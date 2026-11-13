import { useEffect, useState, type RefObject } from 'react';
import {
  FileDown,
  FileText,
  Loader2,
  Printer,
  RectangleHorizontal,
  RectangleVertical,
} from 'lucide-react';
import {
  exportElementToPdf,
  getPdfCaptureWidthPx,
} from '@/shared/print/pdfGenerator';
import {
  useUiStore,
  type PrintOrientation,
  type PrintPaperSize,
} from '@/shared/state/uiStore';
import { applyPrintPageStyle, triggerReportPrint } from './ReportLetterhead';

export const PRINT_PAPER_OPTIONS: {
  id: PrintPaperSize;
  label: string;
  dimensions: string;
}[] = [
  { id: 'A4', label: 'A4', dimensions: '210 × 297 mm' },
  { id: 'A3', label: 'A3', dimensions: '297 × 420 mm' },
  { id: 'letter', label: 'Letter', dimensions: '8.5 × 11 in' },
  { id: 'legal', label: 'Legal', dimensions: '8.5 × 14 in' },
];

/** Returns a responsive modal preview max-width class matching paper size & orientation. */
export function getPrintDialogMaxWidthClass(
  paperSize: PrintPaperSize,
  orientation: PrintOrientation
): string {
  if (orientation === 'landscape') {
    return paperSize === 'A3' || paperSize === 'legal' ? 'max-w-[1360px]' : 'max-w-[1200px]';
  }
  return paperSize === 'A3' ? 'max-w-[1140px]' : 'max-w-5xl';
}

/** Syncs the global `<style>` `@page` rule whenever print page settings change while a modal is open. */
export function usePrintPageSetup(active = true) {
  const paperSize = useUiStore((s) => s.printPaperSize);
  const orientation = useUiStore((s) => s.printOrientation);
  const setPaperSize = useUiStore((s) => s.setPrintPaperSize);
  const setOrientation = useUiStore((s) => s.setPrintOrientation);

  useEffect(() => {
    if (!active) return;
    applyPrintPageStyle(paperSize, orientation);
  }, [active, paperSize, orientation]);

  return {
    paperSize,
    orientation,
    setPaperSize,
    setOrientation,
    dialogMaxWidthClass: getPrintDialogMaxWidthClass(paperSize, orientation),
    sheetWidthPx: getPdfCaptureWidthPx(paperSize, orientation),
  };
}

/** Compact Paper Size + Orientation selector bar embedded in Print Modal toolbars. */
export function PrintPageControls() {
  const { paperSize, orientation, setPaperSize, setOrientation } = usePrintPageSetup(true);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
        <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <select
          aria-label="Paper size"
          value={paperSize}
          onChange={(e) => setPaperSize(e.target.value as PrintPaperSize)}
          className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
        >
          {PRINT_PAPER_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label} ({opt.dimensions})
            </option>
          ))}
        </select>
      </label>

      <div
        className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5 text-[11px] font-semibold"
        role="group"
        aria-label="Page orientation"
      >
        <button
          type="button"
          onClick={() => setOrientation('portrait')}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm transition cursor-pointer ${
            orientation === 'portrait'
              ? 'bg-white text-sky-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Portrait orientation"
        >
          <RectangleVertical className="w-3.5 h-3.5" />
          Portrait
        </button>
        <button
          type="button"
          onClick={() => setOrientation('landscape')}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm transition cursor-pointer ${
            orientation === 'landscape'
              ? 'bg-white text-sky-700 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Landscape orientation"
        >
          <RectangleHorizontal className="w-3.5 h-3.5" />
          Landscape
        </button>
      </div>
    </div>
  );
}

/**
 * Shared report modal action bar combining paper/orientation controls,
 * a direct client-side `.pdf` creator (bypassing the browser print dialog),
 * and a secondary system Print button.
 */
export function ReportToolbarActions({
  targetRef,
  documentTitle,
}: {
  targetRef: RefObject<HTMLElement | null>;
  documentTitle: string;
}) {
  const { paperSize, orientation } = usePrintPageSetup(true);
  const [exporting, setExporting] = useState(false);

  const handleDownloadPdf = async () => {
    const el = targetRef.current;
    if (!el || exporting) return;
    setExporting(true);
    try {
      await exportElementToPdf(el, {
        documentTitle,
        paperSize,
        orientation,
      });
    } catch (err) {
      window.alert(
        err instanceof Error
          ? `Failed to generate PDF: ${err.message}`
          : 'Failed to generate PDF.'
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PrintPageControls />
      <button
        type="button"
        onClick={handleDownloadPdf}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-xs font-semibold cursor-pointer disabled:cursor-wait shadow-xs transition"
        title={`Create and download ${paperSize} ${orientation} PDF directly`}
      >
        {exporting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileDown className="w-3.5 h-3.5" />
        )}
        {exporting ? 'Creating PDF...' : 'Download PDF'}
      </button>
      <button
        type="button"
        onClick={() => triggerReportPrint(documentTitle, { paperSize, orientation })}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer transition"
        title="Open system print dialog"
      >
        <Printer className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Print</span>
      </button>
    </div>
  );
}

