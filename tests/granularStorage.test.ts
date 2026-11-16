import { describe, expect, it } from 'vitest';
import { recalculateDailyLogCarryOver } from '../src/entities/project/calculations';
import type { DailyActivityLogEntry } from '../src/entities/project/types';
import {
  getProjectStorageKey,
  PROJECT_STORAGE_KEY_PREFIX,
  WORKSPACE_INDEX_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
} from '../src/shared/storage/indexedDb';

function makeTestLog(
  id: string,
  date: string,
  dayNumber: number,
  materialsOnSite: DailyActivityLogEntry['materialsOnSite']
): DailyActivityLogEntry {
  return {
    id,
    date,
    dayNumber,
    weather: 'Sunny',
    activitiesSummary: `Work for ${date}`,
    foundationsWorked: ['PF-0'],
    workers: [],
    totalWorkers: 0,
    totalManHours: 0,
    cementUsedBags: 0,
    sandUsedBags: 0,
    gravelUsedBags: 0,
    issuesOrDelays: '',
    materialsOnSite,
  };
}

describe('granular storage & calculations optimization (B1, B2, B6)', () => {
  it('correctly constructs granular storage keys for projects', () => {
    expect(WORKSPACE_INDEX_STORAGE_KEY).toBe('mast2-tower-projects-index-v1');
    expect(WORKSPACE_STORAGE_KEY).toBe('mast2-tower-projects-workspace-v1');
    expect(PROJECT_STORAGE_KEY_PREFIX).toBe('mast2-project-');
    expect(getProjectStorageKey('proj-abc')).toBe('mast2-project-proj-abc');
  });

  it('short-circuits recalculateDailyLogCarryOver when intermediate day remaining quantities are unchanged', () => {
    const logs: DailyActivityLogEntry[] = [
      makeTestLog('log-1', '2026-11-01', 1, [
        {
          id: 'mat-1',
          name: 'Cement Bags',
          unit: 'bags',
          onSiteQty: 100,
          deliveredQty: 50,
          usedTodayQty: 30,
          remainingQty: 120,
          remarks: '',
        },
      ]),
      makeTestLog('log-2', '2026-11-02', 2, [
        {
          id: 'mat-1',
          name: 'Cement Bags',
          unit: 'bags',
          onSiteQty: 120, // matches day 1 remaining
          deliveredQty: 0,
          usedTodayQty: 20,
          remainingQty: 100,
          remarks: '',
        },
      ]),
      makeTestLog('log-3', '2026-11-03', 3, [
        {
          id: 'mat-1',
          name: 'Cement Bags',
          unit: 'bags',
          onSiteQty: 100, // matches day 2 remaining
          deliveredQty: 0,
          usedTodayQty: 10,
          remainingQty: 90,
          remarks: '',
        },
      ]),
    ];

    // When log 2's starting on-site qty matches log 1's remaining, log 2 requires no cascade
    const result = recalculateDailyLogCarryOver(logs, 'log-1');
    expect(result).toHaveLength(3);
    expect(result[1].materialsOnSite?.[0].onSiteQty).toBe(120);
    expect(result[2].materialsOnSite?.[0].onSiteQty).toBe(100);
  });
});
