import { create } from 'zustand';
import { ApiError, apiClient, R2StorageBlockedError } from '@/shared/api/client';
import { uploadInlineImagesInProjectState } from '@/shared/lib/imageUpload';
import { useAuthStore } from '@/shared/state/authStore';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import {
  registerProjectSyncHooks,
  useProjectStore,
} from '@/shared/state/projectStore';
import { useStorageQuotaStore } from '@/shared/state/storageQuotaStore';
import type { ClientShowcaseSettings, SavedProjectRecord } from '@/entities/project/types';

const PENDING_DELETES_KEY = 'mast2-cloud-pending-deletes-v1';
const DEBOUNCE_SYNC_MS = 1200;

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
  lastSyncedAt: string | null;
  lastError: string | null;
  conflictProjectId: string | null;
  conflictServerRecord: SavedProjectRecord | null;
  pendingDeleteIds: string[];

  setStatePatch: (patch: Partial<CloudSyncState>) => void;
}

export const useCloudSyncStore = create<CloudSyncState>((set) => ({
  hydratedFromCloud: false,
  isSyncing: false,
  lastSyncedAt: null,
  lastError: null,
  conflictProjectId: null,
  conflictServerRecord: null,
  pendingDeleteIds: loadPendingDeletes(),

  setStatePatch: (patch) => set(patch),
}));

const debounceTimers = new Map<string, number>();
let syncInitialized = false;
let activeFlushPromise: Promise<void> | null = null;

function isOnlineAndAuthed(): boolean {
  if (typeof window === 'undefined') return false;
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  return isOnline && useAuthStore.getState().status === 'authenticated';
}

export async function syncSingleProjectToCloud(
  projectId: string,
  options: { forceOverwrite?: boolean } = {}
): Promise<boolean> {
  if (!isOnlineAndAuthed()) return false;

  const projectState = useProjectStore.getState();
  const record = projectState.projects.find((p) => p.id === projectId);
  if (!record) return false;

  useCloudSyncStore.getState().setStatePatch({ isSyncing: true, lastError: null });

  try {
    // Upload any offline-staged inline base64 photos to R2 before saving state_json to D1
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
      useProjectStore.getState().applyCloudSyncResult(projectId, res.project);
    }
    if (res.storage) {
      useStorageQuotaStore.getState().applyStatus(res.storage, true);
    }

    useCloudSyncStore.getState().setStatePatch({
      isSyncing: false,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      conflictProjectId:
        useCloudSyncStore.getState().conflictProjectId === projectId
          ? null
          : useCloudSyncStore.getState().conflictProjectId,
      conflictServerRecord:
        useCloudSyncStore.getState().conflictProjectId === projectId
          ? null
          : useCloudSyncStore.getState().conflictServerRecord,
    });

    if (uploadedCount > 0) {
      useFeedbackStore.getState().pushToast({
        tone: 'success',
        title: 'Offline Photos Synced to R2',
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
        lastError: err.message,
      });
      await useFeedbackStore.getState().showAlert({
        tone: 'danger',
        title: 'Offline Photo Sync Blocked (R2 < 100 MB)',
        message: err.message,
      });
      return false;
    }

    if (err instanceof ApiError && err.status === 401) {
      useCloudSyncStore.getState().setStatePatch({
        isSyncing: false,
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
        lastError: err.message,
        conflictProjectId: projectId,
        conflictServerRecord: latest ?? null,
      });
      useFeedbackStore.getState().pushToast({
        tone: 'warning',
        title: 'Cloud Sync Conflict',
        message: 'Another update exists in the cloud. Review conflict to keep your edits or load latest.',
        durationMs: 7000,
      });
      return false;
    }

    useCloudSyncStore.getState().setStatePatch({
      isSyncing: false,
      lastError: err instanceof Error ? err.message : 'Cloud sync failed.',
    });
    return false;
  }
}

export async function flushAllPendingSyncs(): Promise<void> {
  if (!isOnlineAndAuthed()) return;
  if (activeFlushPromise) return activeFlushPromise;

  activeFlushPromise = (async () => {
    try {
      // 1. Flush any pending deletes queued while offline
      const pendingDeletes = [...useCloudSyncStore.getState().pendingDeleteIds];
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

      // 2. Flush pending project mutations
      const pendingProjects = useProjectStore
        .getState()
        .projects.filter((p) => p.syncStatus === 'pending');

      for (const p of pendingProjects) {
        await syncSingleProjectToCloud(p.id);
      }
    } finally {
      activeFlushPromise = null;
    }
  })();

  return activeFlushPromise;
}

export async function hydrateCloudWorkspace(): Promise<void> {
  if (!isOnlineAndAuthed()) return;
  useCloudSyncStore.getState().setStatePatch({ isSyncing: true, lastError: null });

  try {
    const res = await apiClient.listAdminProjects();
    useStorageQuotaStore.getState().applyStatus(res.storage, true);
    useProjectStore.getState().applyCloudWorkspace(res.projects);
    useCloudSyncStore.getState().setStatePatch({
      hydratedFromCloud: true,
      isSyncing: false,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
    await flushAllPendingSyncs();
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
  const localProjects = useProjectStore
    .getState()
    .projects.filter((p) => p.syncStatus === 'local_only' || p.syncStatus === 'pending');

  let migrated = 0;
  for (const proj of localProjects) {
    const ok = await syncSingleProjectToCloud(proj.id, { forceOverwrite: true });
    if (ok) migrated += 1;
  }
  if (migrated > 0) {
    useFeedbackStore.getState().pushToast({
      tone: 'success',
      title: 'Local Projects Synced to Cloud',
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

function scheduleDebouncedSync(projectId: string): void {
  if (typeof window === 'undefined') return;
  const existing = debounceTimers.get(projectId);
  if (existing !== undefined) {
    window.clearTimeout(existing);
  }
  const timer = window.setTimeout(() => {
    debounceTimers.delete(projectId);
    void syncSingleProjectToCloud(projectId);
  }, DEBOUNCE_SYNC_MS);
  debounceTimers.set(projectId, timer);
}

async function syncClientVisibilityPatch(
  projectId: string,
  settings: ClientShowcaseSettings
): Promise<void> {
  if (!isOnlineAndAuthed()) return;
  const record = useProjectStore.getState().projects.find((p) => p.id === projectId);
  if (!record?.version) {
    // Project isn't in cloud yet; push full project
    await syncSingleProjectToCloud(projectId);
    return;
  }
  try {
    const res = await apiClient.updateClientVisibility(projectId, settings);
    if (res.project) {
      useProjectStore.getState().applyCloudSyncResult(projectId, res.project);
    }
    useCloudSyncStore.getState().setStatePatch({
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      useAuthStore.getState().markSessionExpired();
    } else {
      scheduleDebouncedSync(projectId);
    }
  }
}

export function initializeCloudSync(): void {
  if (typeof window === 'undefined' || syncInitialized) return;
  syncInitialized = true;

  registerProjectSyncHooks({
    onProjectMutated: (projectId) => {
      if (useAuthStore.getState().status !== 'authenticated') return;
      scheduleDebouncedSync(projectId);
    },
    onProjectCreated: (record) => {
      if (useAuthStore.getState().status !== 'authenticated') return;
      void syncSingleProjectToCloud(record.id, { forceOverwrite: true });
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
    onClientSettingsChanged: (projectId, settings) => {
      if (useAuthStore.getState().status !== 'authenticated') return;
      void syncClientVisibilityPatch(projectId, settings);
    },
  });

  window.addEventListener('online', () => {
    void useAuthStore.getState().checkSession().then((ok) => {
      if (ok) {
        void flushAllPendingSyncs().then(() => hydrateCloudWorkspace());
      }
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isOnlineAndAuthed()) {
      for (const [id, timer] of debounceTimers.entries()) {
        window.clearTimeout(timer);
        debounceTimers.delete(id);
        void syncSingleProjectToCloud(id);
      }
    }
  });
}
