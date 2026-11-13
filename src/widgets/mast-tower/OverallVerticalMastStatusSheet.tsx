import { formatDateWithWeekday } from '@/entities/project/calculations';
import type { MastProjectState } from '@/entities/project/types';
import {
  GUY_LAYER_STATUS_META,
  TOWER_SECTION_STATUS_META,
  VERTICAL_MAST_DESIGN_SPECS,
} from '@/entities/project/verticalMastBaseline';
import { buildVerticalMastOverviewData } from '@/entities/project/verticalMastCalculations';
import type { MastSelectionTarget } from '@/shared/state/uiStore';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveReportDetails,
} from '@/widgets/report/ReportLetterhead';
import { VerticalMastElevation2D } from './VerticalMastElevation2D';

export function OverallVerticalMastStatusSheet({
  project,
  onSelectTarget,
}: {
  project: MastProjectState;
  onSelectTarget?: (target: MastSelectionTarget) => void;
}) {
  const {
    vm,
    metrics,
    sectionStageCounts,
    guyStageCounts,
    anchorRingSummaries,
    projectedAnchorStatuses,
    anchorGuyStates,
  } = buildVerticalMastOverviewData(project);

  const reportDetails = resolveReportDetails(project);
  const mappedFoundations = project.foundations.map((f) => ({
    ...f,
    status: projectedAnchorStatuses.get(f.id) ?? f.status,
  }));

  return (
    <div className="bg-white text-slate-900 p-4 sm:p-6 pdf-desktop:p-6 print:p-2">
      <ReportLetterhead
        details={reportDetails}
        defaultTitle="OVERALL VERTICAL MAST ERECTION STATUS REPORT"
        subtitle={`Overall Progress: ${metrics.overallProgressPct}% · ${metrics.erectedSections}/${metrics.totalSections} Sections Erected (${metrics.erectedHeightM}/${metrics.totalHeightM} m) · ${metrics.tensionedStrands}/${metrics.totalStrands} Guy Strands Tensioned`}
        fallbackProjectName={project.projectName}
        fallbackLocation={project.location}
        fallbackContractor={project.contractor}
        fallbackDate={project.lastUpdated}
      />

      <div className="border-2 border-slate-900 bg-white text-xs">
        {/* Top Full-Width Band: Large Dual 2D Engineering Diagrams */}
        <div className="grid grid-cols-1 sm:grid-cols-12 pdf-desktop:grid-cols-12 print:grid-cols-12 border-b-2 border-slate-900 divide-y sm:divide-y-0 sm:divide-x-2 pdf-desktop:divide-y-0 pdf-desktop:divide-x-2 print:divide-y-0 print:divide-x-2 divide-slate-900">
          <div className="sm:col-span-7 pdf-desktop:col-span-7 print:col-span-7 flex flex-col p-2">
            <div className="text-[11px] font-bold text-slate-700 text-center pb-1 uppercase tracking-wide shrink-0">
              Vertical Elevation (0–129 m · {VERTICAL_MAST_DESIGN_SPECS.drawingNo})
            </div>
            <div className="h-[340px] sm:h-[420px] pdf-desktop:h-[420px] print:h-[360px] flex items-stretch justify-stretch">
              <VerticalMastElevation2D
                verticalMast={vm}
                onSelectTarget={onSelectTarget}
                compact
                hideHeader
                fillParent
              />
            </div>
          </div>

          <div className="sm:col-span-5 pdf-desktop:col-span-5 print:col-span-5 flex flex-col p-2">
            <div className="text-[11px] font-bold text-slate-700 text-center pb-1 uppercase tracking-wide shrink-0">
              Site Guy Anchor Plan (13 Pads)
            </div>
            <div className="h-[310px] sm:h-[420px] pdf-desktop:h-[420px] print:h-[360px] flex items-stretch justify-stretch">
              <GroundAnchorPlan2D
                foundations={mappedFoundations}
                anchorGuyStates={anchorGuyStates}
                showNodeLabels
                compact
                hideHeader
                fillParent
              />
            </div>
          </div>
        </div>

        {/* Second Full-Width Band: Executive Summary & Stage / Anchor Ring Breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-12 pdf-desktop:grid-cols-12 print:grid-cols-12 border-b-2 border-slate-900 divide-y md:divide-y-0 md:divide-x-2 pdf-desktop:divide-y-0 pdf-desktop:divide-x-2 print:divide-y-0 print:divide-x-2 divide-slate-900">
          {/* Left: Executive KPIs */}
          <div className="md:col-span-5 pdf-desktop:col-span-5 print:col-span-5 flex flex-col">
            <div className="border-b border-slate-900 px-3 py-1.5 font-bold text-xs bg-slate-100 uppercase tracking-wide">
              Executive Erection Summary
            </div>

            <div className="border-b border-slate-900 px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="uppercase text-slate-600">Overall Tower Erection</span>
                <span className="text-sky-700 text-base tabular-nums">
                  {metrics.overallProgressPct}%
                </span>
              </div>
              <div className="h-3 w-full bg-slate-200 overflow-hidden border border-slate-400">
                <div
                  className="h-full bg-sky-600 transition-all"
                  style={{ width: `${metrics.overallProgressPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-slate-900 flex-1 text-xs">
              <div className="p-2.5">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Tower Legs Installed
                </div>
                <div className="font-bold text-slate-900 tabular-nums mt-0.5 text-sm">
                  {metrics.verifiedSections} / {metrics.totalSections}
                  <span className="block text-[11px] font-semibold text-slate-600">
                    ({metrics.verifiedHeightM} m)
                  </span>
                </div>
              </div>
              <div className="p-2.5">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Guy Layers Tensioned
                </div>
                <div className="font-bold text-slate-900 tabular-nums mt-0.5 text-sm">
                  {metrics.tensionedGuyLayers} / {metrics.totalGuyLayers}
                  <span className="block text-[11px] font-semibold text-slate-600">
                    Layers
                  </span>
                </div>
              </div>
              <div className="p-2.5">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Guy Strands Tensioned
                </div>
                <div className="font-bold text-slate-900 tabular-nums mt-0.5 text-sm">
                  {metrics.tensionedStrands} / {metrics.totalStrands}
                  <span className="block text-[11px] font-semibold text-slate-600">
                    Cables
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle: Tower Sections by Stage */}
          <div className="md:col-span-3 pdf-desktop:col-span-3 print:col-span-3 flex flex-col">
            <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 text-xs font-bold uppercase text-slate-800">
              Tower Stages (41 × 3m)
            </div>
            <div className="divide-y divide-slate-200 text-[11px] flex-1">
              {sectionStageCounts.map((st) => (
                <div
                  key={st.status}
                  className="grid grid-cols-12 items-center px-2.5 py-1.5 gap-1"
                >
                  <div className="col-span-8 flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 border border-slate-700 shrink-0"
                      style={{ backgroundColor: st.color }}
                    />
                    <span className="truncate font-medium text-slate-800">{st.label}</span>
                  </div>
                  <div className="col-span-2 text-right font-bold text-slate-900 tabular-nums">
                    {st.count}
                  </div>
                  <div className="col-span-2 text-right text-[10px] text-slate-500 tabular-nums">
                    {st.count * 3}m
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Guy Layer Breakdown by Anchor Ring */}
          <div className="md:col-span-4 pdf-desktop:col-span-4 print:col-span-4 flex flex-col">
            <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 text-xs font-bold uppercase text-slate-800">
              Anchor Rings ({guyStageCounts.find((g) => g.status === 'tensioned_verified')?.count ?? 0}/16 Tensioned)
            </div>
            <div className="divide-y divide-slate-200 text-[11px] flex-1">
              {anchorRingSummaries.map((ring) => (
                <div
                  key={ring.ringKey}
                  className="grid grid-cols-12 items-center px-3 py-1.5 gap-1"
                >
                  <div className="col-span-6 font-semibold text-slate-800">
                    {ring.ringLabel}
                  </div>
                  <div className="col-span-4 text-center text-slate-600 tabular-nums">
                    {ring.tensionedStrands}/{ring.totalStrands} strands
                  </div>
                  <div className="col-span-2 text-right font-bold text-sky-700 tabular-nums">
                    {ring.avgProgressPct}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Lower Section A: 16 Guy Cable Layers Table */}
        <div className="border-b-2 border-slate-900">
          <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-xs flex flex-wrap items-center justify-between gap-2">
            <span>Guy Cable Layers Status (L01–L16 · Ø11.4mm Steel Strand)</span>
            <span className="text-[11px] font-semibold text-slate-600 normal-case">
              {metrics.tensionedGuyLayers}/{metrics.totalGuyLayers} Layers Tensioned ·{' '}
              {metrics.tensionedStrands}/{metrics.totalStrands} Strands Complete
            </span>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-900 bg-slate-50 text-[10px] font-bold uppercase text-slate-800">
                <th className="px-2 py-1.5 border-r border-slate-900 w-14">Layer</th>
                <th className="px-2 py-1.5 border-r border-slate-900 w-16">Elev.</th>
                <th className="px-2 py-1.5 border-r border-slate-900 w-16">Section</th>
                <th className="px-2 py-1.5 border-r border-slate-900">Anchor Ring</th>
                <th className="px-2 py-1.5 border-r border-slate-900 text-center">Sector I</th>
                <th className="px-2 py-1.5 border-r border-slate-900 text-center">Sector II</th>
                <th className="px-2 py-1.5 border-r border-slate-900 text-center">Sector III</th>
                <th className="px-2 py-1.5 border-r border-slate-900">Overall Status</th>
                <th className="px-2 py-1.5">Date / Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 text-[10.5px]">
              {vm.guyLayers.map((g) => {
                const stMeta = GUY_LAYER_STATUS_META[g.status];
                const sectorBadge = (s: { pulled: boolean; terminated: boolean; tensioned: boolean; tensionKn?: string }) =>
                  s.tensioned
                    ? s.tensionKn
                      ? `Tensioned (${s.tensionKn})`
                      : 'Tensioned'
                    : s.terminated
                      ? 'Anchored'
                      : s.pulled
                        ? 'Pulled'
                        : 'Pending';
                return (
                  <tr
                    key={g.id}
                    onClick={() => onSelectTarget?.({ kind: 'guy_layer', id: g.id })}
                    className={onSelectTarget ? 'hover:bg-sky-50/50 cursor-pointer' : undefined}
                  >
                    <td className="px-2 py-1 border-r border-slate-900 font-bold text-slate-900">
                      {g.id}
                    </td>
                    <td className="px-2 py-1 border-r border-slate-900 tabular-nums font-medium">
                      {g.elevationM.toFixed(1)} m
                    </td>
                    <td className="px-2 py-1 border-r border-slate-900 font-semibold">
                      {g.sectionId}
                    </td>
                    <td className="px-2 py-1 border-r border-slate-900 text-slate-700">
                      {g.anchorRingLabel}
                    </td>
                    <td className="px-2 py-1 border-r border-slate-900 text-center">
                      {sectorBadge(g.sectors.I)}
                    </td>
                    <td className="px-2 py-1 border-r border-slate-900 text-center">
                      {sectorBadge(g.sectors.II)}
                    </td>
                    <td className="px-2 py-1 border-r border-slate-900 text-center">
                      {sectorBadge(g.sectors.III)}
                    </td>
                    <td className="px-2 py-1 border-r border-slate-900">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <span
                          className="w-2 h-2 rounded-xs border border-slate-700 shrink-0"
                          style={{ backgroundColor: stMeta.color }}
                        />
                        <span>{stMeta.shortLabel}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1 text-[10px] text-slate-700">
                      {g.verifiedDate
                        ? `Done: ${formatDateWithWeekday(g.verifiedDate)}`
                        : g.installedDate
                          ? `Installed: ${formatDateWithWeekday(g.installedDate)}`
                          : ''}
                      {g.notes ? ` · ${g.notes}` : !g.verifiedDate && !g.installedDate ? '—' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Lower Section B: 41 Tower Sections Summary Grid */}
        <div>
          <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-xs flex flex-wrap items-center justify-between gap-2">
            <span>Tower Sections Progress (S01–S41 · 600×600 mm Triangular Lattice)</span>
            <span className="text-[11px] font-semibold text-slate-600 normal-case">
              Platform (7.0m): {vm.platformStatus} · Lightning Rod (6.0m): {vm.lightningRodStatus}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 pdf-desktop:grid-cols-2 print:grid-cols-2 divide-y md:divide-y-0 md:divide-x pdf-desktop:divide-y-0 pdf-desktop:divide-x print:divide-y-0 print:divide-x divide-slate-900">
            {[vm.sections.slice(0, 21), vm.sections.slice(21)].map((chunk, colIdx) => (
              <table key={colIdx} className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 bg-slate-50 text-[9.5px] font-bold uppercase text-slate-800">
                    <th className="px-1.5 py-1 border-r border-slate-900 w-12">Sec</th>
                    <th className="px-1.5 py-1 border-r border-slate-900 w-20">Elev (m)</th>
                    <th className="px-1.5 py-1 border-r border-slate-900">Stage</th>
                    <th className="px-1.5 py-1 border-r border-slate-900 w-16 text-center">Plumb</th>
                    <th className="px-1.5 py-1">Fixture / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 text-[10px]">
                  {chunk.map((sec) => {
                    const st = TOWER_SECTION_STATUS_META[sec.status];
                    return (
                      <tr
                        key={sec.id}
                        onClick={() => onSelectTarget?.({ kind: 'section', id: sec.id })}
                        className={onSelectTarget ? 'hover:bg-sky-50/50 cursor-pointer' : undefined}
                      >
                        <td className="px-1.5 py-1 border-r border-slate-900 font-bold text-slate-900">
                          {sec.id}
                        </td>
                        <td className="px-1.5 py-1 border-r border-slate-900 tabular-nums text-slate-700">
                          {sec.elevationFromM}–{sec.elevationToM}m
                        </td>
                        <td className="px-1.5 py-1 border-r border-slate-900">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <span
                              className="w-2 h-2 rounded-xs border border-slate-700 shrink-0"
                              style={{ backgroundColor: st.color }}
                            />
                            <span>{st.shortLabel}</span>
                          </span>
                        </td>
                        <td className="px-1.5 py-1 border-r border-slate-900 text-center tabular-nums text-slate-700">
                          {sec.verticalityMm || '—'}
                        </td>
                        <td className="px-1.5 py-1 text-slate-600 truncate max-w-[160px]">
                          {sec.notes.trim() ||
                            (sec.hasPlatform
                              ? '7m Platform'
                              : sec.hasLightningRod
                                ? '6m Lightning Rod'
                                : sec.guyLayerIds.length > 0
                                  ? sec.guyLayerIds.join(', ')
                                  : '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      </div>

      <ReportSignoffFooter
        details={reportDetails}
        fallbackPreparedBy={project.preparedBy}
        fallbackDate={project.lastUpdated}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>
          Project: {reportDetails.projectName || project.projectName} ·{' '}
          {reportDetails.projectLocation || project.location}
        </span>
        <span>Updated: {formatDateWithWeekday(project.lastUpdated)}</span>
      </div>
    </div>
  );
}

