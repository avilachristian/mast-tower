import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { MastProjectState } from '@/entities/project/types';
import { ReportToolbarActions, usePrintPageSetup } from '@/widgets/report/PrintPageControls';
import { OverallProjectStatusSheet } from './OverallProjectStatusSheet';

export function OverallProjectStatusPrintModal({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project: MastProjectState;
}) {
  const { dialogMaxWidthClass } = usePrintPageSetup(open);
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

  const docTitle = `${project.reportDetails?.projectName?.trim() || project.projectName} - Overall Project Status Report`;

  return createPortal(
    <div className="report-modal-portal fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <div className={`report-modal-dialog bg-white w-full ${dialogMaxWidthClass} rounded-xl shadow-2xl border border-slate-300 overflow-hidden my-2 print:max-w-none print:rounded-none print:shadow-none print:border-none`}>
        <div className="print:hidden sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Overall Project Status Report — Print / Save PDF Preview
            </h2>
            <p className="text-xs text-slate-500">
              Landscape Letter / A4 recommended so the 2D status map and 13-pad breakdown fit cleanly
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReportToolbarActions targetRef={sheetRef} documentTitle={docTitle} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close overall project status print preview"
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div ref={sheetRef} className="report-modal-scroll-area report-printable-card bg-white">
          <OverallProjectStatusSheet project={project} />
        </div>
      </div>
    </div>,
    document.body
  );
}

