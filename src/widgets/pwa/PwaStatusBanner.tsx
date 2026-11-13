import { useEffect } from 'react';
import {
  CheckCircle2,
  Download,
  RefreshCw,
  Smartphone,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { usePwaStore } from '@/shared/pwa/pwaManager';

interface PwaStatusBannerProps {
  hasBottomNav?: boolean;
}

export function PwaStatusBanner({ hasBottomNav = true }: PwaStatusBannerProps) {
  const isOnline = usePwaStore((s) => s.isOnline);
  const offlineReady = usePwaStore((s) => s.offlineReady);
  const offlineReadyDismissed = usePwaStore((s) => s.offlineReadyDismissed);
  const updateAvailable = usePwaStore((s) => s.updateAvailable);
  const updateDismissed = usePwaStore((s) => s.updateDismissed);
  const isUpdating = usePwaStore((s) => s.isUpdating);
  const justUpdated = usePwaStore((s) => s.justUpdated);
  const currentBuild = usePwaStore((s) => s.currentBuild);
  const pendingBuild = usePwaStore((s) => s.pendingBuild);
  const applyUpdate = usePwaStore((s) => s.applyUpdate);
  const dismissUpdateBanner = usePwaStore((s) => s.dismissUpdateBanner);
  const dismissOfflineReady = usePwaStore((s) => s.dismissOfflineReady);
  const dismissJustUpdated = usePwaStore((s) => s.dismissJustUpdated);

  useEffect(() => {
    if (!justUpdated) return;
    const timer = window.setTimeout(() => dismissJustUpdated(), 6000);
    return () => window.clearTimeout(timer);
  }, [justUpdated, dismissJustUpdated]);

  useEffect(() => {
    if (!offlineReady || offlineReadyDismissed) return;
    const timer = window.setTimeout(() => dismissOfflineReady(), 6000);
    return () => window.clearTimeout(timer);
  }, [offlineReady, offlineReadyDismissed, dismissOfflineReady]);

  const showUpdateToast = updateAvailable && !updateDismissed;
  const showOfflineReadyToast = offlineReady && !offlineReadyDismissed && !showUpdateToast;
  const showJustUpdatedToast = justUpdated && !showUpdateToast;

  if (!showUpdateToast && !showOfflineReadyToast && !showJustUpdatedToast && isOnline) {
    return null;
  }

  const bottomOffsetClass = hasBottomNav ? 'bottom-20 md:bottom-4' : 'bottom-4';

  return (
    <div
      aria-live="polite"
      className={`print:hidden fixed ${bottomOffsetClass} right-3 left-3 sm:left-auto sm:max-w-sm z-40 flex flex-col gap-2 pointer-events-none`}
    >
      {!isOnline && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50/95 backdrop-blur px-3 py-2 text-xs font-medium text-amber-900 shadow-lg">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="leading-snug">
            Offline mode — changes are saved locally on this device.
          </span>
        </div>
      )}

      {showJustUpdatedToast && (
        <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50/95 backdrop-blur px-3 py-2.5 text-xs text-emerald-900 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold truncate">
              App updated to v{currentBuild.version}
              {currentBuild.buildId ? ` (${currentBuild.buildId.slice(0, 6)})` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={dismissJustUpdated}
            aria-label="Dismiss update confirmation"
            className="p-1 rounded-md text-emerald-700 hover:bg-emerald-100 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showOfflineReadyToast && (
        <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-xl border border-sky-200 bg-white/95 backdrop-blur px-3 py-2.5 text-xs text-slate-800 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="font-medium">
              App cached for offline field use.
            </span>
          </div>
          <button
            type="button"
            onClick={dismissOfflineReady}
            aria-label="Dismiss offline ready notification"
            className="p-1 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showUpdateToast && (
        <div
          role="alert"
          className="pointer-events-auto rounded-xl border border-sky-300 bg-slate-900 text-white p-3.5 shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
                <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">
                  New App Version Available
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                  {pendingBuild?.version
                    ? `Version ${pendingBuild.version}${
                        pendingBuild.buildId ? ` (${pendingBuild.buildId.slice(0, 6)})` : ''
                      } is ready. `
                    : 'A newer build is ready. '}
                  Your local projects stay safe.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissUpdateBanner}
              aria-label="Dismiss update notification"
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={dismissUpdateBanner}
              disabled={isUpdating}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => void applyUpdate()}
              disabled={isUpdating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-bold transition cursor-pointer disabled:opacity-70"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
              <span>{isUpdating ? 'Updating...' : 'Update Now'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact PWA & storage status bar for the Project Launcher footer so users can
 * verify offline/IndexedDB status, install the app, or check for updates anytime.
 */
export function PwaAppStatusBar() {
  const isOnline = usePwaStore((s) => s.isOnline);
  const isStandalone = usePwaStore((s) => s.isStandalone);
  const swRegistered = usePwaStore((s) => s.swRegistered);
  const updateAvailable = usePwaStore((s) => s.updateAvailable);
  const isUpdating = usePwaStore((s) => s.isUpdating);
  const checkStatus = usePwaStore((s) => s.checkStatus);
  const currentBuild = usePwaStore((s) => s.currentBuild);
  const canInstall = usePwaStore((s) => s.canInstall);
  const errorMessage = usePwaStore((s) => s.errorMessage);
  const checkForUpdates = usePwaStore((s) => s.checkForUpdates);
  const applyUpdate = usePwaStore((s) => s.applyUpdate);
  const promptInstall = usePwaStore((s) => s.promptInstall);

  const isChecking = checkStatus === 'checking';

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 shadow-2xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-amber-600" />
          )}
          <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
        </span>

        <span className="text-slate-300">·</span>

        <span>
          v{currentBuild.version}
          {currentBuild.buildId ? ` (${currentBuild.buildId.slice(0, 6)})` : ''}
        </span>

        <span className="text-slate-300">·</span>

        <span className="text-slate-500">
          {swRegistered ? 'Offline cache active' : 'Local IndexedDB storage'}
        </span>

        {checkStatus === 'up_to_date' && (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Up to date
          </span>
        )}
        {checkStatus === 'error' && errorMessage && (
          <span className="text-rose-600">{errorMessage}</span>
        )}
        {checkStatus === 'unsupported' && errorMessage && (
          <span className="text-slate-500">{errorMessage}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {canInstall && !isStandalone && (
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition cursor-pointer"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Install App</span>
          </button>
        )}

        {updateAvailable ? (
          <button
            type="button"
            onClick={() => void applyUpdate()}
            disabled={isUpdating}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold transition cursor-pointer disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isUpdating ? 'Updating...' : 'Update Available — Reload'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void checkForUpdates(true)}
            disabled={isChecking || !isOnline}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking...' : 'Check for Updates'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

