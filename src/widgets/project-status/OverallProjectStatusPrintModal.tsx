import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MastProjectState } from '@/entities/project/types';
import { PrintModalHeader, usePrintPageSetup } from '@/widgets/report/PrintPageControls';
import { ReportSignoffOverrideProvider } from '@/widgets/report/ReportSignoffOverrideContext';
import { OverallProjectStatusSheet } from './OverallProjectStatusSheet';

export function OverallProjectStatusPrintModal({
  open,
  onClose,
  project,
  clientSafe = false,
}: {
  open: boolean;
  onClose: () => void;
  project: MastProjectState;
  clientSafe?: boolean;
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

  const docTitle = `${project.reportDetails?.projectName?.trim() || project.projectName} - Overall Project Status Report`;

  return createPortal(
    <div
      className="report-modal-portal fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-start justify-center overflow-y-auto p-3 sm:p-6 print:static print:p-0 print:bg-white"
      onClick={onClose}
    >
      <div
        className={`report-modal-dialog bg-white w-full ${dialogMaxWidthClass} rounded-xl shadow-2xl border border-slate-300 overflow-hidden my-2 print:my-0 print:max-w-none print:rounded-none print:shadow-none print:border-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <ReportSignoffOverrideProvider project={project} enabled={!clientSafe}>
          <PrintModalHeader
            title="Overall Project Status Report — Print / Save PDF Preview"
            subtitle="Landscape Letter / A4 recommended so the 2D status map and 13-pad breakdown fit cleanly"
            targetRef={sheetRef}
            documentTitle={docTitle}
            onClose={onClose}
          />

          <div className="report-modal-preview-frame overflow-x-auto bg-slate-100/75 p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible">
            <div
              ref={sheetRef}
              style={{ width: `${sheetWidthPx}px`, minWidth: `${sheetWidthPx}px` }}
              className="report-modal-scroll-area report-printable-card pdf-desktop-layout mx-auto bg-white shadow-sm border border-slate-200 print:w-full print:min-w-0 print:border-none print:shadow-none"
            >
              <OverallProjectStatusSheet project={project} clientSafe={clientSafe} />
            </div>
          </div>
        </ReportSignoffOverrideProvider>
      </div>
    </div>,
    document.body
  );
}

