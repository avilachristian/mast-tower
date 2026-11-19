import { useMemo } from 'react';
import {
  computeDailyLogMaterialRemaining,
  formatDateWithWeekday,
  getDailyLogActivityRows,
  getDailyLogDelayRows,
  getDailyLogEquipmentRows,
  getDailyLogMaterialRows,
  getDailyLogSafetyRows,
  getDailyLogVisitorRows,
} from '@/entities/project/calculations';
import type { DailyActivityLogEntry, MastProjectState } from '@/entities/project/types';
import { buildVerticalMastOverviewData } from '@/entities/project/verticalMastCalculations';
import type { MastSelectionTarget } from '@/shared/state/uiStore';
import { DEFAULT_SAFETY_OFFICER_NAME } from '@/entities/project/materialConstants';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import { VerticalMastElevation2D } from '@/widgets/mast-tower/VerticalMastElevation2D';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveMatchingSafetyOfficerSignature,
  resolveReportDetails,
} from '@/widgets/report/ReportLetterhead';
import { useReportSignoffOverrides } from '@/widgets/report/ReportSignoffOverrideContext';

export function DailyLogPrintSheet({
  project,
  log,
  showMaterials = true,
}: {
  project: MastProjectState;
  log: DailyActivityLogEntry;
  showMaterials?: boolean;
}) {
  const projectName =
    log.projectName?.trim() ||
    project.reportDetails?.projectName?.trim() ||
    project.projectName;
  const location =
    log.location?.trim() ||
    project.reportDetails?.projectLocation?.trim() ||
    project.location;
  const preparedBy =
    log.preparedBy?.trim() ||
    project.reportDetails?.preparedBy?.trim() ||
    project.preparedBy;
  const effectiveDetails = resolveReportDetails(project, {
    reportDate: log.date,
    preparedBy,
  });
  const safetyOfficer = log.safetyOfficer?.trim() || '';

  const activityRows = useMemo(() => getDailyLogActivityRows(log), [log]);
  const materialRows = useMemo(() => getDailyLogMaterialRows(log), [log]);
  const equipmentRows = useMemo(() => getDailyLogEquipmentRows(log), [log]);
  const delayRows = useMemo(() => getDailyLogDelayRows(log), [log]);
  const visitorRows = useMemo(() => getDailyLogVisitorRows(log), [log]);
  const safetyRows = useMemo(() => getDailyLogSafetyRows(log), [log]);
  const documentationRows = useMemo(
    () => log.documentationItems ?? [],
    [log.documentationItems]
  );
  const workedIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...log.foundationsWorked,
          ...(log.activities ?? [])
            .map((a) => a.foundationId)
            .filter((id): id is string => Boolean(id)),
        ])
      ),
    [log.foundationsWorked, log.activities]
  );
  const verticalMastView = useMemo(() => {
    if (project.projectType !== 'vertical_mast') return null;
    const { vm, projectedAnchorStatuses, anchorGuyStates } =
      buildVerticalMastOverviewData(project);
    const mappedFoundations = project.foundations.map((f) => ({
      ...f,
      status: projectedAnchorStatuses.get(f.id) ?? 'completed',
    }));
    const firstGuy = workedIds.find((id) => id.startsWith('L'));
    const firstSec = workedIds.find((id) => id.startsWith('S'));
    const target: MastSelectionTarget = firstGuy
      ? { kind: 'guy_layer', id: firstGuy }
      : { kind: 'section', id: firstSec ?? 'S01' };
    const firstGuyLayer = firstGuy
      ? vm.guyLayers.find((g) => g.id === firstGuy)
      : undefined;
    const highlightedAnchors = firstGuyLayer
      ? Object.values(firstGuyLayer.anchorIds)
      : workedIds;
    return {
      vm,
      anchorGuyStates,
      mappedFoundations,
      target,
      highlightedAnchors,
    };
  }, [project, workedIds]);

  return (
    <>
      <ReportLetterhead
        details={{
          ...effectiveDetails,
          projectName,
          projectLocation: location,
          preparedBy,
        }}
        defaultTitle="DAILY CONSTRUCTION SITE LOG"
        subtitle={`Day #${log.dayNumber} · Weather: ${log.weather}`}
        fallbackProjectName={projectName}
        fallbackLocation={location}
        fallbackContractor={project.contractor}
        fallbackDate={log.date}
      />

      <div className="border-2 border-slate-900 text-xs divide-y-2 divide-slate-900">
        {/* Top Split Row: Left 2D Tower Layout Highlighting Current Work | Right Project Metadata & Manpower */}
        <div className="grid grid-cols-12">
          {/* Left: 2D Tower & Foundation Layout */}
          <div className="col-span-12 md:col-span-7 pdf-desktop:col-span-7 print:col-span-7 border-b-2 md:border-b-0 md:border-r-2 pdf-desktop:border-b-0 pdf-desktop:border-r-2 print:border-b-0 print:border-r-2 border-slate-900 flex flex-col p-1.5">
            <div className="text-[11px] font-bold text-slate-700 text-center py-0.5 px-2 shrink-0 uppercase tracking-wide leading-tight">
              Tower Layout — Current Work (
              {workedIds.length === 0
                ? 'General Site'
                : workedIds.length >= project.foundations.length
                  ? `All ${workedIds.length} Foundations`
                  : workedIds.join(', ')}
              )
            </div>
            <div className="flex-1 min-h-[340px] sm:min-h-[380px] pdf-desktop:min-h-[380px] flex items-stretch justify-stretch">
              {verticalMastView ? (
                <div className="grid grid-cols-2 gap-1.5 w-full">
                  <VerticalMastElevation2D
                    verticalMast={verticalMastView.vm}
                    selectedTarget={verticalMastView.target}
                    compact
                    fillParent
                  />
                  <GroundAnchorPlan2D
                    foundations={verticalMastView.mappedFoundations}
                    anchorGuyStates={verticalMastView.anchorGuyStates}
                    highlightedIds={verticalMastView.highlightedAnchors}
                    calloutTitle="CURRENT WORK"
                    compact
                    hideHeader
                    fillParent
                  />
                </div>
              ) : (
                <GroundAnchorPlan2D
                  foundations={project.foundations}
                  highlightedIds={workedIds}
                  calloutTitle="CURRENT WORK"
                  compact
                  hideHeader
                  fillParent
                />
              )}
            </div>
          </div>

          {/* Right: Project Info, Date/Weather & Manpower */}
          <div className="col-span-12 md:col-span-5 pdf-desktop:col-span-5 print:col-span-5 flex flex-col">
            {/* Project Name & Location */}
            <div className="border-b-2 border-slate-900 p-2">
              <div className="text-[10px] font-bold uppercase text-slate-500">Project Name</div>
              <div className="font-bold text-sm text-slate-900">{projectName}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                Location: {location}
              </div>
            </div>

            {/* Date, Day #, Weather */}
            <div className="grid grid-cols-12 border-b-2 border-slate-900">
              <div className="col-span-6 border-r border-slate-900 p-2">
                <div className="text-[10px] font-bold uppercase text-slate-500">Date &amp; Day</div>
                <div className="font-bold text-slate-900">
                  {formatDateWithWeekday(log.date)} · Day #{log.dayNumber}
                </div>
              </div>
              <div className="col-span-6 p-2">
                <div className="text-[10px] font-bold uppercase text-slate-500">Weather</div>
                <div className="font-bold text-slate-900">{log.weather}</div>
                {log.weatherNotes && (
                  <div className="text-[11px] text-slate-600">{log.weatherNotes}</div>
                )}
              </div>
            </div>

            {/* Foundations Worked */}
            <div className="border-b-2 border-slate-900 bg-slate-50 p-2 text-[11px]">
              <div>
                <span className="font-bold text-slate-700">
                  {project.projectType === 'vertical_mast'
                    ? 'Elements Worked:'
                    : 'Foundations Worked:'}
                </span>{' '}
                <span className="font-semibold text-sky-700">
                  {workedIds.length > 0 ? workedIds.join(', ') : 'General Site'}
                </span>
              </div>
            </div>

            {/* Manpower Attendance Table */}
            <div className="flex-1 flex flex-col">
              <div className="px-2 py-1 bg-slate-100 border-b border-slate-900 font-bold uppercase flex items-center justify-between">
                <span>Manpower Attendance</span>
                <span>{log.totalWorkers} Workers</span>
              </div>
              <table className="w-full text-left border-collapse flex-1">
                <thead>
                  <tr className="border-b border-slate-900 bg-slate-50 text-[11px]">
                    <th className="px-2 py-1 border-r border-slate-900">Role / Trade</th>
                    <th className="px-2 py-1 border-r border-slate-900 text-center w-16">
                      Count
                    </th>
                    <th className="px-2 py-1">Names / Crew Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {log.workers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 text-slate-400 italic text-center">
                        No manpower recorded
                      </td>
                    </tr>
                  ) : (
                    log.workers.map((w, idx) => (
                      <tr key={idx} className="border-b last:border-b-0 border-slate-300">
                        <td className="px-2 py-1 border-r border-slate-900 font-semibold">
                          {w.role}
                        </td>
                        <td className="px-2 py-1 border-r border-slate-900 text-center">
                          {w.count}
                        </td>
                        <td className="px-2 py-1 text-slate-700">{w.names || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Activities & Status Table */}
        {(activityRows.length > 0 || Boolean(log.activitiesSummary.trim())) && (
          <div>
            <div className="px-2 py-1 bg-slate-100 border-b border-slate-900 font-bold uppercase">
              Activities &amp; Status
            </div>
            {activityRows.length > 0 && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 bg-slate-50 text-[11px]">
                    <th className="px-2 py-1 border-r border-slate-900 w-24">Location</th>
                    <th className="px-2 py-1 border-r border-slate-900">Activity Description</th>
                    <th className="px-2 py-1 border-r border-slate-900 w-28 text-center">Status</th>
                    <th className="px-2 py-1">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows.map((act) => (
                    <tr key={act.id} className="border-b last:border-b-0 border-slate-300">
                      <td className="px-2 py-1 border-r border-slate-900 font-semibold">
                        {act.foundationId || 'Site'}
                      </td>
                      <td className="px-2 py-1 border-r border-slate-900">{act.description}</td>
                      <td className="px-2 py-1 border-r border-slate-900 text-center font-semibold">
                        {act.status}
                      </td>
                      <td className="px-2 py-1 text-slate-700">{act.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {log.activitiesSummary.trim() && log.activities && log.activities.length > 0 && (
              <div className="px-2 py-1.5 border-t border-slate-900 text-slate-800 leading-relaxed">
                <span className="font-bold">Summary Notes: </span>
                {log.activitiesSummary}
              </div>
            )}
          </div>
        )}

        {/* Safety Logs Table (Safety Officer) */}
        {safetyRows.length > 0 && (
          <div>
            <div className="px-2 py-1 bg-slate-100 border-b border-slate-900 font-bold uppercase flex flex-wrap items-center justify-between gap-2">
              <span>Safety Logs</span>
              {safetyOfficer && (
                <span className="text-[11px] font-semibold text-slate-700 normal-case">
                  Safety Officer: {safetyOfficer}
                </span>
              )}
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-50 text-[11px]">
                  <th className="px-2 py-1 border-r border-slate-900 w-36">Time / Activity</th>
                  <th className="px-2 py-1 border-r border-slate-900">
                    Safety Observation / Hazard
                  </th>
                  <th className="px-2 py-1 border-r border-slate-900">
                    Action Taken / Control
                  </th>
                  <th className="px-2 py-1 w-24 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {safetyRows.map((s) => (
                  <tr key={s.id} className="border-b last:border-b-0 border-slate-300">
                    <td className="px-2 py-1 border-r border-slate-900 font-semibold">
                      {s.timeOrActivity || '—'}
                    </td>
                    <td className="px-2 py-1 border-r border-slate-900">
                      {s.hazardOrFinding || '—'}
                    </td>
                    <td className="px-2 py-1 border-r border-slate-900">
                      {s.actionTaken || '—'}
                    </td>
                    <td className="px-2 py-1 text-center font-semibold">
                      {s.status || 'Compliant'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Materials / Tower Parts on Site Table */}
        {showMaterials && materialRows.length > 0 && (
          <div>
            <div className="px-2 py-1 bg-slate-100 border-b border-slate-900 font-bold uppercase">
              {project.projectType === 'vertical_mast'
                ? 'Tower Parts & Materials on Site'
                : 'Materials on Site'}
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-50 text-[11px]">
                  <th className="px-2 py-1 border-r border-slate-900">
                    {project.projectType === 'vertical_mast' ? 'Tower Part' : 'Material'}
                  </th>
                  <th className="px-2 py-1 border-r border-slate-900 w-14 text-center">Unit</th>
                  <th className="px-2 py-1 border-r border-slate-900 w-20 text-center">On Site</th>
                  <th className="px-2 py-1 border-r border-slate-900 w-20 text-center">Delivered</th>
                  <th className="px-2 py-1 border-r border-slate-900 w-20 text-center">Used</th>
                  <th className="px-2 py-1 border-r border-slate-900 w-20 text-center">Remaining</th>
                  <th className="px-2 py-1">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {materialRows.map((m) => {
                  const delivered = m.deliveredQty ?? 0;
                  const remaining =
                    m.remainingQty ?? computeDailyLogMaterialRemaining(m);
                  return (
                    <tr key={m.id} className="border-b last:border-b-0 border-slate-300">
                      <td className="px-2 py-1 border-r border-slate-900 font-semibold">{m.name}</td>
                      <td className="px-2 py-1 border-r border-slate-900 text-center">{m.unit}</td>
                      <td className="px-2 py-1 border-r border-slate-900 text-center font-semibold">
                        {m.onSiteQty}
                      </td>
                      <td className="px-2 py-1 border-r border-slate-900 text-center">
                        {delivered}
                      </td>
                      <td className="px-2 py-1 border-r border-slate-900 text-center">
                        {m.usedTodayQty}
                      </td>
                      <td className="px-2 py-1 border-r border-slate-900 text-center font-bold">
                        {remaining}
                      </td>
                      <td className="px-2 py-1 text-slate-700">{m.remarks || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Equipments Table */}
        {equipmentRows.length > 0 && (
          <div>
            <div className="px-2 py-1 bg-slate-100 border-b border-slate-900 font-bold uppercase">
              Equipments
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-50 text-[11px]">
                  <th className="px-2 py-1 border-r border-slate-900">Equipment / Tool</th>
                  <th className="px-2 py-1 border-r border-slate-900 w-20 text-center">Qty</th>
                  <th className="px-2 py-1 border-r border-slate-900 w-28 text-center">Status</th>
                  <th className="px-2 py-1">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {equipmentRows.map((eq) => (
                  <tr key={eq.id} className="border-b last:border-b-0 border-slate-300">
                    <td className="px-2 py-1 border-r border-slate-900 font-semibold">{eq.name}</td>
                    <td className="px-2 py-1 border-r border-slate-900 text-center">{eq.qty}</td>
                    <td className="px-2 py-1 border-r border-slate-900 text-center">{eq.status}</td>
                    <td className="px-2 py-1 text-slate-700">{eq.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Delays Table */}
        {delayRows.length > 0 && (
          <div>
            <div className="px-2 py-1 bg-slate-100 border-b border-slate-900 font-bold uppercase">
              Delays / Issues
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-50 text-[11px]">
                  <th className="px-2 py-1 border-r border-slate-900">Delay / Issue Description</th>
                  <th className="px-2 py-1 border-r border-slate-900 w-32 text-center">Impact / Hours</th>
                  <th className="px-2 py-1">Action / Remarks</th>
                </tr>
              </thead>
              <tbody>
                {delayRows.map((d) => (
                  <tr key={d.id} className="border-b last:border-b-0 border-slate-300">
                    <td className="px-2 py-1 border-r border-slate-900 font-medium">{d.description}</td>
                    <td className="px-2 py-1 border-r border-slate-900 text-center">{d.impact || '—'}</td>
                    <td className="px-2 py-1 text-slate-700">{d.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Visitors Table */}
        {visitorRows.length > 0 && (
          <div>
            <div className="px-2 py-1 bg-slate-100 border-b border-slate-900 font-bold uppercase">
              Visitors
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-50 text-[11px]">
                  <th className="px-2 py-1 border-r border-slate-900">Visitor Name</th>
                  <th className="px-2 py-1 border-r border-slate-900 w-36">Company / Role</th>
                  <th className="px-2 py-1 border-r border-slate-900">Purpose</th>
                  <th className="px-2 py-1">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {visitorRows.map((v) => (
                  <tr key={v.id} className="border-b last:border-b-0 border-slate-300">
                    <td className="px-2 py-1 border-r border-slate-900 font-semibold">{v.name}</td>
                    <td className="px-2 py-1 border-r border-slate-900">{v.roleOrCompany || '—'}</td>
                    <td className="px-2 py-1 border-r border-slate-900">{v.purpose || '—'}</td>
                    <td className="px-2 py-1 text-slate-700">{v.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Documentation Table (Image left, Description / Remarks right) */}
        {documentationRows.length > 0 && (
          <div>
            <div className="px-2 py-1 bg-slate-100 border-b border-slate-900 font-bold uppercase">
              Documentation
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-50 text-[11px]">
                  <th className="px-2 py-1 border-r border-slate-900 w-5/12 text-center">
                    Photo
                  </th>
                  <th className="px-2 py-1 w-7/12">Description / Remarks</th>
                </tr>
              </thead>
              <tbody>
                {documentationRows.map((doc) => (
                  <tr key={doc.id} className="border-b last:border-b-0 border-slate-900">
                    <td className="p-2 border-r border-slate-900 align-middle text-center">
                      {doc.photoDataUrl ? (
                        <img
                          src={doc.photoDataUrl}
                          alt={doc.description || doc.photoName || 'Site documentation'}
                          className="mx-auto max-h-40 w-auto object-contain rounded border border-slate-200"
                        />
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No Photo</span>
                      )}
                    </td>
                    <td className="p-2 align-top space-y-1">
                      <div className="font-semibold text-slate-900">
                        {doc.description || '—'}
                      </div>
                      {doc.remarks?.trim() && (
                        <div className="text-[11px] text-slate-700">
                          <span className="font-semibold">Remarks:</span> {doc.remarks}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DailyLogFooterWithSafetyOfficer
        project={project}
        effectiveDetails={effectiveDetails}
        preparedBy={preparedBy}
        safetyOfficer={safetyOfficer}
        fallbackDate={log.date}
      />
    </>
  );
}

function DailyLogFooterWithSafetyOfficer({
  project,
  effectiveDetails,
  preparedBy,
  safetyOfficer,
  fallbackDate,
}: {
  project: MastProjectState;
  effectiveDetails: ReturnType<typeof resolveReportDetails>;
  preparedBy: string;
  safetyOfficer: string;
  fallbackDate: string;
}) {
  const signoffOverrides = useReportSignoffOverrides();
  const hasExplicitOverrideToggle = signoffOverrides?.includeSafetyOfficer !== undefined;
  const showSafetyOfficer = hasExplicitOverrideToggle
    ? Boolean(signoffOverrides.includeSafetyOfficer)
    : Boolean(safetyOfficer);
  const effectiveSafetyOfficer =
    safetyOfficer ||
    (signoffOverrides?.includeSafetyOfficer === true
      ? effectiveDetails.safetyOfficerBy?.trim() || DEFAULT_SAFETY_OFFICER_NAME
      : '');
  const matchingSafetySig = effectiveSafetyOfficer
    ? resolveMatchingSafetyOfficerSignature(project, effectiveSafetyOfficer)
    : undefined;

  return (
    <ReportSignoffFooter
      details={{
        ...effectiveDetails,
        preparedBy,
        safetyOfficerBy: effectiveSafetyOfficer || undefined,
        safetyOfficerSignatureUrl: matchingSafetySig,
      }}
      fallbackPreparedBy={preparedBy}
      fallbackDate={fallbackDate}
      includeSafetyOfficer={showSafetyOfficer}
    />
  );
}
