import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { FOUNDATION_SPECS } from '@/entities/project/mast2Baseline';
import type { MastProjectState } from '@/entities/project/types';
import { useProjectStore } from '@/shared/state/projectStore';
import { triggerReportPrint } from '@/widgets/report/ReportLetterhead';
import { InspectionReportSheet } from './InspectionReportSheet';

export function InspectionPrintModal({
  project,
  onClose,
}: {
  project: MastProjectState;
  onClose: () => void;
}) {
  const selectedFoundationId = useProjectStore((s) => s.selectedFoundationId);
  const selectFoundation = useProjectStore((s) => s.selectFoundation);
  const updateFoundationInspectionItem = useProjectStore(
    (s) => s.updateFoundationInspectionItem
  );

  const selectedFoundation =
    project.foundations.find((f) => f.id === selectedFoundationId) ??
    project.foundations[0];

  useEffect(() => {
    document.body.classList.add('report-modal-open');
    return () => {
      document.body.classList.remove('report-modal-open');
    };
  }, []);

  const reportTitle =
    project.reportDetails?.documentTitle?.trim() ||
    `Foundation Inspection Report - ${selectedFoundation?.id ?? 'PF-0'} - ${
      project.reportDetails?.projectName?.trim() || project.projectName
    }`;

  return createPortal(
    <div
      className="report-modal-portal fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs overflow-y-auto p-2 sm:p-6 print:static print:p-0 print:bg-white"
      onClick={onClose}
    >
      <div
        className="report-modal-dialog max-w-5xl mx-auto bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden print:border-none print:shadow-none print:rounded-none print:max-w-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar (hidden when printing) */}
        <div className="no-print print:hidden flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200 text-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-800">
              Foundation Inspection Report
            </span>
            {selectedFoundation && (
              <select
                value={selectedFoundation.id}
                onChange={(e) => selectFoundation(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-sky-500 focus:outline-none"
              >
                {project.foundations.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.id} — {FOUNDATION_SPECS[f.type].label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerReportPrint(reportTitle)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspection report"
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="report-modal-scroll-area report-printable-card">
          {selectedFoundation && (
            <InspectionReportSheet
              project={project}
              foundation={selectedFoundation}
              onSelectFoundation={selectFoundation}
              onUploadInspectionPhoto={(key, photoDataUrl, photoName) =>
                updateFoundationInspectionItem(selectedFoundation.id, key, {
                  photoDataUrl,
                  photoName,
                })
              }
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

