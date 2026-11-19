import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import {
  formatDailyLogPlainText,
  formatDateWithWeekday,
} from '@/entities/project/calculations';
import type { DailyActivityLogEntry, MastProjectState } from '@/entities/project/types';
import { PrintModalHeader, usePrintPageSetup } from '@/widgets/report/PrintPageControls';
import {
  resolveMatchingPreparedSignature,
} from '@/widgets/report/ReportLetterhead';
import {
  ReportSignoffOverrideProvider,
  useReportSignoffOverrideControls,
} from '@/widgets/report/ReportSignoffOverrideContext';
import { DailyLogPrintSheet } from './DailyLogPrintSheet';

export function DailyLogPrintModal({
  project,
  log,
  onSelectLog,
  onClose,
}: {
  project: MastProjectState;
  log: DailyActivityLogEntry;
  onSelectLog: (id: string) => void;
  onClose: () => void;
}) {
  const preparedBy =
    log.preparedBy?.trim() ||
    project.reportDetails?.preparedBy?.trim() ||
    project.preparedBy;

  return (
    <ReportSignoffOverrideProvider
      project={project}
      defaults={{
        preparedBy,
        preparedSignatureUrl: resolveMatchingPreparedSignature(project, preparedBy),
      }}
    >
      <DailyLogPrintModalContent
        project={project}
        log={log}
        onSelectLog={onSelectLog}
        onClose={onClose}
      />
    </ReportSignoffOverrideProvider>
  );
}

function DailyLogPrintModalContent({
  project,
  log,
  onSelectLog,
  onClose,
}: {
  project: MastProjectState;
  log: DailyActivityLogEntry;
  onSelectLog: (id: string) => void;
  onClose: () => void;
}) {
  const signoffCtrl = useReportSignoffOverrideControls();
  const [copied, setCopied] = useState(false);
  const [showMaterials, setShowMaterials] = useState(true);
  const sheetRef = useRef<HTMLDivElement>(null);

  const projectName =
    log.projectName?.trim() ||
    project.reportDetails?.projectName?.trim() ||
    project.projectName;
  const preparedBy =
    log.preparedBy?.trim() ||
    project.reportDetails?.preparedBy?.trim() ||
    project.preparedBy;

  const { dialogMaxWidthClass, sheetWidthPx } = usePrintPageSetup(true);

  useEffect(() => {
    document.body.classList.add('report-modal-open');
    return () => {
      document.body.classList.remove('report-modal-open');
    };
  }, []);

  const reportDocTitle =
    project.reportDetails?.documentTitle?.trim() ||
    `Daily Construction Log - Day ${log.dayNumber} (${log.date}) - ${projectName}`;

  const handleCopyText = async () => {
    try {
      const overriddenName = signoffCtrl?.overrides.prepared?.name;
      const effectivePrepared =
        overriddenName !== undefined ? overriddenName.trim() : preparedBy;
      const text = formatDailyLogPlainText(
        { ...log, preparedBy: effectivePrepared },
        { ...project, preparedBy: effectivePrepared }
      );
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback if clipboard API unavailable
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
        {/* Toolbar (hidden when printing) */}
        <PrintModalHeader
          title="Daily Construction Log"
          titleExtra={
            project.dailyLogs.length > 0 ? (
              <select
                value={log.id}
                onChange={(e) => onSelectLog(e.target.value)}
                className="w-full sm:w-auto max-w-full min-w-0 min-h-10 sm:min-h-8 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-sky-500 focus:outline-none"
              >
                {project.dailyLogs.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    Day {entry.dayNumber} — {formatDateWithWeekday(entry.date)} ({entry.weather})
                  </option>
                ))}
              </select>
            ) : undefined
          }
          extraActions={
            <>
              <button
                type="button"
                aria-pressed={showMaterials}
                onClick={() => setShowMaterials((v) => !v)}
                className={`inline-flex items-center justify-center gap-1.5 min-h-10 sm:min-h-8 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
                  showMaterials
                    ? 'bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100'
                    : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-100'
                }`}
                title="Toggle materials table on printed daily log"
              >
                {showMaterials ? (
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{showMaterials ? 'Materials: On' : 'Materials: Off'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center justify-center gap-1.5 min-h-10 sm:min-h-8 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-200/70 border border-slate-300 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            </>
          }
          targetRef={sheetRef}
          documentTitle={reportDocTitle}
          onClose={onClose}
        />

        {/* Printable Sheet */}
        <div className="report-modal-preview-frame overflow-x-auto bg-slate-100/75 p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible">
          <div
            ref={sheetRef}
            style={{ width: `${sheetWidthPx}px`, minWidth: `${sheetWidthPx}px` }}
            className="report-modal-scroll-area report-printable-card pdf-desktop-layout mx-auto bg-white text-slate-900 p-4 sm:p-6 pdf-desktop:p-6 print:p-2 shadow-sm border border-slate-200 print:w-full print:min-w-0 print:border-none print:shadow-none"
          >
            <DailyLogPrintSheet
              project={project}
              log={log}
              showMaterials={showMaterials}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
