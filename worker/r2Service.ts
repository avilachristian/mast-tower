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

export type MediaCategory = 'inspection' | 'daily_log' | 'logo';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

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
    if (f.inspectionChecklist) {
      for (const entry of Object.values(f.inspectionChecklist)) {
        collectUrl(entry?.photoDataUrl);
      }
    }
  }

  for (const sec of state.verticalMast?.sections ?? []) {
    if (sec.inspectionChecklist) {
      for (const entry of Object.values(sec.inspectionChecklist)) {
        collectUrl(entry?.photoDataUrl);
      }
    }
  }

  for (const layer of state.verticalMast?.guyLayers ?? []) {
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

  return keys;
}

export async function getR2StorageStatus(env: Env): Promise<R2StorageStatus> {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(size_bytes), 0) AS usedBytes, COUNT(*) AS objectCount FROM media_objects'
  ).first<{ usedBytes: number; objectCount: number }>();

  const limits = resolveR2QuotaLimits(env);
  return evaluateR2Quota(row?.usedBytes ?? 0, row?.objectCount ?? 0, limits);
}

/**
 * Scans the actual R2 bucket via list() to synchronize D1's media_objects accounting table
 * in case objects were modified outside the Worker API.
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

  for (const existingKey of existingMap.keys()) {
    if (!bucketObjects.has(existingKey)) {
      await env.DB.prepare('DELETE FROM media_objects WHERE object_key = ?')
        .bind(existingKey)
        .run();
    }
  }

  for (const [key, meta] of bucketObjects.entries()) {
    const knownSize = existingMap.get(key);
    if (knownSize === undefined) {
      const parts = key.split('/');
      const projectId = parts[0] === 'projects' && parts[1] ? parts[1] : null;
      const category = parts[2] || 'daily_log';
      await env.DB.prepare(
        `INSERT OR IGNORE INTO media_objects (object_key, project_id, category, content_type, size_bytes, original_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(key, projectId, category, meta.contentType, meta.size, null, meta.uploaded)
        .run();
    } else if (knownSize !== meta.size) {
      await env.DB.prepare(
        'UPDATE media_objects SET size_bytes = ? WHERE object_key = ?'
      )
        .bind(meta.size, key)
        .run();
    }
  }

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
      'Only JPEG, PNG, WebP, or SVG images are supported.'
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

  await env.DB.prepare(
    `INSERT INTO media_objects (object_key, project_id, category, content_type, size_bytes, original_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      objectKey,
      projectExists ? safeProjectId : null,
      params.category,
      normalizedMime,
      sizeBytes,
      params.originalName?.slice(0, 180) ?? null,
      now
    )
    .run();

  const updatedStatus = await getR2StorageStatus(env);

  return {
    objectKey,
    url: `${MEDIA_URL_PREFIX}${objectKey}`,
    sizeBytes,
    storage: updatedStatus,
  };
}

/**
 * Deletes candidate R2 objects only when zero remaining projects reference their URL,
 * safely preserving shared assets across duplicated projects.
 */
export async function cleanupOrphanedMediaKeys(
  env: Env,
  candidateKeys: Iterable<string>
): Promise<number> {
  let deletedCount = 0;
  for (const key of candidateKeys) {
    if (!key) continue;
    const urlPattern = `%${MEDIA_URL_PREFIX}${key}%`;
    const refRow = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM projects WHERE state_json LIKE ?'
    )
      .bind(urlPattern)
      .first<{ cnt: number }>();

    if ((refRow?.cnt ?? 0) === 0) {
      await env.IMAGES_BUCKET.delete(key);
      await env.DB.prepare('DELETE FROM media_objects WHERE object_key = ?')
        .bind(key)
        .run();
      deletedCount += 1;
    }
  }
  return deletedCount;
}
