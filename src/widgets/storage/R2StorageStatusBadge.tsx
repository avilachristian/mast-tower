import { AlertOctagon, AlertTriangle, HardDrive, RefreshCw, X } from 'lucide-react';
import { useStorageQuotaStore } from '@/shared/state/storageQuotaStore';
import { formatStorageBytes } from '@/shared/storage/r2Quota';

export function R2StorageHeaderPill() {
  const status = useStorageQuotaStore((s) => s.status);
  const loading = useStorageQuotaStore((s) => s.loading);
  const reconcileStatus = useStorageQuotaStore((s) => s.reconcileStatus);

  if (!status) return null;

  const badgeTone =
    status.level === 'blocked'
      ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
      : status.level === 'warning'
        ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100';

  return (
    <button
      type="button"
      onClick={() => void reconcileStatus()}
      disabled={loading}
      title={`Cloudflare R2 Free Tier: ${formatStorageBytes(status.usedBytes)} used / ${formatStorageBytes(status.limitBytes)} (${formatStorageBytes(status.remainingBytes)} remaining). Click to sync bucket usage.`}
      className={`hidden lg:inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold transition cursor-pointer disabled:opacity-60 ${badgeTone}`}
    >
      <HardDrive className="w-3.5 h-3.5 shrink-0" />
      <span>
        R2: {formatStorageBytes(status.remainingBytes)} left
      </span>
      {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
    </button>
  );
}

export function R2StorageAlertBanner() {
  const status = useStorageQuotaStore((s) => s.status);
  const loading = useStorageQuotaStore((s) => s.loading);
  const bannerDismissed = useStorageQuotaStore((s) => s.bannerDismissed);
  const dismissBanner = useStorageQuotaStore((s) => s.dismissBanner);
  const reconcileStatus = useStorageQuotaStore((s) => s.reconcileStatus);

  if (!status || status.level === 'ok') return null;
  if (status.level === 'warning' && bannerDismissed) return null;

  const isBlocked = status.level === 'blocked';

  return (
    <div
      role="alert"
      className={`print:hidden px-3 sm:px-4 py-2 border-b text-xs flex flex-wrap items-center justify-between gap-2 ${
        isBlocked
          ? 'bg-rose-50 border-rose-300 text-rose-950'
          : 'bg-amber-50 border-amber-300 text-amber-950'
      }`}
    >
      <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
        {isBlocked ? (
          <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
        )}
        <div className="min-w-0">
          <span className="font-bold">
            {isBlocked
              ? 'R2 Uploads Blocked (< 100 MB Left): '
              : 'Low R2 Storage Warning (≤ 1 GB Left): '}
          </span>
          <span>
            {formatStorageBytes(status.usedBytes)} used of{' '}
            {formatStorageBytes(status.limitBytes)} free tier (
            <strong>{formatStorageBytes(status.remainingBytes)} remaining</strong>
            {status.objectCount > 0 ? ` across ${status.objectCount} images` : ''}).{' '}
            {isBlocked
              ? 'Delete unused photos or projects before uploading new images.'
              : 'Uploads will automatically lock below 100 MB remaining.'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => void reconcileStatus()}
          disabled={loading}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
            isBlocked
              ? 'border-rose-300 bg-white text-rose-800 hover:bg-rose-100'
              : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100'
          }`}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Recheck R2</span>
        </button>

        {!isBlocked && (
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Dismiss storage warning"
            className="p-1 rounded-md text-amber-700 hover:bg-amber-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
