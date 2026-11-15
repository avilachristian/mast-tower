import { describe, expect, it } from 'vitest';
import {
  buildClientShowcaseDto,
  resolveClientShowcaseSettings,
  slugifyProjectSlug,
} from '../src/entities/project/clientProjection';
import { createSampleMast2Project } from '../src/entities/project/mast2Baseline';
import type { SavedProjectRecord } from '../src/entities/project/types';
import { createInitialVerticalMastState } from '../src/entities/project/verticalMastBaseline';

describe('Client Showcase Sanitized Projection', () => {
  it('strips sensitive internal payroll, hauler payouts, inventory, inspection remarks, and delays', () => {
    const state = createSampleMast2Project();
    state.verticalMast = createInitialVerticalMastState();

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
        schedulePhaseId: 'step-1',
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
        documentationItems: [
          {
            id: 'doc-1',
            photoDataUrl: '/api/images/projects/p1/daily_log/pour.jpg',
            photoName: 'pour.jpg',
            description: 'PF-0 Concrete Pouring Progress',
          },
        ],
        issuesOrDelays: 'INTERNAL_UNION_DISPUTE_DELAY',
        safetyAndVisitors: 'NEAR_MISS_INTERNAL_ONLY',
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
        showSchedule: true,
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
    expect(dto.highlights.length).toBe(1);
    expect(dto.highlights[0].photos[0].url).toBe(
      '/api/images/projects/p1/daily_log/pour.jpg'
    );
    expect(dto.schedule.length).toBeGreaterThan(0);

    // Sensitive internal fields completely removed
    expect(serialized).not.toContain('SECRET_WORKER_JOHN');
    expect(serialized).not.toContain('SECRET_HAULER_PAYOUT');
    expect(serialized).not.toContain('CONFIDENTIAL_RATE_REMARK');
    expect(serialized).not.toContain('SECRET_GENERATOR_SERIAL_999');
    expect(serialized).not.toContain('CONFIDENTIAL_REBAR_VENDOR_ISSUE');
    expect(serialized).not.toContain('QC_INSPECTOR_SECRET');
    expect(serialized).not.toContain('CONFIDENTIAL_DEFICIENCY_NOTE');
    expect(serialized).not.toContain('INTERNAL_REWORK_INSTRUCTION');
    expect(serialized).not.toContain('INTERNAL_UNION_DISPUTE_DELAY');
    expect(serialized).not.toContain('NEAR_MISS_INTERNAL_ONLY');
    expect(serialized).not.toContain('45678.9');
  });

  it('respects phaseMode, showSchedule, and showPhotos visibility toggles', () => {
    const state = createSampleMast2Project();
    const dto = buildClientShowcaseDto({
      id: 'proj-beta',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      clientSettings: {
        enabled: true,
        featured: false,
        phaseMode: 'foundation',
        showSchedule: false,
        showPhotos: false,
      },
      state,
    });

    expect(dto.verticalMastSummary).toBeUndefined();
    expect(dto.schedule).toEqual([]);
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
});
