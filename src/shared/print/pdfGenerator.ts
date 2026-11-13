import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import type { PrintOrientation, PrintPaperSize } from '@/shared/state/uiStore';

export interface PdfPageDimensionsMm {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  contentWidthMm: number;
  contentHeightMm: number;
  jsPdfFormat: 'a4' | 'a3' | 'letter' | 'legal';
}

const PAPER_BASE_MM: Record<
  PrintPaperSize,
  { width: number; height: number; format: 'a4' | 'a3' | 'letter' | 'legal'; marginMm: number }
> = {
  A4: { width: 210, height: 297, format: 'a4', marginMm: 10 },
  A3: { width: 297, height: 420, format: 'a3', marginMm: 12 },
  letter: { width: 215.9, height: 279.4, format: 'letter', marginMm: 10 },
  legal: { width: 215.9, height: 355.6, format: 'legal', marginMm: 10 },
};

/**
 * Returns exact page and printable-area dimensions in millimeters for the
 * chosen paper size and orientation.
 */
export function getPdfPageDimensionsMm(
  paperSize: PrintPaperSize = 'A4',
  orientation: PrintOrientation = 'portrait'
): PdfPageDimensionsMm {
  const base = PAPER_BASE_MM[paperSize] ?? PAPER_BASE_MM.A4;
  const widthMm =
    orientation === 'landscape'
      ? Math.max(base.width, base.height)
      : Math.min(base.width, base.height);
  const heightMm =
    orientation === 'landscape'
      ? Math.min(base.width, base.height)
      : Math.max(base.width, base.height);

  return {
    widthMm,
    heightMm,
    marginMm: base.marginMm,
    contentWidthMm: widthMm - base.marginMm * 2,
    contentHeightMm: heightMm - base.marginMm * 2,
    jsPdfFormat: base.format,
  };
}

/** Sanitizes a document title into a safe `.pdf` filename. */
export function sanitizePdfFilename(documentTitle?: string): string {
  const cleaned = (documentTitle ?? 'mast-tower-report')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const base = cleaned || 'mast-tower-report';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

export interface PdfSliceRange {
  startPx: number;
  endPx: number;
}

/**
 * Computes clean vertical slice ranges (`startPx` -> `endPx` in DOM px) across
 * a tall printable sheet so page breaks prefer natural block/row boundaries
 * rather than cutting through text lines, table rows, or site photos.
 */
export function computeSmartPdfPageBreaks(
  totalHeightPx: number,
  pageContentHeightPx: number,
  avoidCutIntervals: Array<{ topPx: number; bottomPx: number }> = []
): PdfSliceRange[] {
  if (totalHeightPx <= 0 || pageContentHeightPx <= 0) {
    return [{ startPx: 0, endPx: Math.max(1, totalHeightPx) }];
  }

  // Avoid creating a near-empty trailing page when content only overflows slightly (<= 5%).
  if (totalHeightPx <= pageContentHeightPx * 1.05) {
    return [{ startPx: 0, endPx: totalHeightPx }];
  }

  const slices: PdfSliceRange[] = [];
  const minStepPx = pageContentHeightPx * 0.45;
  let cursor = 0;

  while (cursor < totalHeightPx - 1) {
    const remaining = totalHeightPx - cursor;
    if (remaining <= pageContentHeightPx * 1.04) {
      slices.push({ startPx: cursor, endPx: totalHeightPx });
      break;
    }

    const rawCut = cursor + pageContentHeightPx;
    let bestCut = rawCut;

    // Look for an interval (table row / card / image) that rawCut slices through
    // and snap the page break cleanly right above it when doing so leaves enough page fill.
    const straddling = avoidCutIntervals.filter(
      (box) =>
        box.topPx > cursor + minStepPx &&
        box.topPx < rawCut &&
        box.bottomPx > rawCut &&
        box.bottomPx - box.topPx < pageContentHeightPx * 0.85
    );

    if (straddling.length > 0) {
      const earliestTop = Math.min(...straddling.map((b) => b.topPx));
      if (earliestTop - cursor >= minStepPx) {
        bestCut = earliestTop;
      }
    }

    // Safety guard so cursor always moves strictly forward.
    if (bestCut <= cursor + 16) {
      bestCut = Math.min(totalHeightPx, rawCut);
    }

    slices.push({ startPx: cursor, endPx: bestCut });
    cursor = bestCut;
  }

  return slices;
}

/**
 * Collects vertical bounding intervals (relative to `root`) of atomic elements
 * that should not be sliced in half across PDF page boundaries.
 */
function collectAtomicBlockIntervals(
  root: HTMLElement
): Array<{ topPx: number; bottomPx: number }> {
  const rootRect = root.getBoundingClientRect();
  const candidates = root.querySelectorAll<HTMLElement>(
    'tr, img, svg, [data-pdf-block], .pdf-avoid-break'
  );
  const intervals: Array<{ topPx: number; bottomPx: number }> = [];

  candidates.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) return;
    intervals.push({
      topPx: Math.max(0, rect.top - rootRect.top),
      bottomPx: Math.max(0, rect.bottom - rootRect.top),
    });
  });

  return intervals;
}

/**
 * Generates and directly downloads a `.pdf` file from a printable DOM sheet
 * using the exact configured paper size and orientation — bypassing the
 * browser's native print dialog completely.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  options: {
    documentTitle?: string;
    paperSize: PrintPaperSize;
    orientation: PrintOrientation;
  }
): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    await document.fonts.ready;
  }

  const dims = getPdfPageDimensionsMm(options.paperSize, options.orientation);
  const filename = sanitizePdfFilename(options.documentTitle);

  // Measure target render width so desktop/print grids render consistently
  // according to the chosen paper size & orientation regardless of small viewport widths.
  const targetCaptureWidthPx =
    options.orientation === 'landscape'
      ? options.paperSize === 'A3' || options.paperSize === 'legal'
        ? 1280
        : 1120
      : options.paperSize === 'A3'
        ? 1060
        : 900;

  const prevWidth = element.style.width;
  const prevMinWidth = element.style.minWidth;
  const prevMaxWidth = element.style.maxWidth;
  const prevBackground = element.style.backgroundColor;

  const needsTemporaryResize = element.clientWidth < targetCaptureWidthPx - 40;
  if (needsTemporaryResize) {
    element.style.width = `${targetCaptureWidthPx}px`;
    element.style.minWidth = `${targetCaptureWidthPx}px`;
    element.style.maxWidth = `${targetCaptureWidthPx}px`;
  }
  element.style.backgroundColor = '#ffffff';

  try {
    // Allow browser layout to flush if temporarily resized.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

    const domWidth = Math.max(1, element.scrollWidth);
    const domHeight = Math.max(1, element.scrollHeight);
    const avoidCutIntervals = collectAtomicBlockIntervals(element);

    const pixelRatio = Math.min(2.5, Math.max(2, window.devicePixelRatio || 2));
    const sourceCanvas = await toCanvas(element, {
      backgroundColor: '#ffffff',
      pixelRatio,
      width: domWidth,
      height: domHeight,
      cacheBust: false,
      style: {
        margin: '0',
      },
    });

    const scaleX = sourceCanvas.width / domWidth;
    const scaleY = sourceCanvas.height / domHeight;
    const mmPerDomPx = dims.contentWidthMm / domWidth;
    const pageContentHeightDomPx = dims.contentHeightMm / mmPerDomPx;

    const slices = computeSmartPdfPageBreaks(
      domHeight,
      pageContentHeightDomPx,
      avoidCutIntervals
    );

    const pdf = new jsPDF({
      orientation: options.orientation,
      unit: 'mm',
      format: dims.jsPdfFormat,
      compress: true,
    });

    const sliceCanvas = document.createElement('canvas');
    const sliceCtx = sliceCanvas.getContext('2d');

    slices.forEach((slice, index) => {
      if (index > 0) {
        pdf.addPage(dims.jsPdfFormat, options.orientation);
      }

      const sliceDomHeight = Math.max(1, slice.endPx - slice.startPx);
      const srcY = Math.max(0, Math.round(slice.startPx * scaleY));
      const srcH = Math.min(
        sourceCanvas.height - srcY,
        Math.max(1, Math.round(sliceDomHeight * scaleY))
      );

      sliceCanvas.width = Math.max(1, Math.round(domWidth * scaleX));
      sliceCanvas.height = Math.max(1, srcH);

      if (sliceCtx) {
        sliceCtx.fillStyle = '#ffffff';
        sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sliceCtx.drawImage(
          sourceCanvas,
          0,
          srcY,
          sliceCanvas.width,
          srcH,
          0,
          0,
          sliceCanvas.width,
          srcH
        );
      }

      // Compute rendered image dimensions in mm preserving aspect ratio,
      // clamping height cleanly within printable height if single-page fit kicked in.
      let drawWidthMm = dims.contentWidthMm;
      let drawHeightMm = sliceDomHeight * mmPerDomPx;
      if (drawHeightMm > dims.contentHeightMm) {
        const fitRatio = dims.contentHeightMm / drawHeightMm;
        drawHeightMm = dims.contentHeightMm;
        drawWidthMm = drawWidthMm * fitRatio;
      }

      const xOffsetMm = dims.marginMm + (dims.contentWidthMm - drawWidthMm) / 2;
      const imgData = sliceCanvas.toDataURL('image/png');
      pdf.addImage(
        imgData,
        'PNG',
        xOffsetMm,
        dims.marginMm,
        drawWidthMm,
        drawHeightMm,
        undefined,
        'FAST'
      );

      if (slices.length > 1) {
        pdf.setFontSize(8);
        pdf.setTextColor(120, 130, 145);
        pdf.text(
          `Page ${index + 1} of ${slices.length}`,
          dims.widthMm - dims.marginMm,
          dims.heightMm - 4.5,
          { align: 'right' }
        );
      }
    });

    pdf.save(filename);
  } finally {
    element.style.width = prevWidth;
    element.style.minWidth = prevMinWidth;
    element.style.maxWidth = prevMaxWidth;
    element.style.backgroundColor = prevBackground;
  }
}

