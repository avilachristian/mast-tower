import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { FOUNDATION_SPECS } from '@/entities/project/mast2Baseline';
import type { MastProjectState } from '@/entities/project/types';
import { useProjectStore } from '@/shared/state/projectStore';
import { ActivityReportSheet } from './ActivityReportSheet';
import { ReportToolbarActions, usePrintPageSetup } from './PrintPageControls';

export function PrintableReportModal({
  project,
  onClose,
}: {
  project: MastProjectState;
  onClose: () => void;
}) {
  const selectedFoundationId = useProjectStore((s) => s.selectedFoundationId);
  const selectFoundation = useProjectStore((s) => s.selectFoundation);

  const selectedFoundation =
    project.foundations.find((f) => f.id === selectedFoundationId) ??
    project.foundations[0];

  const { dialogMaxWidthClass, sheetWidthPx } = usePrintPageSetup(true);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add('report-modal-open');
    return () => {
      document.body.classList.remove('report-modal-open');
    };
  }, []);

  const reportTitle =
    project.reportDetails?.documentTitle?.trim() ||
    `Foundation Activity Report - ${selectedFoundation?.id ?? 'PF-0'} - ${
      project.reportDetails?.projectName?.trim() || project.projectName
    }`;

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
        <div className="no-print print:hidden flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200 text-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-800">
              Current Foundation Activity Report
            </span>
            {selectedFoundation && (
              <select
                value={selectedFoundation.id}
                onChange={(e) => selectFoundation(e.target.value)}
                className="w-full sm:w-auto max-w-full min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-sky-500 focus:outline-none"
              >
                {project.foundations.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.id} — {FOUNDATION_SPECS[f.type].label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ReportToolbarActions targetRef={sheetRef} documentTitle={reportTitle} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close report"
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="report-modal-preview-frame overflow-x-auto bg-slate-100/75 p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible">
          <div
            ref={sheetRef}
            style={{ width: `${sheetWidthPx}px`, minWidth: `${sheetWidthPx}px` }}
            className="report-modal-scroll-area report-printable-card pdf-desktop-layout mx-auto bg-white shadow-sm border border-slate-200 print:w-full print:min-w-0 print:border-none print:shadow-none"
          >
            {selectedFoundation && (
              <ActivityReportSheet
                project={project}
                foundation={selectedFoundation}
                onSelectFoundation={selectFoundation}
              />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
