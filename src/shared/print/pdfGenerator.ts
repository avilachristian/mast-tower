import { jsPDF } from 'jspdf';
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
 * Returns a consistent desktop capture/render width in CSS pixels for the chosen
 * paper size and orientation so PDFs always render with desktop proportions.
 */
export function getPdfCaptureWidthPx(
  paperSize: PrintPaperSize = 'A4',
  orientation: PrintOrientation = 'portrait'
): number {
  if (orientation === 'landscape') {
    return paperSize === 'A3' || paperSize === 'legal' ? 1280 : 1120;
  }
  return paperSize === 'A3' ? 1060 : 900;
}

interface ResolvedRgba {
  r: number;
  g: number;
  b: number;
  a: number;
  hex: string;
}

interface PdfBorderEdge {
  widthPx: number;
  color: ResolvedRgba;
}

type PdfRenderOp =
  | {
      type: 'boxFill';
      topPx: number;
      bottomPx: number;
      leftPx: number;
      widthPx: number;
      color: ResolvedRgba;
      radiusPx: number;
    }
  | {
      type: 'boxBorders';
      topPx: number;
      bottomPx: number;
      leftPx: number;
      widthPx: number;
      top: PdfBorderEdge | null;
      right: PdfBorderEdge | null;
      bottom: PdfBorderEdge | null;
      left: PdfBorderEdge | null;
    }
  | {
      type: 'text';
      topPx: number;
      bottomPx: number;
      leftPx: number;
      widthPx: number;
      text: string;
      fontSizePx: number;
      fontWeight: string;
      fontStyle: string;
      isMonospace: boolean;
      color: ResolvedRgba;
    }
  | {
      type: 'image';
      topPx: number;
      bottomPx: number;
      leftPx: number;
      widthPx: number;
      heightPx: number;
      element: HTMLImageElement;
      objectFit: string;
    }
  | {
      type: 'svg';
      topPx: number;
      bottomPx: number;
      leftPx: number;
      widthPx: number;
      heightPx: number;
      sourceSvg: SVGSVGElement;
      preparedSvg: SVGSVGElement;
    };

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

/** Composites an RGBA color cleanly against white `#ffffff` for crisp vector PDF fills/strokes. */
function blendOnWhite(c: ResolvedRgba): [number, number, number] {
  if (c.a >= 0.995) {
    return [c.r, c.g, c.b];
  }
  const a = Math.max(0, Math.min(1, c.a));
  return [
    Math.round(c.r * a + 255 * (1 - a)),
    Math.round(c.g * a + 255 * (1 - a)),
    Math.round(c.b * a + 255 * (1 - a)),
  ];
}

/**
 * Normalizes characters outside jsPDF's WinAnsi Helvetica encoding into clean ASCII/Latin1
 * equivalents so symbols render accurately as selectable vector text.
 */
export function normalizePdfText(input: string): string {
  if (!input) return '';
  let out = input
    .replace(/\u00A0/g, ' ')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2260/g, '!=')
    .replace(/\u2248/g, '~=')
    .replace(/[\u2713\u2714\u2611]/g, '[OK]')
    .replace(/[\u2715\u2716\u2717\u2718]/g, '[X]')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2191/g, '^')
    .replace(/\u2193/g, 'v')
    .replace(/\u20B1/g, 'PHP ')
    .replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, '');

  // Keep ASCII, Latin-1 (<= U+00FF), and supported WinAnsi punctuation
  const WIN_ANSI_EXTRAS = new Set([
    0x2013, // –
    0x2014, // —
    0x2018, // ‘
    0x2019, // ’
    0x201c, // “
    0x201d, // ”
    0x2022, // •
    0x2026, // …
    0x20ac, // €
    0x2122, // ™
  ]);

  let safe = '';
  for (const ch of out) {
    const cp = ch.codePointAt(0) ?? 32;
    if (cp <= 0x00ff || WIN_ANSI_EXTRAS.has(cp)) {
      safe += ch;
    } else {
      safe += '-';
    }
  }
  out = safe;
  return out;
}

function createCssColorResolver(): (cssColor: string) => ResolvedRgba | null {
  const cache = new Map<string, ResolvedRgba | null>();
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgbRegex =
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/i;

  return (rawColor: string): ResolvedRgba | null => {
    const key = rawColor.trim();
    if (!key || key === 'none' || key === 'transparent' || /^url\(/i.test(key)) {
      return null;
    }
    if (cache.has(key)) {
      return cache.get(key) ?? null;
    }

    const rgbMatch = rgbRegex.exec(key);
    if (rgbMatch) {
      const r = Math.round(Number(rgbMatch[1]));
      const g = Math.round(Number(rgbMatch[2]));
      const b = Math.round(Number(rgbMatch[3]));
      let a = 1;
      if (rgbMatch[4] !== undefined) {
        a = rgbMatch[4].endsWith('%')
          ? parseFloat(rgbMatch[4]) / 100
          : parseFloat(rgbMatch[4]);
      }
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a) || a <= 0.004) {
        cache.set(key, null);
        return null;
      }
      const resolved: ResolvedRgba = { r, g, b, a, hex: rgbToHex(r, g, b) };
      cache.set(key, resolved);
      return resolved;
    }

    if (!ctx) {
      cache.set(key, null);
      return null;
    }

    // Verify with dual sentinels so unparseable paints (e.g. gradients/urls) never silently fall back to #000000
    ctx.fillStyle = '#010203';
    ctx.fillStyle = key;
    const assignedA = ctx.fillStyle;
    ctx.fillStyle = '#040506';
    ctx.fillStyle = key;
    const assignedB = ctx.fillStyle;
    if (assignedA === '#010203' && assignedB === '#040506') {
      cache.set(key, null);
      return null;
    }

    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const alpha = data[3] / 255;
    if (alpha <= 0.004) {
      cache.set(key, null);
      return null;
    }
    const resolved: ResolvedRgba = {
      r: data[0],
      g: data[1],
      b: data[2],
      a: alpha,
      hex: rgbToHex(data[0], data[1], data[2]),
    };
    cache.set(key, resolved);
    return resolved;
  };
}

function applyCssTextTransform(text: string, transform: string): string {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return text;
  }
}

function collapseTextForCss(raw: string, whiteSpace: string): string {
  const preserveNewlines =
    whiteSpace === 'pre' || whiteSpace === 'pre-wrap' || whiteSpace === 'break-spaces';
  const preserveSpaces = preserveNewlines || whiteSpace === 'pre-line';
  if (preserveNewlines) {
    return raw.replace(/\t/g, '  ');
  }
  if (preserveSpaces) {
    return raw.replace(/[ \t\r\f]+/g, ' ');
  }
  return raw.replace(/\s+/g, ' ');
}

function extractTextLineOps(
  textNode: Text,
  style: CSSStyleDeclaration,
  rootRect: DOMRect,
  color: ResolvedRgba,
  ops: PdfRenderOp[]
): void {
  const raw = textNode.nodeValue ?? '';
  if (!raw || !raw.trim()) return;

  const range = document.createRange();
  range.selectNodeContents(textNode);
  const fullRects = Array.from(range.getClientRects()).filter(
    (r) => r.width > 0.25 && r.height > 0.25
  );
  if (fullRects.length === 0) return;

  const fontSizePx = Math.max(5, parseFloat(style.fontSize) || 12);
  const fontWeight = style.fontWeight || '400';
  const fontStyle = style.fontStyle || 'normal';
  const isMonospace = /\b(mono|consolas|courier|menlo|ui-monospace)\b/i.test(
    style.fontFamily || ''
  );
  const textTransform = style.textTransform || 'none';
  const whiteSpace = style.whiteSpace || 'normal';

  const emitLine = (text: string, top: number, bottom: number, left: number, width: number) => {
    const clean = normalizePdfText(applyCssTextTransform(text, textTransform)).trim();
    if (!clean) return;
    ops.push({
      type: 'text',
      topPx: Math.max(0, top - rootRect.top),
      bottomPx: Math.max(0, bottom - rootRect.top),
      leftPx: Math.max(0, left - rootRect.left),
      widthPx: Math.max(1, width),
      text: clean,
      fontSizePx,
      fontWeight,
      fontStyle,
      isMonospace,
      color,
    });
  };

  // Fast path: single visual line
  if (fullRects.length === 1) {
    const single = collapseTextForCss(raw, whiteSpace).trim();
    if (single) {
      const r = fullRects[0];
      emitLine(single, r.top, r.bottom, r.left, r.width);
    }
    return;
  }

  // Multi-line wrapped or newline-separated text: map tokens onto visual Y bands
  interface VisualLineBucket {
    top: number;
    bottom: number;
    left: number;
    right: number;
    parts: string[];
  }
  const buckets: VisualLineBucket[] = [];
  const tokenRegex = /\S+|\s+/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(raw)) !== null) {
    const token = match[0];
    const startIdx = match.index;
    const endIdx = startIdx + token.length;

    if (!token.trim()) {
      // Preserve inter-word spacing inside the current line bucket if non-empty
      if (buckets.length > 0 && !token.includes('\n')) {
        buckets[buckets.length - 1].parts.push(' ');
      }
      continue;
    }

    range.setStart(textNode, startIdx);
    range.setEnd(textNode, endIdx);
    const tokenRects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 0.25 && r.height > 0.25
    );
    if (tokenRects.length === 0) continue;

    // Usually a single word occupies 1 rect; if a long word broke mid-word across lines, fall back per-char
    if (tokenRects.length === 1) {
      const r = tokenRects[0];
      const last = buckets[buckets.length - 1];
      if (last && Math.abs(r.top - last.top) <= Math.max(3, fontSizePx * 0.35)) {
        last.parts.push(token);
        last.left = Math.min(last.left, r.left);
        last.right = Math.max(last.right, r.right);
        last.top = Math.min(last.top, r.top);
        last.bottom = Math.max(last.bottom, r.bottom);
      } else {
        buckets.push({
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          parts: [token],
        });
      }
    } else {
      for (let i = startIdx; i < endIdx; i++) {
        range.setStart(textNode, i);
        range.setEnd(textNode, i + 1);
        const charRects = Array.from(range.getClientRects()).filter(
          (r) => r.width > 0.1 && r.height > 0.1
        );
        if (charRects.length === 0) continue;
        const r = charRects[0];
        const last = buckets[buckets.length - 1];
        if (last && Math.abs(r.top - last.top) <= Math.max(3, fontSizePx * 0.35)) {
          last.parts.push(raw[i]);
          last.left = Math.min(last.left, r.left);
          last.right = Math.max(last.right, r.right);
          last.top = Math.min(last.top, r.top);
          last.bottom = Math.max(last.bottom, r.bottom);
        } else {
          buckets.push({
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
            parts: [raw[i]],
          });
        }
      }
    }
  }

  for (const b of buckets) {
    const joined = collapseTextForCss(b.parts.join(''), whiteSpace).trim();
    if (joined) {
      emitLine(joined, b.top, b.bottom, b.left, Math.max(1, b.right - b.left));
    }
  }
}

/**
 * Clones an inline DOM `<svg>` element and resolves all Tailwind/CSS colors (including
 * `oklch()` / `currentColor` / CSS vars) into explicit `#rrggbb` SVG attributes for vector `svg2pdf.js`.
 */
function prepareSvgForPdf(
  origSvg: SVGSVGElement,
  rect: DOMRect,
  resolveColor: (css: string) => ResolvedRgba | null
): SVGSVGElement {
  const clone = origSvg.cloneNode(true) as SVGSVGElement;
  const origAll: Element[] = [origSvg, ...Array.from(origSvg.querySelectorAll('*'))];
  const cloneAll: Element[] = [clone, ...Array.from(clone.querySelectorAll('*'))];

  const NON_RENDERED_TAGS = new Set([
    'defs',
    'pattern',
    'lineargradient',
    'radialgradient',
    'clippath',
    'mask',
    'marker',
    'stop',
  ]);
  const SHAPE_OR_TEXT_TAGS = new Set([
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'tspan',
  ]);

  const extractUrlFragment = (val: string | null | undefined): string | null => {
    if (!val) return null;
    const trimmed = val.trim();
    if (!/^url\(/i.test(trimmed)) return null;
    const hashMatch = /#([^'")\s]+)/.exec(trimmed);
    return hashMatch ? `url(#${hashMatch[1]})` : null;
  };

  for (let i = 0; i < origAll.length && i < cloneAll.length; i++) {
    const origEl = origAll[i];
    const cloneEl = cloneAll[i];
    const tag = cloneEl.tagName.toLowerCase();
    const cs = window.getComputedStyle(origEl);

    cloneEl.removeAttribute('class');
    cloneEl.removeAttribute('style');

    if (NON_RENDERED_TAGS.has(tag)) {
      continue;
    }

    if (cs.display === 'none' || cs.visibility === 'hidden') {
      cloneEl.setAttribute('opacity', '0');
      continue;
    }

    const opacity = parseFloat(cs.opacity);
    if (!Number.isNaN(opacity) && opacity < 0.995) {
      cloneEl.setAttribute('opacity', opacity.toFixed(3));
    }

    if (!SHAPE_OR_TEXT_TAGS.has(tag)) {
      continue;
    }

    const fillUrl =
      extractUrlFragment(origEl.getAttribute('fill')) ?? extractUrlFragment(cs.fill);
    if (fillUrl) {
      // Ensure a crisp white backdrop under pattern-filled CAD rects if parent doesn't draw one
      if (tag === 'rect' && cloneEl.parentNode) {
        const whiteBg = cloneEl.cloneNode(false) as Element;
        whiteBg.setAttribute('fill', '#ffffff');
        whiteBg.setAttribute('stroke', 'none');
        cloneEl.parentNode.insertBefore(whiteBg, cloneEl);
      }
      cloneEl.setAttribute('fill', fillUrl);
    } else if (cs.fill === 'none') {
      cloneEl.setAttribute('fill', 'none');
    } else if (cs.fill) {
      const fillColor = resolveColor(cs.fill);
      if (fillColor) {
        cloneEl.setAttribute('fill', fillColor.hex);
        const cssFillOp = parseFloat(cs.fillOpacity);
        const combinedFillAlpha =
          fillColor.a * (Number.isNaN(cssFillOp) ? 1 : cssFillOp);
        if (combinedFillAlpha < 0.995) {
          cloneEl.setAttribute('fill-opacity', Math.max(0, combinedFillAlpha).toFixed(3));
        } else {
          cloneEl.removeAttribute('fill-opacity');
        }
      } else {
        cloneEl.setAttribute('fill', 'none');
      }
    }

    const strokeUrl =
      extractUrlFragment(origEl.getAttribute('stroke')) ?? extractUrlFragment(cs.stroke);
    if (strokeUrl) {
      cloneEl.setAttribute('stroke', strokeUrl);
    } else if (cs.stroke === 'none') {
      cloneEl.setAttribute('stroke', 'none');
    } else if (cs.stroke) {
      const strokeColor = resolveColor(cs.stroke);
      if (strokeColor) {
        cloneEl.setAttribute('stroke', strokeColor.hex);
        const cssStrokeOp = parseFloat(cs.strokeOpacity);
        const combinedStrokeAlpha =
          strokeColor.a * (Number.isNaN(cssStrokeOp) ? 1 : cssStrokeOp);
        if (combinedStrokeAlpha < 0.995) {
          cloneEl.setAttribute('stroke-opacity', Math.max(0, combinedStrokeAlpha).toFixed(3));
        } else {
          cloneEl.removeAttribute('stroke-opacity');
        }
      } else {
        cloneEl.setAttribute('stroke', 'none');
      }
    }

    const strokeWidth = parseFloat(cs.strokeWidth);
    if (!Number.isNaN(strokeWidth) && strokeWidth > 0 && cs.stroke !== 'none') {
      cloneEl.setAttribute('stroke-width', String(strokeWidth));
    }
    if (cs.strokeDasharray && cs.strokeDasharray !== 'none') {
      cloneEl.setAttribute('stroke-dasharray', cs.strokeDasharray);
    }
    if (cs.strokeLinecap && cs.strokeLinecap !== 'butt') {
      cloneEl.setAttribute('stroke-linecap', cs.strokeLinecap);
    }
    if (cs.strokeLinejoin && cs.strokeLinejoin !== 'miter') {
      cloneEl.setAttribute('stroke-linejoin', cs.strokeLinejoin);
    }

    if (tag === 'text' || tag === 'tspan') {
      const fs = parseFloat(cs.fontSize);
      if (!Number.isNaN(fs) && fs > 0) {
        cloneEl.setAttribute('font-size', `${fs}px`);
      }
      cloneEl.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
      if (cs.fontWeight) {
        const fwNum = Number(cs.fontWeight);
        cloneEl.setAttribute(
          'font-weight',
          fwNum >= 600 || cs.fontWeight === 'bold' ? 'bold' : 'normal'
        );
      }
      if (cs.fontStyle && cs.fontStyle !== 'normal') {
        cloneEl.setAttribute('font-style', cs.fontStyle);
      }
      if (cs.textAnchor) {
        cloneEl.setAttribute('text-anchor', cs.textAnchor);
      }
      cloneEl.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE && child.nodeValue) {
          child.nodeValue = normalizePdfText(child.nodeValue);
        }
      });
    }
  }

  clone.setAttribute('width', `${Math.max(1, rect.width)}`);
  clone.setAttribute('height', `${Math.max(1, rect.height)}`);
  if (!clone.getAttribute('viewBox') && rect.width > 0 && rect.height > 0) {
    clone.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  }
  return clone;
}

function collectPdfSceneOps(
  root: HTMLElement,
  resolveColor: (css: string) => ResolvedRgba | null
): PdfRenderOp[] {
  const rootRect = root.getBoundingClientRect();
  const ops: PdfRenderOp[] = [];
  const defaultTextColor: ResolvedRgba = { r: 15, g: 23, b: 42, a: 1, hex: '#0f172a' };

  const parseBorder = (widthStr: string, styleStr: string, colorStr: string): PdfBorderEdge | null => {
    const w = parseFloat(widthStr);
    if (Number.isNaN(w) || w <= 0.05 || styleStr === 'none' || styleStr === 'hidden') {
      return null;
    }
    const c = resolveColor(colorStr);
    if (!c) return null;
    return { widthPx: w, color: c };
  };

  const walk = (el: HTMLElement, isRoot: boolean) => {
    if (
      !isRoot &&
      (el.classList.contains('no-print') || el.classList.contains('print:hidden'))
    ) {
      return;
    }

    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) <= 0.01) {
      return;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0.25 || rect.height <= 0.25) {
      return;
    }

    const topPx = Math.max(0, rect.top - rootRect.top);
    const bottomPx = Math.max(topPx, rect.bottom - rootRect.top);
    const leftPx = Math.max(0, rect.left - rootRect.left);
    const widthPx = rect.width;
    const heightPx = rect.height;

    const tag = el.tagName.toLowerCase();
    if (tag === 'img') {
      const imgEl = el as HTMLImageElement;
      if (imgEl.complete && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
        ops.push({
          type: 'image',
          topPx,
          bottomPx,
          leftPx,
          widthPx,
          heightPx,
          element: imgEl,
          objectFit: cs.objectFit || 'contain',
        });
      }
      return;
    }

    if (!isRoot) {
      const bg = resolveColor(cs.backgroundColor);
      if (bg) {
        const radiusPx = parseFloat(cs.borderTopLeftRadius) || 0;
        ops.push({
          type: 'boxFill',
          topPx,
          bottomPx,
          leftPx,
          widthPx,
          color: bg,
          radiusPx,
        });
      }
    }

    const textColor = resolveColor(cs.color) ?? defaultTextColor;

    // Handle native input/textarea values if present inside a printable card
    if (tag === 'input' || tag === 'textarea') {
      const val = (el as HTMLInputElement | HTMLTextAreaElement).value?.trim();
      if (val) {
        const fs = Math.max(6, parseFloat(cs.fontSize) || 12);
        const padLeft = parseFloat(cs.paddingLeft) || 4;
        const padTop = parseFloat(cs.paddingTop) || 4;
        ops.push({
          type: 'text',
          topPx: topPx + padTop,
          bottomPx: topPx + padTop + fs * 1.25,
          leftPx: leftPx + padLeft,
          widthPx: Math.max(10, widthPx - padLeft * 2),
          text: normalizePdfText(val),
          fontSizePx: fs,
          fontWeight: cs.fontWeight || '400',
          fontStyle: cs.fontStyle || 'normal',
          isMonospace: false,
          color: textColor,
        });
      }
    } else {
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          extractTextLineOps(child as Text, cs, rootRect, textColor, ops);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const childEl = child as Element;
          if (childEl.tagName.toLowerCase() === 'svg') {
            const svgEl = childEl as SVGSVGElement;
            const svgCs = window.getComputedStyle(svgEl);
            if (
              svgCs.display !== 'none' &&
              svgCs.visibility !== 'hidden' &&
              !svgEl.classList.contains('no-print') &&
              !svgEl.classList.contains('print:hidden')
            ) {
              const svgRect = svgEl.getBoundingClientRect();
              if (svgRect.width > 0.5 && svgRect.height > 0.5) {
                ops.push({
                  type: 'svg',
                  topPx: Math.max(0, svgRect.top - rootRect.top),
                  bottomPx: Math.max(0, svgRect.bottom - rootRect.top),
                  leftPx: Math.max(0, svgRect.left - rootRect.left),
                  widthPx: svgRect.width,
                  heightPx: svgRect.height,
                  sourceSvg: svgEl,
                  preparedSvg: prepareSvgForPdf(svgEl, svgRect, resolveColor),
                });
              }
            }
          } else if (childEl instanceof HTMLElement) {
            walk(childEl, false);
          }
        }
      }
    }

    const borderTop = parseBorder(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor);
    const borderRight = parseBorder(cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor);
    const borderBottom = parseBorder(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor);
    const borderLeft = parseBorder(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor);

    if (borderTop || borderRight || borderBottom || borderLeft) {
      ops.push({
        type: 'boxBorders',
        topPx,
        bottomPx,
        leftPx,
        widthPx,
        top: borderTop,
        right: borderRight,
        bottom: borderBottom,
        left: borderLeft,
      });
    }
  };

  walk(root, true);
  return ops;
}

function rasterizeImageToDataUrl(
  img: HTMLImageElement
): { dataUrl: string; format: 'PNG' | 'JPEG' } | null {
  const maxDim = 2200;
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  if (natW <= 0 || natH <= 0) return null;

  const scale = Math.min(1, maxDim / Math.max(natW, natH));
  const w = Math.max(1, Math.round(natW * scale));
  const h = Math.max(1, Math.round(natH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    ctx.drawImage(img, 0, 0, w, h);
    const isJpeg = /^data:image\/jpe?g/i.test(img.currentSrc || img.src || '');
    return isJpeg
      ? { dataUrl: canvas.toDataURL('image/jpeg', 0.92), format: 'JPEG' }
      : { dataUrl: canvas.toDataURL('image/png'), format: 'PNG' };
  } catch {
    return null;
  }
}

async function rasterizeSvgFallback(
  svg: SVGSVGElement,
  widthPx: number,
  heightPx: number
): Promise<string | null> {
  try {
    const serializer = new XMLSerializer();
    const xml = serializer.serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG fallback load error'));
        img.src = url;
      });
      const scale = 2.5;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(widthPx * scale));
      canvas.height = Math.max(1, Math.round(heightPx * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/**
 * Generates and directly downloads a crisp, selectable-text vector `.pdf` file from
 * a printable DOM sheet using the exact configured paper size and orientation —
 * bypassing the browser's native print dialog completely.
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
  const targetCaptureWidthPx = getPdfCaptureWidthPx(
    options.paperSize,
    options.orientation
  );

  const prevWidth = element.style.width;
  const prevMinWidth = element.style.minWidth;
  const prevMaxWidth = element.style.maxWidth;
  const prevBackground = element.style.backgroundColor;
  const hadDesktopClass = element.classList.contains('pdf-desktop-layout');
  const hadCapturingClass = element.classList.contains('pdf-capturing');

  if (!hadDesktopClass) {
    element.classList.add('pdf-desktop-layout');
  }
  if (!hadCapturingClass) {
    element.classList.add('pdf-capturing');
  }

  const needsTemporaryResize =
    Math.abs(element.clientWidth - targetCaptureWidthPx) > 2;
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

    const mmPerDomPx = dims.contentWidthMm / domWidth;
    const pageContentHeightDomPx = dims.contentHeightMm / mmPerDomPx;

    const slices = computeSmartPdfPageBreaks(
      domHeight,
      pageContentHeightDomPx,
      avoidCutIntervals
    );

    const resolveColor = createCssColorResolver();
    const ops = collectPdfSceneOps(element, resolveColor);

    // Pre-cache raster data for bitmap <img> elements (logos & site photos)
    const imageDataCache = new WeakMap<
      HTMLImageElement,
      { dataUrl: string; format: 'PNG' | 'JPEG' } | null
    >();
    const getImageAsset = (img: HTMLImageElement) => {
      if (!imageDataCache.has(img)) {
        imageDataCache.set(img, rasterizeImageToDataUrl(img));
      }
      return imageDataCache.get(img) ?? null;
    };

    const { svg2pdf } = await import('svg2pdf.js');
    const pdf = new jsPDF({
      orientation: options.orientation,
      unit: 'mm',
      format: dims.jsPdfFormat,
      compress: true,
    });

    const assignSliceIndex = (midPx: number): number => {
      for (let i = 0; i < slices.length; i++) {
        if (midPx < slices[i].endPx || i === slices.length - 1) {
          return i;
        }
      }
      return slices.length - 1;
    };

    for (let pageIdx = 0; pageIdx < slices.length; pageIdx++) {
      if (pageIdx > 0) {
        pdf.addPage(dims.jsPdfFormat, options.orientation);
      }
      const slice = slices[pageIdx];

      for (const op of ops) {
        if (op.type === 'boxFill') {
          if (op.bottomPx <= slice.startPx + 0.5 || op.topPx >= slice.endPx - 0.5) {
            continue;
          }
          const visTop = Math.max(op.topPx, slice.startPx);
          const visBottom = Math.min(op.bottomPx, slice.endPx);
          const visH = visBottom - visTop;
          if (visH <= 0.25) continue;

          const [r, g, b] = blendOnWhite(op.color);
          const x = dims.marginMm + op.leftPx * mmPerDomPx;
          const y = dims.marginMm + (visTop - slice.startPx) * mmPerDomPx;
          const w = op.widthPx * mmPerDomPx;
          const h = visH * mmPerDomPx;
          pdf.setFillColor(r, g, b);
          const radiusMm = Math.min(op.radiusPx * mmPerDomPx, w / 2, h / 2);
          if (radiusMm > 0.25) {
            pdf.roundedRect(x, y, w, h, radiusMm, radiusMm, 'F');
          } else {
            pdf.rect(x, y, w, h, 'F');
          }
          continue;
        }

        if (op.type === 'boxBorders') {
          if (op.bottomPx <= slice.startPx + 0.5 || op.topPx >= slice.endPx - 0.5) {
            continue;
          }
          const visTop = Math.max(op.topPx, slice.startPx);
          const visBottom = Math.min(op.bottomPx, slice.endPx);
          const x1 = dims.marginMm + op.leftPx * mmPerDomPx;
          const x2 = dims.marginMm + (op.leftPx + op.widthPx) * mmPerDomPx;
          const y1 = dims.marginMm + (visTop - slice.startPx) * mmPerDomPx;
          const y2 = dims.marginMm + (visBottom - slice.startPx) * mmPerDomPx;

          const drawEdge = (edge: PdfBorderEdge, ex1: number, ey1: number, ex2: number, ey2: number) => {
            const [r, g, b] = blendOnWhite(edge.color);
            pdf.setDrawColor(r, g, b);
            pdf.setLineWidth(Math.max(0.15, edge.widthPx * mmPerDomPx));
            pdf.line(ex1, ey1, ex2, ey2);
          };

          if (op.top && op.topPx >= slice.startPx - 0.75 && op.topPx <= slice.endPx + 0.75) {
            drawEdge(op.top, x1, y1, x2, y1);
          }
          if (
            op.bottom &&
            op.bottomPx >= slice.startPx - 0.75 &&
            op.bottomPx <= slice.endPx + 0.75
          ) {
            drawEdge(op.bottom, x1, y2, x2, y2);
          }
          if (op.left && y2 - y1 > 0.1) {
            drawEdge(op.left, x1, y1, x1, y2);
          }
          if (op.right && y2 - y1 > 0.1) {
            drawEdge(op.right, x2, y1, x2, y2);
          }
          continue;
        }

        // Atomic content items (text lines, images, SVGs) belong strictly to a single slice
        const midPx = (op.topPx + op.bottomPx) / 2;
        if (assignSliceIndex(midPx) !== pageIdx) {
          continue;
        }

        if (op.type === 'text') {
          const family = op.isMonospace ? 'courier' : 'helvetica';
          const fwNum = Number(op.fontWeight);
          const isBold = fwNum >= 600 || op.fontWeight === 'bold';
          const isItalic = op.fontStyle === 'italic' || op.fontStyle === 'oblique';
          const styleVariant =
            isBold && isItalic
              ? 'bolditalic'
              : isBold
                ? 'bold'
                : isItalic
                  ? 'italic'
                  : 'normal';

          pdf.setFont(family, styleVariant);
          let fontSizePt = op.fontSizePx * mmPerDomPx * (72 / 25.4);
          pdf.setFontSize(fontSizePt);

          const maxLineWidthMm = op.widthPx * mmPerDomPx;
          const measuredWidthMm = pdf.getTextWidth(op.text);
          if (measuredWidthMm > maxLineWidthMm * 1.015 && measuredWidthMm > 0.1) {
            const fitScale = Math.max(0.82, maxLineWidthMm / measuredWidthMm);
            fontSizePt *= fitScale;
            pdf.setFontSize(fontSizePt);
          }

          const [r, g, b] = blendOnWhite(op.color);
          pdf.setTextColor(r, g, b);

          const lineHeightPx = Math.max(op.fontSizePx, op.bottomPx - op.topPx);
          const baselineYpx =
            op.topPx + (lineHeightPx - op.fontSizePx) * 0.5 + op.fontSizePx * 0.8;
          const x = dims.marginMm + op.leftPx * mmPerDomPx;
          const y = dims.marginMm + (baselineYpx - slice.startPx) * mmPerDomPx;

          pdf.text(op.text, x, y);
          continue;
        }

        if (op.type === 'image') {
          const asset = getImageAsset(op.element);
          if (!asset) continue;

          const boxX = dims.marginMm + op.leftPx * mmPerDomPx;
          const boxY = dims.marginMm + (op.topPx - slice.startPx) * mmPerDomPx;
          const boxW = op.widthPx * mmPerDomPx;
          const boxH = op.heightPx * mmPerDomPx;

          let drawX = boxX;
          let drawY = boxY;
          let drawW = boxW;
          let drawH = boxH;

          if (op.objectFit === 'contain' || op.objectFit === 'scale-down') {
            const natRatio = op.element.naturalWidth / op.element.naturalHeight;
            const boxRatio = boxW / Math.max(0.01, boxH);
            if (natRatio > boxRatio) {
              drawH = boxW / natRatio;
              drawY = boxY + (boxH - drawH) / 2;
            } else {
              drawW = boxH * natRatio;
              drawX = boxX + (boxW - drawW) / 2;
            }
          }

          pdf.addImage(
            asset.dataUrl,
            asset.format,
            drawX,
            drawY,
            drawW,
            drawH,
            undefined,
            'FAST'
          );
          continue;
        }

        if (op.type === 'svg') {
          const svgX = dims.marginMm + op.leftPx * mmPerDomPx;
          const svgY = dims.marginMm + (op.topPx - slice.startPx) * mmPerDomPx;
          const svgW = op.widthPx * mmPerDomPx;
          const svgH = op.heightPx * mmPerDomPx;

          try {
            await svg2pdf(op.preparedSvg, pdf, {
              x: svgX,
              y: svgY,
              width: svgW,
              height: svgH,
              loadExternalStyleSheets: false,
            });
          } catch {
            const fallbackPng = await rasterizeSvgFallback(
              op.preparedSvg,
              op.widthPx,
              op.heightPx
            );
            if (fallbackPng) {
              pdf.addImage(
                fallbackPng,
                'PNG',
                svgX,
                svgY,
                svgW,
                svgH,
                undefined,
                'FAST'
              );
            }
          }
        }
      }

      if (slices.length > 1) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(120, 130, 145);
        pdf.text(
          `Page ${pageIdx + 1} of ${slices.length}`,
          dims.widthMm - dims.marginMm,
          dims.heightMm - 4.5,
          { align: 'right' }
        );
      }
    }

    pdf.save(filename);
  } finally {
    if (!hadDesktopClass) {
      element.classList.remove('pdf-desktop-layout');
    }
    if (!hadCapturingClass) {
      element.classList.remove('pdf-capturing');
    }
    element.style.width = prevWidth;
    element.style.minWidth = prevMinWidth;
    element.style.maxWidth = prevMaxWidth;
    element.style.backgroundColor = prevBackground;
  }
}

