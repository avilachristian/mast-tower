import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock,
  Cloud,
  CloudDownload,
  CloudOff,
  CloudUpload,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { estimateInlineImagesUsage } from '@/shared/lib/imageUpload';
import { useAuthStore } from '@/shared/state/authStore';
import { useProjectStore } from '@/shared/state/projectStore';
import {
  doesRecordNeedSync,
  flushAllPendingSyncs,
  hydrateCloudWorkspace,
  MAX_SYNC_INTERVAL_MINUTES,
  MIN_SYNC_INTERVAL_MINUTES,
  syncActiveProjectNow,
  useCloudSyncStore,
} from '@/shared/storage/cloudSync';
import { formatStorageBytes } from '@/shared/storage/r2Quota';

const INTERVAL_PRESETS = [5, 15, 30, 60] as const;

function formatCountdownShort(msRemaining: number): string {
  if (msRemaining <= 0) return 'due';
  const totalSec = Math.ceil(msRemaining / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.ceil(totalSec / 60);
  return `${mins}m`;
}

function formatCountdownDetailed(msRemaining: number): string {
  if (msRemaining <= 0) return 'Due now';
  const totalSec = Math.ceil(msRemaining / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function CloudSyncControls() {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const offlineCached = useAuthStore((s) => s.offlineCached);

  const isSyncing = useCloudSyncStore((s) => s.isSyncing);
  const lastSyncedAt = useCloudSyncStore((s) => s.lastSyncedAt);
  const lastError = useCloudSyncStore((s) => s.lastError);
  const pendingDeleteIds = useCloudSyncStore((s) => s.pendingDeleteIds);
  const autoSyncEnabled = useCloudSyncStore((s) => s.autoSyncEnabled);
  const intervalMinutes = useCloudSyncStore((s) => s.intervalMinutes);
  const nextAutoSyncAt = useCloudSyncStore((s) => s.nextAutoSyncAt);
  const setAutoSyncConfig = useCloudSyncStore((s) => s.setAutoSyncConfig);

  const [open, setOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(String(intervalMinutes));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomMinutes(String(intervalMinutes));
  }, [intervalMinutes]);

  // Refresh countdown quickly while popover is open, and once every 30s when closed
  useEffect(() => {
    setNowMs(Date.now());
    const tickMs = open ? 1000 : 30_000;
    const timer = window.setInterval(() => setNowMs(Date.now()), tickMs);
    return () => window.clearInterval(timer);
  }, [open, nextAutoSyncAt]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const activeRecord = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId]
  );
  const activeDisplayName =
    activeRecord?.state.reportDetails?.projectName?.trim() ||
    activeRecord?.state.projectName ||
    'Active Project';

  const activeNeedsSync = doesRecordNeedSync(activeRecord);
  const activeStagedImages = useMemo(
    () => estimateInlineImagesUsage(activeRecord?.state),
    [activeRecord?.state]
  );

  const totalUnsyncedProjects = useMemo(
    () => projects.filter((p) => doesRecordNeedSync(p)).length,
    [projects]
  );

  const isOffline =
    offlineCached || (typeof navigator !== 'undefined' && navigator.onLine === false);
  const isConflict = activeRecord?.syncStatus === 'conflict';

  const remainingMs =
    autoSyncEnabled && nextAutoSyncAt !== null
      ? Math.max(0, nextAutoSyncAt - nowMs)
      : null;

  const pillTone = isSyncing
    ? 'border-sky-300 bg-sky-50 text-sky-800'
    : isOffline
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : isConflict
        ? 'border-rose-300 bg-rose-50 text-rose-800'
        : activeNeedsSync
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800';

  const handleApplyCustomMinutes = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number.parseInt(customMinutes, 10);
    if (!Number.isFinite(parsed)) return;
    setAutoSyncConfig({ autoSyncEnabled: true, intervalMinutes: parsed });
  };

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Split Control: 1-Click Sync Active Project + Schedule/Settings Trigger */}
      <div
        className={`inline-flex items-center rounded-lg sm:rounded-md border overflow-hidden shadow-2xs ${pillTone}`}
      >
        <button
          type="button"
          onClick={() => void syncActiveProjectNow()}
          disabled={isSyncing || isOffline}
          title={
            isOffline
              ? 'Offline — changes stay saved locally'
              : activeNeedsSync
                ? 'Sync active project & staged photos to Cloudflare now'
                : 'Active project is synced — click to check'
          }
          className="inline-flex items-center gap-1 min-h-10 sm:min-h-0 px-2.5 sm:px-2 py-2 sm:py-1 text-xs sm:text-[11px] font-semibold hover:bg-black/5 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSyncing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : isOffline ? (
            <CloudOff className="w-3.5 h-3.5 shrink-0" />
          ) : activeNeedsSync ? (
            <CloudUpload className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Cloud className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>
            {isSyncing
              ? 'Syncing'
              : isOffline
                ? 'Offline'
                : isConflict
                  ? 'Conflict'
                  : activeNeedsSync
                    ? 'Sync'
                    : 'Synced'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Configure auto-sync schedule and view sync details"
          title="Auto-sync timer settings & queue details"
          className="inline-flex items-center gap-1 min-h-10 sm:min-h-0 px-1.5 sm:px-1.5 py-2 sm:py-1 border-l border-current/20 text-[10px] font-bold hover:bg-black/5 transition cursor-pointer"
        >
          <Clock className="w-3 h-3 shrink-0 opacity-75" />
          <span className="hidden sm:inline tabular-nums">
            {!autoSyncEnabled
              ? 'Manual'
              : remainingMs !== null
                ? formatCountdownShort(remainingMs)
                : `${intervalMinutes}m`}
          </span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-75" />
        </button>
      </div>

      {/* Sync Settings & Queue Popover */}
      {open && (
        <div
          role="dialog"
          aria-label="Cloud Sync Settings"
          className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-full sm:mt-1.5 z-50 w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-slate-200 bg-white shadow-xl text-slate-800 p-3.5 space-y-3"
        >
          {/* Header Status */}
          <div className="space-y-1 border-b border-slate-100 pb-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 truncate">
                {activeDisplayName}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                  isConflict
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : activeNeedsSync
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {isConflict
                  ? 'Conflict'
                  : activeNeedsSync
                    ? 'Unsaved Edits'
                    : 'Synced'}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500">
              <span>
                {lastSyncedAt
                  ? `Last synced: ${new Date(lastSyncedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Not synced in this session'}
              </span>
              {autoSyncEnabled ? (
                <span className="font-medium text-slate-700 tabular-nums">
                  {activeNeedsSync && remainingMs !== null
                    ? `Auto-sync in ${formatCountdownDetailed(remainingMs)}`
                    : remainingMs !== null
                      ? `Check in ${formatCountdownDetailed(remainingMs)}`
                      : `Every ${intervalMinutes} min`}
                </span>
              ) : (
                <span className="font-medium text-slate-500">Manual only</span>
              )}
            </div>

            {activeStagedImages.count > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-900">
                <ImageIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  <strong>{activeStagedImages.uniqueCount}</strong> staged{' '}
                  {activeStagedImages.uniqueCount === 1 ? 'photo' : 'photos'} (~
                  {formatStorageBytes(activeStagedImages.estimatedBytes)}) will upload to R2 on Sync
                </span>
              </div>
            )}

            {lastError && (
              <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-[11px] text-rose-800">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{lastError}</span>
              </div>
            )}
          </div>

          {/* Interval Configurator */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-700">
                Active Project Auto-Sync Interval
              </span>
              <button
                type="button"
                onClick={() => setAutoSyncConfig({ autoSyncEnabled: !autoSyncEnabled })}
                className={`px-2 py-0.5 rounded-md font-semibold border cursor-pointer ${
                  autoSyncEnabled
                    ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                    : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {autoSyncEnabled ? 'Auto On' : 'Manual Only'}
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1">
              <button
                type="button"
                onClick={() => setAutoSyncConfig({ autoSyncEnabled: false })}
                className={`py-1.5 rounded-md border text-[11px] font-semibold cursor-pointer transition ${
                  !autoSyncEnabled
                    ? 'border-slate-800 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Off
              </button>
              {INTERVAL_PRESETS.map((mins) => {
                const selected = autoSyncEnabled && intervalMinutes === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() =>
                      setAutoSyncConfig({ autoSyncEnabled: true, intervalMinutes: mins })
                    }
                    className={`py-1.5 rounded-md border text-[11px] font-semibold cursor-pointer transition ${
                      selected
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {mins}m
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleApplyCustomMinutes} className="flex items-center gap-1.5">
              <label
                htmlFor="sync-interval-custom-input"
                className="text-[11px] text-slate-500 shrink-0"
              >
                Custom:
              </label>
              <input
                id="sync-interval-custom-input"
                type="number"
                min={MIN_SYNC_INTERVAL_MINUTES}
                max={MAX_SYNC_INTERVAL_MINUTES}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                className="w-16 px-2 py-1 rounded-md border border-slate-200 text-xs font-semibold text-slate-900 focus:border-sky-500 focus:outline-none tabular-nums"
              />
              <span className="text-[11px] text-slate-500">min</span>
              <button
                type="submit"
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                Set
              </button>
            </form>

            <p className="text-[10px] text-slate-400 leading-snug">
              Edits &amp; photos save locally in IndexedDB and only push to D1/R2 when you click Sync, publish to Client Showcase, or when the interval elapses with unsaved changes.
            </p>
          </div>

          {/* Sync Actions */}
          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <button
              type="button"
              disabled={isSyncing || isOffline}
              onClick={() => {
                setOpen(false);
                void syncActiveProjectNow();
              }}
              className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync Active Project Now</span>
            </button>

            {(totalUnsyncedProjects > 1 ||
              (totalUnsyncedProjects === 1 && !activeNeedsSync) ||
              pendingDeleteIds.length > 0) && (
              <button
                type="button"
                disabled={isSyncing || isOffline}
                onClick={() => {
                  setOpen(false);
                  void flushAllPendingSyncs();
                }}
                className="w-full py-1.5 px-3 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                <span>
                  Sync All Pending Projects ({totalUnsyncedProjects}
                  {pendingDeleteIds.length > 0 ? ` + ${pendingDeleteIds.length} del` : ''})
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={isSyncing || isOffline}
              onClick={() => {
                setOpen(false);
                void hydrateCloudWorkspace();
              }}
              className="w-full py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CloudDownload className="w-3.5 h-3.5 text-slate-500" />
              <span>Pull Latest from Cloud</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
