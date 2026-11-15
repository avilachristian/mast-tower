import { describe, expect, it } from 'vitest';
import {
  canAcceptUpload,
  evaluateR2Quota,
  formatStorageBytes,
  R2_DEFAULT_BLOCK_REMAINING_BYTES,
  R2_DEFAULT_QUOTA_BYTES,
  R2_DEFAULT_WARN_REMAINING_BYTES,
  resolveR2QuotaLimits,
} from '../src/shared/storage/r2Quota';

describe('R2 Free-Tier Quota Enforcement', () => {
  it('evaluates healthy usage as ok when more than 1 GB remains', () => {
    const status = evaluateR2Quota(8_500_000_000, 120);
    expect(status.level).toBe('ok');
    expect(status.remainingBytes).toBe(1_500_000_000);
    expect(status.limitBytes).toBe(R2_DEFAULT_QUOTA_BYTES);
    expect(status.message).toBeNull();
  });

  it('triggers low-storage warning at 1 GB or less remaining', () => {
    const atBoundary = evaluateR2Quota(
      R2_DEFAULT_QUOTA_BYTES - R2_DEFAULT_WARN_REMAINING_BYTES,
      200
    );
    expect(atBoundary.level).toBe('warning');
    expect(atBoundary.remainingBytes).toBe(1_000_000_000);
    expect(atBoundary.message).toContain('Low Cloudflare R2 storage space');

    const atQuarterGbLeft = evaluateR2Quota(9_750_000_000, 250);
    expect(atQuarterGbLeft.level).toBe('warning');
    expect(atQuarterGbLeft.remainingBytes).toBe(250_000_000);
  });

  it('blocks new uploads when less than 100 MB remains', () => {
    const atExactMinReserve = evaluateR2Quota(
      R2_DEFAULT_QUOTA_BYTES - R2_DEFAULT_BLOCK_REMAINING_BYTES,
      300
    );
    expect(atExactMinReserve.level).toBe('warning');

    const below100Mb = evaluateR2Quota(
      R2_DEFAULT_QUOTA_BYTES - R2_DEFAULT_BLOCK_REMAINING_BYTES + 1,
      301
    );
    expect(below100Mb.level).toBe('blocked');
    expect(below100Mb.remainingBytes).toBe(99_999_999);
    expect(below100Mb.message).toContain('Image uploads are blocked');
  });

  it('rejects uploads that would drop free space below the 100 MB reserve', () => {
    const used = R2_DEFAULT_QUOTA_BYTES - 102_000_000; // 102 MB remaining
    const blocked = canAcceptUpload(used, 3_000_000, 50); // would leave 99 MB < 100 MB
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.reason).toContain('reserve threshold');
    }

    const allowed = canAcceptUpload(used, 1_500_000, 50); // leaves 100.5 MB >= 100 MB
    expect(allowed.allowed).toBe(true);
  });

  it('parses custom env quota overrides and formats readable units', () => {
    const limits = resolveR2QuotaLimits({
      R2_QUOTA_BYTES: '10000',
      R2_WARN_REMAINING_BYTES: '2000',
      R2_BLOCK_REMAINING_BYTES: '500',
    });
    expect(limits).toEqual({
      limitBytes: 10000,
      warnRemainingBytes: 2000,
      blockRemainingBytes: 500,
    });

    expect(formatStorageBytes(10_000_000_000)).toBe('10.00 GB');
    expect(formatStorageBytes(100_000_000)).toBe('100.0 MB');
  });
});
