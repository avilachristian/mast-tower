import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import type { SavedProjectRecord } from '../src/entities/project/types';
import { apiClient } from '../src/shared/api/client';
import type { R2StorageStatus } from '../src/shared/storage/r2Quota';
import { DEFAULT_REPORT_LOGOS } from '../src/shared/assets/defaultLogos';
import {
  estimateDataUrlBytes,
  estimateInlineImagesUsage,
} from '../src/shared/lib/imageUpload';
import { useAuthStore } from '../src/shared/state/authStore';
import { useProjectStore } from '../src/shared/state/projectStore';
import {
  computeNextAutoSyncAt,
  doesRecordNeedSync,
  normalizeAutoSyncConfig,
  runScheduledActiveProjectSyncIfDue,
  stopCloudSyncSchedulerForTest,
  syncPendingChangesForClientPreview,
  syncSingleProjectToCloud,
  useCloudSyncStore,
} from '../src/shared/storage/cloudSync';

function makeRecord(
  id: string,
  syncStatus: SavedProjectRecord['syncStatus']
): SavedProjectRecord {
  const now = '2026-11-15T06:00:00.000Z';
  const state = createCleanBaselineProject();
  state.projectName = `Project ${id}`;
  return {
    id,
    createdAt: now,
    updatedAt: now,
    version: syncStatus === 'local_only' ? undefined : 1,
    syncStatus,
    state,
  };
}

describe('Auto-Sync Schedule & Deferred Staging', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'adm-1', username: 'admin', displayName: 'Admin' },
      offlineCached: false,
      checking: false,
      errorMessage: null,
    });
    useCloudSyncStore.getState().setAutoSyncConfig({
      autoSyncEnabled: true,
      intervalMinutes: 30,
    });
    useCloudSyncStore.getState().setStatePatch({
      isSyncing: false,
      syncingProjectId: null,
      lastError: null,
    });
  });

  it('normalizes editable auto-sync interval with 30 min default and 1..240 bounds', () => {
    expect(normalizeAutoSyncConfig()).toEqual({
      autoSyncEnabled: true,
      intervalMinutes: 30,
    });
    expect(normalizeAutoSyncConfig({ intervalMinutes: 0 })).toEqual({
      autoSyncEnabled: true,
      intervalMinutes: 1,
    });
    expect(normalizeAutoSyncConfig({ intervalMinutes: 999 })).toEqual({
      autoSyncEnabled: true,
      intervalMinutes: 240,
    });
    expect(
      normalizeAutoSyncConfig({ autoSyncEnabled: false, intervalMinutes: 15 })
    ).toEqual({
      autoSyncEnabled: false,
      intervalMinutes: 15,
    });
    expect(computeNextAutoSyncAt(30, 1_000_000)).toBe(1_000_000 + 30 * 60_000);
  });

  it('estimates staged data:image usage while ignoring R2 URLs and default logos', () => {
    const state = createCleanBaselineProject();
    // Sample 12-byte base64 payload ("hello world!" = 12 bytes -> "aGVsbG8gd29ybGQh")
    const sampleDataUrl = 'data:image/jpeg;base64,aGVsbG8gd29ybGQh';
    expect(estimateDataUrlBytes(sampleDataUrl)).toBe(12);

    state.foundations[0].inspectionChecklist = {
      exc_dimensions: {
        status: 'Passed',
        remarks: 'ok',
        photoDataUrl: sampleDataUrl,
        photoName: 'exc.jpg',
      },
      rebar_spacing: {
        status: 'Passed',
        remarks: 'already uploaded',
        photoDataUrl: '/api/images/projects/p1/inspection/rebar.jpg',
      },
    };
    state.dailyLogs = [
      {
        id: 'dl-1',
        date: '2026-11-15',
        dayNumber: 1,
        weather: 'Sunny',
        activitiesSummary: 'Excavation',
        foundationsWorked: ['PF-0'],
        workers: [],
        totalWorkers: 0,
        totalManHours: 0,
        cementUsedBags: 0,
        sandUsedBags: 0,
        gravelUsedBags: 0,
        documentationItems: [
          {
            id: 'doc-1',
            photoDataUrl: sampleDataUrl, // duplicate of sampleDataUrl
            description: 'Photo',
          },
        ],
        issuesOrDelays: '',
      },
    ];
    state.reportDetails = {
      projectName: state.projectName,
      projectLocation: state.location,
      clientName: '',
      contractor: state.contractor,
      referenceNo: '',
      logos: {
        left: DEFAULT_REPORT_LOGOS.left,
      },
    };

    const usage = estimateInlineImagesUsage(state);
    expect(usage.count).toBe(2);
    expect(usage.uniqueCount).toBe(1);
    expect(usage.estimatedBytes).toBe(12);
    expect(
      doesRecordNeedSync({ syncStatus: 'synced', state })
    ).toBe(true);
  });

  it('skips sync when auto-sync is off, unauthenticated, not due, or active project is clean', async () => {
    const syncFn = vi.fn().mockResolvedValue(true);
    const syncedRec = makeRecord('proj-active', 'synced');
    useProjectStore.setState({
      projects: [syncedRec],
      activeProjectId: 'proj-active',
      project: syncedRec.state,
    });

    // Disabled
    useCloudSyncStore.getState().setAutoSyncConfig({ autoSyncEnabled: false });
    expect(await runScheduledActiveProjectSyncIfDue({ syncFn })).toBe('disabled');
    expect(syncFn).not.toHaveBeenCalled();

    // Unauthenticated
    useCloudSyncStore.getState().setAutoSyncConfig({ autoSyncEnabled: true, intervalMinutes: 30 });
    useAuthStore.setState({ status: 'unauthenticated' });
    expect(await runScheduledActiveProjectSyncIfDue({ syncFn })).toBe('unavailable');
    expect(syncFn).not.toHaveBeenCalled();

    // Not due yet
    useAuthStore.setState({ status: 'authenticated' });
    useCloudSyncStore.getState().setStatePatch({ nextAutoSyncAt: 10_000_000 });
    expect(
      await runScheduledActiveProjectSyncIfDue({ nowMs: 5_000_000, syncFn })
    ).toBe('not_due');
    expect(syncFn).not.toHaveBeenCalled();

    // Due, but active project has zero unsaved changes
    useCloudSyncStore.getState().setStatePatch({ nextAutoSyncAt: 5_000_000 });
    expect(
      await runScheduledActiveProjectSyncIfDue({ nowMs: 5_000_001, syncFn })
    ).toBe('clean');
    expect(syncFn).not.toHaveBeenCalled();
    expect(useCloudSyncStore.getState().nextAutoSyncAt).toBe(
      5_000_001 + 30 * 60_000
    );
  });

  it('syncs ONLY the active project when interval is due and unsaved changes exist', async () => {
    const syncFn = vi.fn().mockResolvedValue(true);
    const activePending = makeRecord('proj-active', 'pending');
    const inactivePending = makeRecord('proj-other', 'pending');

    useProjectStore.setState({
      projects: [activePending, inactivePending],
      activeProjectId: 'proj-active',
      project: activePending.state,
    });
    useCloudSyncStore.getState().setAutoSyncConfig({
      autoSyncEnabled: true,
      intervalMinutes: 15,
    });
    useCloudSyncStore.getState().setStatePatch({ nextAutoSyncAt: 2_000_000 });

    const outcome = await runScheduledActiveProjectSyncIfDue({
      nowMs: 2_000_500,
      syncFn,
    });

    expect(outcome).toBe('synced');
    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(syncFn).toHaveBeenCalledWith('proj-active');
    expect(useCloudSyncStore.getState().nextAutoSyncAt).toBe(
      2_000_500 + 15 * 60_000
    );
  });
});

const MOCK_STORAGE: R2StorageStatus = {
  usedBytes: 0,
  limitBytes: 10_000_000_000,
  remainingBytes: 10_000_000_000,
  objectCount: 0,
  usedPercent: 0,
  level: 'ok',
  message: null,
};

describe('Cloud Sync Concurrency, Visibility & Store Integrity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    stopCloudSyncSchedulerForTest();
  });

  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'adm-1', username: 'admin', displayName: 'Admin' },
      offlineCached: false,
      checking: false,
      errorMessage: null,
    });
    useCloudSyncStore.getState().setStatePatch({
      isSyncing: false,
      syncingProjectId: null,
      lastError: null,
      pendingDeleteIds: [],
    });
  });

  it('serializes concurrent syncSingleProjectToCloud calls and flushes mid-flight edits sequentially', async () => {
    const rec = makeRecord('proj-concurrent', 'pending');
    rec.version = 1;
    rec.clientSettings = {
      enabled: true,
      featured: false,
      slug: 'proj-concurrent',
      phaseMode: 'foundation',
      showPhotos: true,
      showReports: true,
    };

    useProjectStore.setState({
      projects: [rec],
      activeProjectId: 'proj-concurrent',
      project: rec.state,
    });

    let resolveFirst!: (val: {
      project: SavedProjectRecord;
      storage: R2StorageStatus;
    }) => void;
    const firstCallPromise = new Promise<{
      project: SavedProjectRecord;
      storage: R2StorageStatus;
    }>((resolve) => {
      resolveFirst = resolve;
    });

    const saveSpy = vi
      .spyOn(apiClient, 'saveAdminProject')
      .mockImplementationOnce(() => firstCallPromise)
      .mockImplementationOnce(async (_id, payload) => ({
        project: {
          ...rec,
          version: 3,
          syncStatus: 'synced',
          updatedAt: '2026-11-15T06:10:00.000Z',
          clientSettings: payload.clientSettings
            ? {
              enabled: Boolean(payload.clientSettings.enabled),
              featured: Boolean(payload.clientSettings.featured),
              slug: payload.clientSettings.slug ?? rec.clientSettings!.slug,
              welcomeNote: payload.clientSettings.welcomeNote,
              phaseMode:
                payload.clientSettings.phaseMode ?? rec.clientSettings!.phaseMode,
              showPhotos:
                payload.clientSettings.showPhotos ?? rec.clientSettings!.showPhotos,
              showReports:
                payload.clientSettings.showReports ?? rec.clientSettings!.showReports,
            }
            : rec.clientSettings,
          state: payload.state,
        },
        storage: MOCK_STORAGE,
      }));

    // Start first sync in flight
    const p1 = syncSingleProjectToCloud('proj-concurrent');
    await vi.waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    // Mutate project clientSettings mid-flight & trigger a second concurrent sync
    useProjectStore.getState().updateProjectClientSettings('proj-concurrent', {
      enabled: true,
      featured: false,
      slug: 'proj-concurrent',
      phaseMode: 'vertical_mast',
      showPhotos: true,
      showReports: true,
    });
    const p2 = syncSingleProjectToCloud('proj-concurrent');

    // Second request must wait for the first to finish rather than racing expectedVersion: 1
    await Promise.resolve();
    await Promise.resolve();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    resolveFirst({
      project: {
        ...rec,
        version: 2,
        syncStatus: 'synced',
        updatedAt: '2026-11-15T06:05:00.000Z',
        clientSettings: { ...rec.clientSettings, phaseMode: 'foundation' },
      },
      storage: MOCK_STORAGE,
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toBe(true);
    expect(res2).toBe(true);
    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(saveSpy.mock.calls[1][1].expectedVersion).toBe(2);
    expect(saveSpy.mock.calls[1][1].clientSettings?.phaseMode).toBe('vertical_mast');

    const finalRecord = useProjectStore
      .getState()
      .projects.find((p) => p.id === 'proj-concurrent');
    expect(finalRecord?.version).toBe(3);
    expect(finalRecord?.syncStatus).toBe('synced');
    expect(finalRecord?.clientSettings?.phaseMode).toBe('vertical_mast');
  });

  it('preserves newer local clientSettings when applyCloudSyncResult finishes after a mid-sync edit', () => {
    const rec = makeRecord('proj-mid-edit', 'pending');
    rec.version = 1;
    rec.updatedAt = '2026-11-15T07:00:00.000Z';
    rec.clientSettings = {
      enabled: true,
      featured: false,
      slug: 'proj-mid-edit',
      phaseMode: 'vertical_mast',
      showPhotos: true,
      showReports: true,
    };

    useProjectStore.setState({
      projects: [rec],
      activeProjectId: 'proj-mid-edit',
      project: rec.state,
    });

    // Simulate response from an earlier snapshot before local clientSettings was updated
    useProjectStore.getState().applyCloudSyncResult(
      'proj-mid-edit',
      {
        ...rec,
        version: 2,
        syncStatus: 'synced',
        clientSettings: {
          enabled: true,
          featured: false,
          slug: 'proj-mid-edit',
          phaseMode: 'foundation',
          showPhotos: false,
          showReports: false,
        },
      },
      '2026-11-15T06:00:00.000Z'
    );

    const updated = useProjectStore
      .getState()
      .projects.find((p) => p.id === 'proj-mid-edit');
    expect(updated?.version).toBe(2);
    expect(updated?.syncStatus).toBe('pending');
    expect(updated?.clientSettings?.phaseMode).toBe('vertical_mast');
    expect(updated?.clientSettings?.showPhotos).toBe(true);
  });

  it('syncPendingChangesForClientPreview flushes deletes and syncs active + published dirty projects only', async () => {
    const activeClean = makeRecord('proj-active-clean', 'synced');
    const publishedDirty = makeRecord('proj-pub-dirty', 'pending');
    publishedDirty.version = 2;
    publishedDirty.clientSettings = {
      enabled: true,
      featured: true,
      slug: 'proj-pub-dirty',
      phaseMode: 'both',
      showPhotos: true,
      showReports: true,
    };
    const privateDirty = makeRecord('proj-priv-dirty', 'pending');
    privateDirty.clientSettings = {
      enabled: false,
      featured: false,
      slug: 'proj-priv-dirty',
      phaseMode: 'foundation',
      showPhotos: true,
      showReports: true,
    };

    useProjectStore.setState({
      projects: [activeClean, publishedDirty, privateDirty],
      activeProjectId: 'proj-active-clean',
      project: activeClean.state,
    });
    useCloudSyncStore.getState().setStatePatch({
      pendingDeleteIds: ['proj-deleted-offline'],
    });

    const delSpy = vi.spyOn(apiClient, 'deleteAdminProject').mockResolvedValue({
      ok: true,
      deletedMediaCount: 0,
      storage: MOCK_STORAGE,
    });
    const saveSpy = vi
      .spyOn(apiClient, 'saveAdminProject')
      .mockResolvedValue({
        project: { ...publishedDirty, version: 3, syncStatus: 'synced' },
        storage: MOCK_STORAGE,
      });

    const ok = await syncPendingChangesForClientPreview('proj-active-clean');

    expect(ok).toBe(true);
    expect(delSpy).toHaveBeenCalledWith('proj-deleted-offline');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][0]).toBe('proj-pub-dirty');
    expect(useCloudSyncStore.getState().pendingDeleteIds).toEqual([]);
  });

  it('clears installedDate when reverting vertical mast sections to not_started', () => {
    const rec = makeRecord('proj-mast-reset', 'synced');
    rec.state.projectType = 'vertical_mast';
    useProjectStore.setState({
      projects: [rec],
      activeProjectId: 'proj-mast-reset',
      project: rec.state,
    });

    useProjectStore.getState().updateTowerSectionStatus('S01', 'plumbed_verified');
    let sec1 = useProjectStore
      .getState()
      .project.verticalMast?.sections.find((s) => s.id === 'S01');
    expect(sec1?.status).toBe('plumbed_verified');
    expect(sec1?.installedDate).toBeTruthy();

    useProjectStore.getState().updateTowerSectionStatus('S01', 'not_started');
    sec1 = useProjectStore
      .getState()
      .project.verticalMast?.sections.find((s) => s.id === 'S01');
    expect(sec1?.status).toBe('not_started');
    expect(sec1?.installedDate).toBeUndefined();

    useProjectStore.getState().updateTowerSectionStatus('S01', 'plumbed_verified');
    useProjectStore
      .getState()
      .batchUpdateTowerSectionRange(2, 4, 'plumbed_verified');
    expect(
      useProjectStore
        .getState()
        .project.verticalMast?.sections.find((s) => s.id === 'S03')?.installedDate
    ).toBeTruthy();

    useProjectStore
      .getState()
      .batchUpdateTowerSectionRange(2, 4, 'not_started');
    expect(
      useProjectStore
        .getState()
        .project.verticalMast?.sections.find((s) => s.id === 'S03')?.installedDate
    ).toBeUndefined();
  });

  it('preserves partial R2 upload URLs in projectStore when a subsequent image upload fails', async () => {
    const rec = makeRecord('proj-partial-r2', 'pending');
    const photo1 = 'data:image/jpeg;base64,aGVsbG8x';
    const photo2 = 'data:image/jpeg;base64,aGVsbG8y';
    rec.state.foundations[0].inspectionChecklist = {
      exc_dimensions: {
        status: 'Passed',
        remarks: 'first',
        photoDataUrl: photo1,
        photoName: 'one.jpg',
      },
      rebar_spacing: {
        status: 'Passed',
        remarks: 'second',
        photoDataUrl: photo2,
        photoName: 'two.jpg',
      },
    };
    useProjectStore.setState({
      projects: [rec],
      activeProjectId: 'proj-partial-r2',
      project: rec.state,
    });

    const uploadSpy = vi
      .spyOn(apiClient, 'uploadImageToR2')
      .mockResolvedValueOnce({
        objectKey: 'projects/proj-partial-r2/inspection/one.jpg',
        url: '/api/images/projects/proj-partial-r2/inspection/one.jpg',
        sizeBytes: 123,
        storage: MOCK_STORAGE,
      })
      .mockRejectedValueOnce(new Error('Network blip during 2nd upload'));

    const saveSpy = vi.spyOn(apiClient, 'saveAdminProject');

    const ok = await syncSingleProjectToCloud('proj-partial-r2');
    expect(ok).toBe(false);
    expect(uploadSpy).toHaveBeenCalledTimes(2);
    expect(saveSpy).not.toHaveBeenCalled();

    const updatedRec = useProjectStore
      .getState()
      .projects.find((p) => p.id === 'proj-partial-r2');
    const checklist = updatedRec?.state.foundations[0].inspectionChecklist;
    // 1st photo must already be swapped to its R2 URL; 2nd stays inline for retry
    expect(checklist?.exc_dimensions?.photoDataUrl).toBe(
      '/api/images/projects/proj-partial-r2/inspection/one.jpg'
    );
    expect(checklist?.rebar_spacing?.photoDataUrl).toBe(photo2);
    expect(
      useProjectStore.getState().project.foundations[0].inspectionChecklist
        ?.exc_dimensions?.photoDataUrl
    ).toBe('/api/images/projects/proj-partial-r2/inspection/one.jpg');
  });

  it('enforces 7-day offline admin session TTL and purges stale cached session', async () => {
    const store = new Map<string, string>();
    const mockStorage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k) => store.get(k) ?? null,
      key: (i) => Array.from(store.keys())[i] ?? null,
      removeItem: (k) => {
        store.delete(k);
      },
      setItem: (k, v) => {
        store.set(k, v);
      },
    };
    vi.stubGlobal('localStorage', mockStorage);
    (globalThis as { window: { localStorage?: Storage } }).window.localStorage =
      mockStorage;

    const expiredAt = new Date(
      Date.now() - (7 * 24 * 60 * 60 * 1000 + 60_000)
    ).toISOString();
    mockStorage.setItem(
      'mast2-admin-session-cache-v1',
      JSON.stringify({
        user: { id: 'adm-1', username: 'admin', displayName: 'Admin' },
        cachedAt: expiredAt,
      })
    );

    vi.spyOn(apiClient, 'getSession').mockRejectedValue(
      new TypeError('Network unreachable')
    );

    const expiredOk = await useAuthStore.getState().checkSession();
    expect(expiredOk).toBe(false);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(mockStorage.getItem('mast2-admin-session-cache-v1')).toBeNull();

    // Fresh cached session within 7-day window succeeds offline
    const freshAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockStorage.setItem(
      'mast2-admin-session-cache-v1',
      JSON.stringify({
        user: { id: 'adm-1', username: 'admin', displayName: 'Admin' },
        cachedAt: freshAt,
      })
    );
    const freshOk = await useAuthStore.getState().checkSession();
    expect(freshOk).toBe(true);
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().offlineCached).toBe(true);
  });
});
