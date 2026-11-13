import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { MastProjectState } from '@/entities/project/types';
import { triggerReportPrint } from '@/widgets/report/ReportLetterhead';
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
      <div className="report-modal-dialog bg-white w-full max-w-6xl rounded-xl shadow-2xl border border-slate-300 overflow-hidden my-2">
        <div className="print:hidden sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Overall Project Status Report — Print / Save PDF Preview
            </h2>
            <p className="text-xs text-slate-500">
              Landscape Letter / A4 recommended so the 2D status map and 13-pad breakdown fit cleanly
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerReportPrint(docTitle)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
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

        <div className="report-modal-scroll-area report-printable-card">
          <OverallProjectStatusSheet project={project} />
        </div>
      </div>
    </div>,
    document.body
  );
}

