import { apiClient } from '@/shared/api/client';
import { DEFAULT_REPORT_LOGOS } from '@/shared/assets/defaultLogos';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore } from '@/shared/state/projectStore';
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

export interface InlineImageCapableState {
  foundations: Array<{
    inspectionChecklist?: Record<
      string,
      { photoDataUrl?: string; photoName?: string } | undefined
    >;
  }>;
  verticalMast?: {
    sections: Array<{
      inspectionChecklist?: Record<
        string,
        { photoDataUrl?: string; photoName?: string } | undefined
      >;
    }>;
    guyLayers: Array<{
      inspectionChecklist?: Record<
        string,
        { photoDataUrl?: string; photoName?: string } | undefined
      >;
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
}

interface InlineImageRef {
  category: 'inspection' | 'daily_log' | 'logo';
  nameHint: string;
  getValue: () => string | undefined;
  setValue: (next: string) => void;
}

function collectInlineImageRefs(state: InlineImageCapableState): InlineImageRef[] {
  const refs: InlineImageRef[] = [];

  for (const f of state.foundations ?? []) {
    if (!f.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(f.inspectionChecklist)) {
      if (entry?.photoDataUrl && entry.photoDataUrl.startsWith('data:image/')) {
        refs.push({
          category: 'inspection',
          nameHint: entry.photoName || `foundation-${key}.jpg`,
          getValue: () => entry.photoDataUrl,
          setValue: (next) => {
            entry.photoDataUrl = next;
          },
        });
      }
    }
  }

  for (const sec of state.verticalMast?.sections ?? []) {
    if (!sec.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(sec.inspectionChecklist)) {
      if (entry?.photoDataUrl && entry.photoDataUrl.startsWith('data:image/')) {
        refs.push({
          category: 'inspection',
          nameHint: entry.photoName || `mast-sec-${key}.jpg`,
          getValue: () => entry.photoDataUrl,
          setValue: (next) => {
            entry.photoDataUrl = next;
          },
        });
      }
    }
  }

  for (const layer of state.verticalMast?.guyLayers ?? []) {
    if (!layer.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(layer.inspectionChecklist)) {
      if (entry?.photoDataUrl && entry.photoDataUrl.startsWith('data:image/')) {
        refs.push({
          category: 'inspection',
          nameHint: entry.photoName || `mast-layer-${key}.jpg`,
          getValue: () => entry.photoDataUrl,
          setValue: (next) => {
            entry.photoDataUrl = next;
          },
        });
      }
    }
  }

  for (const log of state.dailyLogs ?? []) {
    for (const doc of log.documentationItems ?? []) {
      if (doc.photoDataUrl && doc.photoDataUrl.startsWith('data:image/')) {
        refs.push({
          category: 'daily_log',
          nameHint: doc.photoName || 'daily-doc.jpg',
          getValue: () => doc.photoDataUrl,
          setValue: (next) => {
            doc.photoDataUrl = next;
          },
        });
      }
    }
  }

  const logos = state.reportDetails?.logos;
  if (logos) {
    for (const slot of ['left', 'center', 'right'] as const) {
      const item = logos[slot];
      const defaultUrl = DEFAULT_REPORT_LOGOS[slot]?.dataUrl;
      if (
        item?.dataUrl &&
        item.dataUrl.startsWith('data:image/') &&
        item.dataUrl !== defaultUrl
      ) {
        refs.push({
          category: 'logo',
          nameHint: `logo-${slot}.png`,
          getValue: () => item.dataUrl,
          setValue: (next) => {
            item.dataUrl = next;
          },
        });
      }
    }
  }

  return refs;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const base64Marker = ';base64,';
  const idx = dataUrl.indexOf(base64Marker);
  if (idx === -1) return dataUrl.length;
  const b64 = dataUrl.slice(idx + base64Marker.length);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/**
 * Counts inline `data:image/...` photos staged inside a project state
 * and estimates their decoded upload size in bytes.
 */
export function estimateInlineImagesUsage(
  state: InlineImageCapableState | undefined | null
): { count: number; uniqueCount: number; estimatedBytes: number } {
  if (!state) return { count: 0, uniqueCount: 0, estimatedBytes: 0 };
  const refs = collectInlineImageRefs(state);
  const seen = new Set<string>();
  let estimatedBytes = 0;

  for (const ref of refs) {
    const val = ref.getValue();
    if (!val || seen.has(val)) continue;
    seen.add(val);
    estimatedBytes += estimateDataUrlBytes(val);
  }

  return {
    count: refs.length,
    uniqueCount: seen.size,
    estimatedBytes,
  };
}

/**
 * Resizes an image, validates R2 free-tier storage quota limits (< 100 MB remaining blocks staging),
 * and saves it locally in IndexedDB so zero cloud requests occur until the periodic sync timer
 * or manual Sync button uploads staged photos to R2.
 */
export async function uploadOrStageProjectImage(params: {
  file: File;
  projectId: string;
  category: 'inspection' | 'daily_log' | 'logo';
  maxDimension?: number;
  quality?: number;
}): Promise<UploadedImageResult | null> {
  const { file, category, maxDimension = 960, quality = 0.8 } = params;
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
    const projects = useProjectStore.getState().projects;
    const stagedBytesTotal = projects.reduce(
      (sum, p) => sum + estimateInlineImagesUsage(p.state).estimatedBytes,
      0
    );
    const check = canAcceptUpload(
      quotaStore.status.usedBytes + stagedBytesTotal,
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

  feedback.pushToast({
    tone: 'info',
    title: 'Photo Saved Locally',
    message: `${file.name} (${formatStorageBytes(blob.size)}) queued for R2 upload on next Sync.`,
    durationMs: 2600,
  });

  return {
    url: dataUrl,
    name: file.name,
    queuedOffline: true,
  };
}

/**
 * Uploads any inline `data:image/...` strings embedded in a MastProjectState to R2,
 * returning an updated state where those URLs point to `/api/images/...`.
 * Invoked when manual Sync or the periodic Sync timer runs.
 */
export async function uploadInlineImagesInProjectState<
  T extends InlineImageCapableState,
>(projectId: string, state: T): Promise<{ nextState: T; uploadedCount: number }> {
  const cloned = JSON.parse(JSON.stringify(state)) as T;
  const refs = collectInlineImageRefs(cloned);
  const cache = new Map<string, string>();
  let uploadedCount = 0;

  for (const ref of refs) {
    const value = ref.getValue();
    if (!value || !value.startsWith('data:image/')) continue;

    let uploadedUrl = cache.get(value);
    if (!uploadedUrl) {
      const blob = await dataUrlToBlob(value);
      const uploaded = await apiClient.uploadImageToR2({
        blob,
        filename: ref.nameHint,
        projectId,
        category: ref.category,
      });
      useStorageQuotaStore.getState().applyStatus(uploaded.storage, true);
      uploadedUrl = uploaded.url;
      cache.set(value, uploadedUrl);
      uploadedCount += 1;
    }
    ref.setValue(uploadedUrl);
  }

  return { nextState: cloned, uploadedCount };
}
