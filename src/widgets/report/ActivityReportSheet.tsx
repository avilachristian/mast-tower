import { buildFoundationActivityReportData } from '@/entities/project/calculations';
import type { FoundationRecord, MastProjectState } from '@/entities/project/types';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveReportDetails,
} from './ReportLetterhead';

export function ActivityReportSheet({
  project,
  foundation,
  onSelectFoundation,
}: {
  project: MastProjectState;
  foundation: FoundationRecord;
  onSelectFoundation?: (id: string) => void;
}) {
  const report = buildFoundationActivityReportData(project, null, foundation);
  const reportDetails = resolveReportDetails(project);

  return (
    <div className="bg-white text-slate-900 p-4 sm:p-6 print:p-2">
      <ReportLetterhead
        details={reportDetails}
        defaultTitle="CURRENT FOUNDATION ACTIVITY REPORT"
        fallbackProjectName={project.projectName}
        fallbackLocation={project.location}
        fallbackContractor={project.contractor}
        fallbackDate={project.lastUpdated}
      />

      {/* Outer Heavy Box Border matching template */}
      <div className="border-2 border-slate-900 bg-white">
        {/* Top Split Row: Left 2D Layout Image | Right Title, Size, Rebar, Tasks */}
        <div className="grid grid-cols-12">
          {/* Left: Location on the Layout image */}
          <div className="col-span-12 md:col-span-7 print:col-span-7 border-b-2 md:border-b-0 md:border-r-2 print:border-b-0 print:border-r-2 border-slate-900 flex flex-col p-1">
            <div className="text-[11px] font-semibold text-slate-500 text-center py-0.5 shrink-0">
              Location on the Layout image ({foundation.id})
            </div>
            <div className="flex-1 min-h-[340px] flex items-stretch justify-stretch">
              <GroundAnchorPlan2D
                foundations={project.foundations}
                selectedId={foundation.id}
                onSelect={onSelectFoundation}
                compact
                hideHeader
                fillParent
              />
            </div>
          </div>

          {/* Right: Foundation metadata, Organized Design Details, Tasks Status */}
          <div className="col-span-12 md:col-span-5 print:col-span-5 flex flex-col">
            {/* [Foundation Title] */}
            <div className="border-b border-slate-900 px-3 py-1.5 text-center font-bold text-xs sm:text-sm bg-slate-50">
              {report.foundationTitle}
            </div>

            {/* Size */}
            {report.specDetails.size.trim() && (
              <div className="grid grid-cols-12 border-b border-slate-900 text-[11px]">
                <div className="col-span-5 px-2.5 py-1 border-r border-slate-900 font-bold text-slate-900 bg-slate-50">
                  Size
                </div>
                <div className="col-span-7 px-2.5 py-1 font-medium text-slate-900 tabular-nums">
                  {report.specDetails.size}
                </div>
              </div>
            )}

            {/* Volume (Foundation & Lean Concrete) */}
            {(report.specDetails.foundationVolume.trim() ||
              report.specDetails.leanConcreteVolume.trim()) && (
              <div className="border-b border-slate-900 text-[11px]">
                <div className="px-2.5 py-1 font-bold border-b border-slate-900 bg-slate-50 text-slate-900">
                  Volume
                </div>
                <div className="divide-y divide-slate-300">
                  {report.specDetails.foundationVolume.trim() && (
                    <div className="grid grid-cols-12">
                      <div className="col-span-5 px-2.5 py-1 border-r border-slate-900 text-slate-700 font-medium">
                        • Foundation
                      </div>
                      <div className="col-span-7 px-2.5 py-1 text-slate-900 font-medium tabular-nums">
                        {report.specDetails.foundationVolume}
                      </div>
                    </div>
                  )}
                  {report.specDetails.leanConcreteVolume.trim() && (
                    <div className="grid grid-cols-12">
                      <div className="col-span-5 px-2.5 py-1 border-r border-slate-900 text-slate-700 font-medium">
                        • Lean Concrete
                      </div>
                      <div className="col-span-7 px-2.5 py-1 text-slate-900 font-medium tabular-nums">
                        {report.specDetails.leanConcreteVolume}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Excavation Depth */}
            {report.specDetails.excavationDepth.trim() && (
              <div className="grid grid-cols-12 border-b border-slate-900 text-[11px]">
                <div className="col-span-5 px-2.5 py-1 border-r border-slate-900 font-bold text-slate-900 bg-slate-50">
                  Excavation Depth
                </div>
                <div className="col-span-7 px-2.5 py-1 font-medium text-slate-900 tabular-nums">
                  {report.specDetails.excavationDepth}
                </div>
              </div>
            )}

            {/* Cover */}
            {report.specDetails.cover.trim() && (
              <div className="grid grid-cols-12 border-b border-slate-900 text-[11px]">
                <div className="col-span-5 px-2.5 py-1 border-r border-slate-900 font-bold text-slate-900 bg-slate-50">
                  Cover
                </div>
                <div className="col-span-7 px-2.5 py-1 font-medium text-slate-900 tabular-nums">
                  {report.specDetails.cover}
                </div>
              </div>
            )}

            {/* Rebars (Main Rebar & Chair Bar) */}
            {(report.specDetails.mainRebar.trim() ||
              report.specDetails.chairBar.trim()) && (
              <div className="border-b border-slate-900 text-[11px]">
                <div className="px-2.5 py-1 font-bold border-b border-slate-900 bg-slate-50 text-slate-900">
                  Rebars
                </div>
                <div className="divide-y divide-slate-300">
                  {report.specDetails.mainRebar.trim() && (
                    <div className="grid grid-cols-12">
                      <div className="col-span-5 px-2.5 py-1 border-r border-slate-900 text-slate-700 font-medium">
                        • Main Rebar
                      </div>
                      <div className="col-span-7 px-2.5 py-1 text-slate-900 font-medium">
                        {report.specDetails.mainRebar}
                      </div>
                    </div>
                  )}
                  {report.specDetails.chairBar.trim() && (
                    <div className="grid grid-cols-12">
                      <div className="col-span-5 px-2.5 py-1 border-r border-slate-900 text-slate-700 font-medium">
                        • Chair Bar
                      </div>
                      <div className="col-span-7 px-2.5 py-1 text-slate-900 font-medium">
                        {report.specDetails.chairBar}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tower Accessories */}
            {report.specDetails.towerAccessories.trim() && (
              <div className="border-b border-slate-900 text-[11px]">
                <div className="px-2.5 py-1 font-bold border-b border-slate-900 bg-slate-50 text-slate-900">
                  Tower Accessories
                </div>
                <div className="grid grid-cols-12">
                  <div className="col-span-5 px-2.5 py-1 border-r border-slate-900 text-slate-700 font-medium">
                    • {report.specDetails.towerAccessoriesLabel}
                  </div>
                  <div className="col-span-7 px-2.5 py-1 text-slate-900 font-medium">
                    {report.specDetails.towerAccessories}
                  </div>
                </div>
              </div>
            )}

            {/* Tasks Status */}
            <div className="flex-1 flex flex-col">
              <div className="px-2 py-1 text-xs font-semibold border-b border-slate-900 bg-slate-50">
                Tasks Status
              </div>
              <div className="grid grid-cols-12 border-b border-slate-900 text-xs font-semibold bg-white">
                <div className="col-span-9 px-2 py-1 border-r border-slate-900">Description</div>
                <div className="col-span-3 px-2 py-1">Status</div>
              </div>
              <div className="flex-1 divide-y divide-slate-900">
                {report.tasks.map((task) => (
                  <div key={task.key} className="grid grid-cols-12 text-[11px]">
                    <div className="col-span-9 px-2 py-1 border-r border-slate-900 text-slate-800">
                      {task.description}
                    </div>
                    <div
                      className={`col-span-3 px-2 py-1 font-semibold ${
                        task.done ? 'text-emerald-700' : 'text-slate-600'
                      }`}
                    >
                      {task.statusLabel}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>

      <ReportSignoffFooter
        details={reportDetails}
        fallbackPreparedBy={project.preparedBy}
        fallbackDate={project.lastUpdated}
      />
    </div>
  );
}
