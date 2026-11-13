import { formatDateWithWeekday } from '@/entities/project/calculations';
import type { MastProjectState, ReportDetailsSpec } from '@/entities/project/types';
import type { PrintOrientation, PrintPaperSize } from '@/shared/state/uiStore';

const PRINT_PAGE_STYLE_ID = 'mast-dynamic-print-page-style';

/**
 * Injects or updates the dynamic `@page { size: ... }` rule so the browser print
 * dialog defaults cleanly to the chosen paper size and orientation.
 */
export function applyPrintPageStyle(
  paperSize: PrintPaperSize = 'A4',
  orientation: PrintOrientation = 'portrait'
): void {
  if (typeof document === 'undefined') return;
  let styleEl = document.getElementById(PRINT_PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = PRINT_PAGE_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  const margin = paperSize === 'A3' ? '12mm' : '10mm';
  styleEl.textContent = `@media print { @page { size: ${paperSize} ${orientation}; margin: ${margin}; } }`;
}

/**
 * Temporarily sets `document.title` and ensures `@page` size/orientation rules
 * are applied before invoking browser Print / Save as PDF.
 */
export function triggerReportPrint(
  documentTitle?: string,
  pageOptions?: { paperSize?: PrintPaperSize; orientation?: PrintOrientation }
): void {
  if (typeof window === 'undefined') return;
  if (pageOptions?.paperSize || pageOptions?.orientation) {
    applyPrintPageStyle(
      pageOptions.paperSize ?? 'A4',
      pageOptions.orientation ?? 'portrait'
    );
  }
  const previousTitle = document.title;
  const sanitized = (documentTitle ?? '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  if (sanitized) {
    document.title = sanitized;
  }
  const restoreTitle = () => {
    document.title = previousTitle;
  };
  window.addEventListener('afterprint', restoreTitle, { once: true });
  window.print();
}

export function resolveReportDetails(
  project: Pick<
    MastProjectState,
    'projectName' | 'location' | 'preparedBy' | 'contractor' | 'lastUpdated' | 'reportDetails'
  >,
  overrides?: { reportDate?: string; preparedBy?: string }
): ReportDetailsSpec {
  const base = project.reportDetails ?? {};
  return {
    ...base,
    projectName: base.projectName?.trim() || project.projectName,
    projectLocation: base.projectLocation?.trim() || project.location,
    contractor: base.contractor?.trim() || project.contractor,
    preparedBy:
      overrides?.preparedBy?.trim() || base.preparedBy?.trim() || project.preparedBy,
    reportDate:
      overrides?.reportDate?.trim() || base.reportDate?.trim() || project.lastUpdated,
  };
}

export function ReportLetterhead({
  details,
  kicker,
  defaultTitle,
  subtitle,
  fallbackProjectName,
  fallbackLocation,
  fallbackContractor,
  fallbackDate,
}: {
  details?: ReportDetailsSpec;
  kicker?: string;
  defaultTitle: string;
  subtitle?: string;
  fallbackProjectName?: string;
  fallbackLocation?: string;
  fallbackContractor?: string;
  fallbackDate?: string;
}) {
  const logos = details?.logos;
  const hasAnyLogo = Boolean(
    logos?.left?.dataUrl || logos?.center?.dataUrl || logos?.right?.dataUrl
  );
  const logoHeight = Math.min(110, Math.max(28, details?.logoHeightPx ?? 52));
  const projectName = details?.projectName?.trim() || fallbackProjectName?.trim() || '';
  const projectLocation =
    details?.projectLocation?.trim() || fallbackLocation?.trim() || '';
  const contractor = details?.contractor?.trim() || fallbackContractor?.trim() || '';
  const mainTitle = details?.documentTitle?.trim() || defaultTitle;
  const rawDate =
    details?.reportDate?.trim() || fallbackDate?.trim() || new Date().toISOString().slice(0, 10);
  const displayDate = formatDateWithWeekday(rawDate);

  const metaItems: { label: string; value: string }[] = [
    ...(projectName ? [{ label: 'Project Name', value: projectName }] : []),
    ...(details?.clientName?.trim()
      ? [{ label: 'Client / Owner', value: details.clientName.trim() }]
      : []),
    ...(contractor ? [{ label: 'Contractor', value: contractor }] : []),
    ...(projectLocation ? [{ label: 'Location', value: projectLocation }] : []),
    ...(details?.referenceNo?.trim()
      ? [{ label: 'Reference / Dwg No.', value: details.referenceNo.trim() }]
      : []),
    ...(details?.revision?.trim()
      ? [{ label: 'Revision', value: details.revision.trim() }]
      : []),
    ...(details?.checkedBy?.trim()
      ? [{ label: 'Checked By', value: details.checkedBy.trim() }]
      : []),
  ];

  return (
    <div className="break-inside-avoid border-b-2 border-slate-900 pb-3 mb-3">
      {hasAnyLogo && (
        <div className="grid grid-cols-3 items-center gap-2 sm:gap-4 pb-3 mb-3 border-b border-slate-200">
          {(['left', 'center', 'right'] as const).map((slot) => {
            const logo = logos?.[slot];
            const alignClass =
              slot === 'left'
                ? 'items-start text-left'
                : slot === 'center'
                  ? 'items-center text-center'
                  : 'items-end text-right';
            return (
              <div
                key={slot}
                className={`flex flex-col justify-center min-h-[32px] ${alignClass}`}
              >
                {logo?.dataUrl && (
                  <>
                    <img
                      src={logo.dataUrl}
                      alt={logo.caption || `${slot} logo`}
                      style={{ maxHeight: `${logoHeight}px` }}
                      className="w-auto max-w-full object-contain"
                    />
                    {logo.caption?.trim() && (
                      <span className="mt-1 text-[9px] font-medium text-slate-500 leading-tight">
                        {logo.caption.trim()}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {kicker?.trim() && (
            <div className="text-[9.5px] uppercase tracking-[0.14em] text-slate-500 font-bold mb-0.5">
              {kicker.trim()}
            </div>
          )}
          <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight uppercase">
            {mainTitle}
          </h1>
          {subtitle?.trim() && (
            <div className="text-[11px] font-medium text-slate-600 mt-0.5">
              {subtitle.trim()}
            </div>
          )}
        </div>
        <div className="text-right text-[10px] text-slate-500 leading-snug">
          <div>
            <span className="uppercase tracking-wider font-semibold text-slate-400 mr-1">
              Date:
            </span>
            <span className="font-semibold text-slate-800">{displayDate}</span>
          </div>
          {details?.referenceNo?.trim() && (
            <div>
              <span className="uppercase tracking-wider font-semibold text-slate-400 mr-1">
                Reference:
              </span>
              <span className="font-semibold text-slate-800">
                {details.referenceNo.trim()}
              </span>
            </div>
          )}
          {details?.revision?.trim() && (
            <div>
              <span className="uppercase tracking-wider font-semibold text-slate-400 mr-1">
                Revision:
              </span>
              <span className="font-semibold text-slate-800">
                {details.revision.trim()}
              </span>
            </div>
          )}
        </div>
      </div>

      {metaItems.length > 0 && (
        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-x-4 gap-y-1.5 pt-2 border-t border-slate-200 text-[10.5px]">
          {metaItems.map((m) => (
            <div key={m.label} className="min-w-0">
              <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                {m.label}
              </span>
              <span className="block font-semibold text-slate-800 truncate">
                {m.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportSignoffFooter({
  details,
  fallbackPreparedBy,
  fallbackDate,
}: {
  details?: ReportDetailsSpec;
  fallbackPreparedBy?: string;
  fallbackDate?: string;
}) {
  const hasNotes = Boolean(details?.notes?.trim());
  const signatories = [
    {
      role: 'Prepared By',
      name: details?.preparedBy?.trim() || fallbackPreparedBy?.trim(),
      title: details?.preparedTitle?.trim(),
    },
    {
      role: 'Checked / Reviewed By',
      name: details?.checkedBy?.trim(),
      title: details?.checkedTitle?.trim(),
    },
    {
      role: 'Approved By',
      name: details?.approvedBy?.trim(),
      title: details?.approvedTitle?.trim(),
    },
  ].filter((sig) => Boolean(sig.name));

  if (!hasNotes && signatories.length === 0) {
    return null;
  }

  const rawDate =
    details?.reportDate?.trim() || fallbackDate?.trim() || new Date().toISOString().slice(0, 10);
  const displayDate = formatDateWithWeekday(rawDate);
  const gridColsClass =
    signatories.length === 1
      ? 'grid-cols-1 max-w-xs'
      : signatories.length === 2
        ? 'grid-cols-1 sm:grid-cols-2 print:grid-cols-2 max-w-2xl'
        : 'grid-cols-1 sm:grid-cols-3 print:grid-cols-3';

  return (
    <div className="break-inside-avoid pt-3 mt-4 border-t border-slate-300 space-y-3">
      {hasNotes && (
        <div className="bg-slate-50 border-l-2 border-slate-400 px-3 py-2 text-[10.5px] text-slate-700 whitespace-pre-line">
          <div className="text-[9.5px] uppercase tracking-wider font-bold text-slate-500 mb-0.5">
            Notes &amp; Remarks
          </div>
          {details?.notes?.trim()}
        </div>
      )}

      {signatories.length > 0 && (
        <div className={`grid ${gridColsClass} gap-6 pt-2 text-[10.5px]`}>
          {signatories.map((sig) => (
            <div key={sig.role} className="pt-1">
              <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 mb-5">
                {sig.role}
              </div>
              <div className="border-t border-slate-400 pt-1">
                <div className="font-bold text-slate-900 min-h-[15px]">{sig.name}</div>
                {sig.title && (
                  <div className="text-[9.5px] text-slate-500">{sig.title}</div>
                )}
                <div className="text-[9px] text-slate-400 mt-0.5">
                  Date: {displayDate}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

