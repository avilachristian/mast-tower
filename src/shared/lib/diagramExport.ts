/**
 * Shared client-side diagram export utilities for 2D SVG CAD drawings and 3D WebGL captures.
 * Resolves computed CSS/Tailwind styles onto cloned SVG trees so standalone .svg and .png exports
 * match in-app appearance in Word, PowerPoint, Chrome, Illustrator, and CAD viewers.
 */

export interface SvgViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasLegendGroup {
  title: string;
  items: { color: string; label: string }[];
}

const DEFAULT_SVG_WIDTH = 760;
const DEFAULT_SVG_HEIGHT = 600;
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Builds a clean, filesystem-safe download filename stem from a diagram title. */
export function sanitizeDiagramFilename(base: string, ext: string): string {
  const cleanExt = ext.replace(/^\.+/, '').toLowerCase() || 'png';
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `${slug || 'mast-diagram'}.${cleanExt}`;
}

/** Parses numeric SVG `viewBox` dimensions, falling back to bounding rect or sensible defaults. */
export function parseSvgViewBox(svg: SVGSVGElement): SvgViewBox {
  const attr = svg.getAttribute('viewBox');
  if (attr) {
    const parts = attr
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      parts.length === 4 &&
      parts.every((n) => Number.isFinite(n)) &&
      parts[2] > 0 &&
      parts[3] > 0
    ) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }

  if (typeof svg.getBoundingClientRect === 'function') {
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { x: 0, y: 0, width: rect.width, height: rect.height };
    }
  }

  return { x: 0, y: 0, width: DEFAULT_SVG_WIDTH, height: DEFAULT_SVG_HEIGHT };
}

/** Scales target PNG dimensions up cleanly while capping max canvas side for browser stability. */
export function computePngExportDimensions(
  width: number,
  height: number,
  preferredScale = 3,
  maxDimension = 3200
): { width: number; height: number } {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const scale = Math.min(preferredScale, maxDimension / Math.max(safeW, safeH));
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

function inlineComputedSvgStyles(sourceRoot: SVGSVGElement, cloneRoot: SVGSVGElement): void {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return;
  }

  const rootStyle = window.getComputedStyle(sourceRoot);
  if (rootStyle.fontFamily) {
    cloneRoot.style.fontFamily = rootStyle.fontFamily;
  }

  const pairs: Array<[Element, Element]> = [];
  const srcChildren = sourceRoot.children;
  const dstChildren = cloneRoot.children;
  const len = Math.min(srcChildren.length, dstChildren.length);
  for (let i = 0; i < len; i++) {
    pairs.push([srcChildren[i], dstChildren[i]]);
  }

  while (pairs.length > 0) {
    const [src, dst] = pairs.pop()!;
    const tag = src.tagName.toLowerCase();
    const cs = window.getComputedStyle(src);
    const hadClass = src.hasAttribute('class');

    if (tag === 'text' || tag === 'tspan') {
      if (!dst.hasAttribute('fill') && cs.fill) {
        dst.setAttribute('fill', cs.fill);
      }
      if (!dst.hasAttribute('fill-opacity') && cs.fillOpacity && cs.fillOpacity !== '1') {
        dst.setAttribute('fill-opacity', cs.fillOpacity);
      }
      if (!dst.hasAttribute('font-family') && cs.fontFamily) {
        (dst as SVGElement).style.fontFamily = cs.fontFamily;
      }
      if (!dst.hasAttribute('font-size') && cs.fontSize) {
        (dst as SVGElement).style.fontSize = cs.fontSize;
      }
      if (
        !dst.hasAttribute('font-weight') &&
        cs.fontWeight &&
        cs.fontWeight !== '400' &&
        cs.fontWeight !== 'normal'
      ) {
        (dst as SVGElement).style.fontWeight = cs.fontWeight;
      }
      if (cs.fontStyle && cs.fontStyle !== 'normal') {
        (dst as SVGElement).style.fontStyle = cs.fontStyle;
      }
      if (cs.letterSpacing && cs.letterSpacing !== 'normal') {
        (dst as SVGElement).style.letterSpacing = cs.letterSpacing;
      }
      if (!dst.hasAttribute('text-anchor') && cs.textAnchor && cs.textAnchor !== 'start') {
        dst.setAttribute('text-anchor', cs.textAnchor);
      }
      if (cs.textTransform === 'uppercase') {
        for (const childNode of Array.from(dst.childNodes)) {
          if (childNode.nodeType === 3 && childNode.nodeValue) {
            childNode.nodeValue = childNode.nodeValue.toUpperCase();
          }
        }
      }
    } else if (
      tag === 'rect' ||
      tag === 'circle' ||
      tag === 'ellipse' ||
      tag === 'line' ||
      tag === 'polyline' ||
      tag === 'polygon' ||
      tag === 'path'
    ) {
      if (hadClass) {
        if (!dst.hasAttribute('fill') && cs.fill && cs.fill !== 'rgb(0, 0, 0)') {
          dst.setAttribute('fill', cs.fill);
        }
        if (!dst.hasAttribute('stroke') && cs.stroke && cs.stroke !== 'none') {
          dst.setAttribute('stroke', cs.stroke);
        }
      }
    }

    if (hadClass) {
      dst.removeAttribute('class');
    }

    const sKids = src.children;
    const dKids = dst.children;
    const kLen = Math.min(sKids.length, dKids.length);
    for (let i = 0; i < kLen; i++) {
      pairs.push([sKids[i], dKids[i]]);
    }
  }
}

/** Clones a live SVG element into a self-contained SVG XML string with crisp white backdrop. */
export function serializeSvgForExport(
  svg: SVGSVGElement,
  options?: { backgroundColor?: string; scale?: number }
): { svgString: string; width: number; height: number } {
  const backgroundColor = options?.backgroundColor ?? '#ffffff';
  const scale = Math.max(0.1, options?.scale ?? 1);
  const viewBox = parseSvgViewBox(svg);
  const width = Math.round(viewBox.width * scale);
  const height = Math.round(viewBox.height * scale);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedSvgStyles(svg, clone);

  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('xmlns:xlink', XLINK_NS);
  clone.setAttribute(
    'viewBox',
    `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
  );
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.removeAttribute('class');
  clone.removeAttribute('role');

  const doc = clone.ownerDocument ?? document;
  const bgRect = doc.createElementNS(SVG_NS, 'rect');
  bgRect.setAttribute('x', String(viewBox.x));
  bgRect.setAttribute('y', String(viewBox.y));
  bgRect.setAttribute('width', String(viewBox.width));
  bgRect.setAttribute('height', String(viewBox.height));
  bgRect.setAttribute('fill', backgroundColor);

  const firstEl = clone.firstElementChild;
  if (firstEl && firstEl.tagName.toLowerCase() === 'defs' && firstEl.nextSibling) {
    clone.insertBefore(bgRect, firstEl.nextSibling);
  } else if (firstEl && firstEl.tagName.toLowerCase() === 'defs') {
    clone.appendChild(bgRect);
  } else {
    clone.insertBefore(bgRect, clone.firstChild);
  }

  const serialized = new XMLSerializer().serializeToString(clone);
  return { svgString: serialized, width, height };
}

/** Rasterizes an SVG string into a crisp high-resolution PNG Blob on an offscreen canvas. */
export async function rasterizeSvgToPngBlob(
  svgString: string,
  width: number,
  height: number,
  backgroundColor = '#ffffff'
): Promise<Blob> {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to render diagram SVG to image.'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas context unavailable for PNG export.');
    }

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode PNG output.'));
      }, 'image/png');
    });

    return pngBlob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** Composites a rendered 3D WebGL canvas with an optional drafting legend strip into a PNG data URL. */
export function compositeWebglSnapshotWithLegend(
  sourceCanvas: HTMLCanvasElement,
  legendGroups: CanvasLegendGroup[],
  headerLabel?: string
): string {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (w <= 0 || h <= 0 || legendGroups.length === 0) {
    return sourceCanvas.toDataURL('image/png');
  }

  const offscreen = document.createElement('canvas');
  const scaleFactor = Math.max(1, Math.min(2.2, w / 900));
  const padX = Math.round(18 * scaleFactor);
  const padY = Math.round(14 * scaleFactor);
  const lineH = Math.round(17 * scaleFactor);
  const swatchSize = Math.round(9 * scaleFactor);
  const colGap = Math.round(20 * scaleFactor);

  // Measure group heights before sizing composite canvas
  const tempCtx = offscreen.getContext('2d');
  if (!tempCtx) return sourceCanvas.toDataURL('image/png');

  const cols = Math.min(3, legendGroups.length);
  const usableW = w - padX * 2;
  const colW = (usableW - colGap * (cols - 1)) / cols;
  const itemFont = `${Math.round(10.5 * scaleFactor)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const titleFont = `700 ${Math.round(9.5 * scaleFactor)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  const laidOutColumns: Array<{
    x: number;
    groupTitle: string;
    rows: Array<Array<{ color: string; label: string; width: number }>>;
  }> = [];

  let maxColHeight = 0;
  legendGroups.forEach((group, gIdx) => {
    tempCtx.font = itemFont;
    const rows: Array<Array<{ color: string; label: string; width: number }>> = [[]];
    let rowX = 0;
    const gap = Math.round(10 * scaleFactor);
    for (const item of group.items) {
      const labelW = tempCtx.measureText(item.label).width;
      const itemW = swatchSize + Math.round(5 * scaleFactor) + labelW;
      if (rows[rows.length - 1].length > 0 && rowX + itemW > colW) {
        rows.push([]);
        rowX = 0;
      }
      rows[rows.length - 1].push({ color: item.color, label: item.label, width: itemW });
      rowX += itemW + gap;
    }
    const groupH = Math.round(18 * scaleFactor) + rows.length * lineH;
    maxColHeight = Math.max(maxColHeight, groupH);
    laidOutColumns.push({
      x: padX + gIdx * (colW + colGap),
      groupTitle: group.title.toUpperCase(),
      rows,
    });
  });

  const headerBarH = headerLabel ? Math.round(24 * scaleFactor) : 0;
  const footerH = padY * 2 + headerBarH + maxColHeight;

  offscreen.width = w;
  offscreen.height = h + footerH;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return sourceCanvas.toDataURL('image/png');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);
  ctx.drawImage(sourceCanvas, 0, 0, w, h);

  // Top hairline divider
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = Math.max(1, scaleFactor);
  ctx.beginPath();
  ctx.moveTo(0, h + 0.5);
  ctx.lineTo(w, h + 0.5);
  ctx.stroke();

  let cursorY = h + padY;
  if (headerLabel) {
    ctx.font = titleFont;
    ctx.fillStyle = '#334155';
    ctx.textBaseline = 'top';
    ctx.fillText(headerLabel.toUpperCase(), padX, cursorY);
    cursorY += headerBarH;
  }

  for (const col of laidOutColumns) {
    let y = cursorY;
    ctx.font = titleFont;
    ctx.fillStyle = '#64748b';
    ctx.textBaseline = 'top';
    ctx.fillText(col.groupTitle, col.x, y);
    y += Math.round(18 * scaleFactor);

    ctx.font = itemFont;
    const itemGap = Math.round(10 * scaleFactor);
    for (const row of col.rows) {
      let x = col.x;
      for (const item of row) {
        const swatchY = y + Math.round(2 * scaleFactor);
        ctx.fillStyle = item.color;
        ctx.fillRect(x, swatchY, swatchSize, swatchSize);
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
        ctx.lineWidth = Math.max(1, scaleFactor * 0.75);
        ctx.strokeRect(x, swatchY, swatchSize, swatchSize);

        ctx.fillStyle = '#334155';
        ctx.fillText(item.label, x + swatchSize + Math.round(5 * scaleFactor), y);
        x += item.width + itemGap;
      }
      y += lineH;
    }
  }

  return offscreen.toDataURL('image/png');
}

/** Triggers a browser file download from an in-memory Blob. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Triggers a browser file download from a data URL (e.g. PNG canvas output). */
export function triggerDataUrlDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Downloads a live inline `<svg>` element as a self-contained `.svg` vector file. */
export function downloadSvgDiagram(svg: SVGSVGElement, titleOrFilename: string): string {
  const { svgString } = serializeSvgForExport(svg, { backgroundColor: '#ffffff', scale: 1 });
  const filename = sanitizeDiagramFilename(titleOrFilename, 'svg');
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  triggerBlobDownload(blob, filename);
  return filename;
}

/** Downloads a live inline `<svg>` element rendered to a high-resolution `.png` raster file. */
export async function downloadSvgDiagramAsPng(
  svg: SVGSVGElement,
  titleOrFilename: string,
  preferredScale = 3
): Promise<string> {
  const { svgString, width, height } = serializeSvgForExport(svg, {
    backgroundColor: '#ffffff',
    scale: 1,
  });
  const target = computePngExportDimensions(width, height, preferredScale);
  const pngBlob = await rasterizeSvgToPngBlob(svgString, target.width, target.height, '#ffffff');
  const filename = sanitizeDiagramFilename(titleOrFilename, 'png');
  triggerBlobDownload(pngBlob, filename);
  return filename;
}
