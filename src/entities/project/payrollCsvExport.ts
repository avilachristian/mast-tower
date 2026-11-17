import type {
  CivilWorksPayrollSnapshot,
  HaulerPayrollSnapshot,
  PayrollReportProject,
} from './types';
import { todayLocalIso } from '@/shared/lib/dateUtils';

export type CivilWorksPayrollExportInput =
  | CivilWorksPayrollSnapshot
  | Omit<CivilWorksPayrollSnapshot, 'id' | 'createdAt'>;

export type HaulerPayrollExportInput =
  | HaulerPayrollSnapshot
  | Omit<HaulerPayrollSnapshot, 'id' | 'createdAt'>;

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerCsvDownload(csvContent: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function generateCivilWorksPayrollCsv(
  project: PayrollReportProject,
  snapshot: CivilWorksPayrollExportInput
): string {
  const rows: string[][] = [];

  const projName = project.reportDetails?.projectName || project.projectName;
  const contractor = project.reportDetails?.contractor || project.contractor;
  const location = project.reportDetails?.projectLocation || project.location;

  rows.push(['SITE MANPOWER & PAYROLL LEDGER - CIVIL WORKS']);
  rows.push(['Project Name', projName]);
  rows.push(['Contractor', contractor]);
  rows.push(['Location', location]);
  rows.push(['Period Type', snapshot.periodType.toUpperCase()]);
  rows.push(['Coverage Period', `${snapshot.startDate} to ${snapshot.endDate}`]);
  rows.push(['Status', snapshot.status.toUpperCase()]);
  rows.push(['Export Date', todayLocalIso()]);
  rows.push([]); // blank separator

  rows.push([
    '#',
    'Personnel Name',
    'Position',
    'Daily Rate (PHP)',
    'Days Worked',
    'Gross Pay (PHP)',
    'Deduction (PHP)',
    'Net Pay (PHP)',
    'Signature / Remarks',
  ]);

  snapshot.items.forEach((item, idx) => {
    const ded = item.deductionPhp ?? 0;
    const net = item.netPayPhp ?? Math.round((item.grossPayPhp - ded) * 100) / 100;
    rows.push([
      String(idx + 1),
      item.name,
      item.position,
      String(item.dailyRatePhp),
      String(item.daysPresent),
      String(item.grossPayPhp),
      String(ded),
      String(net),
      '',
    ]);
  });

  const grossTotal =
    snapshot.totalGrossPayPhp ??
    snapshot.items.reduce((sum, i) => sum + i.grossPayPhp, 0);
  const dedTotal =
    snapshot.totalDeductionPhp ??
    snapshot.items.reduce((sum, i) => sum + (i.deductionPhp ?? 0), 0);
  const netTotal =
    snapshot.totalNetPayPhp ??
    snapshot.items.reduce(
      (sum, i) => sum + (i.netPayPhp ?? i.grossPayPhp - (i.deductionPhp ?? 0)),
      0
    );

  // Summary Row
  rows.push([
    'TOTAL',
    '',
    '',
    '',
    String(snapshot.totalDaysWorked),
    String(grossTotal),
    String(dedTotal),
    String(netTotal),
    '',
  ]);

  return rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
}

export function downloadCivilWorksPayrollCsv(
  project: PayrollReportProject,
  snapshot: CivilWorksPayrollExportInput
): void {
  const csv = generateCivilWorksPayrollCsv(project, snapshot);
  const filename = `Payroll-CivilWorks-${snapshot.periodType}-${snapshot.startDate}-to-${snapshot.endDate}.csv`;
  triggerCsvDownload(csv, filename);
}

export function generateHaulerPayrollCsv(
  project: PayrollReportProject,
  snapshot: HaulerPayrollExportInput
): string {
  const rows: string[][] = [];

  const projName = project.reportDetails?.projectName || project.projectName;
  const contractor = project.reportDetails?.contractor || project.contractor;
  const location = project.reportDetails?.projectLocation || project.location;
  const blockKg = snapshot.creditBlockKg ?? 120;
  const ratePerBlock = snapshot.ratePerBlockPhp ?? 1100;

  rows.push(['HAULING INVENTORY & PAYROLL LEDGER']);
  rows.push(['Project Name', projName]);
  rows.push(['Contractor', contractor]);
  rows.push(['Location', location]);
  rows.push(['Period Type', snapshot.periodType.toUpperCase()]);
  rows.push(['Coverage Period', `${snapshot.startDate} to ${snapshot.endDate}`]);
  rows.push([`Rate Per ${blockKg}kg Block (PHP)`, String(ratePerBlock)]);
  rows.push(['Status', snapshot.status.toUpperCase()]);
  rows.push(['Export Date', todayLocalIso()]);
  rows.push([]); // blank separator

  rows.push([
    '#',
    'Hauler Name',
    'Active Days',
    'Trips',
    'Hauled (kg)',
    'Prior Excess (kg)',
    `Credits (${blockKg}kg blocks)`,
    'Ending Excess (kg)',
    'Gross Earned (PHP)',
    'Deduction / Cash Advance (PHP)',
    'Deduction Remarks',
    'Net Payout (PHP)',
    'Signature',
  ]);

  snapshot.items.forEach((item, idx) => {
    const ded = item.deductionPhp ?? 0;
    rows.push([
      String(idx + 1),
      item.haulerName,
      String(item.activeDays),
      String(item.tripsCompleted),
      String(item.hauledKg),
      String(item.priorExcessKg),
      String(item.creditsEarned),
      String(item.endingExcessKg),
      String(item.grossEarnedPhp),
      String(ded),
      item.deductionNote?.trim() ?? '',
      String(item.payoutReleasedPhp),
      '',
    ]);
  });

  const grossTotal =
    snapshot.totalEarnedPhp ??
    snapshot.items.reduce((sum, i) => sum + i.grossEarnedPhp, 0);
  const dedTotal =
    snapshot.totalDeductionPhp ??
    snapshot.items.reduce((sum, i) => sum + (i.deductionPhp ?? 0), 0);
  const netTotal =
    snapshot.totalPayoutPhp ??
    snapshot.items.reduce((sum, i) => sum + i.payoutReleasedPhp, 0);

  // Summary Row
  rows.push([
    'TOTAL',
    '',
    '',
    '',
    String(snapshot.totalHauledKg),
    '',
    String(snapshot.totalCredits),
    '',
    String(grossTotal),
    String(dedTotal),
    '',
    String(netTotal),
    '',
  ]);

  return rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
}

export function downloadHaulerPayrollCsv(
  project: PayrollReportProject,
  snapshot: HaulerPayrollExportInput
): void {
  const csv = generateHaulerPayrollCsv(project, snapshot);
  const filename = `Payroll-Hauler-${snapshot.periodType}-${snapshot.startDate}-to-${snapshot.endDate}.csv`;
  triggerCsvDownload(csv, filename);
}
