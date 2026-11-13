import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { MastProjectState } from '@/entities/project/types';
import type { MastSelectionTarget } from '@/shared/state/uiStore';
import { ReportToolbarActions, usePrintPageSetup } from '@/widgets/report/PrintPageControls';
import { VerticalMastInspectionSheet } from './VerticalMastInspectionSheet';

export function VerticalMastInspectionPrintModal({
  open,
  onClose,
  project,
  target,
}: {
  open: boolean;
  onClose: () => void;
  project: MastProjectState;
  target: MastSelectionTarget;
}) {
  const { dialogMaxWidthClass, sheetWidthPx } = usePrintPageSetup(open);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('report-modal-open');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('report-modal-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const docTitle = `Tower & Guying Inspection Report - ${target.id} - ${
    project.reportDetails?.projectName?.trim() || project.projectName
  }`;

  return createPortal(
    <div
      className="report-modal-portal fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 print:static print:p-0 print:bg-white"
      onClick={onClose}
    >
      <div
        className={`report-modal-dialog ${dialogMaxWidthClass} mx-auto bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden print:max-w-none print:rounded-none print:shadow-none print:border-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="no-print print:hidden sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200 text-slate-900">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Tower &amp; Guying QA/QC Inspection Report — {target.id}
            </h3>
            <p className="text-[11px] text-slate-500">
              {project.reportDetails?.projectName?.trim() || project.projectName} · Print or Save as PDF
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReportToolbarActions targetRef={sheetRef} documentTitle={docTitle} />
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
            <VerticalMastInspectionSheet project={project} target={target} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

