import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MastProjectState } from '@/entities/project/types';
import { PrintModalHeader, usePrintPageSetup } from '@/widgets/report/PrintPageControls';
import { OverallVerticalMastStatusSheet } from './OverallVerticalMastStatusSheet';

export function OverallVerticalMastStatusPrintModal({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project: MastProjectState;
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

  const docTitle = `${project.reportDetails?.projectName?.trim() || project.projectName} - Overall Vertical Mast Erection Status Report`;

  return createPortal(
    <div
      className="report-modal-portal fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 print:static print:p-0 print:bg-white"
      onClick={onClose}
    >
      <div
        className={`report-modal-dialog ${dialogMaxWidthClass} mx-auto bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden print:max-w-none print:rounded-none print:shadow-none print:border-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <PrintModalHeader
          title="Overall Vertical Mast Erection Status Report"
          subtitle={`${project.reportDetails?.projectName?.trim() || project.projectName} · Vertical Elevation, Anchor Layout, Sections (S01–S41) & Guy Layers (L01–L16)`}
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
            <OverallVerticalMastStatusSheet project={project} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

