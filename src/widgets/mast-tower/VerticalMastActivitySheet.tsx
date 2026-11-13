import {
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
  buildSectionActivityReportData,
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

export function VerticalMastActivitySheet({
  project,
  target,
  onSelectTarget,
}: {
  project: MastProjectState;
  target: MastSelectionTarget;
  onSelectTarget?: (t: MastSelectionTarget) => void;
}) {
  const { vm, projectedAnchorStatuses, anchorGuyStates } =
    buildVerticalMastOverviewData(project);
  const reportDetails = resolveReportDetails(project);

  const requestedSection =
    target.kind === 'section'
      ? vm.sections.find((s) => s.id === target.id)
      : undefined;
  const requestedGuyLayer =
    target.kind === 'guy_layer'
      ? vm.guyLayers.find((g) => g.id === target.id)
      : undefined;

  const activeSection =
    requestedSection ??
    vm.sections.find((s) => s.id === requestedGuyLayer?.sectionId) ??
    vm.sections[0];

  const attachedGuyLayer =
    requestedGuyLayer ??
    (activeSection.guyLayerIds[0]
      ? vm.guyLayers.find((g) => g.id === activeSection.guyLayerIds[0])
      : undefined);

  const highlightedAnchors = attachedGuyLayer
    ? Object.values(attachedGuyLayer.anchorIds)
    : ['PF-0'];
  const mappedFoundations = project.foundations.map((f) => ({
    ...f,
    status: projectedAnchorStatuses.get(f.id) ?? 'completed',
  }));

  const sectionReport = buildSectionActivityReportData(activeSection, attachedGuyLayer);
  const sectionInspectionRows = buildVerticalMastInspectionRows(
    'section',
    activeSection,
    undefined
  );
  const guyInspectionRows = attachedGuyLayer
    ? buildVerticalMastInspectionRows('guy_layer', undefined, attachedGuyLayer)
    : [];
  const inspectionRows = [...sectionInspectionRows, ...guyInspectionRows];
  const reportableInspections = getReportableInspections(inspectionRows);

  const metaBadge = TOWER_SECTION_STATUS_META[activeSection.status];

  return (
    <div className="bg-white text-slate-900 p-4 sm:p-6 pdf-desktop:p-6 print:p-2">
      <ReportLetterhead
        details={reportDetails}
        defaultTitle={`TOWER SECTION ERECTION ACTIVITY REPORT — ${activeSection.id}${
          attachedGuyLayer ? ` (${attachedGuyLayer.id})` : ''
        }`}
        subtitle={`${VERTICAL_MAST_DESIGN_SPECS.drawingNo} · ${activeSection.label} (+${activeSection.elevationFromM.toFixed(1)}–${activeSection.elevationToM.toFixed(1)} m)${
          attachedGuyLayer
            ? ` · ${attachedGuyLayer.id} @ +${attachedGuyLayer.elevationM.toFixed(1)} m (${attachedGuyLayer.anchorRingLabel})`
            : ''
        }`}
        fallbackProjectName={project.projectName}
        fallbackLocation={project.location}
        fallbackContractor={project.contractor}
        fallbackDate={project.lastUpdated}
      />

      {/* Flush Rectangular Engineering Frame matching Foundation Phase Activity Report */}
      <div className="border-2 border-slate-900 bg-white text-xs">
        {/* Top Full-Width Band: Large Dual 2D Diagrams */}
        <div className="grid grid-cols-1 sm:grid-cols-12 pdf-desktop:grid-cols-12 print:grid-cols-12 border-b-2 border-slate-900 divide-y sm:divide-y-0 sm:divide-x-2 pdf-desktop:divide-y-0 pdf-desktop:divide-x-2 print:divide-y-0 print:divide-x-2 divide-slate-900">
          <div className="sm:col-span-7 pdf-desktop:col-span-7 print:col-span-7 flex flex-col p-2">
            <div className="text-[11px] font-bold uppercase text-slate-700 text-center pb-1 tracking-wide shrink-0">
              Vertical Elevation ({activeSection.id}
              {attachedGuyLayer ? ` · ${attachedGuyLayer.id}` : ''})
            </div>
            <div className="h-[340px] sm:h-[420px] pdf-desktop:h-[420px] print:h-[360px] flex items-stretch justify-stretch">
              <VerticalMastElevation2D
                verticalMast={vm}
                selectedTarget={{ kind: 'section', id: activeSection.id }}
                onSelectTarget={onSelectTarget}
                compact
                hideHeader
                fillParent
              />
            </div>
          </div>
          <div className="sm:col-span-5 pdf-desktop:col-span-5 print:col-span-5 flex flex-col p-2">
            <div className="text-[11px] font-bold uppercase text-slate-700 text-center pb-1 tracking-wide shrink-0">
              Ground Anchor Layout
            </div>
            <div className="h-[310px] sm:h-[420px] pdf-desktop:h-[420px] print:h-[360px] flex items-stretch justify-stretch">
              <GroundAnchorPlan2D
                foundations={mappedFoundations}
                anchorGuyStates={anchorGuyStates}
                selectedId={highlightedAnchors[0] ?? 'PF-0'}
                highlightedIds={highlightedAnchors}
                calloutTitle={
                  attachedGuyLayer
                    ? `SECTION ${activeSection.id} · ${attachedGuyLayer.id}`
                    : `SECTION ${activeSection.id}`
                }
                compact
                hideHeader
                fillParent
              />
            </div>
          </div>
        </div>

        {/* Second Full-Width Band: Flush Element Specifications | Unified Activity Checklist */}
        <div className="grid grid-cols-1 md:grid-cols-12 pdf-desktop:grid-cols-12 print:grid-cols-12 border-b-2 border-slate-900 divide-y md:divide-y-0 md:divide-x-2 pdf-desktop:divide-y-0 pdf-desktop:divide-x-2 print:divide-y-0 print:divide-x-2 divide-slate-900">
          {/* Left: Engineering Specs & Dates */}
          <div className="md:col-span-6 pdf-desktop:col-span-6 print:col-span-6 flex flex-col">
            <div className="border-b border-slate-900 px-3 py-1.5 font-bold text-xs sm:text-sm pdf-desktop:text-sm bg-slate-100 uppercase tracking-wide">
              {activeSection.id} — {activeSection.label}
            </div>

            <div className="grid grid-cols-12 border-b border-slate-900 text-xs">
              <div className="col-span-4 px-2.5 py-1.5 border-r border-slate-900 font-bold bg-slate-50">
                Elevation Span
              </div>
              <div className="col-span-8 px-2.5 py-1.5 font-medium tabular-nums">
                +{activeSection.elevationFromM.toFixed(1)} – +
                {activeSection.elevationToM.toFixed(1)} m
              </div>
            </div>

            <div className="grid grid-cols-12 border-b border-slate-900 text-xs">
              <div className="col-span-4 px-2.5 py-1.5 border-r border-slate-900 font-bold bg-slate-50">
                Main Leg Spec
              </div>
              <div className="col-span-8 px-2.5 py-1.5 font-medium">
                {activeSection.legSpec} · {activeSection.boltSpec}
              </div>
            </div>

            {attachedGuyLayer && (
              <div className="grid grid-cols-12 border-b border-slate-900 text-xs">
                <div className="col-span-4 px-2.5 py-1.5 border-r border-slate-900 font-bold bg-slate-50">
                  Guy Cable Layer
                </div>
                <div className="col-span-8 px-2.5 py-1.5 font-medium">
                  {attachedGuyLayer.id} (+{attachedGuyLayer.elevationM.toFixed(1)} m) ·{' '}
                  {attachedGuyLayer.anchorRingLabel} ({GUY_LAYER_STATUS_META[attachedGuyLayer.status].shortLabel})
                </div>
              </div>
            )}

            <div className="grid grid-cols-12 border-b border-slate-900 text-xs">
              <div className="col-span-4 px-2.5 py-1.5 border-r border-slate-900 font-bold bg-slate-50">
                Current Stage
              </div>
              <div className="col-span-8 px-2.5 py-1.5 font-bold inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 border border-slate-700 shrink-0"
                  style={{ backgroundColor: metaBadge.color }}
                />
                <span>
                  {metaBadge.label} ({metaBadge.pct}%)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-12 border-b border-slate-900 text-xs">
              <div className="col-span-4 px-2.5 py-1.5 border-r border-slate-900 font-bold bg-slate-50">
                Installed / Verified
              </div>
              <div className="col-span-8 px-2.5 py-1.5 font-medium">
                {[
                  activeSection.installedDate
                    ? `Installed: ${formatDateWithWeekday(activeSection.installedDate)}`
                    : '',
                  activeSection.verifiedDate
                    ? `Verified: ${formatDateWithWeekday(activeSection.verifiedDate)}`
                    : '',
                  activeSection.verticalityMm
                    ? `Plumb: ${activeSection.verticalityMm}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </div>
            </div>

            <div className="px-2.5 py-2 bg-slate-50 text-xs flex-1">
              <span className="font-bold uppercase text-slate-600">Field Notes: </span>
              <span className="text-slate-800">
                {activeSection.notes?.trim() || 'No observations recorded.'}
              </span>
            </div>
          </div>

          {/* Right: Unified Installation & Guying Activity Checklist */}
          <div className="md:col-span-6 pdf-desktop:col-span-6 print:col-span-6 flex flex-col">
            <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-xs text-slate-800">
              {attachedGuyLayer
                ? `Erection & Guying Activity Checklist (${activeSection.id} · ${attachedGuyLayer.id})`
                : 'Tower Leg Installation Activity'}
            </div>

            <div className="divide-y divide-slate-300 text-xs flex-1">
              {sectionReport.tasks.map((task, idx) => (
                <div
                  key={task.key}
                  className="grid grid-cols-12 items-center px-3 py-2"
                >
                  <div className="col-span-9 font-medium text-slate-800">
                    {idx + 1}. {task.description}
                  </div>
                  <div
                    className={`col-span-3 text-right font-bold ${
                      task.done ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {task.statusLabel}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Lower Flush Section: QA/QC Inspection Readings */}
        <div>
          <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-[11px] flex items-center justify-between">
            <span>
              QA / QC Inspection Readings ({reportableInspections.length} of{' '}
              {inspectionRows.length} items)
            </span>
            <span className="text-[10px] font-semibold text-slate-600 normal-case">
              Tolerance: {VERTICAL_MAST_DESIGN_SPECS.verticalityTolerance} ·{' '}
              {VERTICAL_MAST_DESIGN_SPECS.galvanizingSpec}
            </span>
          </div>
          {reportableInspections.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-slate-500">
              All inspection items are pending field verification in Tower Inspection.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-50 font-bold uppercase text-[10px] text-slate-800">
                  <th className="px-2.5 py-1.5 border-r border-slate-900 w-8">#</th>
                  <th className="px-2.5 py-1.5 border-r border-slate-900">
                    Inspection Requirement
                  </th>
                  <th className="px-2.5 py-1.5 border-r border-slate-900">
                    Plan Requirement
                  </th>
                  <th className="px-2.5 py-1.5 border-r border-slate-900">
                    Actual Reading
                  </th>
                  <th className="px-2.5 py-1.5 text-center w-24">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {reportableInspections.map((item, idx) => (
                  <tr key={item.key}>
                    <td className="px-2.5 py-1 border-r border-slate-900 text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-2.5 py-1 border-r border-slate-900 font-medium text-slate-900">
                      {item.description}
                    </td>
                    <td className="px-2.5 py-1 border-r border-slate-900 text-slate-700">
                      {item.planMeasurement}
                    </td>
                    <td className="px-2.5 py-1 border-r border-slate-900 font-medium text-slate-900">
                      {item.actualMeasurement || '—'}
                    </td>
                    <td className="px-2.5 py-1 text-center font-bold">
                      <span
                        className={
                          item.status === 'Passed'
                            ? 'text-emerald-700'
                            : item.status === 'For Rectification'
                              ? 'text-rose-700'
                              : 'text-slate-600'
                        }
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ReportSignoffFooter details={reportDetails} fallbackDate={project.lastUpdated} />
    </div>
  );
}
