import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download } from 'lucide-react';
import { formatDateWithWeekday } from '@/entities/project/calculations';
import {
  downloadCivilWorksPayrollCsv,
  downloadHaulerPayrollCsv,
} from '@/entities/project/payrollCsvExport';
import { resolveHaulingRateConfig } from '@/entities/project/haulingInventory';
import {
  buildAttendanceDayColumns,
  buildMonthBucketsForRange,
  buildWeeklyBucketsForRange,
  formatCivilPayrollPlainText,
  formatHaulerPayrollPlainText,
  resolveCivilAttendanceCode,
} from '@/entities/project/manpowerPayroll';
import type {
  CivilWorksPayrollSnapshot,
  HaulerPayrollSnapshot,
  MastProjectState,
} from '@/entities/project/types';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useUiStore } from '@/shared/state/uiStore';
import { PrintModalHeader, usePrintPageSetup } from '@/widgets/report/PrintPageControls';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveReportDetails,
} from '@/widgets/report/ReportLetterhead';
import {
  ReportSignoffOverrideProvider,
  useReportSignoffOverrideControls,
} from '@/widgets/report/ReportSignoffOverrideContext';

export type PayrollSheetData =
  | { kind: 'civil'; snapshot: CivilWorksPayrollSnapshot }
  | { kind: 'hauler'; snapshot: HaulerPayrollSnapshot };

function formatNum(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function PayrollReportSheet({
  project,
  data,
  showSignature = true,
  showStatus = true,
}: {
  project: MastProjectState;
  data: PayrollSheetData;
  showSignature?: boolean;
  showStatus?: boolean;
}) {
  const isCivil = data.kind === 'civil';
  const civilSnapshot = data.kind === 'civil' ? data.snapshot : null;
  const haulerSnapshot = data.kind === 'hauler' ? data.snapshot : null;
  const snapshot = data.snapshot;
  const projectRateConfig = resolveHaulingRateConfig(project);
  const creditBlockKg =
    haulerSnapshot?.creditBlockKg ?? projectRateConfig.creditBlockKg;
  const ratePerBlockPhp =
    haulerSnapshot?.ratePerBlockPhp ?? projectRateConfig.ratePerBlockPhp;
  const projectName =
    project.reportDetails?.projectName?.trim() || project.projectName;
  const projectLocation =
    project.reportDetails?.projectLocation?.trim() || project.location;
  const effectiveDetails = resolveReportDetails(project, {
    reportDate: snapshot.endDate || project.lastUpdated,
  });

  const civilTotals = civilSnapshot
    ? (() => {
        const gross =
          civilSnapshot.totalGrossPayPhp ??
          civilSnapshot.items.reduce((sum, i) => sum + i.grossPayPhp, 0);
        const deduction =
          civilSnapshot.totalDeductionPhp ??
          civilSnapshot.items.reduce((sum, i) => sum + (i.deductionPhp ?? 0), 0);
        const net =
          civilSnapshot.totalNetPayPhp ??
          civilSnapshot.items.reduce(
            (sum, i) => sum + (i.netPayPhp ?? i.grossPayPhp - (i.deductionPhp ?? 0)),
            0
          );
        return { gross, deduction, net };
      })()
    : null;

  const haulerTotals = haulerSnapshot
    ? (() => {
        const earned =
          haulerSnapshot.totalEarnedPhp ??
          haulerSnapshot.items.reduce((sum, i) => sum + i.grossEarnedPhp, 0);
        const deduction =
          haulerSnapshot.totalDeductionPhp ??
          haulerSnapshot.items.reduce((sum, i) => sum + (i.deductionPhp ?? 0), 0);
        const payout =
          haulerSnapshot.totalPayoutPhp ??
          haulerSnapshot.items.reduce((sum, i) => sum + i.payoutReleasedPhp, 0);
        return { earned, deduction, payout };
      })()
    : null;

  const civilMatrix = civilSnapshot
    ? (() => {
        const dayCols = buildAttendanceDayColumns(
          civilSnapshot.startDate,
          civilSnapshot.endDate
        );
        const siteActiveDates = new Set<string>();
        for (const rec of project.civilAttendance ?? []) {
          if (
            rec.date >= civilSnapshot.startDate &&
            rec.date <= civilSnapshot.endDate &&
            rec.presentMemberIds.length > 0
          ) {
            siteActiveDates.add(rec.date);
          }
        }
        for (const item of civilSnapshot.items) {
          for (const d of item.datesPresent) {
            if (d >= civilSnapshot.startDate && d <= civilSnapshot.endDate) {
              siteActiveDates.add(d);
            }
          }
        }

        const spansMultiMonth =
          civilSnapshot.startDate.slice(0, 7) !== civilSnapshot.endDate.slice(0, 7);

        if (
          snapshot.periodType === 'daily' ||
          snapshot.periodType === 'weekly' ||
          (snapshot.periodType === 'overall' &&
            dayCols.length > 0 &&
            dayCols.length <= 10)
        ) {
          return {
            mode: 'days' as const,
            dayCols,
            spansMultiMonth,
            siteActiveDates,
          };
        }

        if (
          snapshot.periodType === 'monthly' ||
          (snapshot.periodType === 'overall' && dayCols.length <= 45)
        ) {
          return {
            mode: 'weeks' as const,
            buckets: buildWeeklyBucketsForRange(
              snapshot.startDate,
              snapshot.endDate
            ),
            siteActiveDates,
          };
        }

        const monthBuckets = buildMonthBucketsForRange(
          snapshot.startDate,
          snapshot.endDate
        );
        if (monthBuckets.length > 0 && monthBuckets.length <= 6) {
          return {
            mode: 'months' as const,
            buckets: monthBuckets,
            siteActiveDates,
          };
        }

        return {
          mode: 'summary' as const,
          totalDaysSpan: dayCols.length,
          siteActiveDates,
        };
      })()
    : null;

  return (
    <div className="bg-white text-slate-900 p-4 sm:p-6 pdf-desktop:p-6 print:p-2">
      <ReportLetterhead
        details={effectiveDetails}
        kicker={
          isCivil
            ? 'SITE MANPOWER & PAYROLL SUMMARY'
            : 'HORSE HAULING SETTLEMENT & PAYROLL'
        }
        defaultTitle={snapshot.title}
        subtitle={
          isCivil
            ? `Civil Works Attendance Payroll (${snapshot.periodType.toUpperCase()})`
            : `Individual Hauler Payroll — ₱${ratePerBlockPhp.toLocaleString()} per ${formatNum(creditBlockKg)} kg Block`
        }
        fallbackProjectName={project.projectName}
        fallbackLocation={project.location}
        fallbackContractor={project.contractor}
        fallbackDate={snapshot.endDate}
      />

      <div className="border-2 border-slate-900 bg-white text-xs">
        {/* Flush Period Metadata Strip */}
        <div
          className={`grid ${
            showStatus
              ? 'grid-cols-2 sm:grid-cols-4 pdf-desktop:grid-cols-4 print:grid-cols-4'
              : 'grid-cols-1 sm:grid-cols-3 pdf-desktop:grid-cols-3 print:grid-cols-3'
          } divide-y sm:divide-y-0 sm:divide-x pdf-desktop:divide-y-0 pdf-desktop:divide-x print:divide-y-0 print:divide-x divide-slate-900 border-b-2 border-slate-900 bg-slate-50`}
        >
          <div className="p-2.5">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Payroll Type
            </div>
            <div className="font-bold text-slate-900 capitalize mt-0.5">
              {snapshot.periodType} ({isCivil ? 'Civil Works' : 'Individual Haulers'})
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Coverage Dates
            </div>
            <div className="font-semibold text-slate-900 mt-0.5">
              {formatDateWithWeekday(snapshot.startDate)}
              {snapshot.startDate !== snapshot.endDate &&
                ` – ${formatDateWithWeekday(snapshot.endDate)}`}
            </div>
          </div>
          {showStatus && (
            <div className="p-2.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">
                Status
              </div>
              <div className="mt-0.5">
                <span
                  className={`inline-block px-1.5 py-0.5 border text-[10px] font-bold uppercase ${
                    snapshot.status === 'paid'
                      ? 'bg-emerald-50 border-emerald-700 text-emerald-800'
                      : 'bg-amber-50 border-amber-700 text-amber-800'
                  }`}
                >
                  {snapshot.status === 'paid'
                    ? `PAID${snapshot.paidDate ? ` (${snapshot.paidDate})` : ''}`
                    : 'FOR APPROVAL / PENDING'}
                </span>
              </div>
            </div>
          )}
          <div className="p-2.5 text-right">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              {isCivil ? 'Total Net Payroll' : 'Total Net Payout'}
            </div>
            <div className="text-base font-extrabold text-emerald-800 tabular-nums mt-0.5">
              ₱
              {(civilTotals
                ? civilTotals.net
                : haulerTotals?.payout ?? 0
              ).toLocaleString()}
            </div>
            {civilTotals && civilTotals.deduction > 0 && (
              <div className="text-[10px] text-slate-600 tabular-nums">
                Gross ₱{civilTotals.gross.toLocaleString()} − Ded. ₱
                {civilTotals.deduction.toLocaleString()}
              </div>
            )}
            {haulerTotals && haulerTotals.deduction > 0 && (
              <div className="text-[10px] text-slate-600 tabular-nums">
                Earned ₱{haulerTotals.earned.toLocaleString()} − Ded. ₱
                {haulerTotals.deduction.toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Ledger Section Header */}
        <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-[11px] flex items-center justify-between">
          <span>
            {civilSnapshot
              ? `Civil Works Attendance Payroll Ledger (${civilSnapshot.items.length} Personnel)`
              : `Horse Hauling Payroll & Settlement Ledger (${haulerSnapshot?.items.length ?? 0} Haulers)`}
          </span>
          <span className="text-[10px] font-semibold text-slate-600 normal-case tabular-nums">
            {civilSnapshot
              ? `${civilSnapshot.totalDaysWorked} total man-days`
              : `${haulerSnapshot?.totalCredits ?? 0} credits (${formatNum(haulerSnapshot?.totalHauledKg ?? 0)} kg)`}
          </span>
        </div>

        {/* Flush Ledger Table */}
        {civilSnapshot && civilMatrix && civilTotals ? (
          <>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left text-[10.5px] print:text-[9.5px] border-collapse">
                <thead>
                  {civilMatrix.mode === 'days' ? (
                    <>
                      <tr className="bg-slate-100 text-slate-800 border-b border-slate-900 font-bold uppercase text-[9.5px] print:text-[8.5px] leading-tight">
                        <th
                          rowSpan={3}
                          className="px-1 py-1 border-r border-slate-900 w-5 text-center align-middle"
                        >
                          #
                        </th>
                        <th
                          rowSpan={3}
                          className="px-1.5 py-1 border-r border-slate-900 align-middle"
                        >
                          Name
                        </th>
                        <th
                          rowSpan={3}
                          className="px-1.5 py-1 border-r border-slate-900 align-middle"
                        >
                          Position
                        </th>
                        <th
                          rowSpan={3}
                          className="px-1 py-1 border-r border-slate-900 text-right align-middle whitespace-nowrap"
                        >
                          Rate (₱)
                        </th>
                        <th
                          colSpan={civilMatrix.dayCols.length}
                          className="px-0.5 py-1 border-r border-slate-900 text-center"
                        >
                          Attendance
                        </th>
                        <th
                          rowSpan={3}
                          className="px-1 py-1 border-r border-slate-900 text-center align-middle whitespace-nowrap"
                        >
                          Days
                        </th>
                        <th
                          rowSpan={3}
                          className="px-1 py-1 border-r border-slate-900 text-right align-middle whitespace-nowrap"
                        >
                          Gross Pay (₱)
                        </th>
                        <th
                          rowSpan={3}
                          className="px-1 py-1 border-r border-slate-900 text-right align-middle whitespace-nowrap"
                        >
                          Deduction (₱)
                        </th>
                        <th
                          rowSpan={3}
                          className={`px-1.5 py-1 text-right align-middle whitespace-nowrap ${
                            showSignature ? 'border-r border-slate-900' : ''
                          }`}
                        >
                          Net Pay (₱)
                        </th>
                        {showSignature && (
                          <th
                            rowSpan={3}
                            className="px-1 py-1 text-center align-middle w-20 print:w-16"
                          >
                            Signature
                          </th>
                        )}
                      </tr>
                      <tr className="bg-slate-50 text-slate-900 border-b border-slate-900 font-bold text-[9.5px] print:text-[8.5px]">
                        {civilMatrix.dayCols.map((col) => (
                          <th
                            key={col.date}
                            className="px-0.5 py-0.5 border-r border-slate-900 text-center tabular-nums min-w-[18px] print:min-w-0"
                          >
                            {civilMatrix.spansMultiMonth
                              ? col.monthDayLabel
                              : col.dayNum}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-slate-50 text-slate-600 border-b border-slate-900 font-bold uppercase text-[8.5px] print:text-[7.5px]">
                        {civilMatrix.dayCols.map((col) => (
                          <th
                            key={`${col.date}-wk`}
                            className="px-0.5 py-0.5 border-r border-slate-900 text-center"
                          >
                            {col.weekdayShort}
                          </th>
                        ))}
                      </tr>
                    </>
                  ) : civilMatrix.mode === 'weeks' ||
                    civilMatrix.mode === 'months' ? (
                    <>
                      <tr className="bg-slate-100 text-slate-800 border-b border-slate-900 font-bold uppercase text-[9px] print:text-[8px] leading-tight">
                        <th
                          rowSpan={2}
                          className="px-1 py-1 border-r border-slate-900 w-5 text-center align-middle"
                        >
                          #
                        </th>
                        <th
                          rowSpan={2}
                          className="px-1.5 py-1 border-r border-slate-900 align-middle"
                        >
                          Name
                        </th>
                        <th
                          rowSpan={2}
                          className="px-1.5 py-1 border-r border-slate-900 align-middle"
                        >
                          Position
                        </th>
                        <th
                          rowSpan={2}
                          className="px-1 py-1 border-r border-slate-900 text-right align-middle whitespace-nowrap"
                        >
                          Rate (₱)
                        </th>
                        <th
                          colSpan={civilMatrix.buckets.length}
                          className="px-1 py-1 border-r border-slate-900 text-center"
                        >
                          {civilMatrix.mode === 'weeks'
                            ? 'Attendance (Days Present per Week)'
                            : 'Attendance (Days Present per Month)'}
                        </th>
                        <th
                          rowSpan={2}
                          className="px-1 py-1 border-r border-slate-900 text-center align-middle whitespace-nowrap"
                        >
                          Days
                        </th>
                        <th
                          rowSpan={2}
                          className="px-1 py-1 border-r border-slate-900 text-right align-middle whitespace-nowrap"
                        >
                          Gross Pay (₱)
                        </th>
                        <th
                          rowSpan={2}
                          className="px-1 py-1 border-r border-slate-900 text-right align-middle whitespace-nowrap"
                        >
                          Deduction (₱)
                        </th>
                        <th
                          rowSpan={2}
                          className={`px-1.5 py-1 text-right align-middle whitespace-nowrap ${
                            showSignature ? 'border-r border-slate-900' : ''
                          }`}
                        >
                          Net Pay (₱)
                        </th>
                        {showSignature && (
                          <th
                            rowSpan={2}
                            className="px-1 py-1 text-center align-middle w-20 print:w-16"
                          >
                            Signature
                          </th>
                        )}
                      </tr>
                      <tr className="bg-slate-50 text-slate-800 border-b border-slate-900 font-bold text-[9px] print:text-[8px]">
                        {civilMatrix.buckets.map((b) => (
                          <th
                            key={`${b.label}-${b.rangeLabel}`}
                            className="px-1 py-1 border-r border-slate-900 text-center leading-tight"
                          >
                            <div className="uppercase">{b.label}</div>
                            <div className="text-[8.5px] font-semibold text-slate-500">
                              ({b.rangeLabel})
                            </div>
                          </th>
                        ))}
                      </tr>
                    </>
                  ) : (
                    <tr className="bg-slate-100 text-slate-800 border-b border-slate-900 font-bold uppercase text-[9px] print:text-[8px] leading-tight">
                      <th className="px-1 py-1.5 border-r border-slate-900 w-5 text-center">
                        #
                      </th>
                      <th className="px-1.5 py-1.5 border-r border-slate-900">Name</th>
                      <th className="px-1.5 py-1.5 border-r border-slate-900">Position</th>
                      <th className="px-1.5 py-1.5 border-r border-slate-900 text-right whitespace-nowrap">
                        Rate (₱)
                      </th>
                      <th className="px-1.5 py-1.5 border-r border-slate-900 text-center">
                        Attendance Span
                      </th>
                      <th className="px-1 py-1.5 border-r border-slate-900 text-center whitespace-nowrap">
                        Days
                      </th>
                      <th className="px-1.5 py-1.5 border-r border-slate-900 text-right whitespace-nowrap">
                        Gross Pay (₱)
                      </th>
                      <th className="px-1.5 py-1.5 border-r border-slate-900 text-right whitespace-nowrap">
                        Deduction (₱)
                      </th>
                      <th
                        className={`px-1.5 py-1.5 text-right whitespace-nowrap ${
                          showSignature ? 'border-r border-slate-900' : ''
                        }`}
                      >
                        Net Pay (₱)
                      </th>
                      {showSignature && (
                        <th className="px-1 py-1.5 text-center w-20 print:w-16">
                          Signature
                        </th>
                      )}
                    </tr>
                  )}
                </thead>

                <tbody className="divide-y divide-slate-300">
                  {civilSnapshot.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          (civilMatrix.mode === 'days'
                            ? civilMatrix.dayCols.length
                            : civilMatrix.mode === 'weeks' ||
                                civilMatrix.mode === 'months'
                              ? civilMatrix.buckets.length
                              : 1) +
                          (showSignature ? 9 : 8)
                        }
                        className="px-3 py-6 text-center text-slate-500 italic"
                      >
                        No civil works attendance recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    civilSnapshot.items.map((item, idx) => {
                      const memberDates = new Set(item.datesPresent);
                      const ded = item.deductionPhp ?? 0;
                      const net =
                        item.netPayPhp ??
                        Math.round((item.grossPayPhp - ded) * 100) / 100;

                      return (
                        <tr key={item.memberId}>
                          <td className="px-1 py-1.5 border-r border-slate-900 text-center text-slate-500 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="px-1.5 py-1.5 border-r border-slate-900 font-bold text-slate-900">
                            {item.name}
                          </td>
                          <td className="px-1.5 py-1.5 border-r border-slate-900 text-slate-700">
                            {item.position}
                          </td>
                          <td className="px-1.5 py-1.5 border-r border-slate-900 text-right font-medium text-slate-800 tabular-nums whitespace-nowrap">
                            ₱{item.dailyRatePhp.toLocaleString()}
                          </td>

                          {civilMatrix.mode === 'days' ? (
                            civilMatrix.dayCols.map((col) => {
                              const code = resolveCivilAttendanceCode(
                                col.date,
                                memberDates,
                                civilMatrix.siteActiveDates
                              );
                              const codeCls =
                                code === 'P'
                                  ? 'text-slate-900'
                                  : code === 'A'
                                    ? 'text-rose-700'
                                    : 'text-emerald-700';
                              return (
                                <td
                                  key={`${item.memberId}-${col.date}`}
                                  className={`px-0.5 py-1.5 border-r border-slate-900 text-center font-bold text-[9.5px] print:text-[8.5px] ${codeCls}`}
                                >
                                  {code}
                                </td>
                              );
                            })
                          ) : civilMatrix.mode === 'weeks' ||
                            civilMatrix.mode === 'months' ? (
                            civilMatrix.buckets.map((b) => {
                              const count = b.dates.filter((d) =>
                                memberDates.has(d)
                              ).length;
                              const bucketWorked = b.dates.some((d) =>
                                civilMatrix.siteActiveDates.has(d)
                              );
                              return (
                                <td
                                  key={`${item.memberId}-${b.label}`}
                                  className={`px-1 py-1.5 border-r border-slate-900 text-center tabular-nums font-bold ${
                                    !bucketWorked
                                      ? 'text-emerald-700 text-[9.5px]'
                                      : count > 0
                                        ? 'text-slate-900'
                                        : 'text-rose-700'
                                  }`}
                                >
                                  {!bucketWorked ? 'NW' : count}
                                </td>
                              );
                            })
                          ) : (
                            <td className="px-1.5 py-1.5 border-r border-slate-900 text-center text-[10px] text-slate-700 tabular-nums">
                              {item.daysPresent} / {civilMatrix.totalDaysSpan} days
                            </td>
                          )}

                          <td className="px-1 py-1.5 border-r border-slate-900 text-center font-bold text-slate-900 tabular-nums">
                            {item.daysPresent}
                          </td>
                          <td className="px-1.5 py-1.5 border-r border-slate-900 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                            ₱{item.grossPayPhp.toLocaleString()}
                          </td>
                          <td className="px-1.5 py-1.5 border-r border-slate-900 text-right text-slate-800 tabular-nums whitespace-nowrap">
                            ₱{ded.toLocaleString()}
                          </td>
                          <td
                            className={`px-1.5 py-1.5 text-right font-extrabold text-slate-900 tabular-nums whitespace-nowrap ${
                              showSignature ? 'border-r border-slate-900' : ''
                            }`}
                          >
                            ₱{net.toLocaleString()}
                          </td>
                          {showSignature && (
                            <td className="px-1 py-1 text-center align-middle">
                              <div className="w-14 mx-auto border-b border-slate-400 mt-2 print:mt-1.5" />
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>

                <tfoot className="bg-slate-100 border-t-2 border-slate-900 font-bold text-[11px] print:text-[10px]">
                  <tr>
                    <td
                      colSpan={4}
                      className="px-1.5 py-2 border-r border-slate-900 text-right uppercase text-slate-700"
                    >
                      Total
                    </td>
                    {civilMatrix.mode === 'days' ? (
                      civilMatrix.dayCols.map((col) => (
                        <td
                          key={`total-${col.date}`}
                          className="px-0.5 py-2 border-r border-slate-900"
                        />
                      ))
                    ) : civilMatrix.mode === 'weeks' ||
                      civilMatrix.mode === 'months' ? (
                      civilMatrix.buckets.map((b) => (
                        <td
                          key={`total-${b.label}`}
                          className="px-1 py-2 border-r border-slate-900"
                        />
                      ))
                    ) : (
                      <td className="px-1.5 py-2 border-r border-slate-900" />
                    )}
                    <td className="px-1 py-2 border-r border-slate-900 text-center text-slate-900 tabular-nums">
                      {civilSnapshot.totalDaysWorked}
                    </td>
                    <td className="px-1.5 py-2 border-r border-slate-900 text-right text-slate-900 tabular-nums whitespace-nowrap">
                      ₱{civilTotals.gross.toLocaleString()}
                    </td>
                    <td className="px-1.5 py-2 border-r border-slate-900 text-right text-slate-900 tabular-nums whitespace-nowrap">
                      ₱{civilTotals.deduction.toLocaleString()}
                    </td>
                    <td
                      className={`px-1.5 py-2 text-right text-xs print:text-[11px] font-extrabold text-emerald-800 tabular-nums whitespace-nowrap ${
                        showSignature ? 'border-r border-slate-900' : ''
                      }`}
                    >
                      ₱{civilTotals.net.toLocaleString()}
                    </td>
                    {showSignature && <td className="px-1 py-2" />}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Compact Attendance Code Legend */}
            <div className="border-t border-slate-900 bg-slate-50 px-3 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-700">
              <span className="font-bold uppercase text-slate-500">Legend:</span>
              {civilMatrix.mode === 'days' ? (
                <>
                  <span>
                    <strong className="text-slate-900">P</strong> = Present
                  </span>
                  <span>
                    <strong className="text-rose-700">A</strong> = Absent
                  </span>
                  <span>
                    <strong className="text-emerald-700">NW</strong> = No Work
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <strong className="text-slate-900">[#]</strong> = Days Present in Period
                  </span>
                  <span>
                    <strong className="text-rose-700">0</strong> = Absent All Workdays
                  </span>
                  <span>
                    <strong className="text-emerald-700">NW</strong> = No Work
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-left text-[10.5px] print:text-[9.5px] border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-800 border-b border-slate-900 font-bold uppercase text-[9px] print:text-[8px] leading-tight">
                  <th className="px-1 py-1.5 border-r border-slate-900 w-5 text-center">#</th>
                  <th className="px-1.5 py-1.5 border-r border-slate-900">Hauler Name</th>
                  <th className="px-1 py-1.5 border-r border-slate-900 text-center whitespace-nowrap">Days</th>
                  <th className="px-1 py-1.5 border-r border-slate-900 text-center whitespace-nowrap">Trips</th>
                  <th className="px-1 py-1.5 border-r border-slate-900 text-right whitespace-nowrap">
                    Hauled (kg)
                  </th>
                  <th className="px-1 py-1.5 border-r border-slate-900 text-right whitespace-nowrap">
                    Prior Ex.
                  </th>
                  <th className="px-1 py-1.5 border-r border-slate-900 text-center whitespace-nowrap">
                    Credits ({formatNum(creditBlockKg)}kg)
                  </th>
                  <th className="px-1 py-1.5 border-r border-slate-900 text-right whitespace-nowrap">
                    End Ex.
                  </th>
                  <th className="px-1 py-1.5 border-r border-slate-900 text-right whitespace-nowrap">
                    Gross (₱)
                  </th>
                  <th className="px-1 py-1.5 border-r border-slate-900 text-right whitespace-nowrap">
                    Deduction (₱)
                  </th>
                  <th
                    className={`px-1.5 py-1.5 text-right whitespace-nowrap ${
                      showSignature ? 'border-r border-slate-900' : ''
                    }`}
                  >
                    Net Payout (₱)
                  </th>
                  {showSignature && (
                    <th className="px-1 py-1.5 text-center w-20 print:w-16">Signature</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {(haulerSnapshot?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td
                      colSpan={showSignature ? 12 : 11}
                      className="px-3 py-6 text-center text-slate-500 italic"
                    >
                      No hauling records or payouts in this period.
                    </td>
                  </tr>
                ) : (
                  haulerSnapshot!.items.map((item, idx) => {
                    const ded = item.deductionPhp ?? 0;
                    return (
                      <tr key={item.haulerName}>
                        <td className="px-1 py-1.5 border-r border-slate-900 text-center text-slate-500 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-1 py-1.5 border-r border-slate-900 font-bold text-slate-900">
                          {item.haulerName}
                        </td>
                        <td className="px-1 py-1.5 border-r border-slate-900 text-center text-slate-700 tabular-nums">
                          {item.activeDays}
                        </td>
                        <td className="px-1 py-1.5 border-r border-slate-900 text-center font-semibold text-slate-800 tabular-nums">
                          {item.tripsCompleted}
                        </td>
                        <td className="px-1 py-1.5 border-r border-slate-900 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                          {formatNum(item.hauledKg)} kg
                        </td>
                        <td className="px-1 py-1.5 border-r border-slate-900 text-right text-slate-500 tabular-nums whitespace-nowrap">
                          {formatNum(item.priorExcessKg)} kg
                        </td>
                        <td className="px-1 py-1.5 border-r border-slate-900 text-center font-bold text-emerald-800 tabular-nums">
                          {item.creditsEarned}
                        </td>
                        <td className="px-1 py-1.5 border-r border-slate-900 text-right text-amber-800 font-semibold tabular-nums whitespace-nowrap">
                          {formatNum(item.endingExcessKg)} kg
                        </td>
                        <td className="px-1 py-1.5 border-r border-slate-900 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                          ₱{item.grossEarnedPhp.toLocaleString()}
                        </td>
                        <td className="px-1 py-1.5 border-r border-slate-900 text-right text-slate-800 tabular-nums">
                          <div className="whitespace-nowrap">
                            ₱{ded.toLocaleString()}
                          </div>
                          {item.deductionNote?.trim() && (
                            <div className="text-[8.5px] leading-tight text-slate-500">
                              {item.deductionNote.trim()}
                            </div>
                          )}
                        </td>
                        <td
                          className={`px-1 py-1.5 text-right font-extrabold text-slate-900 tabular-nums whitespace-nowrap ${
                            showSignature ? 'border-r border-slate-900' : ''
                          }`}
                        >
                          ₱{item.payoutReleasedPhp.toLocaleString()}
                        </td>
                        {showSignature && (
                          <td className="px-1 py-1 text-center align-middle">
                            <div className="w-14 mx-auto border-b border-slate-400 mt-2 print:mt-1.5" />
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-slate-100 border-t-2 border-slate-900 font-bold text-[11px] print:text-[10px]">
                <tr>
                  <td
                    colSpan={4}
                    className="px-1 py-2 border-r border-slate-900 text-right uppercase text-slate-700"
                  >
                    Total
                  </td>
                  <td className="px-1 py-2 border-r border-slate-900 text-right text-slate-900 tabular-nums whitespace-nowrap">
                    {formatNum(haulerSnapshot?.totalHauledKg ?? 0)} kg
                  </td>
                  <td className="px-1 py-2 border-r border-slate-900" />
                  <td className="px-1 py-2 border-r border-slate-900 text-center text-emerald-800 tabular-nums">
                    {haulerSnapshot?.totalCredits ?? 0}
                  </td>
                  <td className="px-1 py-2 border-r border-slate-900" />
                  <td className="px-1 py-2 border-r border-slate-900 text-right text-slate-800 tabular-nums whitespace-nowrap">
                    ₱{(haulerTotals?.earned ?? 0).toLocaleString()}
                  </td>
                  <td className="px-1 py-2 border-r border-slate-900 text-right text-slate-900 tabular-nums whitespace-nowrap">
                    ₱{(haulerTotals?.deduction ?? 0).toLocaleString()}
                  </td>
                  <td
                    className={`px-1 py-2 text-right text-xs print:text-[11px] font-extrabold text-emerald-800 tabular-nums whitespace-nowrap ${
                      showSignature ? 'border-r border-slate-900' : ''
                    }`}
                  >
                    ₱{(haulerTotals?.payout ?? 0).toLocaleString()}
                  </td>
                  {showSignature && <td className="px-1 py-2" />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {snapshot.notes?.trim() && (
          <div className="border-t-2 border-slate-900 p-2.5 space-y-1">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Payroll Remarks
            </div>
            <div className="text-xs text-slate-800 whitespace-pre-wrap">
              {snapshot.notes.trim()}
            </div>
          </div>
        )}
      </div>

      <ReportSignoffFooter
        details={effectiveDetails}
        fallbackDate={snapshot.endDate || project.lastUpdated}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>
          Project: {projectName} · {projectLocation}
        </span>
        <span>Updated: {formatDateWithWeekday(project.lastUpdated)}</span>
      </div>
    </div>
  );
}

export function PayrollPrintModal({
  project,
  data,
  onClose,
}: {
  project: MastProjectState;
  data: PayrollSheetData;
  onClose: () => void;
}) {
  return (
    <ReportSignoffOverrideProvider project={project}>
      <PayrollPrintModalContent project={project} data={data} onClose={onClose} />
    </ReportSignoffOverrideProvider>
  );
}

function PayrollPrintModalContent({
  project,
  data,
  onClose,
}: {
  project: MastProjectState;
  data: PayrollSheetData;
  onClose: () => void;
}) {
  const signoffCtrl = useReportSignoffOverrideControls();
  const [copied, setCopied] = useState(false);
  const payrollShowSignature = useUiStore((s) => s.payrollShowSignature);
  const setPayrollShowSignature = useUiStore((s) => s.setPayrollShowSignature);
  const payrollShowStatus = useUiStore((s) => s.payrollShowStatus);
  const setPayrollShowStatus = useUiStore((s) => s.setPayrollShowStatus);
  const pushToast = useFeedbackStore((s) => s.pushToast);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { dialogMaxWidthClass, sheetWidthPx } = usePrintPageSetup(true);

  useEffect(() => {
    document.body.classList.add('report-modal-open');
    return () => {
      document.body.classList.remove('report-modal-open');
    };
  }, []);

  const isCivil = data.kind === 'civil';
  const snapshot = data.snapshot;
  const projectName =
    project.reportDetails?.projectName?.trim() || project.projectName;

  const reportDocTitle = `${
    isCivil ? 'Civil Works Payroll' : 'Individual Hauler Payroll'
  } - ${snapshot.title} - ${projectName}`;

  const handleCopyText = async () => {
    try {
      const overriddenPrepared = signoffCtrl?.overrides.prepared?.name;
      const effectiveProject =
        overriddenPrepared !== undefined
          ? { ...project, preparedBy: overriddenPrepared.trim() }
          : project;
      const text = isCivil
        ? formatCivilPayrollPlainText(data.snapshot, effectiveProject, {
            includeStatus: payrollShowStatus,
          })
        : formatHaulerPayrollPlainText(data.snapshot, effectiveProject, {
            includeStatus: payrollShowStatus,
          });
      await navigator.clipboard.writeText(text);
      setCopied(true);
      pushToast({
        tone: 'success',
        message: 'Payroll summary copied to clipboard.',
        durationMs: 3000,
      });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      pushToast({
        tone: 'error',
        message: 'Clipboard unavailable in this browser.',
        durationMs: 3500,
      });
    }
  };

  return createPortal(
    <div
      className="report-modal-portal fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs overflow-y-auto p-2 sm:p-6 print:static print:p-0 print:bg-white"
      onClick={onClose}
    >
      <div
        className={`report-modal-dialog ${dialogMaxWidthClass} mx-auto bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden print:border-none print:shadow-none print:rounded-none print:max-w-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <PrintModalHeader
          title={isCivil ? 'Civil Works Payroll Sheet' : 'Individual Hauler Payroll Sheet'}
          subtitle={`${snapshot.title} · Ready for Manager / Admin`}
          extraActions={
            <>
              <label className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-9 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs select-none">
                <input
                  type="checkbox"
                  checked={payrollShowStatus}
                  onChange={(e) => setPayrollShowStatus(e.target.checked)}
                  className="rounded accent-sky-600"
                />
                <span>Status</span>
              </label>
              <label className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-9 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs select-none">
                <input
                  type="checkbox"
                  checked={payrollShowSignature}
                  onChange={(e) => setPayrollShowSignature(e.target.checked)}
                  className="rounded accent-sky-600"
                />
                <span>Signature</span>
              </label>
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (data.kind === 'civil') {
                    downloadCivilWorksPayrollCsv(project, data.snapshot);
                  } else {
                    downloadHaulerPayrollCsv(project, data.snapshot);
                  }
                }}
                className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Export CSV</span>
              </button>
            </>
          }
          targetRef={sheetRef}
          documentTitle={reportDocTitle}
          onClose={onClose}
        />

        <div className="report-modal-preview-frame overflow-x-auto bg-slate-100/75 p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible">
          <div
            ref={sheetRef}
            style={{ width: `${sheetWidthPx}px`, minWidth: `${sheetWidthPx}px` }}
            className="report-modal-scroll-area report-printable-card pdf-desktop-layout mx-auto bg-white shadow-sm border border-slate-200 print:w-full print:min-w-0 print:border-none print:shadow-none"
          >
            <PayrollReportSheet
              project={project}
              data={data}
              showSignature={payrollShowSignature}
              showStatus={payrollShowStatus}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
