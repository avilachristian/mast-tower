import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useFeedbackStore, type ToastItem, type ToastTone } from '@/shared/state/feedbackStore';

const TOAST_STYLES: Record<
  ToastTone,
  { container: string; iconColor: string; dismissBtn: string; Icon: typeof Info }
> = {
  success: {
    container: 'border-emerald-300 bg-emerald-50/95 text-emerald-950',
    iconColor: 'text-emerald-600',
    dismissBtn: 'text-emerald-700 hover:bg-emerald-100',
    Icon: CheckCircle2,
  },
  error: {
    container: 'border-rose-300 bg-rose-50/95 text-rose-950',
    iconColor: 'text-rose-600',
    dismissBtn: 'text-rose-700 hover:bg-rose-100',
    Icon: AlertCircle,
  },
  warning: {
    container: 'border-amber-300 bg-amber-50/95 text-amber-950',
    iconColor: 'text-amber-600',
    dismissBtn: 'text-amber-700 hover:bg-amber-100',
    Icon: AlertTriangle,
  },
  info: {
    container: 'border-sky-300 bg-sky-50/95 text-sky-950',
    iconColor: 'text-sky-600',
    dismissBtn: 'text-sky-700 hover:bg-sky-100',
    Icon: Info,
  },
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const dismissToast = useFeedbackStore((s) => s.dismissToast);
  const style = TOAST_STYLES[toast.tone];
  const { Icon } = style;

  useEffect(() => {
    if (toast.durationMs <= 0) return;
    const timer = window.setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.durationMs, dismissToast]);

  return (
    <div
      className={`pointer-events-auto flex items-start justify-between gap-2.5 rounded-xl border backdrop-blur px-3.5 py-2.5 text-xs shadow-lg ${style.container}`}
      role="status"
    >
      <div className="flex items-start gap-2 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${style.iconColor}`} />
        <div className="min-w-0 leading-snug">
          {toast.title && <div className="font-bold">{toast.title}</div>}
          <div className={toast.title ? 'opacity-90 mt-0.5' : 'font-medium'}>
            {toast.message}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
        className={`p-1 rounded-md cursor-pointer shrink-0 ${style.dismissBtn}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastBanner({ hasBottomNav = true }: { hasBottomNav?: boolean }) {
  const toasts = useFeedbackStore((s) => s.toasts);
  if (toasts.length === 0 || typeof document === 'undefined') return null;

  const bottomOffsetClass = hasBottomNav ? 'bottom-20 md:bottom-4' : 'bottom-4';

  return createPortal(
    <div
      aria-live="polite"
      className={`print:hidden fixed ${bottomOffsetClass} right-3 left-3 sm:left-auto sm:max-w-sm z-[60] flex flex-col gap-2 pointer-events-none`}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body
  );
}
