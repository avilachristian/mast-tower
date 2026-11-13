import {
  deriveOverallInspectionStatus,
  formatDateWithWeekday,
  getReportableInspections,
} from '@/entities/project/calculations';
import type { MastProjectState } from '@/entities/project/types';
import {
  GUY_LAYER_STATUS_META,
  TOWER_SECTION_STATUS_META,
  VERTICAL_MAST_DESIGN_SPECS,
} from '@/entities/project/verticalMastBaseline';
import {
  buildVerticalMastInspectionRows,
  buildVerticalMastOverviewData,
} from '@/entities/project/verticalMastCalculations';
import type { MastSelectionTarget } from '@/shared/state/uiStore';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveReportDetails,
} from '@/widgets/report/ReportLetterhead';
import { VerticalMastElevation2D } from './VerticalMastElevation2D';

export function VerticalMastInspectionSheet({
  project,
  target,
}: {
  project: MastProjectState;
  target: MastSelectionTarget;
}) {
  const { vm, projectedAnchorStatuses, anchorGuyStates } =
    buildVerticalMastOverviewData(project);

  const isSection = target.kind === 'section';
  const section = isSection
    ? vm.sections.find((s) => s.id === target.id) ?? vm.sections[0]
    : undefined;
  const guyLayer = !isSection
    ? vm.guyLayers.find((g) => g.id === target.id) ?? vm.guyLayers[0]
    : undefined;

  const holder = isSection ? section : guyLayer;
  const meta = holder?.inspectionMeta ?? {};
  const inspectionDate = meta.inspectionDate?.trim() || project.lastUpdated;
  const reportDetails = resolveReportDetails(project, {
    reportDate: inspectionDate,
    preparedBy: meta.inspectorName,
  });

  const allRows = buildVerticalMastInspectionRows(
    target.kind,
    section,
    guyLayer
  );
  const rows = getReportableInspections(allRows);
  const photoRows = rows.filter((r) => Boolean(r.photoDataUrl));

  const overallStatus = deriveOverallInspectionStatus(meta.overallStatus, rows);
  const passedCount = rows.filter((i) => i.status === 'Passed').length;

  const inspectorName =
    meta.inspectorName?.trim() || reportDetails.preparedBy || project.preparedBy;
  const contractorRep =
    meta.contractorRep?.trim() || reportDetails.contractor || project.contractor;

  const stageLabel = isSection
    ? TOWER_SECTION_STATUS_META[section!.status].label
    : GUY_LAYER_STATUS_META[guyLayer!.status].label;

  const highlightedAnchors = guyLayer
    ? Object.values(guyLayer.anchorIds)
    : ['PF-0'];
  const mappedFoundations = project.foundations.map((f) => ({
    ...f,
    status: projectedAnchorStatuses.get(f.id) ?? 'completed',
  }));

  const statusBadgeClass =
    overallStatus === 'Passed'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-500'
      : overallStatus === 'For Rectification'
        ? 'bg-rose-50 text-rose-800 border-rose-500'
        : 'bg-amber-50 text-amber-800 border-amber-500';

  return (
    <div className="bg-white text-slate-900 p-4 sm:p-6 pdf-desktop:p-6 print:p-2">
      <ReportLetterhead
        details={reportDetails}
        defaultTitle={
          isSection
            ? `TOWER SECTION INSPECTION CHECKLIST REPORT — ${section!.id}`
            : `GUY CABLE LAYER INSPECTION CHECKLIST REPORT — ${guyLayer!.id}`
        }
        subtitle={`${VERTICAL_MAST_DESIGN_SPECS.drawingNo} · ${
          isSection
            ? `${section!.label} (+${section!.elevationFromM.toFixed(1)}–${section!.elevationToM.toFixed(1)} m)`
            : `+${guyLayer!.elevationM.toFixed(1)} m Elevation · ${guyLayer!.anchorRingLabel}`
        }`}
        fallbackProjectName={project.projectName}
        fallbackLocation={project.location}
        fallbackContractor={contractorRep}
        fallbackDate={inspectionDate}
      />

      {/* Flush Heavy Box Frame matching Foundation Phase InspectionReportSheet */}
      <div className="border-2 border-slate-900 bg-white text-xs">
        {/* Top Full-Width Band: Large Dual 2D Diagrams */}
        <div className="grid grid-cols-1 sm:grid-cols-12 pdf-desktop:grid-cols-12 print:grid-cols-12 border-b-2 border-slate-900 divide-y sm:divide-y-0 sm:divide-x-2 pdf-desktop:divide-y-0 pdf-desktop:divide-x-2 print:divide-y-0 print:divide-x-2 divide-slate-900">
          <div className="sm:col-span-7 pdf-desktop:col-span-7 print:col-span-7 flex flex-col p-2">
            <div className="text-[11px] font-bold uppercase text-slate-700 text-center pb-1 tracking-wide shrink-0">
              Tower Elevation ({isSection ? section!.id : guyLayer!.id})
            </div>
            <div className="h-[340px] sm:h-[420px] pdf-desktop:h-[420px] print:h-[360px] flex items-stretch justify-stretch">
              <VerticalMastElevation2D
                verticalMast={vm}
                selectedTarget={target}
                compact
                hideHeader
                fillParent
              />
            </div>
          </div>
          <div className="sm:col-span-5 pdf-desktop:col-span-5 print:col-span-5 flex flex-col p-2">
            <div className="text-[11px] font-bold uppercase text-slate-700 text-center pb-1 tracking-wide shrink-0">
              Ground Anchor Reference
            </div>
            <div className="h-[310px] sm:h-[420px] pdf-desktop:h-[420px] print:h-[360px] flex items-stretch justify-stretch">
              <GroundAnchorPlan2D
                foundations={mappedFoundations}
                anchorGuyStates={anchorGuyStates}
                selectedId={highlightedAnchors[0] ?? 'PF-0'}
                highlightedIds={highlightedAnchors}
                calloutTitle={
                  guyLayer ? `LAYER ${guyLayer.id}` : `SECTION ${section!.id}`
                }
                compact
                hideHeader
                fillParent
              />
            </div>
          </div>
        </div>

        {/* Second Full-Width Band: Spacious Inspection Metadata & Specs */}
        <div className="border-b-2 border-slate-900">
          <div className="border-b border-slate-900 px-3 py-1.5 font-bold text-xs sm:text-sm pdf-desktop:text-sm bg-slate-100 uppercase tracking-wide flex flex-wrap items-center justify-between gap-2">
            <span>
              {isSection
                ? `${section!.id} — ${section!.label}`
                : `Guy Layer ${guyLayer!.id} (+${guyLayer!.elevationM.toFixed(1)} m)`}
            </span>
            <span
              className={`inline-block px-2 py-0.5 border text-[11px] font-bold ${statusBadgeClass}`}
            >
              QA/QC Result: {overallStatus}
            </span>
          </div>

          <div className="grid grid-cols-12 border-b border-slate-900 divide-x divide-slate-900 text-xs">
            <div className="col-span-6 p-2.5 space-y-0.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">
                Project &amp; Site
              </div>
              <div className="font-bold text-slate-900">
                {reportDetails.projectName || project.projectName}
              </div>
              <div className="text-[11px] text-slate-600">
                {reportDetails.projectLocation || project.location}
              </div>
            </div>
            <div className="col-span-3 p-2.5 space-y-0.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">
                Inspection Date
              </div>
              <div className="font-bold text-slate-900">
                {formatDateWithWeekday(inspectionDate)}
              </div>
            </div>
            <div className="col-span-3 p-2.5 space-y-0.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">
                Check Progress
              </div>
              <div className="font-bold text-slate-900">
                {passedCount}/{rows.length} Passed · {photoRows.length} Photos
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 border-b border-slate-900 divide-x divide-slate-900 text-xs">
            <div className="col-span-4 p-2.5 space-y-0.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">
                {isSection ? 'Structural Spec' : 'Cable & Ring Spec'}
              </div>
              <div className="font-semibold text-slate-900">
                {isSection ? section!.legSpec : guyLayer!.cableSpec}
              </div>
              <div className="text-[11px] text-slate-600">
                {isSection
                  ? section!.boltSpec
                  : VERTICAL_MAST_DESIGN_SPECS.guyHardwareSpec}
              </div>
            </div>
            <div className="col-span-4 p-2.5 space-y-0.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">
                Erection Stage
              </div>
              <div className="font-semibold text-slate-900">{stageLabel}</div>
            </div>
            <div className="col-span-4 p-2.5 space-y-1">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">
                  QA/QC Inspector:{' '}
                </span>
                <span className="font-semibold text-slate-900">
                  {inspectorName || '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">
                  Contractor Rep:{' '}
                </span>
                <span className="font-semibold text-slate-900">
                  {contractorRep || '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-2.5 bg-slate-50 text-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500 mr-1.5">
              Overall Inspection Remarks:
            </span>
            <span className="text-slate-800 whitespace-pre-line">
              {meta.generalNotes?.trim() || 'No general remarks recorded.'}
            </span>
          </div>
        </div>

        {/* Flush Verification Checklist Table */}
        <div className={photoRows.length > 0 ? 'border-b-2 border-slate-900' : ''}>
          <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-[11px] flex items-center justify-between">
            <span>Field QA / QC Verification Checklist ({rows.length} Items)</span>
            <span className="text-[10px] font-semibold text-slate-600 normal-case">
              {VERTICAL_MAST_DESIGN_SPECS.verticalityTolerance}
            </span>
          </div>
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-slate-900 bg-slate-50 font-bold uppercase text-[10px] text-slate-800">
                <th className="px-2 py-1.5 border-r border-slate-900 w-8">#</th>
                <th className="px-2 py-1.5 border-r border-slate-900">
                  Inspection Requirement
                </th>
                <th className="px-2 py-1.5 border-r border-slate-900">
                  Plan / Tolerance
                </th>
                <th className="px-2 py-1.5 border-r border-slate-900">
                  Actual Reading
                </th>
                <th className="px-2 py-1.5 border-r border-slate-900 text-center w-24">
                  Result
                </th>
                <th className="px-2 py-1.5">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {rows.map((row, idx) => (
                <tr key={row.key}>
                  <td className="px-2 py-1 border-r border-slate-900 text-slate-500">
                    {idx + 1}
                  </td>
                  <td className="px-2 py-1 border-r border-slate-900 font-medium text-slate-900">
                    {row.description}
                  </td>
                  <td className="px-2 py-1 border-r border-slate-900 text-slate-700">
                    {row.planMeasurement}
                  </td>
                  <td className="px-2 py-1 border-r border-slate-900 font-semibold text-slate-900">
                    {row.actualMeasurement || '—'}
                  </td>
                  <td className="px-2 py-1 border-r border-slate-900 text-center font-bold">
                    <span
                      className={
                        row.status === 'Passed'
                          ? 'text-emerald-700'
                          : row.status === 'For Rectification'
                            ? 'text-rose-700'
                            : row.status === 'N/A'
                              ? 'text-slate-500'
                              : 'text-amber-700'
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-slate-600">{row.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Flush Photo Evidence Matrix (when photos attached) */}
        {photoRows.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-[11px]">
              Photographic Documentation ({photoRows.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 pdf-desktop:grid-cols-2 print:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x pdf-desktop:divide-y-0 pdf-desktop:divide-x print:divide-y-0 print:divide-x divide-slate-900">
              {photoRows.map((row) => (
                <div
                  key={row.key}
                  className="p-2.5 border-b border-slate-300 break-inside-avoid"
                >
                  <img
                    src={row.photoDataUrl}
                    alt={row.description}
                    className="w-full h-44 object-cover border border-slate-400 bg-white"
                  />
                  <div className="mt-1.5 text-[10.5px]">
                    <div className="font-bold text-slate-900">{row.description}</div>
                    <div className="text-slate-600">
                      Reading: {row.actualMeasurement || '—'} · Result: {row.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ReportSignoffFooter details={reportDetails} fallbackDate={inspectionDate} />
    </div>
  );
}
