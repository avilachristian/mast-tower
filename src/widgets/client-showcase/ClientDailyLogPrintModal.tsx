import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';
import { formatDateWithWeekday } from '@/entities/project/calculations';
import type {
  ClientDailyHighlightDto,
  ClientProjectShowcaseDto,
  MastProjectState,
} from '@/entities/project/types';
import { buildVerticalMastOverviewData } from '@/entities/project/verticalMastCalculations';
import type { MastSelectionTarget } from '@/shared/state/uiStore';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import { VerticalMastElevation2D } from '@/widgets/mast-tower/VerticalMastElevation2D';
import {
  PrintModalHeader,
  usePrintPageSetup,
} from '@/widgets/report/PrintPageControls';
import {
  ReportLetterhead,
  ReportSignoffFooter,
  resolveReportDetails,
} from '@/widgets/report/ReportLetterhead';

function resolveDailyHighlightDiagramMode(
  dto: ClientProjectShowcaseDto,
  highlight: ClientDailyHighlightDto,
  hasVerticalMastData: boolean
): boolean {
  if (!hasVerticalMastData || dto.settings.phaseMode === 'foundation') {
    return false;
  }
  if (dto.settings.phaseMode === 'vertical_mast') {
    return true;
  }
  const workedIds = highlight.foundationsWorked ?? [];
  const hasMastIds = workedIds.some((id) => /^(S|L)\d+$/i.test(id));
  const hasFoundationIds = workedIds.some((id) =>
    /^(PF-0|GA|(?:I|II|III)-\d+)$/i.test(id)
  );
  return hasMastIds || (!hasFoundationIds && dto.projectType === 'vertical_mast');
}

export function ClientDailyLogPrintModal({
  open,
  onClose,
  dto,
  renderProject,
  initialHighlightId,
}: {
  open: boolean;
  onClose: () => void;
  dto: ClientProjectShowcaseDto;
  renderProject: MastProjectState;
  initialHighlightId?: string | null;
}) {
  const highlights = useMemo(() => dto.highlights ?? [], [dto.highlights]);
  const [selectedId, setSelectedId] = useState<string>('');
  const { dialogMaxWidthClass, sheetWidthPx } = usePrintPageSetup(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const lastOpenInitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      lastOpenInitKeyRef.current = null;
      return;
    }
    const initKey = initialHighlightId ?? '__default__';
    const isOpeningNew = lastOpenInitKeyRef.current !== initKey;
    lastOpenInitKeyRef.current = initKey;

    setSelectedId((prev) => {
      if (
        isOpeningNew &&
        initialHighlightId &&
        highlights.some((h) => h.id === initialHighlightId)
      ) {
        return initialHighlightId;
      }
      if (prev && highlights.some((h) => h.id === prev)) {
        return prev;
      }
      if (
        initialHighlightId &&
        highlights.some((h) => h.id === initialHighlightId)
      ) {
        return initialHighlightId;
      }
      return highlights[0]?.id ?? '';
    });
  }, [open, initialHighlightId, highlights]);

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

  const vmOverview = useMemo(
    () =>
      dto.verticalMastSummary
        ? buildVerticalMastOverviewData(renderProject)
        : null,
    [dto.verticalMastSummary, renderProject]
  );

  const highlight =
    highlights.find((h) => h.id === selectedId) ?? highlights[0] ?? null;

  const selectedMastTarget: MastSelectionTarget | null = useMemo(() => {
    if (!highlight) return null;
    for (const rawId of highlight.foundationsWorked ?? []) {
      const id = rawId.trim().toUpperCase();
      if (/^S\d+$/.test(id)) return { kind: 'section', id };
      if (/^L\d+$/.test(id)) return { kind: 'guy_layer', id };
    }
    return null;
  }, [highlight]);

  if (!open || !highlight || typeof document === 'undefined') {
    return null;
  }

  const workedIds = highlight.foundationsWorked ?? [];
  const safetyLogs = highlight.safetyLogs ?? [];
  const equipment = highlight.equipment ?? [];
  const delays = highlight.delays ?? [];
  const visiblePhotos = dto.settings.showPhotos ? highlight.photos ?? [] : [];
  const isVerticalMastLog = resolveDailyHighlightDiagramMode(
    dto,
    highlight,
    Boolean(vmOverview)
  );

  const reportDetails = resolveReportDetails(renderProject, {
    reportDate: highlight.date,
    preparedBy: highlight.preparedBy || renderProject.preparedBy,
  });

  const docTitle = `${dto.projectName} - Daily Construction Log - Day ${highlight.dayNumber} (${highlight.date})`;

  const daySelector = (
    <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
      <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      <select
        value={highlight.id}
        onChange={(e) => setSelectedId(e.target.value)}
        aria-label="Select daily construction log date"
        className="w-full sm:w-auto text-xs font-medium text-slate-800 bg-transparent focus:outline-none cursor-pointer"
      >
        {highlights.map((h) => (
          <option key={h.id} value={h.id}>
            Day {String(h.dayNumber).padStart(2, '0')} — {h.date} ({h.weather})
          </option>
        ))}
      </select>
    </div>
  );

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
          title="Daily Construction Log Report — Print / Save PDF Preview"
          subtitle={`${dto.projectName} · Day ${highlight.dayNumber} (${formatDateWithWeekday(highlight.date)})`}
          titleExtra={daySelector}
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
            <div className="p-5 sm:p-6 text-slate-900 bg-white space-y-4 text-xs">
              <ReportLetterhead
                details={reportDetails}
                kicker={
                  isVerticalMastLog
                    ? 'Vertical Mast Construction Progress'
                    : 'Civil & Foundation Construction Progress'
                }
                defaultTitle="Daily Construction Log Report"
                subtitle={`Field Activity Record — Day ${String(highlight.dayNumber).padStart(2, '0')} (${formatDateWithWeekday(highlight.date)})`}
                fallbackProjectName={dto.projectName}
                fallbackLocation={dto.location}
                fallbackContractor={dto.contractor}
                fallbackDate={highlight.date}
              />

              {/* Upper Grid: 2D Site Map / Mast Elevation + Daily Metadata Table */}
              <div className="grid grid-cols-1 md:grid-cols-12 pdf-desktop:grid-cols-12 print:grid-cols-12 border-2 border-slate-900">
                <div className="md:col-span-5 pdf-desktop:col-span-5 print:col-span-5 border-b md:border-b-0 md:border-r pdf-desktop:border-b-0 pdf-desktop:border-r print:border-b-0 print:border-r border-slate-900 bg-white p-2.5 flex flex-col gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1">
                    {isVerticalMastLog
                      ? 'Mast Elevation & Guyed Anchor Plan'
                      : 'Foundation Layout Plan (Worked Pads Highlighted)'}
                  </div>

                  {isVerticalMastLog && vmOverview ? (
                    <div className="space-y-2">
                      <VerticalMastElevation2D
                        verticalMast={vmOverview.vm}
                        selectedTarget={selectedMastTarget}
                        compact
                        hideHeader
                        frameless
                        enableVerticalScale={false}
                      />
                      <div className="border-t border-slate-200 pt-2">
                        <GroundAnchorPlan2D
                          foundations={renderProject.foundations}
                          anchorGuyStates={vmOverview.anchorGuyStates}
                          highlightedIds={workedIds}
                          calloutTitle="Elements Worked"
                          compact
                          hideHeader
                          frameless
                        />
                      </div>
                    </div>
                  ) : (
                    <GroundAnchorPlan2D
                      foundations={renderProject.foundations}
                      highlightedIds={workedIds}
                      calloutTitle="Foundations Worked"
                      compact
                      hideHeader
                      frameless
                    />
                  )}
                </div>

                <div className="md:col-span-7 pdf-desktop:col-span-7 print:col-span-7 flex flex-col divide-y divide-slate-900">
                  <div className="px-3 py-1.5 bg-slate-100 font-bold uppercase tracking-wider text-[11px] text-slate-900">
                    Daily Site Summary Metadata
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-slate-900">
                    <div className="p-2.5">
                      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">
                        Log Date
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {formatDateWithWeekday(highlight.date)}
                      </div>
                    </div>
                    <div className="p-2.5">
                      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">
                        Project Day
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5 tabular-nums">
                        DAY {String(highlight.dayNumber).padStart(2, '0')}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-slate-900">
                    <div className="p-2.5">
                      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">
                        Weather Condition
                      </div>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {highlight.weather}
                      </div>
                      {highlight.weatherNotes?.trim() && (
                        <div className="text-[10.5px] text-slate-600 mt-0.5">
                          {highlight.weatherNotes}
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">
                        Workforce Headcount
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5 tabular-nums">
                        {highlight.totalWorkers}{' '}
                        {highlight.totalWorkers === 1 ? 'worker' : 'workers'} on site
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-slate-900">
                    <div className="p-2.5">
                      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">
                        Lead Engineer / Prepared By
                      </div>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {highlight.preparedBy || '—'}
                      </div>
                    </div>
                    <div className="p-2.5">
                      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">
                        Safety Officer
                      </div>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {highlight.safetyOfficer || '—'}
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 flex-1">
                    <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">
                      Structural Elements / Locations Worked
                    </div>
                    <div className="font-mono font-semibold text-slate-900 mt-1 leading-relaxed">
                      {workedIds.length > 0
                        ? workedIds.join(', ')
                        : 'General Site Works / Mobilization'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Narrative Activities Summary */}
              <div className="border-2 border-slate-900 break-inside-avoid">
                <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-xs">
                  Site Work Summary &amp; Key Progress
                </div>
                <div className="p-3 text-slate-800 text-[11.5px] leading-relaxed whitespace-pre-line">
                  {highlight.activitiesSummary ||
                    'No narrative activity summary recorded for this date.'}
                </div>
              </div>

              {/* Section: Safety & Compliance Observations */}
              <div className="border-2 border-slate-900 break-inside-avoid">
                <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-xs flex items-center justify-between">
                  <span>Safety &amp; HSE Compliance Log</span>
                  {highlight.safetyOfficer && (
                    <span className="text-[10px] font-semibold text-slate-600 normal-case">
                      HSE Officer: {highlight.safetyOfficer}
                    </span>
                  )}
                </div>
                {safetyLogs.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                    No safety incidents or corrective actions logged. Routine toolbox talk &amp; PPE protocols observed.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900 bg-slate-50 text-[10px] font-bold uppercase text-slate-800">
                        <th className="px-2.5 py-1.5 border-r border-slate-900 w-36">
                          Activity / Time
                        </th>
                        <th className="px-2.5 py-1.5 border-r border-slate-900">
                          Hazard / Observation
                        </th>
                        <th className="px-2.5 py-1.5 border-r border-slate-900">
                          Corrective Action
                        </th>
                        <th className="px-2.5 py-1.5 w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300 text-[10.5px]">
                      {safetyLogs.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-2.5 py-1.5 border-r border-slate-900 font-medium text-slate-900">
                            {entry.timeOrActivity || '—'}
                          </td>
                          <td className="px-2.5 py-1.5 border-r border-slate-900 text-slate-800">
                            {entry.hazardOrFinding || '—'}
                          </td>
                          <td className="px-2.5 py-1.5 border-r border-slate-900 text-slate-700">
                            {entry.actionTaken || '—'}
                          </td>
                          <td className="px-2.5 py-1.5 font-semibold text-slate-900">
                            {entry.status || 'Compliant'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Section: Equipment & Delays 2-Column Block */}
              <div className="grid grid-cols-1 md:grid-cols-2 pdf-desktop:grid-cols-2 print:grid-cols-2 border-2 border-slate-900 divide-y md:divide-y-0 md:divide-x pdf-desktop:divide-y-0 pdf-desktop:divide-x print:divide-y-0 print:divide-x divide-slate-900 break-inside-avoid">
                <div>
                  <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-xs">
                    Equipment Deployed On Site
                  </div>
                  {equipment.length === 0 ? (
                    <div className="px-3 py-2.5 text-[11px] text-slate-500 italic">
                      No heavy equipment deployment recorded.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 bg-slate-50 text-[10px] font-bold uppercase text-slate-800">
                          <th className="px-2.5 py-1 border-r border-slate-900">
                            Equipment
                          </th>
                          <th className="px-2.5 py-1 border-r border-slate-900 w-14 text-center">
                            Qty
                          </th>
                          <th className="px-2.5 py-1 w-28">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300 text-[10.5px]">
                        {equipment.map((eq) => (
                          <tr key={eq.id}>
                            <td className="px-2.5 py-1 border-r border-slate-900 font-medium text-slate-900">
                              {eq.name}
                            </td>
                            <td className="px-2.5 py-1 border-r border-slate-900 text-center tabular-nums">
                              {eq.qty}
                            </td>
                            <td className="px-2.5 py-1 text-slate-700">
                              {eq.status || 'Operational'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div>
                  <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-xs">
                    Recorded Site Delays / Constraints
                  </div>
                  {delays.length === 0 ? (
                    <div className="px-3 py-2.5 text-[11px] text-slate-500 italic">
                      No significant site delays or weather stoppages reported.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-300 text-[10.5px]">
                      {delays.map((delay) => (
                        <li key={delay.id} className="px-3 py-2 space-y-0.5">
                          <div className="font-semibold text-slate-900">
                            {delay.description}
                          </div>
                          {delay.impact && (
                            <div className="text-slate-600 text-[10px]">
                              Impact: {delay.impact}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Section: Site Documentation Photos (Strictly gated by showPhotos) */}
              {visiblePhotos.length > 0 && (
                <div className="border-2 border-slate-900">
                  <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-900 font-bold uppercase text-xs">
                    Site Progress Photography ({visiblePhotos.length}{' '}
                    {visiblePhotos.length === 1 ? 'Photo' : 'Photos'})
                  </div>
                  <div className="p-3 grid grid-cols-2 sm:grid-cols-3 pdf-desktop:grid-cols-3 print:grid-cols-3 gap-3">
                    {visiblePhotos.map((photo) => (
                      <figure
                        key={photo.id}
                        className="border border-slate-300 bg-slate-50 break-inside-avoid"
                      >
                        <div className="aspect-[4/3] overflow-hidden bg-slate-200">
                          <img
                            src={photo.url}
                            alt={photo.description || 'Site progress photo'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        {photo.description && (
                          <figcaption className="px-2 py-1.5 text-[10px] text-slate-700 leading-snug border-t border-slate-200 bg-white">
                            {photo.description}
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                </div>
              )}

              <ReportSignoffFooter
                details={reportDetails}
                fallbackPreparedBy={highlight.preparedBy || renderProject.preparedBy}
                fallbackDate={highlight.date}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
