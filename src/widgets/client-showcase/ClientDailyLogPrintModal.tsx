import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import {
  formatDailyLogPlainText,
  formatDateWithWeekday,
} from '@/entities/project/calculations';
import type {
  ClientDailyHighlightDto,
  ClientProjectShowcaseDto,
  DailyActivityLogEntry,
  MastProjectState,
  WorkerAttendanceEntry,
} from '@/entities/project/types';
import { DailyLogPrintSheet } from '@/widgets/daily-logs/DailyLogPrintSheet';
import {
  PrintModalHeader,
  usePrintPageSetup,
} from '@/widgets/report/PrintPageControls';

function resolveDailyHighlightProjectType(
  dto: ClientProjectShowcaseDto,
  highlight: ClientDailyHighlightDto,
  hasVerticalMastData: boolean
): 'foundation' | 'vertical_mast' {
  if (!hasVerticalMastData || dto.settings.phaseMode === 'foundation') {
    return 'foundation';
  }
  if (dto.settings.phaseMode === 'vertical_mast') {
    return 'vertical_mast';
  }
  const workedIds = highlight.foundationsWorked ?? [];
  const hasMastIds = workedIds.some((id) => /^(S|L)\d+$/i.test(id));
  const hasFoundationIds = workedIds.some((id) =>
    /^(PF-0|GA|(?:I|II|III)-\d+)$/i.test(id)
  );
  return hasMastIds || (!hasFoundationIds && dto.projectType === 'vertical_mast')
    ? 'vertical_mast'
    : 'foundation';
}

/**
 * Reconstructs a client-safe DailyActivityLogEntry from a sanitized ClientDailyHighlightDto
 * so the Client Portal renders the exact same DailyLogPrintSheet layout as Admin.
 */
export function clientHighlightToDailyLogEntry(
  highlight: ClientDailyHighlightDto,
  dto: Pick<ClientProjectShowcaseDto, 'projectName' | 'location' | 'settings'>
): DailyActivityLogEntry {
  const workers: WorkerAttendanceEntry[] =
    highlight.workers && highlight.workers.length > 0
      ? highlight.workers.map((w) => ({
          role: w.role,
          count: w.count,
          names: '',
          hours: 0,
        }))
      : highlight.totalWorkers > 0
        ? [
            {
              role: 'Skilled',
              count: highlight.totalWorkers,
              names: '',
              hours: 0,
            },
          ]
        : [];

  return {
    id: highlight.id,
    date: highlight.date,
    dayNumber: highlight.dayNumber,
    projectName: dto.projectName,
    location: dto.location,
    weather: highlight.weather,
    weatherNotes: highlight.weatherNotes,
    preparedBy: highlight.preparedBy,
    safetyOfficer: highlight.safetyOfficer?.trim() || undefined,
    activitiesSummary: highlight.activitiesSummary,
    activities: highlight.activities ? [...highlight.activities] : undefined,
    foundationsWorked: [...(highlight.foundationsWorked ?? [])],
    workers,
    totalWorkers: highlight.totalWorkers,
    totalManHours: 0,
    cementUsedBags: 0,
    sandUsedBags: 0,
    gravelUsedBags: 0,
    materialsOnSite: highlight.materials ? [...highlight.materials] : undefined,
    safetyLogs: (highlight.safetyLogs ?? []).map((s) => ({ ...s })),
    equipmentItems: (highlight.equipment ?? []).map((eq) => ({
      id: eq.id,
      name: eq.name,
      qty: eq.qty,
      status: eq.status,
      remarks: '',
    })),
    delayItems: (highlight.delays ?? []).map((d) => ({
      id: d.id,
      description: d.description,
      impact: d.impact,
      remarks: '',
    })),
    documentationItems: dto.settings.showPhotos
      ? (highlight.photos ?? []).map((photo) => ({
          id: photo.id,
          photoDataUrl: photo.url,
          description: photo.description,
        }))
      : [],
    issuesOrDelays: '',
  };
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
  const [showMaterials, setShowMaterials] = useState(true);
  const [copied, setCopied] = useState(false);
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

  const highlight =
    highlights.find((h) => h.id === selectedId) ?? highlights[0] ?? null;

  const dailyLog = useMemo(
    () => (highlight ? clientHighlightToDailyLogEntry(highlight, dto) : null),
    [highlight, dto]
  );

  const dailyRenderProject = useMemo<MastProjectState>(() => {
    if (!highlight) return renderProject;
    const projectType = resolveDailyHighlightProjectType(
      dto,
      highlight,
      Boolean(dto.verticalMastSummary)
    );
    return projectType === renderProject.projectType
      ? renderProject
      : { ...renderProject, projectType };
  }, [dto, highlight, renderProject]);

  if (!open || !highlight || !dailyLog || typeof document === 'undefined') {
    return null;
  }

  const projectName =
    renderProject.reportDetails?.projectName?.trim() || dto.projectName;
  const docTitle =
    renderProject.reportDetails?.documentTitle?.trim() ||
    `Daily Construction Log - Day ${highlight.dayNumber} (${highlight.date}) - ${projectName}`;

  const handleCopyText = async () => {
    try {
      const text = formatDailyLogPlainText(dailyLog, dailyRenderProject);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback if clipboard API unavailable
    }
  };

  return createPortal(
    <div
      className="report-modal-portal fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs overflow-y-auto p-2 sm:p-6 print:static print:p-0 print:bg-white"
      onClick={onClose}
    >
      <div
        className={`report-modal-dialog ${dialogMaxWidthClass} mx-auto bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden print:border-none print:shadow-none print:rounded-none print:max-w-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <PrintModalHeader
          title="Daily Construction Log"
          titleExtra={
            highlights.length > 0 ? (
              <select
                value={highlight.id}
                onChange={(e) => setSelectedId(e.target.value)}
                aria-label="Select daily construction log date"
                className="w-full sm:w-auto max-w-full min-w-0 min-h-10 sm:min-h-8 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-sky-500 focus:outline-none"
              >
                {highlights.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    Day {entry.dayNumber} — {formatDateWithWeekday(entry.date)} ({entry.weather})
                  </option>
                ))}
              </select>
            ) : undefined
          }
          extraActions={
            <>
              <button
                type="button"
                aria-pressed={showMaterials}
                onClick={() => setShowMaterials((v) => !v)}
                className={`inline-flex items-center justify-center gap-1.5 min-h-10 sm:min-h-8 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
                  showMaterials
                    ? 'bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100'
                    : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-100'
                }`}
                title="Toggle materials table on printed daily log"
              >
                {showMaterials ? (
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{showMaterials ? 'Materials: On' : 'Materials: Off'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center justify-center gap-1.5 min-h-10 sm:min-h-8 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-200/70 border border-slate-300 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            </>
          }
          targetRef={sheetRef}
          documentTitle={docTitle}
          onClose={onClose}
        />

        <div className="report-modal-preview-frame overflow-x-auto bg-slate-100/75 p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible">
          <div
            ref={sheetRef}
            style={{ width: `${sheetWidthPx}px`, minWidth: `${sheetWidthPx}px` }}
            className="report-modal-scroll-area report-printable-card pdf-desktop-layout mx-auto bg-white text-slate-900 p-4 sm:p-6 pdf-desktop:p-6 print:p-2 shadow-sm border border-slate-200 print:w-full print:min-w-0 print:border-none print:shadow-none"
          >
            <DailyLogPrintSheet
              project={dailyRenderProject}
              log={dailyLog}
              showMaterials={showMaterials}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
