export const R2_DEFAULT_QUOTA_BYTES = 10_000_000_000; // 10 GB Cloudflare R2 free tier (decimal GB)
export const R2_DEFAULT_WARN_REMAINING_BYTES = 1_000_000_000; // <= 1 GB left triggers low-space warning
export const R2_DEFAULT_BLOCK_REMAINING_BYTES = 100_000_000; // < 100 MB left blocks all new uploads

export type R2QuotaLevel = 'ok' | 'warning' | 'blocked';

export interface R2QuotaLimits {
  limitBytes: number;
  warnRemainingBytes: number;
  blockRemainingBytes: number;
}

export interface R2StorageStatus {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  objectCount: number;
  usedPercent: number;
  level: R2QuotaLevel;
  message: string | null;
}

export function formatStorageBytes(bytes: number): string {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safe >= 1_000_000_000) {
    return `${(safe / 1_000_000_000).toFixed(2)} GB`;
  }
  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(1)} MB`;
  }
  if (safe >= 1_000) {
    return `${(safe / 1_000).toFixed(0)} KB`;
  }
  return `${Math.round(safe)} B`;
}

export function resolveR2QuotaLimits(envLike?: {
  R2_QUOTA_BYTES?: string | number;
  R2_WARN_REMAINING_BYTES?: string | number;
  R2_BLOCK_REMAINING_BYTES?: string | number;
}): R2QuotaLimits {
  const parsePositive = (val: string | number | undefined, fallback: number): number => {
    if (val === undefined || val === null || val === '') return fallback;
    const parsed = Number(val);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  };
  return {
    limitBytes: parsePositive(envLike?.R2_QUOTA_BYTES, R2_DEFAULT_QUOTA_BYTES),
    warnRemainingBytes: parsePositive(
      envLike?.R2_WARN_REMAINING_BYTES,
      R2_DEFAULT_WARN_REMAINING_BYTES
    ),
    blockRemainingBytes: parsePositive(
      envLike?.R2_BLOCK_REMAINING_BYTES,
      R2_DEFAULT_BLOCK_REMAINING_BYTES
    ),
  };
}

/**
 * Evaluates current Cloudflare R2 usage against free-tier quota limits.
 * Warns when <= 1 GB remains and blocks new uploads when < 100 MB remains.
 */
export function evaluateR2Quota(
  usedBytes: number,
  objectCount: number,
  limits: R2QuotaLimits = {
    limitBytes: R2_DEFAULT_QUOTA_BYTES,
    warnRemainingBytes: R2_DEFAULT_WARN_REMAINING_BYTES,
    blockRemainingBytes: R2_DEFAULT_BLOCK_REMAINING_BYTES,
  }
): R2StorageStatus {
  const safeUsed = Math.max(0, Math.floor(Number.isFinite(usedBytes) ? usedBytes : 0));
  const safeCount = Math.max(0, Math.floor(Number.isFinite(objectCount) ? objectCount : 0));
  const remainingBytes = Math.max(0, limits.limitBytes - safeUsed);
  const usedPercent =
    limits.limitBytes > 0
      ? Math.min(100, Number(((safeUsed / limits.limitBytes) * 100).toFixed(1)))
      : 100;

  if (remainingBytes < limits.blockRemainingBytes) {
    return {
      usedBytes: safeUsed,
      limitBytes: limits.limitBytes,
      remainingBytes,
      objectCount: safeCount,
      usedPercent,
      level: 'blocked',
      message: `Image uploads are blocked: only ${formatStorageBytes(remainingBytes)} remaining in Cloudflare R2 free tier (minimum ${formatStorageBytes(limits.blockRemainingBytes)} reserve required). Delete unused photos or projects to free space.`,
    };
  }

  if (remainingBytes <= limits.warnRemainingBytes) {
    return {
      usedBytes: safeUsed,
      limitBytes: limits.limitBytes,
      remainingBytes,
      objectCount: safeCount,
      usedPercent,
      level: 'warning',
      message: `Low Cloudflare R2 storage space: ${formatStorageBytes(remainingBytes)} remaining out of ${formatStorageBytes(limits.limitBytes)} free tier. Uploads will lock below ${formatStorageBytes(limits.blockRemainingBytes)}.`,
    };
  }

  return {
    usedBytes: safeUsed,
    limitBytes: limits.limitBytes,
    remainingBytes,
    objectCount: safeCount,
    usedPercent,
    level: 'ok',
    message: null,
  };
}

/**
 * Server- and client-side upload admission guard.
 */
export function canAcceptUpload(
  usedBytes: number,
  incomingBytes: number,
  objectCount = 0,
  limits: R2QuotaLimits = {
    limitBytes: R2_DEFAULT_QUOTA_BYTES,
    warnRemainingBytes: R2_DEFAULT_WARN_REMAINING_BYTES,
    blockRemainingBytes: R2_DEFAULT_BLOCK_REMAINING_BYTES,
  }
):
  | { allowed: true; projectedStatus: R2StorageStatus }
  | { allowed: false; reason: string; status: R2StorageStatus } {
  const currentStatus = evaluateR2Quota(usedBytes, objectCount, limits);
  if (currentStatus.level === 'blocked') {
    return {
      allowed: false,
      reason:
        currentStatus.message ??
        'Upload blocked because R2 free-tier storage has less than 100 MB remaining.',
      status: currentStatus,
    };
  }

  const safeIncoming = Math.max(0, Math.floor(Number.isFinite(incomingBytes) ? incomingBytes : 0));
  const projectedRemaining = Math.max(0, limits.limitBytes - (currentStatus.usedBytes + safeIncoming));
  if (projectedRemaining < limits.blockRemainingBytes) {
    return {
      allowed: false,
      reason: `Upload blocked: adding this ${formatStorageBytes(safeIncoming)} image would leave only ${formatStorageBytes(projectedRemaining)} in R2 free tier (below the ${formatStorageBytes(limits.blockRemainingBytes)} reserve threshold).`,
      status: currentStatus,
    };
  }

  return {
    allowed: true,
    projectedStatus: evaluateR2Quota(
      currentStatus.usedBytes + safeIncoming,
      currentStatus.objectCount + 1,
      limits
    ),
  };
}
