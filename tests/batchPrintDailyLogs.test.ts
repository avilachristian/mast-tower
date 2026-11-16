import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import { DailyLogPrintSheet } from '../src/widgets/daily-logs/DailyLogPrintSheet';
import type { DailyActivityLogEntry } from '../src/entities/project/types';

describe('DailyLogPrintSheet and Batch PDF Export Layout', () => {
  const baseProject = createCleanBaselineProject();

  const mockLog1: DailyActivityLogEntry = {
    id: 'log-day-1',
    dayNumber: 1,
    date: '2026-11-16',
    weather: 'Sunny',
    weatherNotes: 'Clear skies and dry ground',
    foundationsWorked: ['F1', 'F2'],
    workers: [
      { role: 'Foreman', count: 1, names: 'Juan Dela Cruz' },
      { role: 'Mason', count: 2, names: 'Pedro, Jose' },
    ],
    totalWorkers: 3,
    activities: [
      {
        id: 'act-1',
        foundationId: 'F1',
        description: 'Excavation of footing',
        status: 'Ongoing',
        remarks: 'Reached 1.2m depth',
      },
    ],
    activitiesSummary: 'Good progress on footing F1',
    materialsOnSite: [
      {
        id: 'mat-1',
        name: 'Portland Cement',
        unit: 'bags',
        onSiteQty: 50,
        deliveredQty: 10,
        usedTodayQty: 15,
        remainingQty: 45,
        remarks: 'Stored under tarp',
      },
    ],
    equipmentItems: [
      {
        id: 'eq-1',
        name: 'Bagger Mixer',
        qty: 1,
        status: 'Operational',
        remarks: 'Fuel topped up',
      },
    ],
    delayItems: [],
    visitorItems: [
      {
        id: 'vis-1',
        name: 'Engr. Santos',
        roleOrCompany: 'Client QA/QC',
        purpose: 'Site routine inspection',
        remarks: 'Approved soil bearing test',
      },
    ],
    safetyLogs: [
      {
        id: 'saf-1',
        timeOrActivity: '07:30 AM Toolbox Meeting',
        hazardOrFinding: 'Deep excavation edges',
        actionTaken: 'Installed caution barricade tapes',
        status: 'Compliant',
      },
    ],
    safetyOfficer: 'Mark Santos',
    preparedBy: 'Resident Engineer',
    issuesOrDelays: '',
  };

  const mockLog2: DailyActivityLogEntry = {
    ...mockLog1,
    id: 'log-day-2',
    dayNumber: 2,
    date: '2026-11-17',
    weather: 'Cloudy',
    foundationsWorked: ['F1'],
    totalWorkers: 4,
  };

  it('renders single DailyLogPrintSheet with project metadata, manpower, materials and safety', () => {
    const html = renderToStaticMarkup(
      createElement(DailyLogPrintSheet, { project: baseProject, log: mockLog1 })
    );

    expect(html).toContain('DAILY CONSTRUCTION SITE LOG');
    expect(html).toContain('Day #1');
    expect(html).toContain('Sunny');
    expect(html).toContain('Foreman');
    expect(html).toContain('Juan Dela Cruz');
    expect(html).toContain('3 Workers');
    expect(html).toContain('Excavation of footing');
    expect(html).toContain('Portland Cement');
    expect(html).toContain('Bagger Mixer');
    expect(html).toContain('Engr. Santos');
    expect(html).toContain('Mark Santos');
  });

  it('renders multiple daily log sheets with page break separator for batch PDF printing', () => {
    const logs = [mockLog1, mockLog2];
    const html = renderToStaticMarkup(
      createElement(
        'div',
        { className: 'batch-container' },
        logs.map((log, idx) =>
          createElement(
            'div',
            {
              key: log.id,
              className: 'break-after-page print:break-after-page',
              style: { pageBreakAfter: idx < logs.length - 1 ? 'always' : 'auto' },
            },
            createElement(DailyLogPrintSheet, { project: baseProject, log })
          )
        )
      )
    );

    expect(html).toContain('Day #1');
    expect(html).toContain('Day #2');
    expect(html).toContain('page-break-after:always');
    expect(html).toContain('break-after-page');
  });
});
