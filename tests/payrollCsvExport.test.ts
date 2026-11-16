import { describe, expect, it } from 'vitest';
import { createSampleMast2Project } from '../src/entities/project/mast2Baseline';
import {
  generateCivilWorksPayrollCsv,
  generateHaulerPayrollCsv,
} from '../src/entities/project/payrollCsvExport';
import type {
  CivilWorksPayrollSnapshot,
  HaulerPayrollSnapshot,
} from '../src/entities/project/types';

describe('payrollCsvExport', () => {
  const project = createSampleMast2Project();

  it('generates well-formatted RFC 4180 CSV for civil works payroll', () => {
    const snapshot: CivilWorksPayrollSnapshot = {
      id: 'test-civ-1',
      periodType: 'weekly',
      startDate: '2026-05-18',
      endDate: '2026-05-24',
      title: 'Week 20 - May 18-24, 2026',
      items: [
        {
          memberId: 'm1',
          name: 'Albert Bernal',
          position: 'Skilled',
          dailyRatePhp: 700,
          daysPresent: 6,
          datesPresent: ['2026-05-18', '2026-05-19'],
          grossPayPhp: 4200,
          deductionPhp: 200,
          netPayPhp: 4000,
        },
      ],
      totalDaysWorked: 6,
      totalGrossPayPhp: 4200,
      totalDeductionPhp: 200,
      totalNetPayPhp: 4000,
      totalAmountPhp: 4000,
      status: 'generated',
      createdAt: '2026-05-24T12:00:00Z',
    };

    const csv = generateCivilWorksPayrollCsv(project, snapshot);
    expect(csv).toContain('SITE MANPOWER & PAYROLL LEDGER - CIVIL WORKS');
    expect(csv).toContain('Albert Bernal,Skilled,700,6,4200,200,4000');
    expect(csv).toContain('TOTAL,,,,6,4200,200,4000');
  });

  it('generates well-formatted CSV for hauler payroll with deductions and weights', () => {
    const snapshot: HaulerPayrollSnapshot = {
      id: 'test-haul-1',
      periodType: 'weekly',
      startDate: '2026-05-18',
      endDate: '2026-05-24',
      title: 'Week 20 Hauling',
      creditBlockKg: 120,
      ratePerBlockPhp: 1100,
      items: [
        {
          haulerName: 'Mario',
          activeDays: 2,
          tripsCompleted: 4,
          hauledKg: 240,
          priorExcessKg: 0,
          creditsEarned: 2,
          endingExcessKg: 0,
          grossEarnedPhp: 2200,
          alreadyPaidInRangePhp: 0,
          deductionPhp: 500,
          deductionNote: 'Cash advance, emergency',
          payoutReleasedPhp: 1700,
          netBalanceAfterPhp: 0,
        },
      ],
      totalHauledKg: 240,
      totalCredits: 2,
      totalEarnedPhp: 2200,
      totalDeductionPhp: 500,
      totalPayoutPhp: 1700,
      status: 'generated',
      createdAt: '2026-05-24T12:00:00Z',
    };

    const csv = generateHaulerPayrollCsv(project, snapshot);
    expect(csv).toContain('HAULING INVENTORY & PAYROLL LEDGER');
    expect(csv).toContain('Mario,2,4,240,0,2,0,2200,500,"Cash advance, emergency",1700');
    expect(csv).toContain('TOTAL,,,,240,,2,,2200,500,,1700');
  });

  it('escapes commas and quotes safely in CSV cells', () => {
    const snapshot: CivilWorksPayrollSnapshot = {
      id: 'test-civ-2',
      periodType: 'daily',
      startDate: '2026-05-18',
      endDate: '2026-05-18',
      title: 'Day 1',
      items: [
        {
          memberId: 'm2',
          name: 'Gaon, "Sonny" Jr.',
          position: 'Foreman',
          dailyRatePhp: 800,
          daysPresent: 1,
          datesPresent: ['2026-05-18'],
          grossPayPhp: 800,
          deductionPhp: 0,
          netPayPhp: 800,
        },
      ],
      totalDaysWorked: 1,
      totalGrossPayPhp: 800,
      totalDeductionPhp: 0,
      totalNetPayPhp: 800,
      totalAmountPhp: 800,
      status: 'paid',
      createdAt: '2026-05-18T18:00:00Z',
    };

    const csv = generateCivilWorksPayrollCsv(project, snapshot);
    expect(csv).toContain('"Gaon, ""Sonny"" Jr."');
  });
});
