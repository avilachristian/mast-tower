import { describe, expect, it } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import type { SavedProjectRecord } from '../src/entities/project/types';
import { computeProjectConflictDiff } from '../src/shared/storage/cloudConflictDiff';

describe('computeProjectConflictDiff', () => {
  const baseProject = createCleanBaselineProject();

  const localRecord: SavedProjectRecord = {
    id: 'proj-123',
    createdAt: '2026-11-16T08:00:00.000Z',
    updatedAt: '2026-11-16T09:00:00.000Z',
    version: 3,
    syncStatus: 'conflict',
    state: {
      ...baseProject,
      projectName: 'Local Tower Edition',
      location: 'Local Site A',
      foundations: baseProject.foundations.map((f, i) =>
        i === 0 ? { ...f, status: 'completed' } : f
      ),
      dailyLogs: [
        {
          id: 'log-1',
          dayNumber: 1,
          date: '2026-11-16',
          weather: 'Sunny',
          weatherNotes: '',
          foundationsWorked: ['F1'],
          workers: [{ role: 'Mason', count: 2, names: 'Pedro', hours: 8 }],
          totalWorkers: 2,
          totalManHours: 16,
          activitiesSummary: 'Excavation complete',
          cementUsedBags: 0,
          sandUsedBags: 0,
          gravelUsedBags: 0,
          issuesOrDelays: '',
        },
      ],
    },
  };

  it('detects no differences between identical records', () => {
    const report = computeProjectConflictDiff(localRecord, localRecord);
    expect(report.hasDifferences).toBe(false);
    expect(report.totalDifferenceCount).toBe(0);
  });

  it('detects version, timestamp, metadata, foundation progress, and daily log differences', () => {
    const cloudRecord: SavedProjectRecord = {
      ...localRecord,
      version: 4,
      updatedAt: '2026-11-16T10:00:00.000Z',
      state: {
        ...localRecord.state,
        projectName: 'Cloud Tower Edition',
        location: 'Cloud Site B',
        foundations: localRecord.state.foundations.map((f, i) =>
          i === 0 ? { ...f, status: 'rebar_and_anchor' } : f
        ),
        dailyLogs: [
          ...localRecord.state.dailyLogs,
          {
            id: 'log-2',
            dayNumber: 2,
            date: '2026-11-17',
            weather: 'Cloudy',
            weatherNotes: 'Overcast skies',
            foundationsWorked: ['F2'],
            workers: [{ role: 'Foreman', count: 1, names: 'Juan', hours: 8 }],
            totalWorkers: 1,
            totalManHours: 8,
            activitiesSummary: 'Formworks setup',
            cementUsedBags: 0,
            sandUsedBags: 0,
            gravelUsedBags: 0,
            issuesOrDelays: '',
          },
        ],
      },
    };

    const report = computeProjectConflictDiff(localRecord, cloudRecord);

    expect(report.hasDifferences).toBe(true);
    expect(report.totalDifferenceCount).toBeGreaterThan(0);
    expect(report.localVersion).toBe(3);
    expect(report.cloudVersion).toBe(4);

    // Metadata section
    const metaSec = report.sections.find((s) => s.title === 'Version & Metadata');
    expect(metaSec).toBeDefined();
    const verDiff = metaSec?.diffs.find((d) => d.label === 'Version');
    expect(verDiff?.isDifferent).toBe(true);
    expect(verDiff?.localVal).toBe('v3');
    expect(verDiff?.cloudVal).toBe('v4');

    const nameDiff = metaSec?.diffs.find((d) => d.label === 'Project Name');
    expect(nameDiff?.isDifferent).toBe(true);
    expect(nameDiff?.localVal).toBe('Local Tower Edition');
    expect(nameDiff?.cloudVal).toBe('Cloud Tower Edition');

    // Foundations section
    const fndSec = report.sections.find((s) => s.title === 'Foundations & Progress');
    expect(fndSec).toBeDefined();
    const f1Diff = fndSec?.diffs.find((d) => d.label.includes('PF-0'));
    expect(f1Diff?.isDifferent).toBe(true);
    expect(f1Diff?.localVal).toContain('completed');
    expect(f1Diff?.cloudVal).toContain('rebar and anchor');

    // Daily Logs section
    const logSec = report.sections.find((s) => s.title === 'Daily Construction Logs');
    expect(logSec).toBeDefined();
    const countDiff = logSec?.diffs.find((d) => d.label === 'Total Logs Count');
    expect(countDiff?.isDifferent).toBe(true);
    expect(countDiff?.localVal).toBe('1 logs recorded');
    expect(countDiff?.cloudVal).toBe('2 logs recorded');

    const day2Diff = logSec?.diffs.find((d) => d.label.includes('Day #2'));
    expect(day2Diff?.isDifferent).toBe(true);
    expect(day2Diff?.localVal).toBe('Missing locally');
    expect(day2Diff?.cloudVal).toContain('Present in cloud');
  });
});
