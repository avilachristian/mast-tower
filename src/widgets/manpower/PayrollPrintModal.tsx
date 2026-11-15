import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy } from 'lucide-react';
import { formatDateWithWeekday } from '@/entities/project/calculations';
import {
  HAULING_CREDIT_BLOCK_KG,
  HAULING_RATE_PER_BLOCK_PHP,
} from '@/entities/project/haulingInventory';
import {
  formatCivilPayrollPlainText,
  formatHaulerPayrollPlainText,
} from '@/entities/project/manpowerPayroll';
import type {
  CivilWorksPayrollSnapshot,
  HaulerPayrollSnapshot,
  MastProjectState,
} from '@/entities/project/types';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { PrintModalHeader, usePrintPageSetup } from '@/widgets/report/PrintPageControls';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveReportDetails,
} from '@/widgets/report/ReportLetterhead';

export type PayrollSheetData =
  | { kind: 'civil'; snapshot: CivilWorksPayrollSnapshot }
  | { kind: 'hauler'; snapshot: HaulerPayrollSnapshot };

function formatNum(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
  const [copied, setCopied] = useState(false);
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

  const effectiveDetails = resolveReportDetails(project, {
    reportDate: snapshot.endDate || project.lastUpdated,
  });

  const reportDocTitle = `${
    isCivil ? 'Civil Works Payroll' : 'Individual Hauler Payroll'
  } - ${snapshot.title} - ${projectName}`;

  const handleCopyText = async () => {
    try {
      const text = isCivil
        ? formatCivilPayrollPlainText(data.snapshot, project)
        : formatHaulerPayrollPlainText(data.snapshot, project);
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
          }
          targetRef={sheetRef}
          documentTitle={reportDocTitle}
          onClose={onClose}
        />

        <div className="report-modal-preview-frame overflow-x-auto bg-slate-100/75 p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible">
          <div
            ref={sheetRef}
            style={{ width: `${sheetWidthPx}px`, minWidth: `${sheetWidthPx}px` }}
            className="report-modal-scroll-area report-printable-card pdf-desktop-layout mx-auto bg-white shadow-sm border border-slate-200 p-6 sm:p-8 space-y-5 print:w-full print:min-w-0 print:border-none print:shadow-none print:p-0"
          >
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
                  : `Individual Hauler Payroll — ₱${HAULING_RATE_PER_BLOCK_PHP.toLocaleString()} per ${HAULING_CREDIT_BLOCK_KG} kg Block`
              }
              fallbackProjectName={project.projectName}
              fallbackLocation={project.location}
              fallbackContractor={project.contractor}
              fallbackDate={snapshot.endDate}
            />

            {/* Period Metadata Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Payroll Type
                </div>
                <div className="font-bold text-slate-900 capitalize mt-0.5">
                  {snapshot.periodType} ({isCivil ? 'Civil Works' : 'Individual Haulers'})
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Coverage Dates
                </div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {formatDateWithWeekday(snapshot.startDate)}
                  {snapshot.startDate !== snapshot.endDate &&
                    ` – ${formatDateWithWeekday(snapshot.endDate)}`}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Status
                </div>
                <div className="mt-0.5">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${
                      snapshot.status === 'paid'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    {snapshot.status === 'paid'
                      ? `PAID${snapshot.paidDate ? ` (${snapshot.paidDate})` : ''}`
                      : 'FOR APPROVAL / PENDING'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  {isCivil ? 'Total Payroll Amount' : 'Total Payout Amount'}
                </div>
                <div className="text-base font-extrabold text-emerald-800 mt-0.5">
                  ₱
                  {(isCivil
                    ? data.snapshot.totalAmountPhp
                    : data.snapshot.totalPayoutPhp
                  ).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Table */}
            {isCivil ? (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="px-3 py-2 font-bold w-10">#</th>
                      <th className="px-3 py-2 font-bold">Worker Name</th>
                      <th className="px-3 py-2 font-bold">Position</th>
                      <th className="px-3 py-2 font-bold text-right">Daily Rate</th>
                      <th className="px-3 py-2 font-bold text-center">Days Present</th>
                      <th className="px-3 py-2 font-bold">Dates Worked</th>
                      <th className="px-3 py-2 font-bold text-right">Gross Pay (₱)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.snapshot.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-6 text-center text-slate-500"
                        >
                          No civil works attendance recorded for this period.
                        </td>
                      </tr>
                    ) : (
                      data.snapshot.items.map((item, idx) => (
                        <tr key={item.memberId}>
                          <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-2 font-bold text-slate-900">
                            {item.name}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {item.position}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-800">
                            ₱{item.dailyRatePhp.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-slate-900">
                            {item.daysPresent}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-slate-600">
                            {item.datesPresent.length > 0
                              ? item.datesPresent.join(', ')
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-extrabold text-slate-900">
                            ₱{item.grossPayPhp.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-xs">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5 text-right uppercase text-slate-600">
                        Total
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-900">
                        {data.snapshot.totalDaysWorked} days
                      </td>
                      <td className="px-3 py-2.5" />
                      <td className="px-3 py-2.5 text-right text-sm font-extrabold text-emerald-800">
                        ₱{data.snapshot.totalAmountPhp.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="px-3 py-2 font-bold w-10">#</th>
                      <th className="px-3 py-2 font-bold">Hauler Name</th>
                      <th className="px-2 py-2 font-bold text-center">Days</th>
                      <th className="px-2 py-2 font-bold text-center">Trips</th>
                      <th className="px-2 py-2 font-bold text-right">Hauled (kg)</th>
                      <th className="px-2 py-2 font-bold text-right">Prior Excess</th>
                      <th className="px-2 py-2 font-bold text-center">Credits (120kg)</th>
                      <th className="px-2 py-2 font-bold text-right">End Excess</th>
                      <th className="px-2 py-2 font-bold text-right">Period Earned</th>
                      <th className="px-3 py-2 font-bold text-right">Payout (₱)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.snapshot.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-3 py-6 text-center text-slate-500"
                        >
                          No hauling records or payouts in this period.
                        </td>
                      </tr>
                    ) : (
                      data.snapshot.items.map((item, idx) => (
                        <tr key={item.haulerName}>
                          <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-2 font-bold text-slate-900">
                            {item.haulerName}
                          </td>
                          <td className="px-2 py-2 text-center text-slate-700">
                            {item.activeDays}
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-slate-800">
                            {item.tripsCompleted}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold text-slate-800">
                            {formatNum(item.hauledKg)} kg
                          </td>
                          <td className="px-2 py-2 text-right text-slate-500">
                            {formatNum(item.priorExcessKg)} kg
                          </td>
                          <td className="px-2 py-2 text-center font-bold text-emerald-800">
                            {item.creditsEarned}
                          </td>
                          <td className="px-2 py-2 text-right text-amber-800 font-semibold">
                            {formatNum(item.endingExcessKg)} kg
                          </td>
                          <td className="px-2 py-2 text-right font-semibold text-slate-800">
                            ₱{item.grossEarnedPhp.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right font-extrabold text-slate-900">
                            ₱{item.payoutReleasedPhp.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-xs">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5 text-right uppercase text-slate-600">
                        Total
                      </td>
                      <td className="px-2 py-2.5 text-right text-slate-900">
                        {formatNum(data.snapshot.totalHauledKg)} kg
                      </td>
                      <td className="px-2 py-2.5" />
                      <td className="px-2 py-2.5 text-center text-emerald-800">
                        {data.snapshot.totalCredits}
                      </td>
                      <td className="px-2 py-2.5" />
                      <td className="px-2 py-2.5 text-right text-slate-800">
                        ₱{data.snapshot.totalEarnedPhp.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm font-extrabold text-emerald-800">
                        ₱{data.snapshot.totalPayoutPhp.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {snapshot.notes && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <strong className="text-slate-900">Payroll Remarks:</strong>{' '}
                {snapshot.notes}
              </div>
            )}

            <ReportSignoffFooter details={effectiveDetails} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
