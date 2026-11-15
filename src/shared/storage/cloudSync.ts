import { create } from 'zustand';
import { ApiError, apiClient, R2StorageBlockedError } from '@/shared/api/client';
import {
  estimateInlineImagesUsage,
  uploadInlineImagesInProjectState,
} from '@/shared/lib/imageUpload';
import { useAuthStore } from '@/shared/state/authStore';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import {
  registerProjectSyncHooks,
  useProjectStore,
} from '@/shared/state/projectStore';
import { useStorageQuotaStore } from '@/shared/state/storageQuotaStore';
import type { ClientShowcaseSettings, SavedProjectRecord } from '@/entities/project/types';

const PENDING_DELETES_KEY = 'mast2-cloud-pending-deletes-v1';
const AUTO_SYNC_CONFIG_KEY = 'mast2-cloud-sync-config-v1';
const SCHEDULER_TICK_MS = 15_000;

export const DEFAULT_SYNC_INTERVAL_MINUTES = 30;
export const MIN_SYNC_INTERVAL_MINUTES = 1;
export const MAX_SYNC_INTERVAL_MINUTES = 240;

export interface AutoSyncConfig {
  autoSyncEnabled: boolean;
  intervalMinutes: number;
}

export function normalizeAutoSyncConfig(
  input?: Partial<AutoSyncConfig> | null
): AutoSyncConfig {
  const rawMinutes = Number(input?.intervalMinutes);
  const clampedMinutes = Number.isFinite(rawMinutes)
    ? Math.min(
      MAX_SYNC_INTERVAL_MINUTES,
      Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(rawMinutes))
    )
    : DEFAULT_SYNC_INTERVAL_MINUTES;

  return {
    autoSyncEnabled:
      typeof input?.autoSyncEnabled === 'boolean' ? input.autoSyncEnabled : true,
    intervalMinutes: clampedMinutes,
  };
}

export function loadAutoSyncConfig(): AutoSyncConfig {
  if (typeof window === 'undefined') {
    return {
      autoSyncEnabled: true,
      intervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
    };
  }
  try {
    const raw = window.localStorage.getItem(AUTO_SYNC_CONFIG_KEY);
    if (!raw) {
      return {
        autoSyncEnabled: true,
        intervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
      };
    }
    const parsed = JSON.parse(raw) as Partial<AutoSyncConfig>;
    return normalizeAutoSyncConfig(parsed);
  } catch {
    return {
      autoSyncEnabled: true,
      intervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
    };
  }
}

export function saveAutoSyncConfig(config: AutoSyncConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTO_SYNC_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage error
  }
}

export function computeNextAutoSyncAt(
  intervalMinutes: number,
  nowMs = Date.now()
): number {
  const normalized = normalizeAutoSyncConfig({ intervalMinutes });
  return nowMs + normalized.intervalMinutes * 60_000;
}

export function doesRecordNeedSync(
  record: Pick<SavedProjectRecord, 'syncStatus' | 'state'> | undefined
): boolean {
  if (!record) return false;
  if (record.syncStatus === 'pending' || record.syncStatus === 'local_only') {
    return true;
  }
  return estimateInlineImagesUsage(record.state).count > 0;
}

function loadPendingDeletes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PENDING_DELETES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

function savePendingDeletes(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage error
  }
}

interface CloudSyncState {
  hydratedFromCloud: boolean;
  isSyncing: boolean;
  syncingProjectId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  conflictProjectId: string | null;
  conflictServerRecord: SavedProjectRecord | null;
  pendingDeleteIds: string[];
  autoSyncEnabled: boolean;
  intervalMinutes: number;
  nextAutoSyncAt: number | null;

  setStatePatch: (patch: Partial<CloudSyncState>) => void;
  setAutoSyncConfig: (patch: Partial<AutoSyncConfig>) => void;
  resetAutoSyncSchedule: (nowMs?: number) => void;
}

const initialAutoSyncConfig = loadAutoSyncConfig();

export const useCloudSyncStore = create<CloudSyncState>((set, get) => ({
  hydratedFromCloud: false,
  isSyncing: false,
  syncingProjectId: null,
  lastSyncedAt: null,
  lastError: null,
  conflictProjectId: null,
  conflictServerRecord: null,
  pendingDeleteIds: loadPendingDeletes(),
  autoSyncEnabled: initialAutoSyncConfig.autoSyncEnabled,
  intervalMinutes: initialAutoSyncConfig.intervalMinutes,
  nextAutoSyncAt: initialAutoSyncConfig.autoSyncEnabled
    ? computeNextAutoSyncAt(initialAutoSyncConfig.intervalMinutes)
    : null,

  setStatePatch: (patch) => set(patch),

  setAutoSyncConfig: (patch) => {
    const current = get();
    const next = normalizeAutoSyncConfig({
      autoSyncEnabled: patch.autoSyncEnabled ?? current.autoSyncEnabled,
      intervalMinutes: patch.intervalMinutes ?? current.intervalMinutes,
    });
    saveAutoSyncConfig(next);
    set({
      autoSyncEnabled: next.autoSyncEnabled,
      intervalMinutes: next.intervalMinutes,
      nextAutoSyncAt: next.autoSyncEnabled
        ? computeNextAutoSyncAt(next.intervalMinutes)
        : null,
    });
  },

  resetAutoSyncSchedule: (nowMs = Date.now()) => {
    const { autoSyncEnabled, intervalMinutes } = get();
    set({
      nextAutoSyncAt: autoSyncEnabled
        ? computeNextAutoSyncAt(intervalMinutes, nowMs)
        : null,
    });
  },
}));

let syncInitialized = false;
let schedulerIntervalId: number | null = null;
let activeDeleteFlushPromise: Promise<void> | null = null;
const inFlightProjectSyncs = new Map<string, Promise<boolean>>();
const pendingResyncQueue = new Map<string, { forceOverwrite?: boolean }>();
const inFlightVisibilityPatches = new Map<
  string,
  { settingsKey: string; promise: Promise<void> }
>();

function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function isOnlineAndAuthed(): boolean {
  if (typeof window === 'undefined') return false;
  return isBrowserOnline() && useAuthStore.getState().status === 'authenticated';
}

export async function flushPendingDeletesOnly(): Promise<void> {
  if (!isOnlineAndAuthed()) return;
  if (activeDeleteFlushPromise) return activeDeleteFlushPromise;

  activeDeleteFlushPromise = (async () => {
    try {
      const pendingDeletes = [...useCloudSyncStore.getState().pendingDeleteIds];
      if (pendingDeletes.length === 0) return;

      const remainingDeletes: string[] = [];
      for (const delId of pendingDeletes) {
        try {
          const res = await apiClient.deleteAdminProject(delId);
          useStorageQuotaStore.getState().applyStatus(res.storage, false);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            continue;
          }
          if (err instanceof ApiError && err.status === 401) {
            useAuthStore.getState().markSessionExpired();
            remainingDeletes.push(delId);
            break;
          }
          remainingDeletes.push(delId);
        }
      }
      savePendingDeletes(remainingDeletes);
      useCloudSyncStore.getState().setStatePatch({ pendingDeleteIds: remainingDeletes });
    } finally {
      activeDeleteFlushPromise = null;
    }
  })();

  return activeDeleteFlushPromise;
}

async function executeSingleProjectSync(
  projectId: string,
  options: { forceOverwrite?: boolean } = {}
): Promise<boolean> {
  if (!isOnlineAndAuthed()) return false;

  const projectStore = useProjectStore.getState();
  const record = projectStore.projects.find((p) => p.id === projectId);
  if (!record) return false;

  const snapshotUpdatedAt = record.updatedAt;
  useCloudSyncStore.getState().setStatePatch({
    isSyncing: true,
    syncingProjectId: projectId,
    lastError: null,
  });

  try {
    // Batch-upload any staged inline base64 photos to R2 before saving state_json to D1
    const { nextState, uploadedCount } = await uploadInlineImagesInProjectState(
      projectId,
      record.state
    );

    const expectedVersion = options.forceOverwrite ? undefined : record.version;
    const res = await apiClient.saveAdminProject(projectId, {
      state: nextState,
      clientSettings: record.clientSettings,
      expectedVersion,
    });

    if (res.project) {
      useProjectStore
        .getState()
        .applyCloudSyncResult(projectId, res.project, snapshotUpdatedAt);
    }
    if (res.storage) {
      useStorageQuotaStore.getState().applyStatus(res.storage, true);
    }

    const syncStore = useCloudSyncStore.getState();
    const isActiveProject = useProjectStore.getState().activeProjectId === projectId;
    syncStore.setStatePatch({
      isSyncing: false,
      syncingProjectId: null,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      conflictProjectId:
        syncStore.conflictProjectId === projectId ? null : syncStore.conflictProjectId,
      conflictServerRecord:
        syncStore.conflictProjectId === projectId ? null : syncStore.conflictServerRecord,
      nextAutoSyncAt:
        isActiveProject && syncStore.autoSyncEnabled
          ? computeNextAutoSyncAt(syncStore.intervalMinutes)
          : syncStore.nextAutoSyncAt,
    });

    if (uploadedCount > 0) {
      useFeedbackStore.getState().pushToast({
        tone: 'success',
        title: 'Photos Uploaded to R2',
        message: `Uploaded ${uploadedCount} staged ${uploadedCount === 1 ? 'photo' : 'photos'} to Cloudflare R2.`,
      });
    }
    return true;
  } catch (err) {
    if (err instanceof R2StorageBlockedError) {
      if (err.storage) {
        useStorageQuotaStore.getState().applyStatus(err.storage, false);
      }
      useCloudSyncStore.getState().setStatePatch({
        isSyncing: false,
        syncingProjectId: null,
        lastError: err.message,
      });
      await useFeedbackStore.getState().showAlert({
        tone: 'danger',
        title: 'Photo Upload Blocked (R2 < 100 MB)',
        message: err.message,
      });
      return false;
    }

    if (err instanceof ApiError && err.status === 401) {
      useCloudSyncStore.getState().setStatePatch({
        isSyncing: false,
        syncingProjectId: null,
        lastError: err.message,
      });
      useAuthStore.getState().markSessionExpired();
      return false;
    }

    if (err instanceof ApiError && err.status === 409) {
      const latest = (err.payload as { latestProject?: SavedProjectRecord } | undefined)
        ?.latestProject;
      useProjectStore.getState().markProjectSyncStatus(projectId, 'conflict');
      useCloudSyncStore.getState().setStatePatch({
        isSyncing: false,
        syncingProjectId: null,
        lastError: err.message,
        conflictProjectId: projectId,
        conflictServerRecord: latest ?? null,
      });
      useFeedbackStore.getState().pushToast({
        tone: 'warning',
        title: 'Cloud Sync Conflict',
        message:
          'Another update exists in the cloud. Review conflict to keep your edits or load latest.',
        durationMs: 7000,
      });
      return false;
    }

    useCloudSyncStore.getState().setStatePatch({
      isSyncing: false,
      syncingProjectId: null,
      lastError: err instanceof Error ? err.message : 'Cloud sync failed.',
    });
    return false;
  }
}

export async function syncSingleProjectToCloud(
  projectId: string,
  options: { forceOverwrite?: boolean } = {}
): Promise<boolean> {
  if (!isOnlineAndAuthed()) return false;

  const existing = inFlightProjectSyncs.get(projectId);
  if (existing) {
    const queued = pendingResyncQueue.get(projectId);
    pendingResyncQueue.set(projectId, {
      forceOverwrite: Boolean(queued?.forceOverwrite || options.forceOverwrite),
    });
    const firstResult = await existing;
    const followUp = inFlightProjectSyncs.get(projectId);
    if (followUp) {
      return followUp;
    }
    return firstResult;
  }

  const runLoop = (async () => {
    let currentOptions = options;
    let lastResult = false;
    while (true) {
      lastResult = await executeSingleProjectSync(projectId, currentOptions);
      const queued = pendingResyncQueue.get(projectId);
      pendingResyncQueue.delete(projectId);
      if (!queued || !lastResult) {
        break;
      }
      const latestRecord = useProjectStore
        .getState()
        .projects.find((p) => p.id === projectId);
      if (!latestRecord || (!queued.forceOverwrite && !doesRecordNeedSync(latestRecord))) {
        break;
      }
      currentOptions = queued;
    }
    return lastResult;
  })();

  inFlightProjectSyncs.set(projectId, runLoop);
  try {
    return await runLoop;
  } finally {
    if (inFlightProjectSyncs.get(projectId) === runLoop) {
      inFlightProjectSyncs.delete(projectId);
    }
  }
}

export async function syncActiveProjectNow(): Promise<boolean> {
  const feedback = useFeedbackStore.getState();

  if (!isBrowserOnline()) {
    feedback.pushToast({
      tone: 'warning',
      title: 'Currently Offline',
      message: 'Your edits stay saved locally in IndexedDB until connection returns.',
    });
    return false;
  }

  if (useAuthStore.getState().status !== 'authenticated') {
    return false;
  }

  if (useCloudSyncStore.getState().isSyncing) {
    return false;
  }

  await flushPendingDeletesOnly();

  const { activeProjectId, projects } = useProjectStore.getState();
  const active = projects.find((p) => p.id === activeProjectId);
  if (!active) return false;

  if (!doesRecordNeedSync(active)) {
    useCloudSyncStore.getState().resetAutoSyncSchedule();
    feedback.pushToast({
      tone: 'info',
      title: 'Already Synced',
      message: 'Active project has no unsynced local changes.',
      durationMs: 2500,
    });
    return true;
  }

  const ok = await syncSingleProjectToCloud(active.id);
  if (ok) {
    const name = active.state.reportDetails?.projectName?.trim() || active.state.projectName;
    feedback.pushToast({
      tone: 'success',
      title: 'Active Project Synced',
      message: `"${name}" synced to Cloudflare D1.`,
      durationMs: 2800,
    });
  }
  return ok;
}

export async function flushAllPendingSyncs(): Promise<number> {
  if (!isOnlineAndAuthed()) return 0;

  await flushPendingDeletesOnly();

  const pendingProjects = useProjectStore
    .getState()
    .projects.filter((p) => doesRecordNeedSync(p));

  let syncedCount = 0;
  for (const p of pendingProjects) {
    const ok = await syncSingleProjectToCloud(p.id);
    if (ok) syncedCount += 1;
  }

  if (syncedCount > 0) {
    useFeedbackStore.getState().pushToast({
      tone: 'success',
      title: 'Cloud Sync Complete',
      message: `Synced ${syncedCount} ${syncedCount === 1 ? 'project' : 'projects'} to Cloudflare D1 & R2.`,
    });
  }

  return syncedCount;
}

export async function runScheduledActiveProjectSyncIfDue(options?: {
  nowMs?: number;
  syncFn?: (projectId: string) => Promise<boolean>;
}): Promise<'synced' | 'clean' | 'not_due' | 'disabled' | 'unavailable'> {
  const syncState = useCloudSyncStore.getState();
  if (!syncState.autoSyncEnabled) {
    return 'disabled';
  }

  if (!isBrowserOnline() || useAuthStore.getState().status !== 'authenticated') {
    return 'unavailable';
  }

  if (syncState.isSyncing) {
    return 'not_due';
  }

  const nowMs = options?.nowMs ?? Date.now();
  if (syncState.nextAutoSyncAt === null) {
    syncState.setStatePatch({
      nextAutoSyncAt: computeNextAutoSyncAt(syncState.intervalMinutes, nowMs),
    });
    return 'not_due';
  }

  if (nowMs < syncState.nextAutoSyncAt) {
    return 'not_due';
  }

  // Advance countdown right away so idle/error states never spin on 15s ticks
  syncState.setStatePatch({
    nextAutoSyncAt: computeNextAutoSyncAt(syncState.intervalMinutes, nowMs),
  });

  const { activeProjectId, projects } = useProjectStore.getState();
  const active = projects.find((p) => p.id === activeProjectId);
  if (!doesRecordNeedSync(active)) {
    return 'clean';
  }

  const syncRunner = options?.syncFn ?? ((id: string) => syncSingleProjectToCloud(id));
  await syncRunner(active!.id);
  return 'synced';
}

export async function hydrateCloudWorkspace(): Promise<void> {
  if (!isOnlineAndAuthed()) return;
  useCloudSyncStore.getState().setStatePatch({ isSyncing: true, lastError: null });

  try {
    const res = await apiClient.listAdminProjects();
    useStorageQuotaStore.getState().applyStatus(res.storage, true);
    useProjectStore.getState().applyCloudWorkspace(res.projects);

    const syncStore = useCloudSyncStore.getState();
    syncStore.setStatePatch({
      hydratedFromCloud: true,
      isSyncing: false,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      nextAutoSyncAt: syncStore.autoSyncEnabled
        ? syncStore.nextAutoSyncAt ?? computeNextAutoSyncAt(syncStore.intervalMinutes)
        : null,
    });

    // Flush any pending project deletions safely without pushing unrelated unsynced drafts
    await flushPendingDeletesOnly();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      useAuthStore.getState().markSessionExpired();
    }
    useCloudSyncStore.getState().setStatePatch({
      isSyncing: false,
      lastError: err instanceof Error ? err.message : 'Unable to load cloud projects.',
    });
  }
}

export async function migrateLocalProjectsToCloud(): Promise<number> {
  if (!isOnlineAndAuthed()) return 0;
  await flushPendingDeletesOnly();

  const localProjects = useProjectStore
    .getState()
    .projects.filter((p) => doesRecordNeedSync(p));

  let migrated = 0;
  for (const proj of localProjects) {
    const ok = await syncSingleProjectToCloud(proj.id, { forceOverwrite: true });
    if (ok) migrated += 1;
  }
  if (migrated > 0) {
    useFeedbackStore.getState().pushToast({
      tone: 'success',
      title: 'Projects Synced to Cloud',
      message: `Synced ${migrated} ${migrated === 1 ? 'project' : 'projects'} to Cloudflare D1 & R2.`,
    });
  }
  return migrated;
}

export async function resolveConflictUseCloud(): Promise<void> {
  const { conflictProjectId, conflictServerRecord } = useCloudSyncStore.getState();
  if (!conflictProjectId || !conflictServerRecord) return;
  useProjectStore.getState().applyCloudSyncResult(conflictProjectId, conflictServerRecord);
  useCloudSyncStore.getState().setStatePatch({
    conflictProjectId: null,
    conflictServerRecord: null,
    lastError: null,
  });
}

export async function resolveConflictOverwriteCloud(): Promise<void> {
  const { conflictProjectId } = useCloudSyncStore.getState();
  if (!conflictProjectId) return;
  await syncSingleProjectToCloud(conflictProjectId, { forceOverwrite: true });
}

export async function syncClientVisibilityPatch(
  projectId: string,
  settings: ClientShowcaseSettings,
  hadUnsavedStateEdits = false
): Promise<void> {
  if (!isOnlineAndAuthed()) return;

  const settingsKey = JSON.stringify(settings);
  const existing = inFlightVisibilityPatches.get(projectId);
  if (existing) {
    if (existing.settingsKey === settingsKey) {
      return existing.promise;
    }
    await existing.promise;
  }

  const runPromise = (async () => {
    const record = useProjectStore.getState().projects.find((p) => p.id === projectId);
    if (!record) return;

    // Publishing a project to the Client Showcase pushes full state + staged photos immediately
    // so clients see complete, accurate live diagrams & photos.
    if (settings.enabled) {
      await syncSingleProjectToCloud(projectId);
      return;
    }

    // If private and never uploaded to cloud yet, keep it local until next manual/scheduled sync.
    if (!record.version) {
      return;
    }

    try {
      const snapshotUpdatedAt = record.updatedAt;
      const res = await apiClient.updateClientVisibility(projectId, settings);
      if (res.project) {
        useProjectStore
          .getState()
          .applyCloudSyncResult(
            projectId,
            { ...res.project, state: record.state },
            snapshotUpdatedAt
          );
        if (hadUnsavedStateEdits) {
          useProjectStore.getState().markProjectSyncStatus(projectId, 'pending');
        }
      }
      useCloudSyncStore.getState().setStatePatch({
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().markSessionExpired();
      }
    }
  })();

  inFlightVisibilityPatches.set(projectId, { settingsKey, promise: runPromise });
  try {
    await runPromise;
  } finally {
    if (inFlightVisibilityPatches.get(projectId)?.promise === runPromise) {
      inFlightVisibilityPatches.delete(projectId);
    }
  }
}

export async function syncPendingChangesForClientPreview(
  targetProjectId?: string
): Promise<boolean> {
  if (!isOnlineAndAuthed()) return false;

  await flushPendingDeletesOnly();

  const { activeProjectId, projects } = useProjectStore.getState();
  const primaryId = targetProjectId ?? activeProjectId;
  const candidateIds = new Set<string>();

  for (const record of projects) {
    const isPrimary = record.id === primaryId;
    const isEnabled = record.clientSettings?.enabled === true;
    if ((isPrimary || isEnabled) && doesRecordNeedSync(record)) {
      candidateIds.add(record.id);
    }
  }

  let allOk = true;
  for (const id of candidateIds) {
    const ok = await syncSingleProjectToCloud(id);
    if (!ok) allOk = false;
  }

  if (primaryId) {
    const inFlightVis = inFlightVisibilityPatches.get(primaryId);
    if (inFlightVis) {
      await inFlightVis.promise;
    }
  }

  return allOk;
}

export function initializeCloudSync(): void {
  if (typeof window === 'undefined' || syncInitialized) return;
  syncInitialized = true;

  registerProjectSyncHooks({
    // Routine active-project edits and new projects stay in local IndexedDB until
    // the editable periodic interval expires or the Admin clicks the Sync button.
    onProjectMutated: () => {
      const store = useCloudSyncStore.getState();
      if (store.autoSyncEnabled && store.nextAutoSyncAt === null) {
        store.resetAutoSyncSchedule();
      }
    },
    onProjectCreated: () => {
      // Leave newly created/duplicated/imported projects staged locally until synced
    },
    onProjectDeleted: (projectId) => {
      if (useAuthStore.getState().status !== 'authenticated') return;
      if (!isOnlineAndAuthed()) {
        const next = Array.from(
          new Set([...useCloudSyncStore.getState().pendingDeleteIds, projectId])
        );
        savePendingDeletes(next);
        useCloudSyncStore.getState().setStatePatch({ pendingDeleteIds: next });
        return;
      }
      void apiClient
        .deleteAdminProject(projectId)
        .then((res) => {
          useStorageQuotaStore.getState().applyStatus(res.storage, false);
          useCloudSyncStore.getState().setStatePatch({
            lastSyncedAt: new Date().toISOString(),
          });
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) return;
          if (err instanceof ApiError && err.status === 401) {
            useAuthStore.getState().markSessionExpired();
            return;
          }
          const next = Array.from(
            new Set([...useCloudSyncStore.getState().pendingDeleteIds, projectId])
          );
          savePendingDeletes(next);
          useCloudSyncStore.getState().setStatePatch({ pendingDeleteIds: next });
        });
    },
    onClientSettingsChanged: (projectId, settings, hadUnsavedStateEdits) => {
      if (useAuthStore.getState().status !== 'authenticated') return;
      void syncClientVisibilityPatch(projectId, settings, hadUnsavedStateEdits);
    },
  });

  schedulerIntervalId = window.setInterval(() => {
    void runScheduledActiveProjectSyncIfDue();
  }, SCHEDULER_TICK_MS);

  window.addEventListener('online', () => {
    void useAuthStore.getState().checkSession().then((ok) => {
      if (!ok) return;
      void flushPendingDeletesOnly().then(() => {
        if (!useCloudSyncStore.getState().hydratedFromCloud) {
          void hydrateCloudWorkspace();
        } else {
          void runScheduledActiveProjectSyncIfDue();
        }
      });
    });
  });
}

export function stopCloudSyncSchedulerForTest(): void {
  if (typeof window !== 'undefined' && schedulerIntervalId !== null) {
    window.clearInterval(schedulerIntervalId);
  }
  schedulerIntervalId = null;
  syncInitialized = false;
  inFlightProjectSyncs.clear();
  pendingResyncQueue.clear();
  inFlightVisibilityPatches.clear();
}
