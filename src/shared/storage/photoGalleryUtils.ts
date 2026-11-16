import type { MastProjectState } from '@/entities/project/types';

export type PhotoSourceKind =
  | 'daily_log'
  | 'foundation_inspection'
  | 'vertical_mast_inspection';

export interface GalleryPhotoItem {
  id: string;
  source: PhotoSourceKind;
  sourceLabel: string;
  photoDataUrl: string;
  photoName?: string;
  description: string;
  remarks?: string;
  date?: string;
  dayNumber?: number;
  foundationId?: string;
  logId?: string;
  isCloudUploaded: boolean;
  isStagedOffline: boolean;
  sizeBytes: number;
  sizeFormatted: string;
}

export interface PhotoGalleryStats {
  totalCount: number;
  stagedOfflineCount: number;
  cloudUploadedCount: number;
  stagedSizeBytes: number;
  cloudSizeBytes: number;
  totalSizeBytes: number;
  stagedSizeFormatted: string;
  cloudSizeFormatted: string;
  totalSizeFormatted: string;
}

export function isPhotoCloudUploaded(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url.startsWith('/api/uploads/') ||
    url.startsWith('/uploads/')
  );
}

export function isPhotoStagedOffline(url?: string): boolean {
  if (!url) return false;
  return url.startsWith('data:image/');
}

export function estimatePhotoSizeBytes(url?: string): number {
  if (!url) return 0;
  if (url.startsWith('data:image/')) {
    const commaIndex = url.indexOf(',');
    if (commaIndex === -1) return url.length;
    const base64Str = url.slice(commaIndex + 1);
    const padding = base64Str.endsWith('==') ? 2 : base64Str.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((base64Str.length * 3) / 4) - padding);
  }
  // Standard average for compressed WebP/JPEG in Cloudflare R2
  return 350 * 1024;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function collectAllProjectPhotos(project: MastProjectState): GalleryPhotoItem[] {
  const photos: GalleryPhotoItem[] = [];

  // 1. Daily Activity Logs Documentation Photos
  for (const log of project.dailyLogs ?? []) {
    for (let i = 0; i < (log.documentationItems ?? []).length; i++) {
      const doc = log.documentationItems![i];
      if (!doc.photoDataUrl) continue;

      const isCloud = isPhotoCloudUploaded(doc.photoDataUrl);
      const isStaged = isPhotoStagedOffline(doc.photoDataUrl);
      const bytes = estimatePhotoSizeBytes(doc.photoDataUrl);

      photos.push({
        id: doc.id || `daily-log-${log.id}-doc-${i}`,
        source: 'daily_log',
        sourceLabel: `Day ${log.dayNumber} (${log.date})`,
        photoDataUrl: doc.photoDataUrl,
        photoName: doc.photoName,
        description: doc.description || `Site documentation for Day ${log.dayNumber}`,
        remarks: doc.remarks,
        date: log.date,
        dayNumber: log.dayNumber,
        logId: log.id,
        isCloudUploaded: isCloud,
        isStagedOffline: isStaged,
        sizeBytes: bytes,
        sizeFormatted: formatBytes(bytes),
      });
    }
  }

  // 2. Foundation Inspection Photos
  for (const f of project.foundations ?? []) {
    if (!f.inspectionChecklist) continue;
    for (const [key, entry] of Object.entries(f.inspectionChecklist)) {
      if (!entry?.photoDataUrl) continue;

      const isCloud = isPhotoCloudUploaded(entry.photoDataUrl);
      const isStaged = isPhotoStagedOffline(entry.photoDataUrl);
      const bytes = estimatePhotoSizeBytes(entry.photoDataUrl);

      photos.push({
        id: `insp-${f.id}-${key}`,
        source: 'foundation_inspection',
        sourceLabel: `${f.name} (${f.code})`,
        photoDataUrl: entry.photoDataUrl,
        photoName: entry.photoName,
        description: entry.description || `Inspection: ${key}`,
        remarks: entry.remarks,
        date: f.pourDate || f.completedDate,
        foundationId: f.id,
        isCloudUploaded: isCloud,
        isStagedOffline: isStaged,
        sizeBytes: bytes,
        sizeFormatted: formatBytes(bytes),
      });
    }
  }

  // 3. Vertical Mast Section Inspection Photos
  if (project.verticalMast?.sections) {
    for (const sec of project.verticalMast.sections) {
      if (!sec.inspectionChecklist) continue;
      for (const [key, entry] of Object.entries(sec.inspectionChecklist)) {
        if (!entry?.photoDataUrl) continue;

        const isCloud = isPhotoCloudUploaded(entry.photoDataUrl);
        const isStaged = isPhotoStagedOffline(entry.photoDataUrl);
        const bytes = estimatePhotoSizeBytes(entry.photoDataUrl);

        photos.push({
          id: `sec-insp-${sec.id}-${key}`,
          source: 'vertical_mast_inspection',
          sourceLabel: `Section ${sec.label}`,
          photoDataUrl: entry.photoDataUrl,
          photoName: entry.photoName,
          description: entry.description || `Section Inspection: ${key}`,
          remarks: entry.remarks,
          date: sec.verifiedDate || sec.installedDate,
          isCloudUploaded: isCloud,
          isStagedOffline: isStaged,
          sizeBytes: bytes,
          sizeFormatted: formatBytes(bytes),
        });
      }
    }
  }

  return photos;
}

export function computePhotoGalleryStats(photos: GalleryPhotoItem[]): PhotoGalleryStats {
  let stagedCount = 0;
  let cloudCount = 0;
  let stagedBytes = 0;
  let cloudBytes = 0;

  for (const p of photos) {
    if (p.isStagedOffline) {
      stagedCount++;
      stagedBytes += p.sizeBytes;
    } else if (p.isCloudUploaded) {
      cloudCount++;
      cloudBytes += p.sizeBytes;
    } else {
      // Unrecognized scheme, treat as local
      stagedCount++;
      stagedBytes += p.sizeBytes;
    }
  }

  const totalBytes = stagedBytes + cloudBytes;

  return {
    totalCount: photos.length,
    stagedOfflineCount: stagedCount,
    cloudUploadedCount: cloudCount,
    stagedSizeBytes: stagedBytes,
    cloudSizeBytes: cloudBytes,
    totalSizeBytes: totalBytes,
    stagedSizeFormatted: formatBytes(stagedBytes),
    cloudSizeFormatted: formatBytes(cloudBytes),
    totalSizeFormatted: formatBytes(totalBytes),
  };
}
