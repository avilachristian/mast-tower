import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, CheckSquare, Eye, EyeOff, Filter, Square } from 'lucide-react';
import { sortDailyLogsNewestFirst } from '@/entities/project/calculations';
import type {
  MastProjectState,
} from '@/entities/project/types';
import { todayLocalIso } from '@/shared/lib/dateUtils';
import { PrintModalHeader, usePrintPageSetup } from '@/widgets/report/PrintPageControls';
import { ReportSignoffOverrideProvider } from '@/widgets/report/ReportSignoffOverrideContext';
import { DailyLogPrintSheet } from './DailyLogPrintSheet';

export function DailyLogBatchPrintModal({
  project,
  onClose,
}: {
  project: MastProjectState;
  onClose: () => void;
}) {
  return (
    <ReportSignoffOverrideProvider
      project={project}
      defaultIncludeSafetyOfficer={project.dailyLogs.some((l) =>
        Boolean(l.safetyOfficer?.trim())
      )}
    >
      <DailyLogBatchPrintModalContent project={project} onClose={onClose} />
    </ReportSignoffOverrideProvider>
  );
}

function DailyLogBatchPrintModalContent({
  project,
  onClose,
}: {
  project: MastProjectState;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { dialogMaxWidthClass, sheetWidthPx } = usePrintPageSetup(true);

  // Sorted logs (oldest to newest for batch printing chronologically)
  const allLogsChronological = useMemo(() => {
    return [...sortDailyLogsNewestFirst(project.dailyLogs)].reverse();
  }, [project.dailyLogs]);

  // Initial date bounds
  const minDate = allLogsChronological[0]?.date ?? todayLocalIso();
  const maxDate =
    allLogsChronological[allLogsChronological.length - 1]?.date ?? todayLocalIso();

  const [startDate, setStartDate] = useState(minDate);
  const [endDate, setEndDate] = useState(maxDate);
  const [showMaterials, setShowMaterials] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(allLogsChronological.map((l) => l.id));
  });

  useEffect(() => {
    document.body.classList.add('report-modal-open');
    return () => {
      document.body.classList.remove('report-modal-open');
    };
  }, []);

  // Filter logs by date range
  const logsInRange = useMemo(() => {
    return allLogsChronological.filter((l) => {
      if (startDate && l.date < startDate) return false;
      if (endDate && l.date > endDate) return false;
      return true;
    });
  }, [allLogsChronological, startDate, endDate]);

  // Selected logs to actually print
  const logsToPrint = useMemo(() => {
    return logsInRange.filter((l) => selectedIds.has(l.id));
  }, [logsInRange, selectedIds]);

  const handleSelectAll = () => {
    setSelectedIds(new Set(logsInRange.map((l) => l.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const toggleLogId = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const setPresetRange = (preset: 'all' | 'last7' | 'thisMonth') => {
    if (preset === 'all') {
      setStartDate(minDate);
      setEndDate(maxDate);
      setSelectedIds(new Set(allLogsChronological.map((l) => l.id)));
      return;
    }
    const today = todayLocalIso();
    if (preset === 'last7') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const start = d.toISOString().slice(0, 10);
      setStartDate(start);
      setEndDate(today);
      const matching = allLogsChronological.filter((l) => l.date >= start && l.date <= today);
      setSelectedIds(new Set(matching.map((l) => l.id)));
    } else if (preset === 'thisMonth') {
      const ym = today.slice(0, 7);
      const start = `${ym}-01`;
      setStartDate(start);
      setEndDate(today);
      const matching = allLogsChronological.filter((l) => l.date >= start && l.date <= today);
      setSelectedIds(new Set(matching.map((l) => l.id)));
    }
  };

  const projectName =
    project.reportDetails?.projectName?.trim() || project.projectName;
  const reportDocTitle = `Daily Construction Logs Batch (${logsToPrint.length} logs) - ${projectName}`;

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
          title="Batch Print Daily Construction Logs"
          subtitle={`${logsToPrint.length} of ${project.dailyLogs.length} logs selected · Ready for multi-page PDF Export`}
          extraActions={
            <button
              type="button"
              aria-pressed={showMaterials}
              onClick={() => setShowMaterials((v) => !v)}
              className={`inline-flex items-center justify-center gap-1.5 min-h-10 sm:min-h-8 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
                showMaterials
                  ? 'bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100'
                  : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-100'
              }`}
              title="Toggle materials table on printed daily logs"
            >
              {showMaterials ? (
                <Eye className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{showMaterials ? 'Materials: On' : 'Materials: Off'}</span>
            </button>
          }
          targetRef={sheetRef}
          documentTitle={reportDocTitle}
          onClose={onClose}
        />

        {/* Date Filter & Log Selector Bar (hidden in print) */}
        <div className="no-print border-b border-slate-200 bg-slate-50 p-3 sm:px-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Date Range:
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-sky-500"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-sky-500"
              />

              {/* Quick Range Presets */}
              <div className="flex items-center gap-1 ml-1">
                <button
                  type="button"
                  onClick={() => setPresetRange('last7')}
                  className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold cursor-pointer"
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => setPresetRange('thisMonth')}
                  className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold cursor-pointer"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => setPresetRange('all')}
                  className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold cursor-pointer"
                >
                  All Logs
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
              >
                <CheckSquare className="w-3 h-3 text-slate-500" />
                <span>Select All ({logsInRange.length})</span>
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
              >
                <Square className="w-3 h-3 text-slate-500" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Quick pills of logs in range for fine-tuning */}
          {logsInRange.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200 max-h-24 overflow-y-auto">
              <span className="text-[10px] font-bold uppercase text-slate-500 mr-1">
                Logs ({logsToPrint.length} selected):
              </span>
              {logsInRange.map((l) => {
                const isSelected = selectedIds.has(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLogId(l.id)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-sky-50 border-sky-300 text-sky-800'
                        : 'bg-white border-slate-200 text-slate-400 opacity-60'
                    }`}
                  >
                    <span>Day #{l.dayNumber} ({l.date})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Multi-page Printable Frame */}
        <div className="report-modal-preview-frame overflow-x-auto bg-slate-100/75 p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible">
          {logsToPrint.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-white rounded-lg border border-slate-200 max-w-xl mx-auto my-8">
              <Filter className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="font-bold text-slate-700">No daily logs match the selected range.</div>
              <div className="text-xs text-slate-500 mt-1">
                Adjust the date range or click &ldquo;All Logs&rdquo; above.
              </div>
            </div>
          ) : (
            <div
              ref={sheetRef}
              style={{ width: `${sheetWidthPx}px`, minWidth: `${sheetWidthPx}px` }}
              className="report-modal-scroll-area mx-auto print:w-full print:min-w-0"
            >
              {logsToPrint.map((l, idx) => (
                <div
                  key={l.id}
                  className="report-printable-card pdf-desktop-layout mx-auto bg-white text-slate-900 p-4 sm:p-6 pdf-desktop:p-6 print:p-2 shadow-sm border border-slate-200 print:w-full print:min-w-0 print:border-none print:shadow-none mb-6 print:mb-0 break-after-page print:break-after-page"
                  style={{ pageBreakAfter: idx < logsToPrint.length - 1 ? 'always' : 'auto' }}
                >
                  <DailyLogPrintSheet
                    project={project}
                    log={l}
                    showMaterials={showMaterials}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
