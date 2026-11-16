import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MastProjectState } from '@/entities/project/types';
import type { MastSelectionTarget } from '@/shared/state/uiStore';
import { PrintModalHeader, usePrintPageSetup } from '@/widgets/report/PrintPageControls';
import { resolveMatchingPreparedSignature } from '@/widgets/report/ReportLetterhead';
import { ReportSignoffOverrideProvider } from '@/widgets/report/ReportSignoffOverrideContext';
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

  const vm = project.verticalMast;
  const holder =
    target.kind === 'section'
      ? vm?.sections.find((s) => s.id === target.id)
      : vm?.guyLayers.find((g) => g.id === target.id);
  const meta = holder?.inspectionMeta;

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
        <ReportSignoffOverrideProvider
          project={project}
          includeVerified
          defaults={{
            preparedBy:
              meta?.inspectorName?.trim() ||
              project.reportDetails?.preparedBy?.trim() ||
              project.preparedBy?.trim() ||
              '',
            preparedSignatureUrl:
              meta?.inspectorSignatureUrl?.trim() ||
              resolveMatchingPreparedSignature(project, meta?.inspectorName),
            verifiedBy: meta?.contractorRep?.trim() || '',
            verifiedSignatureUrl:
              meta?.verifiedSignatureUrl?.trim() || undefined,
          }}
        >
          <PrintModalHeader
            title={`Tower & Guying QA/QC Inspection Report — ${target.id}`}
            subtitle={`${project.reportDetails?.projectName?.trim() || project.projectName} · Print or Save as PDF`}
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
              <VerticalMastInspectionSheet project={project} target={target} />
            </div>
          </div>
        </ReportSignoffOverrideProvider>
      </div>
    </div>,
    document.body
  );
}

