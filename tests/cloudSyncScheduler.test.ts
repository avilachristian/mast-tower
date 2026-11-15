import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import type { SavedProjectRecord } from '../src/entities/project/types';
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
