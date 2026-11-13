import { AlertTriangle, ArrowDownRight, X } from 'lucide-react';
import { useUiStore } from '@/shared/state/uiStore';

export function VerticalMastOrderModal() {
  const mastViolation = useUiStore((s) => s.mastOrderViolation);
  const foundationViolation = useUiStore((s) => s.foundationOrderViolation);
  const setMastOrderViolation = useUiStore((s) => s.setMastOrderViolation);
  const setFoundationOrderViolation = useUiStore(
    (s) => s.setFoundationOrderViolation
  );
  const setSelectedMastTarget = useUiStore((s) => s.setSelectedMastTarget);

  const activeViolation = mastViolation ?? foundationViolation;
  if (!activeViolation) return null;

  const isMast = Boolean(mastViolation);
  const kicker = isMast ? 'Erection Sequence Check' : 'Foundation Activity Check';

  const handleClose = () => {
    setMastOrderViolation(null);
    setFoundationOrderViolation(null);
  };

  const handleJumpToBlocking = () => {
    if (mastViolation?.blockingSectionId) {
      setSelectedMastTarget({
        kind: 'section',
        id: mastViolation.blockingSectionId,
      });
    }
    handleClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mast-order-modal-title"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
              <AlertTriangle className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                {kicker}
              </div>
              <h3
                id="mast-order-modal-title"
                className="text-sm font-bold text-slate-900 leading-tight"
              >
                {activeViolation.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close message"
            title="Close"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-amber-200 bg-white hover:bg-amber-100 text-slate-600 hover:text-slate-900 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs text-slate-700">
          <p className="font-medium text-slate-900 leading-relaxed">
            {activeViolation.message}
          </p>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[11px] text-slate-600 leading-relaxed">
            {activeViolation.detail}
          </div>
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
          {mastViolation?.blockingSectionId && (
            <button
              type="button"
              onClick={handleJumpToBlocking}
              className="inline-flex items-center gap-1.5 min-h-9 sm:min-h-0 px-3 py-1.5 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold cursor-pointer"
            >
              <ArrowDownRight className="w-3.5 h-3.5" />
              Go to {mastViolation.blockingSectionId}
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center justify-center min-h-9 sm:min-h-0 px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
