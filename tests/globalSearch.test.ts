import { describe, expect, it } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import {
  groupSearchResults,
  searchProject,
} from '../src/shared/search/globalProjectSearch';
import type { DailyActivityLogEntry, MastProjectState } from '../src/entities/project/types';

describe('Global Project Search (C5)', () => {
  it('returns empty results for empty or whitespace query', () => {
    const project = createCleanBaselineProject();
    expect(searchProject(project, '')).toEqual([]);
    expect(searchProject(project, '   ')).toEqual([]);
  });

  it('searches daily logs by day number, weather, activity description, and worker name', () => {
    const project = createCleanBaselineProject();
    const mockLog: DailyActivityLogEntry = {
      id: 'log-101',
      dayNumber: 15,
      date: '2026-11-20',
      weather: 'Foggy / Windy',
      weatherNotes: 'High wind speed on summit',
      foundationsWorked: ['PF-0'],
      workers: [
        { role: 'Foreman', count: 1, names: 'Alejandro Ramos', hours: 8 },
        { role: 'Mason', count: 2, names: 'Benny, Carlito', hours: 8 },
      ],
      totalWorkers: 3,
      totalManHours: 24,
      cementUsedBags: 10,
      sandUsedBags: 0,
      gravelUsedBags: 0,
      activities: [
        {
          id: 'act-1',
          description: 'Curing and protective burlap cover installation',
          status: 'Completed',
          remarks: 'Moistened thoroughly',
        },
      ],
      activitiesSummary: 'Summited mast anchor staging',
      issuesOrDelays: 'Brief drizzle at 2pm',
    };
    project.dailyLogs = [mockLog];

    // Search by day
    const dayResults = searchProject(project, 'Day 15');
    expect(dayResults.length).toBeGreaterThan(0);
    expect(dayResults[0].category).toBe('daily_logs');
    expect(dayResults[0].navigation.dailyLogId).toBe('log-101');
    expect(dayResults[0].title).toContain('Day 15 Daily Log');

    // Search by weather
    const weatherResults = searchProject(project, 'Foggy');
    expect(weatherResults.length).toBeGreaterThan(0);
    expect(weatherResults[0].category).toBe('daily_logs');

    // Search by activity description
    const actResults = searchProject(project, 'protective burlap');
    expect(actResults.length).toBeGreaterThan(0);
    expect(actResults[0].snippet).toContain('protective burlap');

    // Search by worker name
    const workerResults = searchProject(project, 'Alejandro');
    expect(workerResults.length).toBeGreaterThan(0);
    expect(workerResults[0].snippet).toContain('Alejandro Ramos');
  });

  it('searches foundations and inspections with navigation metadata', () => {
    const project = createCleanBaselineProject();
    project.foundations[0].notes = 'Critical bedrock contact verified by geotech engineer';
    project.foundations[0].inspectionChecklist = {
      anchor_rod_alignment: {
        status: 'Passed',
        description: 'Anchor rod template plumbness',
        remarks: 'Zero deviation on laser level',
      },
    };

    // Search by foundation code
    const fResults = searchProject(project, 'PF-0');
    expect(fResults.some((r) => r.category === 'inspections' && r.badge === 'PF-0')).toBe(true);

    // Search by inspection note / keyword
    const inspResults = searchProject(project, 'laser level');
    expect(inspResults.length).toBeGreaterThan(0);
    const item = inspResults.find((r) => r.category === 'inspections');
    expect(item).toBeDefined();
    expect(item?.navigation.foundationId).toBe('PF-0');
    expect(item?.navigation.tab).toBe('inspection');
  });

  it('searches manpower roster, civil payroll, and hauler snapshots', () => {
    const project: MastProjectState = {
      ...createCleanBaselineProject(),
      manpowerRoster: [
        {
          id: 'mem-1',
          name: 'Rodrigo Duterte Jr',
          category: 'civil_works',
          position: 'Steelman',
          dailyRatePhp: 750,
          active: true,
          notes: 'Specialist in 20mm rebar bending',
        },
      ],
      civilPayrollHistory: [
        {
          id: 'snap-civil-1',
          createdAt: new Date().toISOString(),
          periodType: 'weekly',
          startDate: '2026-11-01',
          endDate: '2026-11-07',
          title: 'Week 1 Civil Works Payout',
          items: [
            {
              memberId: 'mem-1',
              name: 'Rodrigo Duterte Jr',
              position: 'Steelman',
              dailyRatePhp: 750,
              daysPresent: 6,
              datesPresent: [],
              grossPayPhp: 4500,
            },
          ],
          totalDaysWorked: 6,
          totalAmountPhp: 4500,
          status: 'paid',
        },
      ],
      haulerPayrollHistory: [
        {
          id: 'snap-hauler-1',
          createdAt: new Date().toISOString(),
          periodType: 'weekly',
          startDate: '2026-11-01',
          endDate: '2026-11-07',
          title: 'Mountain Haulers Week 1',
          items: [
            {
              haulerName: 'Mando Horse Team',
              activeDays: 5,
              tripsCompleted: 12,
              hauledKg: 1440,
              priorExcessKg: 0,
              creditsEarned: 12,
              endingExcessKg: 0,
              grossEarnedPhp: 13200,
              alreadyPaidInRangePhp: 0,
              payoutReleasedPhp: 13200,
              netBalanceAfterPhp: 0,
            },
          ],
          totalHauledKg: 1440,
          totalCredits: 12,
          totalEarnedPhp: 13200,
          totalPayoutPhp: 13200,
          status: 'generated',
        },
      ],
    };

    // Match worker name
    const mResults = searchProject(project, 'Rodrigo');
    expect(mResults.length).toBeGreaterThan(0);
    expect(mResults.some((r) => r.category === 'manpower')).toBe(true);

    // Match hauler team
    const hResults = searchProject(project, 'Mando Horse');
    expect(hResults.length).toBeGreaterThan(0);
    const haulerItem = hResults.find((r) => r.id === 'hauler-payroll-snap-hauler-1');
    expect(haulerItem).toBeDefined();
    expect(haulerItem?.navigation.manpowerMode).toBe('hauler');
  });

  it('searches documentation photos and groups results by category', () => {
    const project = createCleanBaselineProject();
    project.dailyLogs = [
      {
        id: 'log-1',
        dayNumber: 2,
        date: '2026-11-17',
        weather: 'Sunny',
        foundationsWorked: [],
        workers: [],
        totalWorkers: 0,
        totalManHours: 0,
        cementUsedBags: 0,
        sandUsedBags: 0,
        gravelUsedBags: 0,
        activitiesSummary: '',
        issuesOrDelays: '',
        documentationItems: [
          {
            id: 'doc-photo-99',
            photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
            photoName: 'excavation_depth_gauge.jpg',
            description: 'Laser measurement of excavation depth',
            remarks: 'Depth verified at 1.85m',
          },
        ],
      },
    ];

    const results = searchProject(project, 'depth gauge');
    expect(results.length).toBe(1);
    expect(results[0].category).toBe('photos');
    expect(results[0].badge).toBe('Offline Staged');

    const groups = groupSearchResults(results);
    expect(groups.length).toBe(1);
    expect(groups[0].category).toBe('photos');
    expect(groups[0].label).toBe('Photos & Documentation');
  });
});
