import {
  buildOverallProjectStatusReportData,
  formatDateWithWeekday,
} from '@/entities/project/calculations';
import type { MastProjectState } from '@/entities/project/types';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveReportDetails,
} from '@/widgets/report/ReportLetterhead';

export function OverallProjectStatusSheet({
  project,
  onSelectFoundation,
}: {
  project: MastProjectState;
  onSelectFoundation?: (id: string) => void;
}) {
  const overview = buildOverallProjectStatusReportData(project);
  const { metrics, stageCounts, sectorSummaries, foundationRows } = overview;
  const reportDetails = resolveReportDetails(project);

  return (
    <div className="bg-white text-slate-900 p-4 sm:p-6 pdf-desktop:p-6 print:p-2">
      <ReportLetterhead
        details={reportDetails}
        defaultTitle="OVERALL PROJECT STATUS REPORT"
        subtitle={`Overall Progress: ${metrics.overallProgressPct}% · ${metrics.completedCount}/${metrics.totalFoundations} Completed · ${metrics.pouredConcreteCuM.toFixed(2)}/${metrics.totalConcreteCuM.toFixed(2)} m³ Poured`}
        fallbackProjectName={project.projectName}
        fallbackLocation={project.location}
        fallbackContractor={project.contractor}
        fallbackDate={project.lastUpdated}
      />

      {/* Framed Overall Layout + Summary Grid */}
      <div className="border-2 border-slate-900 bg-white text-xs">
        <div className="grid grid-cols-12 border-b-2 border-slate-900">
          {/* Left: Overall 2D Color-Coded Foundation Layout */}
          <div className="col-span-12 md:col-span-7 pdf-desktop:col-span-7 print:col-span-7 border-b-2 md:border-b-0 md:border-r-2 pdf-desktop:border-b-0 pdf-desktop:border-r-2 print:border-b-0 print:border-r-2 border-slate-900 flex flex-col p-1.5">
            <div className="text-[11px] font-bold text-slate-700 text-center py-0.5 shrink-0 uppercase tracking-wide">
              Site Foundation Status Map ({metrics.totalFoundations} Pads)
            </div>
            <div className="flex-1 min-h-[340px] sm:min-h-[380px] pdf-desktop:min-h-[380px] flex items-stretch justify-stretch">
              <GroundAnchorPlan2D
                foundations={project.foundations}
                showNodeLabels
                onSelect={onSelectFoundation}
                compact
                hideHeader
                fillParent
              />
            </div>
          </div>

          {/* Right: Project Progress Summary, Stage Distribution, Sector Rollup */}
          <div className="col-span-12 md:col-span-5 pdf-desktop:col-span-5 print:col-span-5 flex flex-col">
            <div className="border-b border-slate-900 px-3 py-1.5 text-center font-bold text-xs sm:text-sm pdf-desktop:text-sm bg-slate-50 uppercase tracking-wide">
              Executive Progress Summary
            </div>

            {/* Overall Progress Bar */}
            <div className="border-b border-slate-900 px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="uppercase text-slate-600">Overall Site Completion</span>
                <span className="text-sky-700 text-sm tabular-nums">
                  {metrics.overallProgressPct}%
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                <div
                  className="h-full bg-sky-600 transition-all"
                  style={{ width: `${metrics.overallProgressPct}%` }}
                />
              </div>
            </div>

            {/* Key KPI Grid */}
            <div className="grid grid-cols-2 border-b border-slate-900 text-[11px]">
              <div className="p-2 border-r border-b border-slate-900">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Completed Pads
                </div>
                <div className="font-bold text-slate-900 tabular-nums mt-0.5">
                  {metrics.completedCount} / {metrics.totalFoundations} Done
                </div>
              </div>
              <div className="p-2 border-b border-slate-900">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Concreted / Curing
                </div>
                <div className="font-bold text-slate-900 tabular-nums mt-0.5">
                  {metrics.pouredOrBeyondCount} / {metrics.totalFoundations} Poured
                </div>
              </div>
              <div className="p-2 border-r border-slate-900">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Concrete Volume Poured
                </div>
                <div className="font-bold text-slate-900 tabular-nums mt-0.5">
                  {metrics.pouredConcreteCuM.toFixed(2)} / {metrics.totalConcreteCuM.toFixed(2)} m³
                </div>
              </div>
              <div className="p-2">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Daily Logs / Man-Days
                </div>
                <div className="font-bold text-slate-900 tabular-nums mt-0.5">
                  {project.dailyLogs.length} logs · {metrics.totalManDays} md
                </div>
              </div>
            </div>

            {/* Stage Breakdown */}
            <div className="border-b border-slate-900">
              <div className="px-2.5 py-1 bg-slate-100 border-b border-slate-900 text-[11px] font-bold uppercase text-slate-800">
                Foundations by Current Stage
              </div>
              <div className="divide-y divide-slate-200 text-[10.5px]">
                {stageCounts.map((stage) => (
                  <div
                    key={stage.status}
                    className="grid grid-cols-12 items-center px-2.5 py-1 gap-1"
                  >
                    <div className="col-span-7 flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs border border-slate-700 shrink-0"
                        style={{
                          backgroundColor: stage.color,
                          opacity: stage.status === 'not_started' ? 0.3 : 0.9,
                        }}
                      />
                      <span className="truncate font-medium text-slate-800">
                        {stage.label}
                      </span>
                    </div>
                    <div className="col-span-2 text-right font-bold text-slate-900 tabular-nums">
                      {stage.count}
                    </div>
                    <div className="col-span-3 text-right text-[9.5px] text-slate-500 truncate">
                      {stage.foundationIds.length > 0
                        ? stage.foundationIds.join(', ')
                        : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sector Summary */}
            <div className="flex-1 flex flex-col">
              <div className="px-2.5 py-1 bg-slate-100 border-b border-slate-900 text-[11px] font-bold uppercase text-slate-800">
                Progress by Sector
              </div>
              <div className="divide-y divide-slate-200 text-[10.5px]">
                {sectorSummaries.map((sec) => (
                  <div
                    key={sec.sector}
                    className="grid grid-cols-12 items-center px-2.5 py-1 gap-1"
                  >
                    <div className="col-span-5 font-semibold text-slate-800">
                      {sec.label}
                    </div>
                    <div className="col-span-4 text-center text-slate-600 tabular-nums">
                      {sec.completedCount}/{sec.foundationCount} done
                    </div>
                    <div className="col-span-3 text-right font-bold text-sky-700 tabular-nums">
                      {sec.avgProgressPct}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Lower Section: Individual Status of Each Foundation */}
        <div>
          <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-xs flex flex-wrap items-center justify-between gap-2">
            <span>Individual Status of Each Foundation</span>
            <span className="text-[11px] font-semibold text-slate-600 normal-case">
              {metrics.totalFoundations} Foundations Total · {metrics.completedCount} Completed ·{' '}
              {metrics.overallProgressPct}% Overall
            </span>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-900 bg-slate-50 text-[10.5px] font-bold uppercase text-slate-800">
                <th className="px-2 py-1.5 border-r border-slate-900 w-16">Pad ID</th>
                <th className="px-2 py-1.5 border-r border-slate-900">Foundation &amp; Sector</th>
                <th className="px-2 py-1.5 border-r border-slate-900 w-32">Size &amp; Vol.</th>
                <th className="px-2 py-1.5 border-r border-slate-900 text-center w-20">
                  Tasks
                </th>
                <th className="px-2 py-1.5 border-r border-slate-900">Current Status</th>
                <th className="px-2 py-1.5 border-r border-slate-900 text-center w-16">
                  Progress
                </th>
                <th className="px-2 py-1.5 border-r border-slate-900 w-36">
                  Pour / Done Date
                </th>
                <th className="px-2 py-1.5">Remarks / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 text-[11px]">
              {foundationRows.map((row) => {
                const dateDisplay = row.completedDate
                  ? `Done: ${formatDateWithWeekday(row.completedDate)}`
                  : row.pourDate
                    ? `Pour: ${formatDateWithWeekday(row.pourDate)}`
                    : '—';
                return (
                  <tr
                    key={row.id}
                    className={
                      onSelectFoundation
                        ? 'hover:bg-sky-50/50 cursor-pointer'
                        : undefined
                    }
                    onClick={() => onSelectFoundation?.(row.id)}
                  >
                    <td className="px-2 py-1.5 border-r border-slate-900 font-bold text-slate-900 whitespace-nowrap">
                      {row.id}
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-900">
                      <div className="font-semibold text-slate-900">{row.typeLabel}</div>
                      <div className="text-[10px] text-slate-500">{row.sectorLabel}</div>
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-900 tabular-nums">
                      <div className="font-medium text-slate-900">{row.sizeLabel}</div>
                      <div className="text-[10px] text-slate-500">
                        {row.totalVolumeCuM.toFixed(2)} m³ total
                      </div>
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-900 text-center font-semibold tabular-nums text-slate-800">
                      {row.completedSteps}/{row.totalSteps}
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-900">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                        <span
                          className="w-2.5 h-2.5 rounded-xs border border-slate-700 shrink-0"
                          style={{
                            backgroundColor: row.statusColor,
                            opacity: row.status === 'not_started' ? 0.3 : 0.9,
                          }}
                        />
                        <span>{row.statusLabel}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-900 text-center font-bold tabular-nums text-slate-900">
                      {row.progressPct}%
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-900 text-[10px] text-slate-700">
                      {dateDisplay}
                    </td>
                    <td className="px-2 py-1.5 text-[10.5px] text-slate-700">
                      {row.notes.trim() || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

