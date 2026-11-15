import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useFeedbackStore, type DialogTone } from '@/shared/state/feedbackStore';

const TONE_STYLES: Record<
  DialogTone,
  {
    headerBg: string;
    iconBox: string;
    kickerText: string;
    closeBtn: string;
    confirmBtn: string;
    kickerLabel: string;
    Icon: typeof Info;
  }
> = {
  danger: {
    headerBg: 'border-rose-200 bg-rose-50',
    iconBox: 'bg-rose-100 border-rose-300 text-rose-700',
    kickerText: 'text-rose-800',
    closeBtn: 'border-rose-200 bg-white hover:bg-rose-100',
    confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
    kickerLabel: 'Confirmation / Error',
    Icon: AlertCircle,
  },
  warning: {
    headerBg: 'border-amber-200 bg-amber-50',
    iconBox: 'bg-amber-100 border-amber-300 text-amber-700',
    kickerText: 'text-amber-800',
    closeBtn: 'border-amber-200 bg-white hover:bg-amber-100',
    confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
    kickerLabel: 'Attention',
    Icon: AlertTriangle,
  },
  success: {
    headerBg: 'border-emerald-200 bg-emerald-50',
    iconBox: 'bg-emerald-100 border-emerald-300 text-emerald-700',
    kickerText: 'text-emerald-800',
    closeBtn: 'border-emerald-200 bg-white hover:bg-emerald-100',
    confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    kickerLabel: 'Completed',
    Icon: CheckCircle2,
  },
  info: {
    headerBg: 'border-sky-200 bg-sky-50',
    iconBox: 'bg-sky-100 border-sky-300 text-sky-700',
    kickerText: 'text-sky-800',
    closeBtn: 'border-sky-200 bg-white hover:bg-sky-100',
    confirmBtn: 'bg-slate-900 hover:bg-slate-800 text-white',
    kickerLabel: 'Notice',
    Icon: Info,
  },
};

export function AppDialogModal() {
  const activeDialog = useFeedbackStore((s) => s.activeDialog);
  const resolveActiveDialog = useFeedbackStore((s) => s.resolveActiveDialog);

  useEffect(() => {
    if (!activeDialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveActiveDialog(activeDialog.kind === 'alert');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDialog, resolveActiveDialog]);

  if (!activeDialog || typeof document === 'undefined') return null;

  const tone = activeDialog.tone ?? 'info';
  const style = TONE_STYLES[tone];
  const { Icon } = style;
  const isConfirm = activeDialog.kind === 'confirm';

  return createPortal(
    <div
      className="fixed inset-0 z-[70] print:hidden bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-dialog-modal-title"
      onClick={() => resolveActiveDialog(!isConfirm)}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-start justify-between gap-3 px-4 py-3.5 border-b ${style.headerBg}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${style.iconBox}`}
            >
              <Icon className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <div className={`text-[10px] font-bold uppercase tracking-wider ${style.kickerText}`}>
                {isConfirm ? 'Confirm Action' : style.kickerLabel}
              </div>
              <h3
                id="app-dialog-modal-title"
                className="text-sm font-bold text-slate-900 leading-tight"
              >
                {activeDialog.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => resolveActiveDialog(!isConfirm)}
            aria-label="Close dialog"
            title="Close"
            className={`h-8 w-8 inline-flex items-center justify-center rounded-lg border text-slate-600 hover:text-slate-900 cursor-pointer shrink-0 ${style.closeBtn}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs text-slate-700">
          <p className="font-medium text-slate-900 leading-relaxed whitespace-pre-line">
            {activeDialog.message}
          </p>
          {activeDialog.detail && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[11px] text-slate-600 leading-relaxed whitespace-pre-line">
              {activeDialog.detail}
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
          {isConfirm && (
            <button
              type="button"
              onClick={() => resolveActiveDialog(false)}
              className="inline-flex items-center justify-center min-h-9 sm:min-h-0 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              {activeDialog.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button
            type="button"
            autoFocus={!isConfirm}
            onClick={() => resolveActiveDialog(true)}
            className={`inline-flex items-center justify-center min-h-9 sm:min-h-0 px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs ${style.confirmBtn}`}
          >
            {activeDialog.confirmLabel ?? (isConfirm ? 'Confirm' : 'OK')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
