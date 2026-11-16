import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  History,
  Plus,
  Printer,
  Scale,
  Trash2,
} from 'lucide-react';
import { formatDateWithWeekday } from '@/entities/project/calculations';
import {
  HAULING_CREDIT_BLOCK_KG,
  HAULING_RATE_PER_BLOCK_PHP,
} from '@/entities/project/haulingInventory';
import {
  addDaysIso,
  computeHaulerPayrollPreview,
  formatHaulerPayrollPlainText,
  getPayrollPeriodBounds,
  resolveKnownHaulerNames,
} from '@/entities/project/manpowerPayroll';
import type {
  HaulerPayoutRecord,
  HaulerPayrollLineItem,
  HaulerPayrollSnapshot,
  ManpowerMember,
  MastProjectState,
  PayrollPeriodType,
} from '@/entities/project/types';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore } from '@/shared/state/projectStore';
import type { PayrollSheetData } from './PayrollPrintModal';

const PERIOD_OPTIONS: { id: PayrollPeriodType; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'overall', label: 'Overall' },
];

function formatNum(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function stepAnchorDate(
  periodType: PayrollPeriodType,
  anchorDate: string,
  delta: -1 | 1
): string {
  if (periodType === 'daily') return addDaysIso(anchorDate, delta);
  if (periodType === 'weekly') return addDaysIso(anchorDate, delta * 7);
  if (periodType === 'monthly') {
    const [y, m] = anchorDate.split('-').map(Number);
    if (!y || !m) return anchorDate;
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 10);
  }
  return anchorDate;
}

export function HaulerPayrollPanel({
  project,
  roster,
  onPrintSheet,
}: {
  project: MastProjectState;
  roster: ManpowerMember[];
  onPrintSheet: (sheet: PayrollSheetData) => void;
}) {
  const createHaulerPayrollSnapshot = useProjectStore(
    (s) => s.createHaulerPayrollSnapshot
  );
  const updateHaulerPayrollStatus = useProjectStore(
    (s) => s.updateHaulerPayrollStatus
  );
  const deleteHaulerPayrollSnapshot = useProjectStore(
    (s) => s.deleteHaulerPayrollSnapshot
  );
  const addHaulerPayout = useProjectStore((s) => s.addHaulerPayout);
  const deleteHaulerPayout = useProjectStore((s) => s.deleteHaulerPayout);
  const pushToast = useFeedbackStore((s) => s.pushToast);
  const requestConfirm = useFeedbackStore((s) => s.requestConfirm);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [periodType, setPeriodType] = useState<PayrollPeriodType>('weekly');
  const [anchorDate, setAnchorDate] = useState(todayStr);
  const [customTitle, setCustomTitle] = useState('');
  const [payrollNotes, setPayrollNotes] = useState('');
  const [selectedHaulers, setSelectedHaulers] = useState<Record<string, boolean>>({});
  const [payoutOverrides, setPayoutOverrides] = useState<Record<string, string>>({});

  // Ad-hoc direct payout form
  const [directHauler, setDirectHauler] = useState('');
  const [directAmount, setDirectAmount] = useState('');
  const [directDate, setDirectDate] = useState(todayStr);
  const [directNotes, setDirectNotes] = useState('');

  const knownHaulers = useMemo(
    () => resolveKnownHaulerNames(project),
    [project]
  );

  const availableHaulingDates = useMemo(
    () => project.haulingLogs.map((l) => l.date),
    [project.haulingLogs]
  );

  const periodBounds = useMemo(
    () =>
      getPayrollPeriodBounds(periodType, anchorDate, availableHaulingDates),
    [periodType, anchorDate, availableHaulingDates]
  );

  const preview = useMemo(
    () =>
      computeHaulerPayrollPreview(
        project.haulingLogs,
        project.haulerPayouts ?? [],
        roster,
        periodBounds.startDate,
        periodBounds.endDate,
        periodType
      ),
    [
      project.haulingLogs,
      project.haulerPayouts,
      roster,
      periodBounds.startDate,
      periodBounds.endDate,
      periodType,
    ]
  );

  const periodKey = `${periodType}:${periodBounds.startDate}:${periodBounds.endDate}`;
  const lastInitPeriodKeyRef = useRef<string>('');

  useEffect(() => {
    const periodChanged = lastInitPeriodKeyRef.current !== periodKey;
    if (periodChanged) {
      lastInitPeriodKeyRef.current = periodKey;
      setCustomTitle('');
      setPayoutOverrides({});
      const nextSel: Record<string, boolean> = {};
      for (const row of preview.rows) {
        nextSel[row.haulerName] =
          row.tripsCompleted > 0 || row.overallBalanceDuePhp > 0;
      }
      setSelectedHaulers(nextSel);
      return;
    }

    setSelectedHaulers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const row of preview.rows) {
        if (!(row.haulerName in next)) {
          next[row.haulerName] =
            row.tripsCompleted > 0 || row.overallBalanceDuePhp > 0;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [periodKey, preview.rows]);

  const effectiveItems = useMemo<HaulerPayrollLineItem[]>(() => {
    return preview.rows
      .filter(
        (row) =>
          selectedHaulers[row.haulerName] ??
          (row.tripsCompleted > 0 || row.overallBalanceDuePhp > 0)
      )
      .map((row) => {
        const override = payoutOverrides[row.haulerName];
        const payoutReleasedPhp =
          override !== undefined
            ? Math.max(0, Number(override) || 0)
            : row.payoutReleasedPhp;
        return {
          haulerName: row.haulerName,
          memberId: row.memberId,
          activeDays: row.activeDays,
          tripsCompleted: row.tripsCompleted,
          hauledKg: row.hauledKg,
          priorExcessKg: row.priorExcessKg,
          creditsEarned: row.creditsEarned,
          endingExcessKg: row.endingExcessKg,
          grossEarnedPhp: row.grossEarnedPhp,
          alreadyPaidInRangePhp: row.alreadyPaidInRangePhp,
          payoutReleasedPhp,
          netBalanceAfterPhp: Math.max(
            0,
            Math.round((row.overallBalanceDuePhp - payoutReleasedPhp) * 100) / 100
          ),
        };
      });
  }, [preview.rows, selectedHaulers, payoutOverrides]);

  const totalBatchPayoutPhp = useMemo(
    () =>
      Math.round(
        effectiveItems.reduce((sum, i) => sum + i.payoutReleasedPhp, 0) * 100
      ) / 100,
    [effectiveItems]
  );

  const buildDraftSnapshot = (
    status: 'generated' | 'paid'
  ): Omit<HaulerPayrollSnapshot, 'id' | 'createdAt'> => ({
    periodType,
    startDate: periodBounds.startDate,
    endDate: periodBounds.endDate,
    title: customTitle.trim() || periodBounds.label,
    items: effectiveItems,
    totalHauledKg:
      Math.round(
        effectiveItems.reduce((s, r) => s + r.hauledKg, 0) * 100
      ) / 100,
    totalCredits: effectiveItems.reduce((s, r) => s + r.creditsEarned, 0),
    totalEarnedPhp:
      Math.round(
        effectiveItems.reduce((s, r) => s + r.grossEarnedPhp, 0) * 100
      ) / 100,
    totalPayoutPhp: totalBatchPayoutPhp,
    status,
    paidDate: status === 'paid' ? todayStr : undefined,
    notes: payrollNotes.trim() || undefined,
  });

  const handleSaveSnapshot = (status: 'generated' | 'paid') => {
    const draft = buildDraftSnapshot(status);
    if (draft.items.length === 0) {
      pushToast({
        tone: 'warning',
        message: 'Select at least one individual hauler to create a payroll record.',
      });
      return;
    }
    createHaulerPayrollSnapshot(draft);
    setPayrollNotes('');
    pushToast({
      tone: 'success',
      title:
        status === 'paid'
          ? 'Hauler Payroll Saved & Paid'
          : 'Hauler Payroll Saved',
      message: `${draft.title} (Payout: ₱${draft.totalPayoutPhp.toLocaleString()}) added to Hauler Payment History.`,
    });
  };

  const handlePrintPreview = () => {
    const draft = buildDraftSnapshot('generated');
    onPrintSheet({
      kind: 'hauler',
      snapshot: {
        ...draft,
        id: 'preview',
        createdAt: new Date().toISOString(),
      },
    });
  };

  const handleCopyPlainText = async (
    snapshot: Pick<
      HaulerPayrollSnapshot,
      | 'title'
      | 'periodType'
      | 'startDate'
      | 'endDate'
      | 'status'
      | 'paidDate'
      | 'items'
      | 'totalHauledKg'
      | 'totalCredits'
      | 'totalEarnedPhp'
      | 'totalPayoutPhp'
      | 'notes'
    >
  ) => {
    try {
      const text = formatHaulerPayrollPlainText(snapshot, project);
      await navigator.clipboard.writeText(text);
      pushToast({
        tone: 'success',
        message: 'Individual Hauler payroll summary copied to clipboard.',
        durationMs: 3000,
      });
    } catch {
      pushToast({
        tone: 'error',
        message: 'Unable to copy to clipboard in this browser.',
      });
    }
  };

  const handleDeleteSnapshot = async (rec: HaulerPayrollSnapshot) => {
    const ok = await requestConfirm({
      tone: 'danger',
      title: 'Delete Hauler Payroll?',
      message: `Delete "${rec.title}" (₱${rec.totalPayoutPhp.toLocaleString()}) from Hauler Payment History?`,
      detail:
        rec.status === 'paid'
          ? 'Any hauler payouts linked to this payroll batch will also be removed so balances due stay accurate.'
          : undefined,
      confirmLabel: 'Delete Record',
    });
    if (ok) {
      deleteHaulerPayrollSnapshot(rec.id);
    }
  };

  const handleRecordDirectPayout = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.max(0, Number(directAmount) || 0);
    if (!directHauler.trim() || amt <= 0) return;
    addHaulerPayout({
      date: directDate,
      haulerName: directHauler.trim(),
      amountPhp: amt,
      notes: directNotes.trim() || undefined,
    });
    pushToast({
      tone: 'success',
      message: `Recorded ₱${amt.toLocaleString()} payout to ${directHauler.trim()}.`,
      durationMs: 3500,
    });
    setDirectAmount('');
    setDirectNotes('');
  };

  const handleDeleteDirectPayout = async (p: HaulerPayoutRecord) => {
    const ok = await requestConfirm({
      tone: 'danger',
      title: 'Delete Payout Entry?',
      message: `Delete ₱${p.amountPhp.toLocaleString()} payout to ${p.haulerName} (${formatDateWithWeekday(p.date)})?`,
      confirmLabel: 'Delete Payout',
    });
    if (ok) {
      deleteHaulerPayout(p.id);
    }
  };

  const history = project.haulerPayrollHistory ?? [];
  const payouts = project.haulerPayouts ?? [];

  return (
    <div className="space-y-4">
      {/* 1. Hauler Payroll Period Generator */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-600" />
              <span>Individual Hauler Payroll ({HAULING_RATE_PER_BLOCK_PHP.toLocaleString()} PHP / {HAULING_CREDIT_BLOCK_KG} kg)</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Each hauler is paid individually per completed {HAULING_CREDIT_BLOCK_KG} kg block with carried excess. Tick haulers to include and generate Daily, Weekly, Monthly, or Overall payroll.
            </p>
          </div>

          <div className="grid grid-cols-4 sm:inline-flex rounded-lg bg-slate-100 p-1 gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriodType(opt.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  periodType === opt.id
                    ? 'bg-white text-amber-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Period Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-slate-50 border border-slate-200 rounded-xl p-3">
          {periodType !== 'overall' && (
            <div className="md:col-span-4">
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                {periodType === 'daily'
                  ? 'Hauling Date'
                  : periodType === 'weekly'
                    ? 'Any Date in Week (Mon–Sun)'
                    : 'Month Reference Date'}
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setAnchorDate(stepAnchorDate(periodType, anchorDate, -1))
                  }
                  aria-label="Previous period"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={anchorDate}
                  onChange={(e) => setAnchorDate(e.target.value)}
                  className="flex-1 min-w-0 min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900"
                />
                <button
                  type="button"
                  onClick={() =>
                    setAnchorDate(stepAnchorDate(periodType, anchorDate, 1))
                  }
                  aria-label="Next period"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer shrink-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className={periodType === 'overall' ? 'md:col-span-6' : 'md:col-span-4'}>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Payroll Sheet Title
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={periodBounds.label}
              className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900"
            />
          </div>

          <div className={periodType === 'overall' ? 'md:col-span-6' : 'md:col-span-4'}>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Remarks for Manager / Admin (Optional)
            </label>
            <input
              type="text"
              value={payrollNotes}
              onChange={(e) => setPayrollNotes(e.target.value)}
              placeholder="e.g. Trail hauling settlement"
              className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800"
            />
          </div>
        </div>

        {/* Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 font-bold text-amber-900">
              {periodBounds.startDate === periodBounds.endDate
                ? formatDateWithWeekday(periodBounds.startDate)
                : `${periodBounds.startDate} to ${periodBounds.endDate}`}
            </span>
            <span className="text-slate-600">
              <strong>{formatNum(preview.totalHauledKg)} kg</strong> in period ·{' '}
              <strong>{preview.totalCredits}</strong> credits · Overall Balance Due:{' '}
              <strong className="text-slate-900">
                ₱{preview.totalOverallBalanceDuePhp.toLocaleString()}
              </strong>
            </span>
          </div>
          <div className="text-xs font-bold text-emerald-800">
            Selected Batch Payout: ₱{totalBatchPayoutPhp.toLocaleString()}
          </div>
        </div>

        {preview.rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
            No individual hauler trips or unpaid balances yet. Add individual haulers in the Roster tab and log trips under Hauling &amp; Inventory.
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden space-y-2.5">
              {preview.rows.map((row) => {
                const checked = selectedHaulers[row.haulerName] ?? true;
                const valStr =
                  payoutOverrides[row.haulerName] ?? String(row.payoutReleasedPhp);
                const pct = Math.min(
                  100,
                  Math.round(
                    (row.currentOverallExcessKg / HAULING_CREDIT_BLOCK_KG) * 100
                  )
                );
                return (
                  <div
                    key={row.haulerName}
                    className={`rounded-xl border p-3 space-y-2 ${
                      checked
                        ? 'border-amber-200 bg-amber-50/30'
                        : 'border-slate-200 bg-white opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedHaulers((prev) => ({
                              ...prev,
                              [row.haulerName]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 rounded accent-amber-600"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {row.haulerName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {row.tripsCompleted} trip{row.tripsCompleted === 1 ? '' : 's'} ·{' '}
                            {formatNum(row.hauledKg)} kg · {row.creditsEarned} credit
                            {row.creditsEarned === 1 ? '' : 's'}
                          </div>
                        </div>
                      </label>
                      <div className="text-right text-[11px]">
                        <div className="font-bold text-emerald-700">
                          Period: ₱{row.grossEarnedPhp.toLocaleString()}
                        </div>
                        <div className="text-slate-500">
                          Total Due: ₱{row.overallBalanceDuePhp.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-white border border-slate-200 p-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-amber-800 flex items-center gap-1">
                          <Scale className="w-3 h-3" />
                          Ending Excess: {formatNum(row.endingExcessKg)} kg
                        </span>
                        <span className="text-slate-500">
                          Prior: {formatNum(row.priorExcessKg)} kg
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {checked && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-600">
                          Release Payout (₱):
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={valStr}
                          onChange={(e) =>
                            setPayoutOverrides((prev) => ({
                              ...prev,
                              [row.haulerName]: e.target.value,
                            }))
                          }
                          className="w-28 min-h-8 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-xs font-extrabold text-slate-900"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
                  <tr>
                    <th className="px-2.5 py-2 w-8 text-center">Inc</th>
                    <th className="px-3 py-2 font-bold">Hauler Name</th>
                    <th className="px-2 py-2 font-bold text-center">Trips</th>
                    <th className="px-2 py-2 font-bold text-right">Hauled</th>
                    <th className="px-2 py-2 font-bold text-right">Prior Excess</th>
                    <th className="px-2 py-2 font-bold text-center">Credits</th>
                    <th className="px-2 py-2 font-bold text-right">End Excess</th>
                    <th className="px-2 py-2 font-bold text-right">Period Earned</th>
                    <th className="px-2 py-2 font-bold text-right">Balance Due</th>
                    <th className="px-3 py-2 font-bold text-right w-32">Payout (₱)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row) => {
                    const checked = selectedHaulers[row.haulerName] ?? true;
                    const valStr =
                      payoutOverrides[row.haulerName] ?? String(row.payoutReleasedPhp);
                    return (
                      <tr
                        key={row.haulerName}
                        className={checked ? 'hover:bg-slate-50/70' : 'bg-slate-50/40 opacity-60'}
                      >
                        <td className="px-2.5 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedHaulers((prev) => ({
                                ...prev,
                                [row.haulerName]: e.target.checked,
                              }))
                            }
                            aria-label={`Include ${row.haulerName}`}
                            className="w-4 h-4 rounded accent-amber-600 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-900">
                          {row.haulerName}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-700">
                          {row.tripsCompleted}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-800">
                          {formatNum(row.hauledKg)} kg
                        </td>
                        <td className="px-2 py-2 text-right text-slate-500">
                          {formatNum(row.priorExcessKg)} kg
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                            {row.creditsEarned}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-amber-800">
                          {formatNum(row.endingExcessKg)} kg
                        </td>
                        <td className="px-2 py-2 text-right font-bold text-emerald-800">
                          ₱{row.grossEarnedPhp.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-700">
                          ₱{row.overallBalanceDuePhp.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            disabled={!checked}
                            value={valStr}
                            onChange={(e) =>
                              setPayoutOverrides((prev) => ({
                                ...prev,
                                [row.haulerName]: e.target.value,
                              }))
                            }
                            aria-label={`Payout for ${row.haulerName}`}
                            className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs font-extrabold text-slate-900 disabled:bg-slate-100"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleCopyPlainText(buildDraftSnapshot('generated'))}
            disabled={effectiveItems.length === 0}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Summary</span>
          </button>
          <button
            type="button"
            onClick={handlePrintPreview}
            disabled={effectiveItems.length === 0}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>
          <button
            type="button"
            onClick={() => handleSaveSnapshot('generated')}
            disabled={effectiveItems.length === 0}
            className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Save Payroll History</span>
          </button>
          <button
            type="button"
            onClick={() => handleSaveSnapshot('paid')}
            disabled={effectiveItems.length === 0 || totalBatchPayoutPhp <= 0}
            className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer shadow-2xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Save &amp; Mark Paid</span>
          </button>
        </div>
      </div>

      {/* 2. Quick Individual Ad-Hoc Payout */}
      <form
        onSubmit={handleRecordDirectPayout}
        className="rounded-xl border border-slate-200 bg-white p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end shadow-2xs"
      >
        <div className="sm:col-span-4">
          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
            Quick Individual Payout / Advance
          </label>
          <select
            value={directHauler}
            onChange={(e) => setDirectHauler(e.target.value)}
            required
            className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
          >
            <option value="">Select individual hauler...</option>
            {knownHaulers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
            Amount (₱)
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={directAmount}
            onChange={(e) => setDirectAmount(e.target.value)}
            placeholder="1100"
            required
            className="w-full min-h-9 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-900"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
            Date
          </label>
          <input
            type="date"
            value={directDate}
            onChange={(e) => setDirectDate(e.target.value)}
            required
            className="w-full min-h-9 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
            Note (Optional)
          </label>
          <input
            type="text"
            value={directNotes}
            onChange={(e) => setDirectNotes(e.target.value)}
            placeholder="Cash advance / partial"
            className="w-full min-h-9 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="w-full min-h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer inline-flex items-center justify-center gap-1"
          >
            <Banknote className="w-3.5 h-3.5" />
            <span>Record Pay</span>
          </button>
        </div>
      </form>

      {/* 3. Hauler Payroll History */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
          <History className="w-4 h-4 text-amber-600" />
          <span>Hauler Payroll History ({history.length})</span>
        </h3>

        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
            No saved Hauler payroll sheets yet. Use Daily, Weekly, Monthly, or Overall above to generate a printable/shareable payroll record.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((rec) => (
              <div
                key={rec.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">
                      {rec.title}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                      {rec.periodType}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        rec.status === 'paid'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                    >
                      {rec.status === 'paid'
                        ? `Paid${rec.paidDate ? ` (${rec.paidDate})` : ''}`
                        : 'Pending Approval'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {rec.startDate === rec.endDate
                      ? formatDateWithWeekday(rec.startDate)
                      : `${rec.startDate} to ${rec.endDate}`}{' '}
                    · {rec.items.length} hauler{rec.items.length === 1 ? '' : 's'} ·{' '}
                    {formatNum(rec.totalHauledKg)} kg · {rec.totalCredits} credits · Payout:{' '}
                    <strong className="text-emerald-700">
                      ₱{rec.totalPayoutPhp.toLocaleString()}
                    </strong>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      updateHaulerPayrollStatus(
                        rec.id,
                        rec.status === 'paid' ? 'generated' : 'paid'
                      )
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      rec.status === 'paid'
                        ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    <Check className="w-3 h-3" />
                    <span>{rec.status === 'paid' ? 'Set Pending' : 'Mark Paid'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyPlainText(rec)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPrintSheet({ kind: 'hauler', snapshot: rec })}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-[11px] font-bold text-sky-700 cursor-pointer"
                  >
                    <Printer className="w-3 h-3" />
                    <span>Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSnapshot(rec)}
                    aria-label={`Delete ${rec.title}`}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Individual Payout Transactions */}
      {payouts.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-2xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Individual Payout Transactions ({payouts.length})
          </div>
          <div className="divide-y divide-slate-100">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="py-1.5 flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900">{p.haulerName}</span>
                  <span className="text-slate-400 mx-1.5">·</span>
                  <span className="text-slate-500">
                    {formatDateWithWeekday(p.date)}
                  </span>
                  {p.notes && (
                    <span className="text-slate-400 ml-2 text-[11px]">
                      ({p.notes})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-700">
                    ₱{p.amountPhp.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDeleteDirectPayout(p)}
                    aria-label={`Delete payout to ${p.haulerName}`}
                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
