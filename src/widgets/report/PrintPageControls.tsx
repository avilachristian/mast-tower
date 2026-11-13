import { useEffect, type ReactNode, type RefObject } from 'react';
import { Printer, X } from 'lucide-react';
import { applyPrintPageStyle, triggerReportPrint } from './ReportLetterhead';

const DEFAULT_PREVIEW_WIDTH_PX = 900;

/**
 * Provides consistent desktop preview sheet sizing for print preview modals
 * while clearing any stale dynamic `@page` orientation overrides so the
 * browser print dialog controls Portrait / Landscape layout natively.
 */
export function usePrintPageSetup(active = true) {
  useEffect(() => {
    if (!active) return;
    applyPrintPageStyle();
  }, [active]);

  return {
    dialogMaxWidthClass: 'max-w-5xl',
    sheetWidthPx: DEFAULT_PREVIEW_WIDTH_PX,
  };
}

/**
 * Shared report modal action bar exposing native browser Print / Save as PDF.
 */
export function ReportToolbarActions({
  documentTitle,
}: {
  targetRef?: RefObject<HTMLElement | null>;
  documentTitle: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => triggerReportPrint(documentTitle)}
        className="inline-flex items-center justify-center gap-1.5 min-h-10 sm:min-h-9 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer shadow-2xs transition"
        title="Open browser Print / Save as PDF dialog"
      >
        <Printer className="w-3.5 h-3.5 shrink-0" />
        <span>Print</span>
      </button>
    </div>
  );
}

export interface PrintModalHeaderProps {
  title: string;
  subtitle?: string;
  titleExtra?: ReactNode;
  extraActions?: ReactNode;
  targetRef?: RefObject<HTMLElement | null>;
  documentTitle: string;
  onClose: () => void;
}

export function PrintModalHeader({
  title,
  subtitle,
  titleExtra,
  extraActions,
  documentTitle,
  onClose,
}: PrintModalHeaderProps) {
  const actionButtons = (
    <>
      {extraActions}
      <button
        type="button"
        onClick={() => triggerReportPrint(documentTitle)}
        className="inline-flex items-center justify-center gap-1.5 min-h-10 sm:min-h-9 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 shadow-2xs transition-colors cursor-pointer"
        title="Open browser Print / Save as PDF dialog"
      >
        <Printer className="w-3.5 h-3.5 shrink-0" />
        <span>Print</span>
      </button>
    </>
  );

  return (
    <div className="sticky top-0 z-20 px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-100/95 backdrop-blur-sm border-b border-slate-200 text-slate-900 shrink-0 no-print print:hidden">
      {/* Row 1: Title/Switcher on Left, Desktop Actions + Pinned Top-Right Close Button on Right */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-snug">
                {subtitle}
              </p>
            )}
          </div>
          {titleExtra && <div className="w-full sm:w-auto shrink-0">{titleExtra}</div>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-2">{actionButtons}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close print preview"
            title="Close"
            className="shrink-0 h-10 w-10 sm:h-9 sm:w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 shadow-2xs transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile Action Row */}
      <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-end gap-2 sm:hidden">
        {actionButtons}
      </div>
    </div>
  );
}
