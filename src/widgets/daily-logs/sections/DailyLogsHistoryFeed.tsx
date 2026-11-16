import { memo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Printer,
  Trash2,
} from 'lucide-react';
import {
  computeDailyLogMaterialRemaining,
  formatDateWithWeekday,
  formatDailyLogPlainText,
  getDailyLogActivityRows,
  getDailyLogDelayRows,
  getDailyLogEquipmentRows,
  getDailyLogMaterialRows,
  getDailyLogSafetyRows,
  getDailyLogVisitorRows,
} from '@/entities/project/calculations';
import type {
  DailyActivityLogEntry,
  DailyLogActivityStatus,
  MastProjectState,
} from '@/entities/project/types';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore } from '@/shared/state/projectStore';
import { useUiStore } from '@/shared/state/uiStore';

const ACTIVITY_STATUS_BADGE: Record<DailyLogActivityStatus, string> = {
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Ongoing: 'bg-sky-50 text-sky-700 border-sky-200',
  Pending: 'bg-slate-100 text-slate-700 border-slate-200',
  Delayed: 'bg-amber-50 text-amber-800 border-amber-200',
};

export interface DailyLogsHistoryFeedProps {
  project: MastProjectState;
  sortedDailyLogs: DailyActivityLogEntry[];
  mobilePane: 'form' | 'history';
  onLoadLogForEdit: (log: DailyActivityLogEntry) => void;
  onBatchPrint: () => void;
}

export const DailyLogsHistoryFeed = memo(function DailyLogsHistoryFeed({
  project,
  sortedDailyLogs,
  mobilePane,
  onLoadLogForEdit,
  onBatchPrint,
}: DailyLogsHistoryFeedProps) {
  const deleteDailyLog = useProjectStore((s) => s.deleteDailyLog);
  const setDailyLogPrintId = useUiStore((s) => s.setDailyLogPrintId);
  const requestConfirm = useFeedbackStore((s) => s.requestConfirm);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const handleCopyText = async (log: DailyActivityLogEntry) => {
    try {
      const text = formatDailyLogPlainText(log, project);
      await navigator.clipboard.writeText(text);
      setCopiedLogId(log.id);
      useFeedbackStore.getState().pushToast({
        tone: 'success',
        message: `Day #${log.dayNumber} log summary copied to clipboard.`,
        durationMs: 3000,
      });
      window.setTimeout(() => setCopiedLogId(null), 1800);
    } catch {
      useFeedbackStore.getState().pushToast({
        tone: 'error',
        message: 'Clipboard unavailable in this browser.',
        durationMs: 3500,
      });
    }
  };

  return (
    <div
      className={`lg:col-span-6 space-y-3 ${
        mobilePane === 'history' ? 'block' : 'hidden lg:block'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Saved Daily Logs ({project.dailyLogs.length})
        </h2>
        <div className="flex items-center gap-2">
          {sortedDailyLogs.length > 0 && (
            <>
              <button
                type="button"
                onClick={onBatchPrint}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold cursor-pointer shadow-2xs"
                title="Batch export multiple logs to a single PDF / print document"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>Batch Print / PDF</span>
              </button>
              <div className="inline-flex rounded-md border border-slate-200 bg-white overflow-hidden text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    sortedDailyLogs.forEach((l) => {
                      next[l.id] = true;
                    });
                    setExpandedLogs(next);
                  }}
                  className="px-2 py-0.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-r border-slate-200 cursor-pointer"
                >
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    sortedDailyLogs.forEach((l) => {
                      next[l.id] = false;
                    });
                    setExpandedLogs(next);
                  }}
                  className="px-2 py-0.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                >
                  Collapse All
                </button>
              </div>
            </>
          )}
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Stored offline on device
          </span>
        </div>
      </div>

      {sortedDailyLogs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
          No daily logs recorded yet. Fill out the form to log today&apos;s site report.
        </div>
      ) : (
        sortedDailyLogs.map((log, index) => {
          const isExpanded = expandedLogs[log.id] ?? index === 0;
          const activityRows = getDailyLogActivityRows(log);
          const mats = getDailyLogMaterialRows(log).filter(
            (m) =>
              m.onSiteQty > 0 ||
              (m.deliveredQty ?? 0) > 0 ||
              m.usedTodayQty > 0 ||
              (m.remainingQty ?? 0) > 0 ||
              Boolean(m.remarks?.trim())
          );
          const equips = getDailyLogEquipmentRows(log);
          const delays = getDailyLogDelayRows(log);
          const visitors = getDailyLogVisitorRows(log);
          const safetyRows = getDailyLogSafetyRows(log);
          const docs = log.documentationItems ?? [];

          const logProjectName = log.projectName?.trim() || project.projectName;
          const logLocation = log.location?.trim() || project.location;
          const logAuthor = log.preparedBy?.trim() || project.preparedBy;

          return (
            <article
              key={log.id}
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              {/* Collapsible Card Top Bar */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() =>
                  setExpandedLogs((prev) => ({ ...prev, [log.id]: !isExpanded }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedLogs((prev) => ({ ...prev, [log.id]: !isExpanded }));
                  }
                }}
                className={`flex flex-wrap items-start justify-between gap-2 p-3 sm:p-3.5 cursor-pointer hover:bg-slate-50/80 transition ${
                  isExpanded ? 'border-b border-slate-100' : ''
                }`}
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="mt-0.5 text-slate-400 shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-600" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </span>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-bold">
                        Day {log.dayNumber}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900">
                        {formatDateWithWeekday(log.date)}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                        {log.weather}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 truncate">
                      {logProjectName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {logLocation} · By {logAuthor}
                      {log.weatherNotes ? ` · ${log.weatherNotes}` : ''}
                    </div>
                    {!isExpanded && (
                      <div className="text-[11px] text-slate-600 pt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
                        <span>{log.totalWorkers} workers</span>
                        <span>· {activityRows.length} activities</span>
                        {safetyRows.length > 0 && (
                          <span>· {safetyRows.length} safety</span>
                        )}
                        {log.foundationsWorked.length > 0 && (
                          <span className="font-semibold text-sky-700">
                            · {log.foundationsWorked.join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleCopyText(log)}
                    title="Copy plain text summary"
                    aria-label="Copy plain text summary"
                    className="inline-flex items-center justify-center gap-1 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 px-2.5 sm:px-2 py-2 sm:py-1 rounded-lg sm:rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    {copiedLogId === log.id ? (
                      <Check className="w-4 h-4 sm:w-3 sm:h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 sm:w-3 sm:h-3" />
                    )}
                    <span className="hidden sm:inline">
                      {copiedLogId === log.id ? 'Copied' : 'Copy'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDailyLogPrintId(log.id)}
                    title="Print / Save PDF"
                    aria-label="Print / Save PDF"
                    className="inline-flex items-center justify-center gap-1 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 px-2.5 sm:px-2 py-2 sm:py-1 rounded-lg sm:rounded border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-200 text-[11px] font-semibold text-slate-700 hover:text-sky-700 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 sm:w-3 sm:h-3" />
                    <span className="hidden sm:inline">Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onLoadLogForEdit(log)}
                    title="Edit daily log"
                    aria-label="Edit daily log"
                    className="min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center p-2 sm:p-1.5 rounded-lg sm:rounded border border-slate-200 text-slate-500 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await requestConfirm({
                        tone: 'danger',
                        title: 'Delete Daily Log?',
                        message: `Delete Day ${log.dayNumber} (${log.date}) log?`,
                        detail:
                          'This removes the daily log entry and recalculates carried-over material balances for subsequent logs.',
                        confirmLabel: 'Delete Log',
                      });
                      if (ok) {
                        deleteDailyLog(log.id);
                      }
                    }}
                    title="Delete daily log"
                    aria-label="Delete daily log"
                    className="min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center p-2 sm:p-1.5 rounded-lg sm:rounded border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="p-3.5 sm:p-4 space-y-3">
                  {/* Manpower Summary & Tags */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                      <span className="font-bold uppercase tracking-wider text-slate-500">
                        Manpower: {log.totalWorkers} workers
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[11px]">
                      {log.foundationsWorked.map((fid) => (
                        <span
                          key={fid}
                          className="px-2 py-0.5 rounded bg-sky-600 text-white font-semibold"
                        >
                          {fid}
                        </span>
                      ))}
                      {log.workers.map((w, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700"
                        >
                          {w.count}× {w.role}
                          {w.names ? ` (${w.names})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Activities & Status Table */}
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Activities &amp; Status
                    </div>
                    <div className="rounded-lg border border-slate-200 overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="px-2 py-1 font-semibold w-16">Loc.</th>
                            <th className="px-2 py-1 font-semibold">Activity</th>
                            <th className="px-2 py-1 font-semibold text-center w-24">Status</th>
                            <th className="px-2 py-1 font-semibold">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activityRows.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-2 py-1.5 text-center text-slate-400 italic">
                                No activities recorded
                              </td>
                            </tr>
                          ) : (
                            activityRows.map((act) => (
                              <tr key={act.id}>
                                <td className="px-2 py-1 font-bold text-sky-700">
                                  {act.foundationId || 'Site'}
                                </td>
                                <td className="px-2 py-1 text-slate-900 font-medium">
                                  {act.description}
                                </td>
                                <td className="px-2 py-1 text-center">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                                      ACTIVITY_STATUS_BADGE[act.status]
                                    }`}
                                  >
                                    {act.status}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-slate-500">
                                  {act.remarks || '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {log.activitiesSummary && log.activities && log.activities.length > 0 && (
                      <p className="text-xs text-slate-600 leading-relaxed pt-0.5">
                        {log.activitiesSummary}
                      </p>
                    )}
                  </div>

                  {/* Safety Logs Table (Safety Officer) */}
                  {(safetyRows.length > 0 || Boolean(log.safetyOfficer?.trim())) && (
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold uppercase tracking-wider text-slate-500">
                          Safety Logs
                        </span>
                        {log.safetyOfficer?.trim() && (
                          <span className="font-semibold text-emerald-700">
                            Safety Officer: {log.safetyOfficer}
                          </span>
                        )}
                      </div>
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Time / Activity</th>
                              <th className="px-2 py-1 font-semibold">Observation / Hazard</th>
                              <th className="px-2 py-1 font-semibold">Action Taken</th>
                              <th className="px-2 py-1 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {safetyRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="px-2 py-1.5 text-center text-slate-400 italic"
                                >
                                  No safety log entries recorded
                                </td>
                              </tr>
                            ) : (
                              safetyRows.map((s) => (
                                <tr key={s.id}>
                                  <td className="px-2 py-1 font-semibold text-slate-800">
                                    {s.timeOrActivity || '—'}
                                  </td>
                                  <td className="px-2 py-1 text-slate-700">
                                    {s.hazardOrFinding || '—'}
                                  </td>
                                  <td className="px-2 py-1 text-slate-700">
                                    {s.actionTaken || '—'}
                                  </td>
                                  <td className="px-2 py-1 font-semibold text-emerald-700">
                                    {s.status || 'Compliant'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Materials on Site Table */}
                  {mats.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Materials on Site
                      </div>
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Item</th>
                              <th className="px-2 py-1 font-semibold text-right">On Site</th>
                              <th className="px-2 py-1 font-semibold text-right">Delivered</th>
                              <th className="px-2 py-1 font-semibold text-right">Used</th>
                              <th className="px-2 py-1 font-semibold text-right">Remaining</th>
                              <th className="px-2 py-1 font-semibold">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {mats.map((m) => {
                              const delivered = m.deliveredQty ?? 0;
                              const remaining =
                                m.remainingQty ?? computeDailyLogMaterialRemaining(m);
                              return (
                                <tr key={m.id}>
                                  <td className="px-2 py-1 font-semibold text-slate-800">
                                    {m.name} ({m.unit})
                                  </td>
                                  <td className="px-2 py-1 text-right font-semibold text-slate-900">
                                    {m.onSiteQty}
                                  </td>
                                  <td className="px-2 py-1 text-right font-semibold text-emerald-700">
                                    {delivered}
                                  </td>
                                  <td className="px-2 py-1 text-right text-slate-700">
                                    {m.usedTodayQty}
                                  </td>
                                  <td className="px-2 py-1 text-right font-bold text-sky-700">
                                    {remaining}
                                  </td>
                                  <td className="px-2 py-1 text-slate-500">
                                    {m.remarks || '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Equipments Table */}
                  {equips.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Equipments
                      </div>
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Equipment / Tool</th>
                              <th className="px-2 py-1 font-semibold text-center w-14">Qty</th>
                              <th className="px-2 py-1 font-semibold text-center w-24">Status</th>
                              <th className="px-2 py-1 font-semibold">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {equips.map((eq) => (
                              <tr key={eq.id}>
                                <td className="px-2 py-1 font-semibold text-slate-800">
                                  {eq.name}
                                </td>
                                <td className="px-2 py-1 text-center text-slate-900">
                                  {eq.qty}
                                </td>
                                <td className="px-2 py-1 text-center text-slate-700">
                                  {eq.status}
                                </td>
                                <td className="px-2 py-1 text-slate-500">
                                  {eq.remarks || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Delays Table */}
                  {delays.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                        Delays
                      </div>
                      <div className="rounded-lg border border-amber-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-amber-50 text-amber-900 border-b border-amber-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Delay / Issue</th>
                              <th className="px-2 py-1 font-semibold w-28">Impact</th>
                              <th className="px-2 py-1 font-semibold">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100">
                            {delays.map((d) => (
                              <tr key={d.id}>
                                <td className="px-2 py-1 font-medium text-amber-950">
                                  {d.description}
                                </td>
                                <td className="px-2 py-1 text-amber-900">
                                  {d.impact || '—'}
                                </td>
                                <td className="px-2 py-1 text-amber-800">
                                  {d.remarks || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Visitors Table */}
                  {visitors.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Visitors
                      </div>
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Name</th>
                              <th className="px-2 py-1 font-semibold">Company / Role</th>
                              <th className="px-2 py-1 font-semibold">Purpose</th>
                              <th className="px-2 py-1 font-semibold">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {visitors.map((v) => (
                              <tr key={v.id}>
                                <td className="px-2 py-1 font-semibold text-slate-800">
                                  {v.name}
                                </td>
                                <td className="px-2 py-1 text-slate-700">
                                  {v.roleOrCompany || '—'}
                                </td>
                                <td className="px-2 py-1 text-slate-700">
                                  {v.purpose || '—'}
                                </td>
                                <td className="px-2 py-1 text-slate-500">
                                  {v.remarks || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Documentation Table (Image left, Description / Remarks right) */}
                  {docs.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Documentation
                      </div>
                      <div className="rounded-lg border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-2 py-1 font-semibold w-5/12">Image</th>
                              <th className="px-2 py-1 font-semibold w-7/12">
                                Description / Remarks
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {docs.map((doc) => (
                              <tr key={doc.id}>
                                <td className="p-1.5 align-middle">
                                  {doc.photoDataUrl ? (
                                    <img
                                      src={doc.photoDataUrl}
                                      alt={doc.description || doc.photoName || 'Documentation'}
                                      className="max-h-28 w-auto mx-auto rounded border border-slate-200 object-contain"
                                    />
                                  ) : (
                                    <span className="text-slate-400 italic block text-center">
                                      No photo
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 align-top space-y-1">
                                  <div className="font-semibold text-slate-900">
                                    {doc.description || '—'}
                                  </div>
                                  {doc.remarks && (
                                    <div className="text-slate-600">
                                      <span className="font-semibold">Remarks:</span> {doc.remarks}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
});
