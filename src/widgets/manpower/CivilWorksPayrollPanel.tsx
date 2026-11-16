import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  History,
  Plus,
  Printer,
  Trash2,
  Users,
} from 'lucide-react';
import { formatDateWithWeekday } from '@/entities/project/calculations';
import { downloadCivilWorksPayrollCsv } from '@/entities/project/payrollCsvExport';
import {
  addDaysIso,
  computeCivilWorksPayrollPreview,
  formatCivilPayrollPlainText,
  getPayrollPeriodBounds,
} from '@/entities/project/manpowerPayroll';
import type {
  CivilWorksPayrollSnapshot,
  ManpowerMember,
  MastProjectState,
  PayrollPeriodType,
} from '@/entities/project/types';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore } from '@/shared/state/projectStore';
import { todayLocalIso } from '@/shared/lib/dateUtils';

const EMPTY_STRING_SET = new Set<string>();
import type { PayrollSheetData } from './PayrollPrintModal';

const PERIOD_OPTIONS: { id: PayrollPeriodType; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'overall', label: 'Overall' },
];

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

export function CivilWorksPayrollPanel({
  project,
  civilMembers,
  onAddWorker,
  onPrintSheet,
}: {
  project: MastProjectState;
  civilMembers: ManpowerMember[];
  onAddWorker: () => void;
  onPrintSheet: (sheet: PayrollSheetData) => void;
}) {
  const toggleCivilAttendanceMember = useProjectStore(
    (s) => s.toggleCivilAttendanceMember
  );
  const setCivilAttendanceForDate = useProjectStore(
    (s) => s.setCivilAttendanceForDate
  );
  const createCivilPayrollSnapshot = useProjectStore(
    (s) => s.createCivilPayrollSnapshot
  );
  const updateCivilPayrollStatus = useProjectStore(
    (s) => s.updateCivilPayrollStatus
  );
  const deleteCivilPayrollSnapshot = useProjectStore(
    (s) => s.deleteCivilPayrollSnapshot
  );
  const pushToast = useFeedbackStore((s) => s.pushToast);
  const requestConfirm = useFeedbackStore((s) => s.requestConfirm);

  const todayStr = todayLocalIso();
  const [attendanceDate, setAttendanceDate] = useState(todayStr);
  const [periodType, setPeriodType] = useState<PayrollPeriodType>('weekly');
  const [anchorDate, setAnchorDate] = useState(todayStr);
  const [customTitle, setCustomTitle] = useState('');
  const [payrollNotes, setPayrollNotes] = useState('');
  const [includeZeroDays, setIncludeZeroDays] = useState(false);
  const [deductionsByMember, setDeductionsByMember] = useState<Record<string, number>>({});

  const activeCivilMembers = useMemo(
    () =>
      civilMembers
        .filter((m) => m.active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [civilMembers]
  );

  const attendanceRecords = project.civilAttendance ?? [];
  const attendanceMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const rec of attendanceRecords) {
      map.set(rec.date, new Set(rec.presentMemberIds));
    }
    return map;
  }, [attendanceRecords]);

  const presentSetForSelectedDate =
    attendanceMap.get(attendanceDate) ?? EMPTY_STRING_SET;

  const weekStripDates = useMemo(() => {
    const { startDate } = getPayrollPeriodBounds('weekly', attendanceDate);
    return Array.from({ length: 7 }, (_, idx) => addDaysIso(startDate, idx));
  }, [attendanceDate]);

  const dayPayrollTotal = useMemo(
    () =>
      activeCivilMembers.reduce(
        (sum, m) =>
          presentSetForSelectedDate.has(m.id) ? sum + m.dailyRatePhp : sum,
        0
      ),
    [activeCivilMembers, presentSetForSelectedDate]
  );

  const availableAttendanceDates = useMemo(
    () => attendanceRecords.map((r) => r.date),
    [attendanceRecords]
  );

  const periodBounds = useMemo(
    () =>
      getPayrollPeriodBounds(periodType, anchorDate, availableAttendanceDates),
    [periodType, anchorDate, availableAttendanceDates]
  );

  useEffect(() => {
    setCustomTitle('');
    setDeductionsByMember({});
  }, [periodType, periodBounds.startDate, periodBounds.endDate]);

  const preview = useMemo(
    () =>
      computeCivilWorksPayrollPreview(
        civilMembers,
        attendanceRecords,
        periodBounds.startDate,
        periodBounds.endDate,
        deductionsByMember
      ),
    [
      civilMembers,
      attendanceRecords,
      periodBounds.startDate,
      periodBounds.endDate,
      deductionsByMember,
    ]
  );

  const displayedRows = useMemo(
    () =>
      includeZeroDays
        ? preview.rows
        : preview.rows.filter((r) => r.daysPresent > 0),
    [preview.rows, includeZeroDays]
  );

  const buildDraftSnapshot = (
    status: 'generated' | 'paid'
  ): Omit<CivilWorksPayrollSnapshot, 'id' | 'createdAt'> => {
    const items = preview.rows.filter((r) => r.daysPresent > 0);
    const totalGrossPayPhp = items.reduce((s, r) => s + r.grossPayPhp, 0);
    const totalDeductionPhp = items.reduce((s, r) => s + (r.deductionPhp ?? 0), 0);
    const totalNetPayPhp = items.reduce(
      (s, r) => s + (r.netPayPhp ?? r.grossPayPhp),
      0
    );
    return {
      periodType,
      startDate: periodBounds.startDate,
      endDate: periodBounds.endDate,
      title: customTitle.trim() || periodBounds.label,
      items,
      totalDaysWorked: items.reduce((s, r) => s + r.daysPresent, 0),
      totalGrossPayPhp,
      totalDeductionPhp,
      totalNetPayPhp,
      totalAmountPhp: totalNetPayPhp,
      status,
      paidDate: status === 'paid' ? todayStr : undefined,
      notes: payrollNotes.trim() || undefined,
    };
  };

  const handleSaveSnapshot = (status: 'generated' | 'paid') => {
    const draft = buildDraftSnapshot(status);
    if (draft.items.length === 0) {
      pushToast({
        tone: 'warning',
        message: 'Tick attendance for at least one worker in this period before saving.',
      });
      return;
    }
    createCivilPayrollSnapshot(draft);
    setPayrollNotes('');
    pushToast({
      tone: 'success',
      title: status === 'paid' ? 'Payroll Saved & Marked Paid' : 'Payroll Saved',
      message: `${draft.title} (₱${draft.totalAmountPhp.toLocaleString()}) added to Civil Works Payment History.`,
    });
  };

  const handlePrintPreview = () => {
    const draft = buildDraftSnapshot('generated');
    onPrintSheet({
      kind: 'civil',
      snapshot: {
        ...draft,
        id: 'preview',
        createdAt: new Date().toISOString(),
      },
    });
  };

  const handleCopyPlainText = async (
    snapshot: Pick<
      CivilWorksPayrollSnapshot,
      | 'title'
      | 'periodType'
      | 'startDate'
      | 'endDate'
      | 'status'
      | 'paidDate'
      | 'items'
      | 'totalDaysWorked'
      | 'totalAmountPhp'
      | 'notes'
    >
  ) => {
    try {
      const text = formatCivilPayrollPlainText(snapshot, project);
      await navigator.clipboard.writeText(text);
      pushToast({
        tone: 'success',
        message: 'Civil Works payroll summary copied to clipboard.',
        durationMs: 3000,
      });
    } catch {
      pushToast({
        tone: 'error',
        message: 'Unable to copy to clipboard in this browser.',
      });
    }
  };

  const handleDeleteSnapshot = async (rec: CivilWorksPayrollSnapshot) => {
    const ok = await requestConfirm({
      tone: 'danger',
      title: 'Delete Payroll Record?',
      message: `Delete "${rec.title}" (₱${rec.totalAmountPhp.toLocaleString()}) from Civil Works Payment History?`,
      confirmLabel: 'Delete Record',
    });
    if (ok) {
      deleteCivilPayrollSnapshot(rec.id);
    }
  };

  const history = project.civilPayrollHistory ?? [];

  return (
    <div className="space-y-4">
      {/* 1. Daily Attendance Ticking */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <CalendarCheck2 className="w-4 h-4 text-sky-600" />
              <span>Daily Attendance Checklist</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Tick Present / Absent for each Civil Works worker. Daily totals automatically feed payroll generation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAttendanceDate(addDaysIso(attendanceDate, -1))}
              aria-label="Previous day"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setAttendanceDate(addDaysIso(attendanceDate, 1))}
              aria-label="Next day"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {attendanceDate !== todayStr && (
              <button
                type="button"
                onClick={() => setAttendanceDate(todayStr)}
                className="min-h-9 px-2.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-xs font-bold cursor-pointer"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* 7-day quick strip */}
        <div className="grid grid-cols-7 gap-1">
          {weekStripDates.map((d) => {
            const count = attendanceMap.get(d)?.size ?? 0;
            const selected = d === attendanceDate;
            const weekday = new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', {
              weekday: 'short',
              timeZone: 'UTC',
            });
            return (
              <button
                key={d}
                type="button"
                onClick={() => setAttendanceDate(d)}
                className={`rounded-lg border px-1 py-1.5 text-center transition cursor-pointer ${
                  selected
                    ? 'bg-sky-600 border-sky-600 text-white shadow-2xs'
                    : count > 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="text-[10px] font-bold uppercase opacity-80">
                  {weekday}
                </div>
                <div className="text-xs font-extrabold">{d.slice(8)}</div>
                <div
                  className={`text-[9px] font-bold mt-0.5 ${
                    selected ? 'text-sky-100' : 'text-slate-500'
                  }`}
                >
                  {count}/{activeCivilMembers.length}
                </div>
              </button>
            );
          })}
        </div>

        {activeCivilMembers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-2">
            <Users className="w-7 h-7 text-slate-300 mx-auto" />
            <div className="text-xs font-bold text-slate-700">
              No active Civil Works workers in the roster yet
            </div>
            <p className="text-[11px] text-slate-500">
              Add your Civil Works crew (Foreman, Mason, Steelman, Laborer, etc.) with their daily rates first.
            </p>
            <button
              type="button"
              onClick={onAddWorker}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Civil Works Worker
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-xs text-slate-600">
                <strong>{formatDateWithWeekday(attendanceDate)}</strong>:{' '}
                <span className="font-bold text-sky-700">
                  {presentSetForSelectedDate.size} / {activeCivilMembers.length} present
                </span>{' '}
                · Day Cost:{' '}
                <strong className="text-emerald-700">
                  ₱{dayPayrollTotal.toLocaleString()}
                </strong>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setCivilAttendanceForDate(
                      attendanceDate,
                      activeCivilMembers.map((m) => m.id)
                    )
                  }
                  className="px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold cursor-pointer"
                >
                  Mark All Present
                </button>
                <button
                  type="button"
                  onClick={() => setCivilAttendanceForDate(attendanceDate, [])}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-bold cursor-pointer"
                >
                  Clear Day
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeCivilMembers.map((member) => {
                const isPresent = presentSetForSelectedDate.has(member.id);
                return (
                  <label
                    key={member.id}
                    className={`flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition select-none ${
                      isPresent
                        ? 'border-emerald-300 bg-emerald-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isPresent}
                        onChange={() =>
                          toggleCivilAttendanceMember(attendanceDate, member.id)
                        }
                        className="w-4.5 h-4.5 rounded accent-emerald-600 shrink-0 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {member.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {member.position} · ₱{member.dailyRatePhp.toLocaleString()}/day
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        isPresent
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isPresent ? 'Present' : 'Absent'}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 2. Create Daily / Weekly / Monthly / Overall Payroll */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-sky-600" />
              <span>Generate Civil Works Payroll</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Select Daily, Weekly, Monthly, or Overall period to save to Payment History or print/send to your manager.
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
                    ? 'bg-white text-sky-700 shadow-2xs'
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
                  ? 'Payroll Date'
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
              Notes for Manager / Admin (Optional)
            </label>
            <input
              type="text"
              value={payrollNotes}
              onChange={(e) => setPayrollNotes(e.target.value)}
              placeholder="e.g. Week 2 civil works crew payroll"
              className="w-full min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800"
            />
          </div>
        </div>

        {/* Period Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-sky-50 border border-sky-200 font-bold text-sky-900">
              {periodBounds.startDate === periodBounds.endDate
                ? formatDateWithWeekday(periodBounds.startDate)
                : `${periodBounds.startDate} to ${periodBounds.endDate}`}
            </span>
            <span className="text-slate-600">
              <strong>{preview.totalWorkersWithAttendance}</strong> worker
              {preview.totalWorkersWithAttendance === 1 ? '' : 's'} ·{' '}
              <strong>{preview.totalDaysWorked}</strong> man-day
              {preview.totalDaysWorked === 1 ? '' : 's'} · Total:{' '}
              <strong className="text-emerald-700 text-sm">
                ₱{preview.totalAmountPhp.toLocaleString()}
              </strong>
              {preview.totalDeductionPhp > 0 && (
                <span className="text-slate-500 ml-1">
                  (Gross ₱{preview.totalGrossPayPhp.toLocaleString()} − Ded. ₱
                  {preview.totalDeductionPhp.toLocaleString()})
                </span>
              )}
            </span>
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeZeroDays}
              onChange={(e) => setIncludeZeroDays(e.target.checked)}
              className="rounded accent-sky-600"
            />
            <span>Show 0-day workers</span>
          </label>
        </div>

        {/* Preview Table */}
        {displayedRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">
            No Civil Works attendance ticked inside this {periodType} period.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-bold">Worker</th>
                  <th className="px-3 py-2 font-bold">Position</th>
                  <th className="px-2 py-2 font-bold text-right">Rate / Day</th>
                  <th className="px-2 py-2 font-bold text-center">Days Present</th>
                  <th className="px-3 py-2 font-bold hidden sm:table-cell">Dates</th>
                  <th className="px-3 py-2 font-bold text-right">Gross Pay</th>
                  <th className="px-2 py-2 font-bold text-right w-28">Deduction (₱)</th>
                  <th className="px-3 py-2 font-bold text-right">Net Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.map((row) => (
                  <tr key={row.memberId} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-bold text-slate-900">
                      {row.name}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.position}</td>
                    <td className="px-2 py-2 text-right text-slate-700">
                      ₱{row.dailyRatePhp.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-center font-bold text-sky-700">
                      {row.daysPresent}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500 hidden sm:table-cell">
                      {row.datesPresent.length > 0
                        ? row.datesPresent.map((d) => d.slice(5)).join(', ')
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">
                      ₱{row.grossPayPhp.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        aria-label={`Deduction for ${row.name}`}
                        value={deductionsByMember[row.memberId] ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
                          setDeductionsByMember((prev) => ({
                            ...prev,
                            [row.memberId]: val,
                          }));
                        }}
                        placeholder="0"
                        className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-extrabold text-slate-900 tabular-nums">
                      ₱{(row.netPayPhp ?? row.grossPayPhp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleCopyPlainText(buildDraftSnapshot('generated'))}
            disabled={preview.totalWorkersWithAttendance === 0}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Summary</span>
          </button>
          <button
            type="button"
            onClick={handlePrintPreview}
            disabled={preview.totalWorkersWithAttendance === 0}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>
          <button
            type="button"
            onClick={() => downloadCivilWorksPayrollCsv(project, buildDraftSnapshot('generated'))}
            disabled={preview.totalWorkersWithAttendance === 0}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => handleSaveSnapshot('generated')}
            disabled={preview.totalWorkersWithAttendance === 0}
            className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Save Payroll History</span>
          </button>
          <button
            type="button"
            onClick={() => handleSaveSnapshot('paid')}
            disabled={preview.totalWorkersWithAttendance === 0}
            className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer shadow-2xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Save &amp; Mark Paid</span>
          </button>
        </div>
      </div>

      {/* 3. Saved Civil Works Payment History */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <History className="w-4 h-4 text-sky-600" />
            <span>Civil Works Payment History ({history.length})</span>
          </h3>
        </div>

        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
            No saved Civil Works payroll batches yet. Generate a Daily, Weekly, Monthly, or Overall payroll above to build your payment history.
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
                    · {rec.items.length} worker{rec.items.length === 1 ? '' : 's'} ·{' '}
                    {rec.totalDaysWorked} man-days ·{' '}
                    <strong className="text-emerald-700">
                      ₱{rec.totalAmountPhp.toLocaleString()}
                    </strong>
                    {(rec.totalDeductionPhp ?? 0) > 0 && (
                      <span className="text-slate-400">
                        {' '}
                        (Ded. ₱{(rec.totalDeductionPhp ?? 0).toLocaleString()})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      updateCivilPayrollStatus(
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
                    aria-label={`Copy ${rec.title}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPrintSheet({ kind: 'civil', snapshot: rec })}
                    aria-label={`Print ${rec.title}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-[11px] font-bold text-sky-700 cursor-pointer"
                  >
                    <Printer className="w-3 h-3" />
                    <span>Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadCivilWorksPayrollCsv(project, rec)}
                    aria-label={`Export CSV ${rec.title}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>CSV</span>
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
    </div>
  );
}
