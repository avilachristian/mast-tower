import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import { PayrollReportSheet } from '../src/widgets/manpower/PayrollPrintModal';

describe('PayrollReportSheet Engineering Sheet Formatting', () => {
  it('renders Weekly P/A/NW attendance grid with Gross, Deduction, Net Pay, Legend, and optional Signature', () => {
    const baseProject = createCleanBaselineProject();
    // Simulate Wed Nov 18 having site work (another worker attended), while Sun Nov 22 had zero site work (NW)
    const project = {
      ...baseProject,
      civilAttendance: [
        { date: '2026-11-16', presentMemberIds: ['m1'] },
        { date: '2026-11-17', presentMemberIds: ['m1'] },
        { date: '2026-11-18', presentMemberIds: ['m2'] },
        { date: '2026-11-19', presentMemberIds: ['m1'] },
        { date: '2026-11-20', presentMemberIds: ['m1'] },
        { date: '2026-11-21', presentMemberIds: ['m2'] },
      ],
    };

    const civilWeeklyData = {
      kind: 'civil' as const,
      snapshot: {
        id: 'pay-civil-wk',
        periodType: 'weekly' as const,
        startDate: '2026-11-16',
        endDate: '2026-11-22',
        title: 'Weekly (2026-11-16 to 2026-11-22)',
        items: [
          {
            memberId: 'm1',
            name: 'Christian Avila',
            position: 'Mason' as const,
            dailyRatePhp: 500,
            daysPresent: 4,
            datesPresent: ['2026-11-16', '2026-11-17', '2026-11-19', '2026-11-20'],
            grossPayPhp: 2000,
            deductionPhp: 1000,
            netPayPhp: 1000,
          },
        ],
        totalDaysWorked: 4,
        totalGrossPayPhp: 2000,
        totalDeductionPhp: 1000,
        totalNetPayPhp: 1000,
        totalAmountPhp: 1000,
        status: 'generated' as const,
        notes: 'Approved for release.',
        createdAt: '2026-11-22T00:00:00Z',
      },
    };

    const withSigHtml = renderToStaticMarkup(
      createElement(PayrollReportSheet, {
        project,
        data: civilWeeklyData,
        showSignature: true,
      })
    );

    expect(withSigHtml).toContain('border-2 border-slate-900');
    expect(withSigHtml).toContain('Civil Works Attendance Payroll Ledger');
    expect(withSigHtml).toContain('MON');
    expect(withSigHtml).toContain('SUN');
    expect(withSigHtml).toContain('>P<');
    expect(withSigHtml).toContain('>A<');
    expect(withSigHtml).toContain('>NW<');
    expect(withSigHtml).toContain('Gross Pay (₱)');
    expect(withSigHtml).toContain('Deduction (₱)');
    expect(withSigHtml).toContain('Net Pay (₱)');
    expect(withSigHtml).toContain('Signature');
    expect(withSigHtml).toContain('₱2,000');
    expect(withSigHtml).toContain('₱1,000');
    expect(withSigHtml).toContain('Legend:');
    expect(withSigHtml).not.toMatch(/\brounded(?:-[a-z0-9]+)?\b/);

    const withoutSigHtml = renderToStaticMarkup(
      createElement(PayrollReportSheet, {
        project,
        data: civilWeeklyData,
        showSignature: false,
      })
    );
    expect(withoutSigHtml).not.toContain('Signature');
  });

  it('adapts Monthly Civil Payroll to Week 1..Week 5 present counts and renders Daily & Hauler sheets without rounded corners', () => {
    const project = createCleanBaselineProject();

    const monthlyHtml = renderToStaticMarkup(
      createElement(PayrollReportSheet, {
        project: {
          ...project,
          civilAttendance: [
            { date: '2026-11-02', presentMemberIds: ['m1'] },
            { date: '2026-11-16', presentMemberIds: ['m1'] },
            { date: '2026-11-17', presentMemberIds: ['m1'] },
          ],
        },
        data: {
          kind: 'civil',
          snapshot: {
            id: 'pay-civil-mo',
            periodType: 'monthly',
            startDate: '2026-11-01',
            endDate: '2026-11-30',
            title: 'Monthly — November 2026',
            items: [
              {
                memberId: 'm1',
                name: 'Christian Avila',
                position: 'Mason',
                dailyRatePhp: 500,
                daysPresent: 3,
                datesPresent: ['2026-11-02', '2026-11-16', '2026-11-17'],
                grossPayPhp: 1500,
                deductionPhp: 0,
                netPayPhp: 1500,
              },
            ],
            totalDaysWorked: 3,
            totalAmountPhp: 1500,
            status: 'generated',
            createdAt: '2026-11-30T00:00:00Z',
          },
        },
        showSignature: false,
      })
    );

    expect(monthlyHtml).toContain('Attendance (Days Present per Week)');
    expect(monthlyHtml).toContain('Week 1');
    expect(monthlyHtml).toContain('(1–7)');
    expect(monthlyHtml).toContain('Week 3');
    expect(monthlyHtml).toContain('(15–21)');
    expect(monthlyHtml).toContain('Week 5');
    expect(monthlyHtml).toContain('(29–30)');
    expect(monthlyHtml).not.toContain('Signature');
    expect(monthlyHtml).not.toMatch(/\brounded(?:-[a-z0-9]+)?\b/);

    const dailyHtml = renderToStaticMarkup(
      createElement(PayrollReportSheet, {
        project,
        data: {
          kind: 'civil',
          snapshot: {
            id: 'pay-civil-day',
            periodType: 'daily',
            startDate: '2026-11-16',
            endDate: '2026-11-16',
            title: 'Daily — Mon, Nov 16, 2026',
            items: [
              {
                memberId: 'm1',
                name: 'Christian Avila',
                position: 'Mason',
                dailyRatePhp: 500,
                daysPresent: 1,
                datesPresent: ['2026-11-16'],
                grossPayPhp: 500,
              },
            ],
            totalDaysWorked: 1,
            totalAmountPhp: 500,
            status: 'generated',
            createdAt: '2026-11-16T00:00:00Z',
          },
        },
      })
    );
    expect(dailyHtml).toContain('>P<');
    expect(dailyHtml).not.toMatch(/\brounded(?:-[a-z0-9]+)?\b/);

    const haulerHtml = renderToStaticMarkup(
      createElement(PayrollReportSheet, {
        project,
        data: {
          kind: 'hauler',
          snapshot: {
            id: 'pay-haul-1',
            periodType: 'weekly',
            startDate: '2026-11-01',
            endDate: '2026-11-07',
            title: 'Week 1 Hauling',
            items: [
              {
                haulerName: 'Hauler A',
                activeDays: 3,
                tripsCompleted: 6,
                hauledKg: 360,
                priorExcessKg: 0,
                creditsEarned: 3,
                endingExcessKg: 0,
                grossEarnedPhp: 1500,
                alreadyPaidInRangePhp: 0,
                payoutReleasedPhp: 1500,
                netBalanceAfterPhp: 0,
              },
            ],
            totalHauledKg: 360,
            totalCredits: 3,
            totalEarnedPhp: 1500,
            totalPayoutPhp: 1500,
            status: 'paid',
            paidDate: '2026-11-08',
            createdAt: '2026-11-07T00:00:00Z',
          },
        },
        showSignature: false,
      })
    );

    expect(haulerHtml).toContain('border-2 border-slate-900');
    expect(haulerHtml).toContain('Horse Hauling Payroll &amp; Settlement Ledger');
    expect(haulerHtml).not.toContain('Signature');
    expect(haulerHtml).not.toMatch(/\brounded(?:-[a-z0-9]+)?\b/);
  });

  it('displays snapshot custom credit weight & pay per block, or falls back to project haulingRateConfig', () => {
    const baseProject = createCleanBaselineProject();
    const projectWithCustomRate = {
      ...baseProject,
      haulingRateConfig: {
        creditBlockKg: 80,
        ratePerBlockPhp: 950,
      },
    };

    const snapshotWithRateHtml = renderToStaticMarkup(
      createElement(PayrollReportSheet, {
        project: projectWithCustomRate,
        data: {
          kind: 'hauler',
          snapshot: {
            id: 'pay-haul-custom',
            periodType: 'weekly',
            startDate: '2026-11-01',
            endDate: '2026-11-07',
            title: 'Custom Snapshot Rate',
            items: [
              {
                haulerName: 'Hauler A',
                activeDays: 2,
                tripsCompleted: 3,
                hauledKg: 250,
                priorExcessKg: 0,
                creditsEarned: 2,
                endingExcessKg: 50,
                grossEarnedPhp: 3000,
                alreadyPaidInRangePhp: 0,
                payoutReleasedPhp: 3000,
                netBalanceAfterPhp: 0,
              },
            ],
            totalHauledKg: 250,
            totalCredits: 2,
            totalEarnedPhp: 3000,
            totalPayoutPhp: 3000,
            creditBlockKg: 100,
            ratePerBlockPhp: 1500,
            status: 'generated',
            createdAt: '2026-11-07T00:00:00Z',
          },
        },
        showSignature: false,
      })
    );

    expect(snapshotWithRateHtml).toContain('₱1,500 per 100 kg Block');
    expect(snapshotWithRateHtml).toContain('Credits (100kg)');

    const snapshotFallbackHtml = renderToStaticMarkup(
      createElement(PayrollReportSheet, {
        project: projectWithCustomRate,
        data: {
          kind: 'hauler',
          snapshot: {
            id: 'pay-haul-fallback',
            periodType: 'weekly',
            startDate: '2026-11-08',
            endDate: '2026-11-14',
            title: 'Fallback Rate',
            items: [],
            totalHauledKg: 0,
            totalCredits: 0,
            totalEarnedPhp: 0,
            totalPayoutPhp: 0,
            status: 'generated',
            createdAt: '2026-11-14T00:00:00Z',
          },
        },
      })
    );

    expect(snapshotFallbackHtml).toContain('₱950 per 80 kg Block');
    expect(snapshotFallbackHtml).toContain('Credits (80kg)');
  });
});
