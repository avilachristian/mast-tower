import { describe, expect, it } from 'vitest';
import {
  buildClientShowcaseDto,
  resolveClientShowcaseSettings,
  slugifyProjectSlug,
} from '../src/entities/project/clientProjection';
import { createSampleMast2Project } from '../src/entities/project/mast2Baseline';
import type { SavedProjectRecord } from '../src/entities/project/types';
import { createInitialVerticalMastState } from '../src/entities/project/verticalMastBaseline';
import { parseWorkspacePayload } from '../src/shared/state/projectStore';

describe('Client Showcase Sanitized Projection', () => {
  it('strips private payroll, worker names, inventory, QC remarks, and safetyAndVisitors while projecting public daily log details and delays', () => {
    const state = createSampleMast2Project();
    state.verticalMast = createInitialVerticalMastState();
    state.reportDetails = {
      ...(state.reportDetails ?? {}),
      preparedBy: 'Engr. Christian C. Avila',
    } as typeof state.reportDetails;

    // Populate sensitive internal fields that must never reach the client showcase
    state.manpowerRoster = [
      {
        id: 'mp-1',
        name: 'SECRET_WORKER_JOHN',
        category: 'civil_works',
        position: 'Mason',
        dailyRatePhp: 987.65,
        active: true,
      },
    ];
    state.civilPayrollHistory = [
      {
        id: 'cph-1',
        createdAt: '2026-01-10T00:00:00Z',
        periodType: 'weekly',
        startDate: '2026-01-01',
        endDate: '2026-01-07',
        title: 'Week 1 Payroll',
        items: [],
        totalDaysWorked: 7,
        totalAmountPhp: 45678.9,
        status: 'generated',
      },
    ];
    state.haulerPayouts = [
      {
        id: 'hp-1',
        date: '2026-01-05',
        haulerName: 'SECRET_HAULER_PAYOUT',
        amountPhp: 12345,
        notes: 'CONFIDENTIAL_RATE_REMARK',
      },
    ];
    state.inventory = [
      {
        id: 'inv-1',
        category: 'Tools & Equipment',
        name: 'SECRET_GENERATOR_SERIAL_999',
        unit: 'unit',
        requiredQty: 1,
        onHandQty: 1,
        deliveredQty: 1,
        remarks: 'INTERNAL_WAREHOUSE_NOTE',
      },
    ];
    state.foundations[0].notes = 'CONFIDENTIAL_REBAR_VENDOR_ISSUE';
    state.foundations[0].inspectionMeta = {
      inspectorName: 'QC_INSPECTOR_SECRET',
      generalNotes: 'CONFIDENTIAL_DEFICIENCY_NOTE',
    };
    state.foundations[0].inspectionChecklist = {
      exc_dimensions: {
        status: 'For Rectification',
        remarks: 'INTERNAL_REWORK_INSTRUCTION',
        photoDataUrl: '/api/images/projects/p1/inspection/internal.jpg',
      },
    };
    state.dailyLogs = [
      {
        id: 'dl-1',
        date: '2026-01-12',
        dayNumber: 4,
        weather: 'Sunny',
        weatherNotes: 'Clear sky, light breeze 8 km/h',
        preparedBy: 'Engr. Maria Santos',
        safetyOfficer: 'SO. Carlo Reyes',
        activitiesSummary: 'Completed PF-0 concrete pour ahead of schedule.',
        foundationsWorked: ['PF-0'],
        workers: [
          {
            role: 'Site Engineer',
            count: 2,
            names: 'SECRET_ENG_NAME',
            hours: 8,
          },
        ],
        totalWorkers: 12,
        totalManHours: 96,
        cementUsedBags: 50,
        sandUsedBags: 80,
        gravelUsedBags: 100,
        safetyLogs: [
          {
            id: 'saf-1',
            timeOrActivity: '07:30 Toolbox Meeting',
            hazardOrFinding: 'All rigging & fall-arrest harnesses inspected',
            actionTaken: '100% PPE clearance issued',
            status: 'Compliant',
          },
        ],
        equipmentItems: [
          {
            id: 'eq-1',
            name: 'Transit Mixer',
            qty: 2,
            status: 'Operational',
          },
        ],
        delayItems: [
          {
            id: 'del-1',
            description: 'Heavy morning squall paused crane lift',
            impact: '2 hrs weather standby',
            remarks: 'INTERNAL_DELAY_REMARK_ONLY',
          },
        ],
        documentationItems: [
          {
            id: 'doc-1',
            photoDataUrl: '/api/images/projects/p1/daily_log/pour.jpg',
            photoName: 'pour.jpg',
            description: 'PF-0 Concrete Pouring Progress',
          },
        ],
        issuesOrDelays: '',
        safetyAndVisitors: 'NEAR_MISS_INTERNAL_ONLY',
      },
      {
        id: 'dl-2',
        date: '2026-01-11',
        dayNumber: 3,
        weather: 'Cloudy',
        activitiesSummary: 'Rebar cage placement at I-C1.',
        foundationsWorked: ['I-C1'],
        workers: [],
        totalWorkers: 9,
        totalManHours: 72,
        cementUsedBags: 0,
        sandUsedBags: 0,
        gravelUsedBags: 0,
        delayItems: [
          {
            id: 'del-none',
            description: 'None',
            impact: '',
          },
        ],
        issuesOrDelays: 'None.',
        safetyAndVisitors: 'Standard site walk',
      },
    ];

    const record: SavedProjectRecord = {
      id: 'proj-alpha',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-12T10:00:00Z',
      version: 3,
      clientSettings: {
        enabled: true,
        featured: true,
        slug: 'mt-data-relay',
        welcomeNote: 'Welcome to our live progress portal.',
        phaseMode: 'both',
        showPhotos: true,
      },
      state,
    };

    const dto = buildClientShowcaseDto(record);
    const serialized = JSON.stringify(dto);

    // Safe public fields retained
    expect(dto.slug).toBe('mt-data-relay');
    expect(dto.featured).toBe(true);
    expect(dto.foundations.length).toBe(13);
    expect(dto.verticalMastSummary?.sections.length).toBe(41);
    expect(dto.highlights.length).toBe(2);

    const latest = dto.highlights[0];
    expect(latest.preparedBy).toBe('Engr. Maria Santos');
    expect(latest.totalWorkers).toBe(12);
    expect(latest.foundationsWorked).toEqual(['PF-0']);
    expect(latest.safetyOfficer).toBe('SO. Carlo Reyes');
    expect(latest.weatherNotes).toBe('Clear sky, light breeze 8 km/h');
    expect(latest.safetyLogs).toEqual([
      {
        id: 'saf-1',
        timeOrActivity: '07:30 Toolbox Meeting',
        hazardOrFinding: 'All rigging & fall-arrest harnesses inspected',
        actionTaken: '100% PPE clearance issued',
        status: 'Compliant',
      },
    ]);
    expect(latest.equipment).toEqual([
      { id: 'eq-1', name: 'Transit Mixer', qty: 2, status: 'Operational' },
    ]);
    expect(latest.delays).toEqual([
      {
        id: 'del-1',
        description: 'Heavy morning squall paused crane lift',
        impact: '2 hrs weather standby',
      },
    ]);
    expect(latest.photos[0].url).toBe('/api/images/projects/p1/daily_log/pour.jpg');

    // Placeholder delays ("None" / "None.") are filtered out and engineer falls back cleanly
    const previous = dto.highlights[1];
    expect(previous.preparedBy).toBe('Engr. Christian C. Avila');
    expect(previous.delays).toEqual([]);

    // Sensitive internal fields completely removed
    expect(serialized).not.toContain('SECRET_WORKER_JOHN');
    expect(serialized).not.toContain('SECRET_ENG_NAME');
    expect(serialized).not.toContain('SECRET_HAULER_PAYOUT');
    expect(serialized).not.toContain('CONFIDENTIAL_RATE_REMARK');
    expect(serialized).not.toContain('SECRET_GENERATOR_SERIAL_999');
    expect(serialized).not.toContain('INTERNAL_WAREHOUSE_NOTE');
    expect(serialized).not.toContain('CONFIDENTIAL_REBAR_VENDOR_ISSUE');
    expect(serialized).not.toContain('QC_INSPECTOR_SECRET');
    expect(serialized).not.toContain('CONFIDENTIAL_DEFICIENCY_NOTE');
    expect(serialized).not.toContain('INTERNAL_REWORK_INSTRUCTION');
    expect(serialized).not.toContain('INTERNAL_DELAY_REMARK_ONLY');
    expect(serialized).not.toContain('NEAR_MISS_INTERNAL_ONLY');
    expect(serialized).not.toContain('45678.9');
  });

  it('respects phaseMode and showPhotos visibility toggles', () => {
    const state = createSampleMast2Project();
    const dto = buildClientShowcaseDto({
      id: 'proj-beta',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      clientSettings: {
        enabled: true,
        featured: false,
        phaseMode: 'foundation',
        showPhotos: false,
      },
      state,
    });

    expect(dto.verticalMastSummary).toBeUndefined();
    expect(dto.highlights).toEqual([]);
    expect(slugifyProjectSlug('Site #01 — Cebu North!', 'fallback')).toBe(
      'site-01-cebu-north'
    );
    expect(
      resolveClientShowcaseSettings({
        id: 'proj-beta',
        state,
      }).phaseMode
    ).toBe('both');
  });

  it('strips legacy unused schedule and schedulePhaseId data when loading saved workspaces', () => {
    const state = createSampleMast2Project() as unknown as Record<string, unknown>;
    state.schedule = [{ id: 'phase-1', stepNo: 1, title: 'Old Unused Phase' }];
    state.dailyLogs = [
      {
        id: 'dl-legacy',
        date: '2026-11-10',
        dayNumber: 1,
        weather: 'Sunny',
        schedulePhaseId: 'phase-1',
        activitiesSummary: 'Legacy log',
        foundationsWorked: ['PF-0'],
        workers: [],
        totalWorkers: 0,
        totalManHours: 0,
        cementUsedBags: 0,
        sandUsedBags: 0,
        gravelUsedBags: 0,
        issuesOrDelays: '',
      },
    ];

    const workspace = parseWorkspacePayload({
      activeProjectId: 'proj-legacy',
      projects: [
        {
          id: 'proj-legacy',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
          clientSettings: {
            enabled: true,
            featured: false,
            phaseMode: 'both',
            showSchedule: true,
            showPhotos: true,
          },
          state,
        },
      ],
    });

    expect(workspace).not.toBeNull();
    const normalized = workspace!.projects[0];
    expect('schedule' in normalized.state).toBe(false);
    expect('schedulePhaseId' in normalized.state.dailyLogs[0]).toBe(false);

    const dto = buildClientShowcaseDto(normalized) as unknown as Record<string, unknown>;
    expect('schedule' in dto).toBe(false);
    expect(
      'showSchedule' in (dto.settings as Record<string, unknown>)
    ).toBe(false);
  });
});
