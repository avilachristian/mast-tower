import { DEFAULT_SAFETY_OFFICER_NAME } from '@/entities/project/materialConstants';
import { formatDateWithWeekday } from '@/entities/project/calculations';
import { todayLocalIso } from '@/shared/lib/dateUtils';
import type { MastProjectState, ReportDetailsSpec } from '@/entities/project/types';
import { resolveReportLogos } from '@/shared/assets/defaultLogos';
import {
  applySignoffOverridesToDetails,
  useReportSignoffOverrides,
} from './ReportSignoffOverrideContext';

const PRINT_PAGE_STYLE_ID = 'mast-dynamic-print-page-style';

/**
 * Removes any legacy dynamic `@page { size: ... }` override so the browser's
 * native Print / Save as PDF dialog controls paper size and Portrait / Landscape
 * orientation directly without CSS conflicts.
 */
export function applyPrintPageStyle(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(PRINT_PAGE_STYLE_ID)?.remove();
}

export interface ReportPrintResult {
  status: 'completed' | 'failed';
  message: string;
  detail?: string;
}

/**
 * Temporarily sets `document.title` and opens the browser's native Print /
 * Save as PDF dialog without forcing a `@page` orientation override, while
 * reporting completion or failure (including blocked/unsupported WebViews).
 */
export function triggerReportPrint(
  documentTitle?: string,
  onResult?: (result: ReportPrintResult) => void,
  options?: { blockedTimeoutMs?: number }
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    onResult?.({
      status: 'failed',
      message: 'Browser printing is not available in this environment.',
    });
    return;
  }

  if (typeof window.print !== 'function') {
    onResult?.({
      status: 'failed',
      message: 'Browser print is not supported in this viewer.',
      detail:
        'Open this report in Chrome, Edge, or Safari to Print or Save as PDF.',
    });
    return;
  }

  applyPrintPageStyle();
  const previousTitle = document.title;
  const sanitized = (documentTitle ?? '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  if (sanitized) {
    document.title = sanitized;
  }

  let finished = false;
  let printSessionSeen = false;
  let blockedTimer: number | null = null;
  let mediaQueryList: MediaQueryList | null = null;

  const restoreTitle = () => {
    document.title = previousTitle;
  };

  const cleanup = () => {
    if (blockedTimer !== null) {
      window.clearTimeout(blockedTimer);
      blockedTimer = null;
    }
    window.removeEventListener('beforeprint', handleBeforePrint);
    window.removeEventListener('afterprint', handleAfterPrint);
    if (mediaQueryList) {
      mediaQueryList.removeEventListener?.('change', handleMediaChange);
    }
    restoreTitle();
  };

  const finishCompleted = () => {
    if (finished) return;
    finished = true;
    cleanup();
    onResult?.({
      status: 'completed',
      message:
        'Print dialog closed. Check your printer queue or saved PDF file.',
      detail:
        'Note: Browsers do not report whether Print/Save or Cancel was pressed inside the system dialog.',
    });
  };

  const finishFailed = (message: string, detail?: string) => {
    if (finished) return;
    finished = true;
    cleanup();
    onResult?.({
      status: 'failed',
      message,
      detail,
    });
  };

  function handleBeforePrint() {
    printSessionSeen = true;
    if (blockedTimer !== null) {
      window.clearTimeout(blockedTimer);
      blockedTimer = null;
    }
  }

  function handleAfterPrint() {
    printSessionSeen = true;
    finishCompleted();
  }

  function handleMediaChange(e: MediaQueryListEvent) {
    if (e.matches) {
      handleBeforePrint();
    } else if (printSessionSeen) {
      finishCompleted();
    }
  }

  window.addEventListener('beforeprint', handleBeforePrint);
  window.addEventListener('afterprint', handleAfterPrint);

  if (typeof window.matchMedia === 'function') {
    mediaQueryList = window.matchMedia('print');
    if (mediaQueryList?.matches) {
      printSessionSeen = true;
    }
    mediaQueryList?.addEventListener?.('change', handleMediaChange);
  }

  try {
    window.print();
  } catch (err) {
    finishFailed(
      err instanceof Error
        ? `Failed to open print dialog: ${err.message}`
        : 'Failed to open browser print dialog.',
      'Try opening this report in a full desktop or mobile browser to Print or Save as PDF.'
    );
    return;
  }

  // Some desktop browsers fire `afterprint` asynchronously on the next task;
  // restricted embedded WebViews may ignore `window.print()` with no events.
  if (!finished && !printSessionSeen) {
    const timeoutMs = options?.blockedTimeoutMs ?? 650;
    blockedTimer = window.setTimeout(() => {
      if (!finished && !printSessionSeen) {
        finishFailed(
          'Unable to open the print dialog in this browser or app viewer.',
          'Some embedded WebViews and standalone viewers block window.print(). Open this link in Chrome, Edge, or Safari to Print or Save as PDF.'
        );
      }
    }, timeoutMs);
  }
}

export function resolveMatchingPreparedSignature(
  project: Pick<MastProjectState, 'preparedBy' | 'reportDetails'>,
  candidateName?: string
): string | undefined {
  const sigUrl = project.reportDetails?.preparedSignatureUrl?.trim();
  if (!sigUrl) return undefined;
  const candidate = candidateName?.trim();
  if (!candidate) return sigUrl;
  const basePreparedBy =
    project.reportDetails?.preparedBy?.trim() || project.preparedBy?.trim() || '';
  return basePreparedBy && candidate.toLowerCase() === basePreparedBy.toLowerCase()
    ? sigUrl
    : undefined;
}

export function resolveReportDetails(
  project: Pick<
    MastProjectState,
    'projectName' | 'location' | 'preparedBy' | 'contractor' | 'lastUpdated' | 'reportDetails'
  >,
  overrides?: {
    reportDate?: string;
    preparedBy?: string;
    preparedSignatureUrl?: string;
  }
): ReportDetailsSpec {
  const base = project.reportDetails ?? {};
  const basePreparedBy = base.preparedBy?.trim() || project.preparedBy?.trim() || '';
  const overridePreparedBy = overrides?.preparedBy?.trim() || '';

  return {
    ...base,
    projectName: base.projectName?.trim() || project.projectName,
    projectLocation: base.projectLocation?.trim() || project.location,
    contractor: base.contractor?.trim() || project.contractor,
    preparedBy: overridePreparedBy || basePreparedBy,
    preparedSignatureUrl:
      overrides?.preparedSignatureUrl !== undefined
        ? overrides.preparedSignatureUrl.trim() || undefined
        : resolveMatchingPreparedSignature(project, overridePreparedBy),
    reportDate:
      overrides?.reportDate?.trim() || base.reportDate?.trim() || project.lastUpdated,
    safetyOfficerBy:
      base.safetyOfficerBy !== undefined
        ? base.safetyOfficerBy
        : DEFAULT_SAFETY_OFFICER_NAME,
    logos: resolveReportLogos(base.logos),
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
  const signoffOverrides = useReportSignoffOverrides();
  const effectiveDetails =
    applySignoffOverridesToDetails(details, signoffOverrides) ?? details;
  const logos = resolveReportLogos(effectiveDetails?.logos);
  const hasAnyLogo = Boolean(
    logos?.left?.dataUrl || logos?.center?.dataUrl || logos?.right?.dataUrl
  );
  const logoHeight = Math.min(110, Math.max(28, effectiveDetails?.logoHeightPx ?? 52));
  const projectName =
    effectiveDetails?.projectName?.trim() || fallbackProjectName?.trim() || '';
  const projectLocation =
    effectiveDetails?.projectLocation?.trim() || fallbackLocation?.trim() || '';
  const contractor =
    effectiveDetails?.contractor?.trim() || fallbackContractor?.trim() || '';
  const mainTitle = effectiveDetails?.documentTitle?.trim() || defaultTitle;
  const rawDate =
    effectiveDetails?.reportDate?.trim() ||
    fallbackDate?.trim() ||
    todayLocalIso();
  const displayDate = formatDateWithWeekday(rawDate);

  const metaItems: { label: string; value: string }[] = [
    ...(projectName ? [{ label: 'Project Name', value: projectName }] : []),
    ...(effectiveDetails?.clientName?.trim()
      ? [{ label: 'Client / Owner', value: effectiveDetails.clientName.trim() }]
      : []),
    ...(contractor ? [{ label: 'Contractor', value: contractor }] : []),
    ...(projectLocation ? [{ label: 'Location', value: projectLocation }] : []),
    ...(effectiveDetails?.referenceNo?.trim()
      ? [{ label: 'Reference / Dwg No.', value: effectiveDetails.referenceNo.trim() }]
      : []),
    ...(effectiveDetails?.revision?.trim()
      ? [{ label: 'Revision', value: effectiveDetails.revision.trim() }]
      : []),
    ...(effectiveDetails?.checkedBy?.trim()
      ? [{ label: 'Checked By', value: effectiveDetails.checkedBy.trim() }]
      : []),
  ];

  return (
    <div className="break-inside-avoid border-b-2 border-slate-900 pb-3 mb-3">
      {hasAnyLogo && (
        <div className="grid grid-cols-3 items-center gap-2 sm:gap-4 pdf-desktop:gap-4 pb-3 mb-3 border-b border-slate-200">
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
          <h1 className="text-base sm:text-lg pdf-desktop:text-lg font-bold text-slate-900 leading-tight uppercase">
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
        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 pdf-desktop:grid-cols-4 print:grid-cols-4 gap-x-4 gap-y-1.5 pt-2 border-t border-slate-200 text-[10.5px]">
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
  const signoffOverrides = useReportSignoffOverrides();
  const effectiveDetails = applySignoffOverridesToDetails(
    details,
    signoffOverrides,
    fallbackPreparedBy
  );
  const hasNotes = Boolean(effectiveDetails?.notes?.trim());
  const resolvedPreparedName =
    signoffOverrides?.prepared?.name !== undefined
      ? effectiveDetails?.preparedBy?.trim()
      : effectiveDetails?.preparedBy?.trim() || fallbackPreparedBy?.trim();
  const signatories = [
    {
      role: 'Prepared By',
      name: resolvedPreparedName,
      title: effectiveDetails?.preparedTitle?.trim(),
      signatureUrl: effectiveDetails?.preparedSignatureUrl?.trim() || undefined,
    },
    {
      role: 'Checked / Reviewed By',
      name: effectiveDetails?.checkedBy?.trim(),
      title: effectiveDetails?.checkedTitle?.trim(),
      signatureUrl: effectiveDetails?.checkedSignatureUrl?.trim() || undefined,
    },
    {
      role: 'Approved By',
      name: effectiveDetails?.approvedBy?.trim(),
      title: effectiveDetails?.approvedTitle?.trim(),
      signatureUrl: effectiveDetails?.approvedSignatureUrl?.trim() || undefined,
    },
    {
      role: 'Safety Officer',
      name: effectiveDetails?.safetyOfficerBy?.trim(),
      title: 'Safety Officer',
      signatureUrl: undefined,
    },
  ].filter((sig) => Boolean(sig.name || sig.signatureUrl));

  if (!hasNotes && signatories.length === 0) {
    return null;
  }

  const rawDate =
    details?.reportDate?.trim() || fallbackDate?.trim() || todayLocalIso();
  const displayDate = formatDateWithWeekday(rawDate);
  const gridColsClass =
    signatories.length === 1
      ? 'grid-cols-1 max-w-xs'
      : signatories.length === 2
        ? 'grid-cols-1 sm:grid-cols-2 pdf-desktop:grid-cols-2 print:grid-cols-2 max-w-2xl'
        : 'grid-cols-1 sm:grid-cols-3 pdf-desktop:grid-cols-3 print:grid-cols-3';

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
            <div key={sig.role} className="pt-1 flex flex-col">
              <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                {sig.role}
              </div>
              <div className="h-11 flex items-end pb-1">
                {sig.signatureUrl ? (
                  <img
                    src={sig.signatureUrl}
                    alt={`${sig.role} signature`}
                    className="max-h-10 max-w-[160px] w-auto object-contain"
                  />
                ) : null}
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

/**
 * Flush boxed sign-off strip shared by Foundation and Vertical Mast Inspection sheets.
 * Omits Verified By when blank and renders blank space above the line when no signature image is uploaded.
 */
export function InspectionSignoffRow({
  inspectorLabel,
  inspectorName,
  inspectorSignatureUrl,
  verifiedBy,
  verifiedSignatureUrl,
  inspectionDate,
}: {
  inspectorLabel: string;
  inspectorName: string;
  inspectorSignatureUrl?: string;
  verifiedBy?: string;
  verifiedSignatureUrl?: string;
  inspectionDate: string;
}) {
  const trimmedVerified = verifiedBy?.trim() || '';
  return (
    <div
      className={`grid grid-cols-1 ${
        trimmedVerified
          ? 'sm:grid-cols-3 pdf-desktop:grid-cols-3 print:grid-cols-3'
          : 'sm:grid-cols-2 pdf-desktop:grid-cols-2 print:grid-cols-2'
      } divide-y sm:divide-y-0 sm:divide-x pdf-desktop:divide-y-0 pdf-desktop:divide-x print:divide-y-0 print:divide-x divide-slate-900 text-[11px]`}
    >
      <div className="p-2.5 flex flex-col">
        <div className="text-[10px] font-bold uppercase text-slate-500">
          {inspectorLabel}
        </div>
        <div className="h-10 flex items-end pb-0.5 mt-1">
          {inspectorSignatureUrl ? (
            <img
              src={inspectorSignatureUrl}
              alt="Inspector signature"
              className="max-h-9 max-w-[160px] w-auto object-contain"
            />
          ) : null}
        </div>
        <div className="pt-1 border-t border-slate-400 font-semibold text-slate-900">
          {inspectorName || '—'}
        </div>
      </div>
      {trimmedVerified && (
        <div className="p-2.5 flex flex-col">
          <div className="text-[10px] font-bold uppercase text-slate-500">
            Verified By
          </div>
          <div className="h-10 flex items-end pb-0.5 mt-1">
            {verifiedSignatureUrl ? (
              <img
                src={verifiedSignatureUrl}
                alt="Verifier signature"
                className="max-h-9 max-w-[160px] w-auto object-contain"
              />
            ) : null}
          </div>
          <div className="pt-1 border-t border-slate-400 font-semibold text-slate-900">
            {trimmedVerified}
          </div>
        </div>
      )}
      <div className="p-2.5 flex flex-col">
        <div className="text-[10px] font-bold uppercase text-slate-500">
          Date Inspected
        </div>
        <div className="h-10 mt-1" />
        <div className="pt-1 border-t border-slate-400 font-semibold text-slate-900">
          {formatDateWithWeekday(inspectionDate)}
        </div>
      </div>
    </div>
  );
}

