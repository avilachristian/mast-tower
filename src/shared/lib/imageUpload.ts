import { apiClient, R2StorageBlockedError } from '@/shared/api/client';
import { DEFAULT_REPORT_LOGOS } from '@/shared/assets/defaultLogos';
import { useAuthStore } from '@/shared/state/authStore';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useStorageQuotaStore } from '@/shared/state/storageQuotaStore';
import { canAcceptUpload, formatStorageBytes } from '@/shared/storage/r2Quota';

/**
 * Reads an uploaded image File and downscales it (max 960px dimension) into a
 * compressed JPEG data URL so inspection photos print sharply while staying lightweight in storage.
 */
export function readAndResizeImageFile(
  file: File,
  maxDimension = 960,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        reject(new Error('Empty image data.'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported or corrupted image format.'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function resizeLogoFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const rawUrl = String(reader.result || '');
      if (!rawUrl.startsWith('data:image/')) {
        resolve(rawUrl);
        return;
      }
      if (file.type === 'image/svg+xml') {
        resolve(rawUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxDim = 420;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const targetW = Math.max(1, Math.round((img.width || 1) * scale));
        const targetH = Math.max(1, Math.round((img.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const keepPng = file.type === 'image/png' || file.type === 'image/webp';
        resolve(canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.88));
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

export interface UploadedImageResult {
  url: string;
  name: string;
  queuedOffline: boolean;
}

/**
 * Resizes an image, enforces R2 free-tier storage quota limits (< 100 MB remaining blocks upload,
 * <= 1 GB remaining warns), and uploads to Cloudflare R2 when online — or stages as an offline
 * local data URL to be auto-uploaded to R2 when connectivity returns.
 */
export async function uploadOrStageProjectImage(params: {
  file: File;
  projectId: string;
  category: 'inspection' | 'daily_log' | 'logo';
  maxDimension?: number;
  quality?: number;
}): Promise<UploadedImageResult | null> {
  const { file, projectId, category, maxDimension = 960, quality = 0.8 } = params;
  const quotaStore = useStorageQuotaStore.getState();
  const feedback = useFeedbackStore.getState();

  // Immediate client-side block check before reading/resizing if R2 is already < 100 MB left
  if (quotaStore.status?.level === 'blocked') {
    await feedback.showAlert({
      tone: 'danger',
      title: 'Image Upload Blocked (R2 Storage Full)',
      message:
        quotaStore.status.message ||
        'Cloudflare R2 free-tier storage has less than 100 MB left. Delete unused images or projects before uploading new photos.',
    });
    return null;
  }

  const dataUrl =
    category === 'logo'
      ? await resizeLogoFileToDataUrl(file)
      : await readAndResizeImageFile(file, maxDimension, quality);
  const blob = await dataUrlToBlob(dataUrl);

  if (quotaStore.status) {
    const check = canAcceptUpload(
      quotaStore.status.usedBytes,
      blob.size,
      quotaStore.status.objectCount
    );
    if (!check.allowed) {
      await feedback.showAlert({
        tone: 'danger',
        title: 'Image Upload Blocked (R2 Storage Limit)',
        message: check.reason,
      });
      return null;
    }
  }

  const isAuthenticated = useAuthStore.getState().status === 'authenticated';
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;

  if (!isAuthenticated || !isOnline) {
    feedback.pushToast({
      tone: 'info',
      title: 'Photo Staged Offline',
      message: `${file.name} (${formatStorageBytes(blob.size)}) saved locally and will upload to R2 when online.`,
    });
    return {
      url: dataUrl,
      name: file.name,
      queuedOffline: true,
    };
  }

  try {
    const ext =
      blob.type === 'image/png'
        ? 'png'
        : blob.type === 'image/webp'
          ? 'webp'
          : blob.type === 'image/svg+xml'
            ? 'svg'
            : 'jpg';
    const safeFilename = file.name.replace(/\.[^.]+$/, '') + `.${ext}`;
    const uploaded = await apiClient.uploadImageToR2({
      blob,
      filename: safeFilename,
      projectId,
      category,
    });
    quotaStore.applyStatus(uploaded.storage, true);
    return {
      url: uploaded.url,
      name: file.name,
      queuedOffline: false,
    };
  } catch (err) {
    if (err instanceof R2StorageBlockedError) {
      if (err.storage) {
        quotaStore.applyStatus(err.storage, false);
      }
      await feedback.showAlert({
        tone: 'danger',
        title: 'Image Upload Blocked (R2 Free Tier)',
        message: err.message,
      });
      return null;
    }

    // Network interruption while uploading: fall back to offline staging
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      feedback.pushToast({
        tone: 'warning',
        title: 'Saved Offline Pending R2 Upload',
        message: `${file.name} will upload to R2 automatically when connection returns.`,
      });
      return {
        url: dataUrl,
        name: file.name,
        queuedOffline: true,
      };
    }

    await feedback.showAlert({
      tone: 'danger',
      title: 'Photo Upload Failed',
      message: err instanceof Error ? err.message : 'Unable to upload photo to R2.',
    });
    return null;
  }
}

/**
 * Uploads any inline `data:image/...` strings embedded in a MastProjectState to R2,
 * returning an updated state where those URLs point to `/api/images/...`.
 * Used during offline reconnect sync and local-to-cloud project migration.
 */
export async function uploadInlineImagesInProjectState<
  T extends {
    foundations: Array<{
      inspectionChecklist?: Record<string, { photoDataUrl?: string; photoName?: string } | undefined>;
    }>;
    verticalMast?: {
      sections: Array<{
        inspectionChecklist?: Record<string, { photoDataUrl?: string; photoName?: string } | undefined>;
      }>;
      guyLayers: Array<{
        inspectionChecklist?: Record<string, { photoDataUrl?: string; photoName?: string } | undefined>;
      }>;
    };
    dailyLogs: Array<{
      documentationItems?: Array<{ photoDataUrl?: string; photoName?: string }>;
    }>;
    reportDetails?: {
      logos?: {
        left?: { dataUrl: string; caption?: string };
        center?: { dataUrl: string; caption?: string };
        right?: { dataUrl: string; caption?: string };
      };
    };
  },
>(projectId: string, state: T): Promise<{ nextState: T; uploadedCount: number }> {
  const cloned = JSON.parse(JSON.stringify(state)) as T;
  const cache = new Map<string, string>();
  let uploadedCount = 0;

  const maybeUploadDataUrl = async (
    value: string | undefined,
    category: 'inspection' | 'daily_log' | 'logo',
    nameHint: string
  ): Promise<string | undefined> => {
    if (!value || !value.startsWith('data:image/')) return value;
    // Skip tiny Vite-inlined default logos if already static? No, data:image/png in custom logos or legacy photos can go to R2
    if (cache.has(value)) return cache.get(value);
    const blob = await dataUrlToBlob(value);
    const uploaded = await apiClient.uploadImageToR2({
      blob,
      filename: nameHint,
      projectId,
      category,
    });
    useStorageQuotaStore.getState().applyStatus(uploaded.storage, true);
    cache.set(value, uploaded.url);
    uploadedCount += 1;
    return uploaded.url;
  };

  for (const f of cloned.foundations ?? []) {
    if (!f.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(f.inspectionChecklist)) {
      if (entry?.photoDataUrl) {
        entry.photoDataUrl = await maybeUploadDataUrl(
          entry.photoDataUrl,
          'inspection',
          entry.photoName || `foundation-${key}.jpg`
        );
      }
    }
  }

  for (const sec of cloned.verticalMast?.sections ?? []) {
    if (!sec.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(sec.inspectionChecklist)) {
      if (entry?.photoDataUrl) {
        entry.photoDataUrl = await maybeUploadDataUrl(
          entry.photoDataUrl,
          'inspection',
          entry.photoName || `mast-sec-${key}.jpg`
        );
      }
    }
  }

  for (const layer of cloned.verticalMast?.guyLayers ?? []) {
    if (!layer.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(layer.inspectionChecklist)) {
      if (entry?.photoDataUrl) {
        entry.photoDataUrl = await maybeUploadDataUrl(
          entry.photoDataUrl,
          'inspection',
          entry.photoName || `mast-layer-${key}.jpg`
        );
      }
    }
  }

  for (const log of cloned.dailyLogs ?? []) {
    for (const doc of log.documentationItems ?? []) {
      if (doc.photoDataUrl) {
        doc.photoDataUrl = await maybeUploadDataUrl(
          doc.photoDataUrl,
          'daily_log',
          doc.photoName || 'daily-doc.jpg'
        );
      }
    }
  }

  const logos = cloned.reportDetails?.logos;
  if (logos) {
    for (const slot of ['left', 'center', 'right'] as const) {
      const item = logos[slot];
      const defaultUrl = DEFAULT_REPORT_LOGOS[slot]?.dataUrl;
      if (
        item?.dataUrl &&
        item.dataUrl.startsWith('data:image/') &&
        item.dataUrl !== defaultUrl
      ) {
        item.dataUrl =
          (await maybeUploadDataUrl(item.dataUrl, 'logo', `logo-${slot}.png`)) ||
          item.dataUrl;
      }
    }
  }

  return { nextState: cloned, uploadedCount };
}
