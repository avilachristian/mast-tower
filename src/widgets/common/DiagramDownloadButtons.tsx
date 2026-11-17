import { useState, type RefObject } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  downloadSvgDiagram,
  downloadSvgDiagramAsPng,
} from '@/shared/lib/diagramExport';
import { useFeedbackStore } from '@/shared/state/feedbackStore';

/**
 * Compact dual-format (PNG / SVG) download button group for 2D engineering SVG diagrams.
 * Automatically hidden in print media so reports never display screen toolbar buttons.
 */
export function DiagramDownloadButtons({
  svgRef,
  filenameBase,
  frameless = false,
  showSelection,
  onShowSelectionChange,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  filenameBase: string;
  frameless?: boolean;
  showSelection: boolean;
  onShowSelectionChange: (show: boolean) => void;
}) {
  const [exportingPng, setExportingPng] = useState(false);
  const pushToast = useFeedbackStore((s) => s.pushToast);

  const handleDownloadPng = async () => {
    const svg = svgRef.current;
    if (!svg || exportingPng) return;
    setExportingPng(true);
    try {
      const filename = await downloadSvgDiagramAsPng(svg, filenameBase);
      pushToast({
        tone: 'success',
        message: `Downloaded ${filename}`,
        durationMs: 2800,
      });
    } catch {
      pushToast({
        tone: 'error',
        message: 'Could not export PNG diagram in this browser. Try SVG download instead.',
      });
    } finally {
      setExportingPng(false);
    }
  };

  const handleDownloadSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const filename = downloadSvgDiagram(svg, filenameBase);
    pushToast({
      tone: 'success',
      message: `Downloaded ${filename}`,
      durationMs: 2800,
    });
  };

  return (
    <div
      className={
        frameless
          ? 'inline-flex items-center border border-stone-300 bg-[#F7F6F2] p-0.5 text-[11px] print:hidden shrink-0'
          : 'inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] shadow-2xs print:hidden shrink-0'
      }
      role="group"
      aria-label="Download diagram"
    >
      <span
        className={
          frameless
            ? 'inline-flex items-center gap-1 px-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-600 select-none'
            : 'inline-flex items-center gap-1 px-1.5 text-[10px] font-semibold text-slate-500 select-none'
        }
      >
        {exportingPng ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Download className="w-3 h-3" />
        )}
        <span className="hidden sm:inline">Save</span>
      </span>
      <label
        className={
          frameless
            ? 'inline-flex items-center gap-1 px-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-700 cursor-pointer select-none'
            : 'inline-flex items-center gap-1 px-1.5 text-[10px] font-semibold text-slate-600 cursor-pointer select-none'
        }
        title="Show or hide the selected pad or section in the diagram and saved image"
      >
        <input
          type="checkbox"
          checked={showSelection}
          onChange={(event) => onShowSelectionChange(event.target.checked)}
          aria-label="Show selected pad or section"
          className={frameless ? 'accent-neutral-950' : 'accent-sky-600'}
        />
        <span className="hidden sm:inline">Selection</span>
      </label>
      <button
        type="button"
        onClick={() => void handleDownloadPng()}
        disabled={exportingPng}
        title="Download high-resolution PNG image for reports & slides"
        className={`px-2 py-0.5 font-semibold transition cursor-pointer disabled:opacity-60 ${
          frameless
            ? 'text-neutral-800 hover:bg-neutral-900 hover:text-white'
            : 'rounded-md text-slate-700 hover:bg-sky-50 hover:text-sky-700'
        }`}
      >
        PNG
      </button>
      <button
        type="button"
        onClick={handleDownloadSvg}
        title="Download scalable SVG vector drawing"
        className={`px-2 py-0.5 font-semibold transition cursor-pointer ${
          frameless
            ? 'text-neutral-800 hover:bg-neutral-900 hover:text-white border-l border-stone-300'
            : 'rounded-md text-slate-700 hover:bg-sky-50 hover:text-sky-700'
        }`}
      >
        SVG
      </button>
    </div>
  );
}
