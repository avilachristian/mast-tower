import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eraser, PenTool, RotateCcw, Type, X } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

const LOGICAL_WIDTH = 560;
const LOGICAL_HEIGHT = 200;
const EXPORT_SCALE = 2;

const PEN_COLORS = [
  { label: 'Ink Black', value: '#0f172a', swatchClass: 'bg-slate-900' },
  { label: 'Royal Navy', value: '#1e3a8a', swatchClass: 'bg-blue-900' },
  { label: 'Deep Blue', value: '#0369a1', swatchClass: 'bg-sky-700' },
] as const;

const PEN_WIDTHS = [
  { label: 'Fine', value: 2 },
  { label: 'Medium', value: 3.2 },
  { label: 'Bold', value: 4.8 },
] as const;

const TYPED_STYLES = [
  {
    id: 'script',
    label: 'Script',
    font: 'italic 58px "Brush Script MT", "Segoe Script", "Apple Chancery", cursive',
  },
  {
    id: 'classic',
    label: 'Classic Serif',
    font: 'italic 48px Georgia, "Times New Roman", serif',
  },
  {
    id: 'modern',
    label: 'Modern Italic',
    font: 'italic 600 44px "Trebuchet MS", system-ui, sans-serif',
  },
] as const;

function drawStrokeOnContext(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.points.length === 1) {
    const pt = stroke.points[0];
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length - 1; i++) {
    const midX = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
    const midY = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
    ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, midX, midY);
  }
  const last = stroke.points[stroke.points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

function trimTransparentCanvasToBlob(source: HTMLCanvasElement): Promise<Blob | null> {
  const ctx = source.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  const { width, height } = source;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return Promise.resolve(null);
  }

  const padding = 16;
  const sx = Math.max(0, minX - padding);
  const sy = Math.max(0, minY - padding);
  const sw = Math.min(width - sx, maxX - minX + 1 + padding * 2);
  const sh = Math.min(height - sy, maxY - minY + 1 + padding * 2);

  const trimmed = document.createElement('canvas');
  trimmed.width = sw;
  trimmed.height = sh;
  const trimCtx = trimmed.getContext('2d');
  if (!trimCtx) return Promise.resolve(null);
  trimCtx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve) => {
    trimmed.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export interface SignaturePadModalProps {
  open: boolean;
  title?: string;
  defaultTypedName?: string;
  onClose: () => void;
  onSave: (file: File) => Promise<void> | void;
}

export function SignaturePadModal({
  open,
  title = 'Create Signature',
  defaultTypedName = '',
  onClose,
  onSave,
}: SignaturePadModalProps) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0].value);
  const [penWidth, setPenWidth] = useState<number>(PEN_WIDTHS[1].value);
  const [typedText, setTypedText] = useState(defaultTypedName);
  const [typedStyleId, setTypedStyleId] = useState<(typeof TYPED_STYLES)[number]['id']>('script');
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const typedPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const drawingPointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('draw');
    setStrokes([]);
    activeStrokeRef.current = null;
    drawingPointerIdRef.current = null;
    setTypedText(defaultTypedName);
    setSaving(false);
  }, [open, defaultTypedName]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, saving, onClose]);

  const redrawCanvas = useCallback(
    (extraStroke?: Stroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(EXPORT_SCALE, EXPORT_SCALE);

      for (const stroke of strokes) {
        drawStrokeOnContext(ctx, stroke);
      }
      if (extraStroke) {
        drawStrokeOnContext(ctx, extraStroke);
      }
      ctx.restore();
    },
    [strokes]
  );

  const activeTypedStyle = useMemo(
    () => TYPED_STYLES.find((s) => s.id === typedStyleId) ?? TYPED_STYLES[0],
    [typedStyleId]
  );

  useEffect(() => {
    if (!open || mode !== 'type') return;
    const canvas = typedPreviewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const trimmed = typedText.trim();
    if (trimmed) {
      ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
      ctx.fillStyle = penColor;
      ctx.font = activeTypedStyle.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(trimmed, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, LOGICAL_WIDTH - 48);
    }
    ctx.restore();
  }, [open, mode, typedText, penColor, activeTypedStyle]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = LOGICAL_WIDTH / (rect.width || LOGICAL_WIDTH);
    const scaleY = LOGICAL_HEIGHT / (rect.height || LOGICAL_HEIGHT);
    return {
      x: Math.max(0, Math.min(LOGICAL_WIDTH, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(LOGICAL_HEIGHT, (e.clientY - rect.top) * scaleY)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingPointerIdRef.current = e.pointerId;
    const pt = getCanvasPoint(e);
    const stroke: Stroke = {
      points: [pt],
      color: penColor,
      width: penWidth,
    };
    activeStrokeRef.current = stroke;
    redrawCanvas(stroke);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingPointerIdRef.current !== e.pointerId || !activeStrokeRef.current) {
      return;
    }
    const pt = getCanvasPoint(e);
    activeStrokeRef.current.points.push(pt);
    redrawCanvas(activeStrokeRef.current);
  };

  const finishActiveStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingPointerIdRef.current !== e.pointerId || !activeStrokeRef.current) {
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const completed = activeStrokeRef.current;
    activeStrokeRef.current = null;
    drawingPointerIdRef.current = null;
    setStrokes((prev) => [...prev, completed]);
  };

  useEffect(() => {
    if (!open || mode !== 'draw') return;
    redrawCanvas(activeStrokeRef.current);
  }, [open, mode, strokes, redrawCanvas]);

  const canSave =
    mode === 'draw' ? strokes.length > 0 : typedText.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      let sourceCanvas: HTMLCanvasElement;

      if (mode === 'draw') {
        if (!canvasRef.current) return;
        sourceCanvas = canvasRef.current;
      } else {
        sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = LOGICAL_WIDTH * EXPORT_SCALE;
        sourceCanvas.height = LOGICAL_HEIGHT * EXPORT_SCALE;
        const ctx = sourceCanvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
        ctx.fillStyle = penColor;
        ctx.font = activeTypedStyle.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typedText.trim(), LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, LOGICAL_WIDTH - 48);
      }

      const blob = await trimTransparentCanvasToBlob(sourceCanvas);
      if (!blob) return;
      const file = new File([blob], 'drawn-signature.png', {
        type: 'image/png',
      });
      await onSave(file);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            <PenTool className="w-4 h-4 text-sky-600 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close signature pad"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Mode Tabs & Pen Colors */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode('draw')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                  mode === 'draw'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Draw</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('type')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                  mode === 'type'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Type</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5" aria-label="Ink color">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => setPenColor(c.value)}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform ${c.swatchClass} ${
                      penColor === c.value
                        ? 'border-sky-500 scale-110 ring-2 ring-sky-200'
                        : 'border-white shadow-xs hover:scale-105'
                    }`}
                  />
                ))}
              </div>

              {mode === 'draw' && (
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
                  {PEN_WIDTHS.map((w) => (
                    <button
                      key={w.label}
                      type="button"
                      onClick={() => setPenWidth(w.value)}
                      className={`px-2 py-1 rounded cursor-pointer ${
                        penWidth === w.value
                          ? 'bg-white text-sky-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {mode === 'draw' ? (
            <div className="space-y-2">
              <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 overflow-hidden select-none">
                <canvas
                  ref={canvasRef}
                  width={LOGICAL_WIDTH * EXPORT_SCALE}
                  height={LOGICAL_HEIGHT * EXPORT_SCALE}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishActiveStroke}
                  onPointerCancel={finishActiveStroke}
                  className="block w-full h-44 sm:h-48 touch-none cursor-crosshair bg-white"
                />
                <div className="pointer-events-none absolute inset-x-6 bottom-6 border-b border-slate-300/80" />
                {strokes.length === 0 && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-400">
                    Draw your signature here using mouse, stylus, or finger
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={strokes.length === 0}
                    onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-45 text-xs font-semibold text-slate-700 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Undo</span>
                  </button>
                  <button
                    type="button"
                    disabled={strokes.length === 0}
                    onClick={() => setStrokes([])}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-rose-50 hover:text-rose-700 disabled:opacity-45 text-xs font-semibold text-slate-700 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
                <span className="text-[11px] text-slate-500">
                  Saved with transparent background
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Signer Name or Initials
                </span>
                <input
                  type="text"
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder="Type name to generate signature..."
                  className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-3 gap-2">
                {TYPED_STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setTypedStyleId(st.id)}
                    className={`rounded-lg border px-2.5 py-2 text-center cursor-pointer transition-colors ${
                      typedStyleId === st.id
                        ? 'border-sky-500 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {st.label}
                    </div>
                  </button>
                ))}
              </div>

              <div className="relative rounded-xl border border-slate-200 bg-white h-36 px-4 flex items-center justify-center overflow-hidden">
                <canvas
                  ref={typedPreviewCanvasRef}
                  width={LOGICAL_WIDTH * EXPORT_SCALE}
                  height={LOGICAL_HEIGHT * EXPORT_SCALE}
                  className="block w-full h-full object-contain"
                />
                {!typedText.trim() && (
                  <span className="pointer-events-none absolute text-xs text-slate-400 italic">
                    Signature preview appears here
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold shadow-2xs cursor-pointer disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Use Signature'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
