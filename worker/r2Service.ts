import type { MastProjectState } from '../src/entities/project/types';
import {
  canAcceptUpload,
  evaluateR2Quota,
  resolveR2QuotaLimits,
  type R2StorageStatus,
} from '../src/shared/storage/r2Quota';
import type { Env } from './types';

export const MEDIA_URL_PREFIX = '/api/images/';
export const MAX_SINGLE_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB max per single upload
const SQL_IN_CHUNK_SIZE = 75;
const D1_BATCH_CHUNK_SIZE = 50;
const R2_DELETE_BATCH_SIZE = 500;
const ORPHAN_UNLINKED_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (prevents deleting images staged offline or during interrupted syncs)

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export type MediaCategory = 'inspection' | 'daily_log' | 'logo' | 'signature';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Validates image binary signatures (magic bytes) to prevent arbitrary file uploads.
 * Permitted: JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A), WebP (RIFF....WEBP).
 * SVG is blocked per security policy.
 */
export function validateImageMagicBytes(bytes: Uint8Array): { valid: boolean; detectedMime?: string } {
  if (bytes.length < 12) return { valid: false };

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, detectedMime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { valid: true, detectedMime: 'image/png' };
  }

  // WebP: RIFF (bytes 0..3) and WEBP (bytes 8..11)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { valid: true, detectedMime: 'image/webp' };
  }

  return { valid: false };
}

export class R2UploadRejectedError extends Error {
  statusCode: 400 | 413 | 415 | 507;
  code: string;
  storage?: R2StorageStatus;

  constructor(
    statusCode: 400 | 413 | 415 | 507,
    code: string,
    message: string,
    storage?: R2StorageStatus
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.storage = storage;
  }
}

export function extractObjectKeyFromMediaUrl(
  value: string | undefined | null
): string | null {
  if (!value || typeof value !== 'string') return null;
  if (!value.startsWith(MEDIA_URL_PREFIX)) return null;
  const key = value.slice(MEDIA_URL_PREFIX.length).split('?')[0].trim();
  return key.length > 0 ? key : null;
}

export function extractMediaKeysFromProjectState(
  state: MastProjectState | undefined | null
): Set<string> {
  const keys = new Set<string>();
  if (!state) return keys;

  const collectUrl = (url: string | undefined) => {
    const key = extractObjectKeyFromMediaUrl(url);
    if (key) keys.add(key);
  };

  for (const f of state.foundations ?? []) {
    collectUrl(f.inspectionMeta?.inspectorSignatureUrl);
    collectUrl(f.inspectionMeta?.verifiedSignatureUrl);
    if (f.inspectionChecklist) {
      for (const entry of Object.values(f.inspectionChecklist)) {
        collectUrl(entry?.photoDataUrl);
      }
    }
  }

  for (const sec of state.verticalMast?.sections ?? []) {
    collectUrl(sec.inspectionMeta?.inspectorSignatureUrl);
    collectUrl(sec.inspectionMeta?.verifiedSignatureUrl);
    if (sec.inspectionChecklist) {
      for (const entry of Object.values(sec.inspectionChecklist)) {
        collectUrl(entry?.photoDataUrl);
      }
    }
  }

  for (const layer of state.verticalMast?.guyLayers ?? []) {
    collectUrl(layer.inspectionMeta?.inspectorSignatureUrl);
    collectUrl(layer.inspectionMeta?.verifiedSignatureUrl);
    if (layer.inspectionChecklist) {
      for (const entry of Object.values(layer.inspectionChecklist)) {
        collectUrl(entry?.photoDataUrl);
      }
    }
  }

  for (const log of state.dailyLogs ?? []) {
    for (const doc of log.documentationItems ?? []) {
      collectUrl(doc.photoDataUrl);
    }
  }

  const logos = state.reportDetails?.logos;
  if (logos) {
    collectUrl(logos.left?.dataUrl);
    collectUrl(logos.center?.dataUrl);
    collectUrl(logos.right?.dataUrl);
  }

  collectUrl(state.reportDetails?.preparedSignatureUrl);
  collectUrl(state.reportDetails?.checkedSignatureUrl);
  collectUrl(state.reportDetails?.approvedSignatureUrl);
  collectUrl(state.reportDetails?.safetyOfficerSignatureUrl);

  return keys;
}

export async function getR2StorageStatus(env: Env): Promise<R2StorageStatus> {
  const counter = await env.DB.prepare(
    'SELECT total_bytes AS usedBytes, object_count AS objectCount FROM storage_counters WHERE id = 1'
  ).first<{ usedBytes: number; objectCount: number }>();

  if (counter) {
    const limits = resolveR2QuotaLimits(env);
    return evaluateR2Quota(counter.usedBytes ?? 0, counter.objectCount ?? 0, limits);
  }

  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(size_bytes), 0) AS usedBytes, COUNT(*) AS objectCount FROM media_objects'
  ).first<{ usedBytes: number; objectCount: number }>();

  const limits = resolveR2QuotaLimits(env);
  return evaluateR2Quota(row?.usedBytes ?? 0, row?.objectCount ?? 0, limits);
}

async function recomputeStorageCounters(env: Env): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(size_bytes), 0) AS usedBytes, COUNT(*) AS objectCount FROM media_objects'
  ).first<{ usedBytes: number; objectCount: number }>();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO storage_counters (id, total_bytes, object_count, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       total_bytes = excluded.total_bytes,
       object_count = excluded.object_count,
       updated_at = excluded.updated_at`
  )
    .bind(row?.usedBytes ?? 0, row?.objectCount ?? 0, now)
    .run();
}

/**
 * Scans the actual R2 bucket via list() to synchronize D1's media_objects accounting table,
 * prunes stale unlinked temporary uploads older than 24 hours, and refreshes storage_counters.
 */
export async function reconcileR2BucketUsage(env: Env): Promise<R2StorageStatus> {
  const bucketObjects = new Map<
    string,
    { size: number; contentType: string; uploaded: string }
  >();
  let cursor: string | undefined;

  do {
    const listing = await env.IMAGES_BUCKET.list({
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    for (const obj of listing.objects) {
      bucketObjects.set(obj.key, {
        size: obj.size,
        contentType: obj.httpMetadata?.contentType || 'application/octet-stream',
        uploaded: obj.uploaded?.toISOString?.() || new Date().toISOString(),
      });
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  const existingRows = await env.DB.prepare(
    'SELECT object_key, size_bytes FROM media_objects'
  ).all<{ object_key: string; size_bytes: number }>();

  const existingMap = new Map(
    (existingRows.results ?? []).map((r) => [r.object_key, r.size_bytes])
  );

  const statements: ReturnType<Env['DB']['prepare']>[] = [];

  for (const existingKey of existingMap.keys()) {
    if (!bucketObjects.has(existingKey)) {
      statements.push(
        env.DB.prepare('DELETE FROM media_objects WHERE object_key = ?').bind(existingKey)
      );
    }
  }

  for (const [key, meta] of bucketObjects.entries()) {
    const knownSize = existingMap.get(key);
    if (knownSize === undefined) {
      const parts = key.split('/');
      const projectId = parts[0] === 'projects' && parts[1] ? parts[1] : null;
      const category = parts[2] || 'daily_log';
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO media_objects (object_key, project_id, category, content_type, size_bytes, original_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(key, projectId, category, meta.contentType, meta.size, null, meta.uploaded)
      );
    } else if (knownSize !== meta.size) {
      statements.push(
        env.DB.prepare(
          'UPDATE media_objects SET size_bytes = ? WHERE object_key = ?'
        ).bind(meta.size, key)
      );
    }
  }

  for (const batch of chunkArray(statements, D1_BATCH_CHUNK_SIZE)) {
    await env.DB.batch(batch);
  }

  // Sweep stale unlinked uploads older than 24h (never referenced by project_media)
  const cutoffIso = new Date(Date.now() - ORPHAN_UNLINKED_TTL_MS).toISOString();
  const staleRows = await env.DB.prepare(
    `SELECT m.object_key
     FROM media_objects m
     WHERE m.created_at < ?
       AND NOT EXISTS (
         SELECT 1 FROM project_media pm WHERE pm.object_key = m.object_key
       )`
  )
    .bind(cutoffIso)
    .all<{ object_key: string }>();

  const staleKeys = (staleRows.results ?? []).map((r) => r.object_key).filter(Boolean);
  if (staleKeys.length > 0) {
    for (const r2Chunk of chunkArray(staleKeys, R2_DELETE_BATCH_SIZE)) {
      await env.IMAGES_BUCKET.delete(r2Chunk);
    }
    const delStmts = chunkArray(staleKeys, SQL_IN_CHUNK_SIZE).map((chunk) => {
      const placeholders = chunk.map(() => '?').join(', ');
      return env.DB.prepare(
        `DELETE FROM media_objects WHERE object_key IN (${placeholders})`
      ).bind(...chunk);
    });
    for (const batch of chunkArray(delStmts, D1_BATCH_CHUNK_SIZE)) {
      await env.DB.batch(batch);
    }
  }

  await recomputeStorageCounters(env);
  return getR2StorageStatus(env);
}

export async function uploadImageToR2(
  env: Env,
  params: {
    projectId: string;
    category: MediaCategory;
    contentType: string;
    originalName?: string;
    bytes: ArrayBuffer | Uint8Array;
  }
): Promise<{
  objectKey: string;
  url: string;
  sizeBytes: number;
  storage: R2StorageStatus;
}> {
  const normalizedMime = params.contentType.split(';')[0].trim().toLowerCase();
  const ext = MIME_TO_EXT[normalizedMime];
  if (!ext) {
    throw new R2UploadRejectedError(
      415,
      'UNSUPPORTED_IMAGE_TYPE',
      'Only JPEG, PNG, or WebP images are supported.'
    );
  }

  const uint8 = params.bytes instanceof Uint8Array ? params.bytes : new Uint8Array(params.bytes);
  const magic = validateImageMagicBytes(uint8);
  if (!magic.valid) {
    throw new R2UploadRejectedError(
      415,
      'INVALID_IMAGE_SIGNATURE',
      'Uploaded file content does not match a valid JPEG, PNG, or WebP image signature.'
    );
  }

  const sizeBytes = params.bytes.byteLength;
  if (sizeBytes <= 0) {
    throw new R2UploadRejectedError(400, 'EMPTY_FILE', 'Uploaded image file is empty.');
  }
  if (sizeBytes > MAX_SINGLE_IMAGE_BYTES) {
    throw new R2UploadRejectedError(
      413,
      'FILE_TOO_LARGE',
      'Image exceeds the 8 MB maximum upload size.'
    );
  }

  const currentStatus = await getR2StorageStatus(env);
  const limits = resolveR2QuotaLimits(env);
  const admission = canAcceptUpload(
    currentStatus.usedBytes,
    sizeBytes,
    currentStatus.objectCount,
    limits
  );

  if (!admission.allowed) {
    throw new R2UploadRejectedError(
      507,
      'R2_STORAGE_BLOCKED',
      admission.reason,
      admission.status
    );
  }

  const safeProjectId =
    params.projectId.replace(/[^a-zA-Z0-9_-]/g, '') || 'unassigned';
  const objectKey = `projects/${safeProjectId}/${params.category}/${crypto.randomUUID()}.${ext}`;
  const now = new Date().toISOString();

  await env.IMAGES_BUCKET.put(objectKey, params.bytes, {
    httpMetadata: {
      contentType: normalizedMime === 'image/jpg' ? 'image/jpeg' : normalizedMime,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  // Verify project existence so FK constraint never fails if project was drafted offline first
  const projectExists = await env.DB.prepare(
    'SELECT 1 AS ok FROM projects WHERE id = ?'
  )
    .bind(safeProjectId)
    .first<{ ok: number }>();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO media_objects (object_key, project_id, category, content_type, size_bytes, original_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        objectKey,
        projectExists ? safeProjectId : null,
        params.category,
        normalizedMime,
        sizeBytes,
        params.originalName?.slice(0, 180) ?? null,
        now
      ),
      env.DB.prepare(
        `INSERT INTO storage_counters (id, total_bytes, object_count, updated_at)
         VALUES (1, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           total_bytes = total_bytes + excluded.total_bytes,
           object_count = object_count + 1,
           updated_at = excluded.updated_at`
      ).bind(sizeBytes, now),
    ]);
  } catch (dbErr) {
    // Rollback R2 object if D1 accounting fails so quota & objects stay consistent
    await env.IMAGES_BUCKET.delete(objectKey).catch(() => undefined);
    throw dbErr;
  }

  const updatedStatus = await getR2StorageStatus(env);

  return {
    objectKey,
    url: `${MEDIA_URL_PREFIX}${objectKey}`,
    sizeBytes,
    storage: updatedStatus,
  };
}

/**
 * Deletes candidate R2 objects only when zero remaining projects reference their key in project_media,
 * safely preserving shared assets across duplicated projects using indexed queries and batched deletes.
 */
export async function cleanupOrphanedMediaKeys(
  env: Env,
  candidateKeys: Iterable<string>
): Promise<number> {
  const uniqueKeys = Array.from(new Set(Array.from(candidateKeys).filter(Boolean)));
  if (uniqueKeys.length === 0) return 0;

  const referencedKeys = new Set<string>();
  for (const chunk of chunkArray(uniqueKeys, SQL_IN_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await env.DB.prepare(
      `SELECT DISTINCT object_key FROM project_media WHERE object_key IN (${placeholders})`
    )
      .bind(...chunk)
      .all<{ object_key: string }>();
    for (const r of rows.results ?? []) {
      referencedKeys.add(r.object_key);
    }
  }

  const orphanKeys = uniqueKeys.filter((k) => !referencedKeys.has(k));
  if (orphanKeys.length === 0) return 0;

  let freedBytes = 0;
  let trackedRowsCount = 0;
  for (const chunk of chunkArray(orphanKeys, SQL_IN_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    const sizeRows = await env.DB.prepare(
      `SELECT object_key, size_bytes FROM media_objects WHERE object_key IN (${placeholders})`
    )
      .bind(...chunk)
      .all<{ object_key: string; size_bytes: number }>();
    for (const r of sizeRows.results ?? []) {
      freedBytes += Number(r.size_bytes ?? 0);
      trackedRowsCount += 1;
    }
  }

  for (const r2Batch of chunkArray(orphanKeys, R2_DELETE_BATCH_SIZE)) {
    await env.IMAGES_BUCKET.delete(r2Batch);
  }

  const deleteStatements: ReturnType<Env['DB']['prepare']>[] = [];
  for (const chunk of chunkArray(orphanKeys, SQL_IN_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    deleteStatements.push(
      env.DB.prepare(
        `DELETE FROM media_objects WHERE object_key IN (${placeholders})`
      ).bind(...chunk)
    );
  }

  const now = new Date().toISOString();
  if (trackedRowsCount > 0) {
    deleteStatements.push(
      env.DB.prepare(
        `UPDATE storage_counters
         SET total_bytes = MAX(0, total_bytes - ?),
             object_count = MAX(0, object_count - ?),
             updated_at = ?
         WHERE id = 1`
      ).bind(freedBytes, trackedRowsCount, now)
    );
  }

  for (const batch of chunkArray(deleteStatements, D1_BATCH_CHUNK_SIZE)) {
    await env.DB.batch(batch);
  }

  return orphanKeys.length;
}
