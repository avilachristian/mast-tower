import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MastProjectState } from '@/entities/project/types';
import { PrintModalHeader, usePrintPageSetup } from '@/widgets/report/PrintPageControls';
import { ReportSignoffOverrideProvider } from '@/widgets/report/ReportSignoffOverrideContext';
import {
  MaterialsReportSheet,
  type MaterialsReportPhaseScope,
} from './MaterialsReportSheet';

export function MaterialsReportPrintModal({
  open,
  onClose,
  project,
  initialPhaseScope = 'active',
}: {
  open: boolean;
  onClose: () => void;
  project: MastProjectState;
  initialPhaseScope?: MaterialsReportPhaseScope;
}) {
  const [phaseScope, setPhaseScope] =
    useState<MaterialsReportPhaseScope>(initialPhaseScope);
  const { dialogMaxWidthClass, sheetWidthPx } = usePrintPageSetup(open);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhaseScope(initialPhaseScope);
  }, [open, initialPhaseScope]);

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

  if (!open || typeof document === 'undefined') return null;

  const activePhase = project.projectType ?? 'foundation';
  const activePhaseLabel =
    activePhase === 'vertical_mast' ? 'Vertical Mast' : 'Foundation';
  const projectDisplayName =
    project.reportDetails?.projectName?.trim() || project.projectName;
  const docTitle = `${projectDisplayName} - Materials Inventory Report (${
    phaseScope === 'all' ? 'All Materials' : activePhaseLabel
  })`;

  const phaseToggle = (
    <div
      role="group"
      aria-label="Materials phase scope"
      className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs"
    >
      <button
        type="button"
        onClick={() => setPhaseScope('active')}
        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
          phaseScope === 'active'
            ? 'bg-sky-600 text-white'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        {activePhaseLabel}
      </button>
      <button
        type="button"
        onClick={() => setPhaseScope('all')}
        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
          phaseScope === 'all'
            ? 'bg-sky-600 text-white'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        All Materials
      </button>
    </div>
  );

  return createPortal(
    <div
      className="report-modal-portal fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-start justify-center overflow-y-auto p-3 sm:p-6 print:static print:p-0 print:bg-white"
      onClick={onClose}
    >
      <div
        className={`report-modal-dialog bg-white w-full ${dialogMaxWidthClass} rounded-xl shadow-2xl border border-slate-300 overflow-hidden my-2 print:max-w-none print:rounded-none print:shadow-none print:border-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <ReportSignoffOverrideProvider project={project}>
          <PrintModalHeader
            title="Materials Inventory Report — Print / Save PDF Preview"
            subtitle="Combined Stock Yard & On-Site balances · Landscape Letter / A4 recommended"
            extraActions={phaseToggle}
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
              <MaterialsReportSheet project={project} phaseScope={phaseScope} />
            </div>
          </div>
        </ReportSignoffOverrideProvider>
      </div>
    </div>,
    document.body
  );
}
