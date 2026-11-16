import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import { createCleanVerticalMastProject } from '../src/entities/project/verticalMastBaseline';
import {
  computePngExportDimensions,
  parseSvgViewBox,
  sanitizeDiagramFilename,
  serializeSvgForExport,
} from '../src/shared/lib/diagramExport';
import { GroundAnchorPlan2D } from '../src/widgets/layout-plan/GroundAnchorPlan2D';
import { VerticalMastElevation2D } from '../src/widgets/mast-tower/VerticalMastElevation2D';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Diagram Export Utilities & Download Controls', () => {
  it('sanitizes diagram titles into safe download filenames', () => {
    expect(sanitizeDiagramFilename('2D Foundation & Anchor Layout Plan', 'png')).toBe(
      '2d-foundation-anchor-layout-plan.png'
    );
    expect(
      sanitizeDiagramFilename('Vertical Mast & 16-Layer Guying Elevation (ZT-120-01)', '.SVG')
    ).toBe('vertical-mast-16-layer-guying-elevation-zt-120-01.svg');
    expect(sanitizeDiagramFilename('---', 'png')).toBe('mast-diagram.png');
  });

  it('computes high-resolution PNG dimensions capped within safe canvas bounds', () => {
    expect(computePngExportDimensions(700, 672, 3)).toEqual({
      width: 2100,
      height: 2016,
    });
    // Tall 3x V-Scale elevation (~760 x 1500) scales down smoothly to keep maxDimension <= 3200
    expect(computePngExportDimensions(760, 1500, 3, 3200)).toEqual({
      width: 1621,
      height: 3200,
    });
  });

  it('renders PNG and SVG download controls in interactive 2D diagrams (Client & Admin) and omits them when hideHeader is set', () => {
    const project = createCleanBaselineProject();
    const vmProject = createCleanVerticalMastProject();

    const adminPlanHtml = renderToStaticMarkup(
      createElement(GroundAnchorPlan2D, {
        foundations: project.foundations,
        title: 'Site Foundation Status Layout',
      })
    );
    expect(adminPlanHtml).toContain('aria-label="Download diagram"');
    expect(adminPlanHtml).toContain('>PNG</button>');
    expect(adminPlanHtml).toContain('>SVG</button>');
    expect(adminPlanHtml).toContain('print:hidden');

    const clientPlanHtml = renderToStaticMarkup(
      createElement(GroundAnchorPlan2D, {
        foundations: project.foundations,
        frameless: true,
        title: '2D Foundation & Anchor Layout Plan',
      })
    );
    expect(clientPlanHtml).toContain('aria-label="Download diagram"');
    expect(clientPlanHtml).toContain('print:hidden');
    expect(clientPlanHtml).not.toMatch(/\brounded(?:-[a-z0-9]+)?\b/);

    const printPlanHtml = renderToStaticMarkup(
      createElement(GroundAnchorPlan2D, {
        foundations: project.foundations,
        hideHeader: true,
      })
    );
    expect(printPlanHtml).not.toContain('aria-label="Download diagram"');

    const adminMastHtml = renderToStaticMarkup(
      createElement(VerticalMastElevation2D, {
        verticalMast: vmProject.verticalMast!,
      })
    );
    expect(adminMastHtml).toContain('aria-label="Download diagram"');
    expect(adminMastHtml).toContain('>PNG</button>');
    expect(adminMastHtml).toContain('>SVG</button>');

    const clientMastHtml = renderToStaticMarkup(
      createElement(VerticalMastElevation2D, {
        verticalMast: vmProject.verticalMast!,
        frameless: true,
      })
    );
    expect(clientMastHtml).toContain('aria-label="Download diagram"');
    expect(clientMastHtml).not.toMatch(/\brounded(?:-[a-z0-9]+)?\b/);

    const printMastHtml = renderToStaticMarkup(
      createElement(VerticalMastElevation2D, {
        verticalMast: vmProject.verticalMast!,
        hideHeader: true,
      })
    );
    expect(printMastHtml).not.toContain('aria-label="Download diagram"');
  });

  it('serializes standalone SVGs with viewBox dimensions, white backdrop rect, and inlined computed styles', () => {
    const attrs = new Map<string, string>([
      ['viewBox', '30 8 700 672'],
      ['class', 'w-full h-auto'],
    ]);
    const textAttrs = new Map<string, string>([['class', 'fill-sky-100 uppercase']]);
    const textStyle: Record<string, string> = {};
    const rootStyle: Record<string, string> = {};
    const insertedNodes: unknown[] = [];

    const textNode = { nodeType: 3, nodeValue: 'Sector I' };
    const textEl = {
      tagName: 'text',
      children: [],
      childNodes: [textNode],
      style: textStyle,
      hasAttribute: (k: string) => textAttrs.has(k),
      setAttribute: (k: string, v: string) => textAttrs.set(k, v),
      removeAttribute: (k: string) => textAttrs.delete(k),
    };

    const bgAttrs = new Map<string, string>();
    const bgRect = {
      tagName: 'rect',
      setAttribute: (k: string, v: string) => bgAttrs.set(k, v),
    };

    const cloneSvg = {
      tagName: 'svg',
      children: [textEl],
      style: rootStyle,
      firstChild: textEl,
      firstElementChild: textEl,
      ownerDocument: {
        createElementNS: () => bgRect,
      },
      hasAttribute: (k: string) => attrs.has(k),
      getAttribute: (k: string) => attrs.get(k) ?? null,
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
      insertBefore: (node: unknown) => insertedNodes.unshift(node),
      appendChild: (node: unknown) => insertedNodes.push(node),
    };

    const sourceSvg = {
      tagName: 'svg',
      children: [textEl],
      getAttribute: (k: string) => (k === 'viewBox' ? '30 8 700 672' : null),
      cloneNode: () => cloneSvg,
    } as unknown as SVGSVGElement;

    vi.stubGlobal('window', {
      getComputedStyle: (el: unknown) =>
        el === textEl
          ? {
              fill: 'rgb(224, 242, 254)',
              fillOpacity: '1',
              fontFamily: 'Noto Sans, sans-serif',
              fontSize: '9px',
              fontWeight: '700',
              fontStyle: 'normal',
              letterSpacing: '0.45px',
              textAnchor: 'middle',
              textTransform: 'uppercase',
            }
          : { fontFamily: 'Noto Sans, sans-serif' },
    });

    vi.stubGlobal(
      'XMLSerializer',
      class {
        serializeToString() {
          return `<svg xmlns="${attrs.get('xmlns')}" width="${attrs.get('width')}" height="${attrs.get('height')}" viewBox="${attrs.get('viewBox')}"><rect x="${bgAttrs.get('x')}" y="${bgAttrs.get('y')}" width="${bgAttrs.get('width')}" height="${bgAttrs.get('height')}" fill="${bgAttrs.get('fill')}" /><text fill="${textAttrs.get('fill')}">${textNode.nodeValue}</text></svg>`;
        }
      }
    );

    expect(parseSvgViewBox(sourceSvg)).toEqual({
      x: 30,
      y: 8,
      width: 700,
      height: 672,
    });

    const result = serializeSvgForExport(sourceSvg);
    expect(result.width).toBe(700);
    expect(result.height).toBe(672);
    expect(insertedNodes[0]).toBe(bgRect);
    expect(result.svgString).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result.svgString).toContain('fill="#ffffff"');
    expect(result.svgString).toContain('fill="rgb(224, 242, 254)"');
    expect(result.svgString).toContain('>SECTOR I</text>');
  });
});
