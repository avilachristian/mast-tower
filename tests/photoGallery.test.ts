import { describe, expect, it } from 'vitest';
import { createCleanBaselineProject } from '../src/entities/project/mast2Baseline';
import {
  collectAllProjectPhotos,
  computePhotoGalleryStats,
  estimatePhotoSizeBytes,
  formatBytes,
  isPhotoCloudUploaded,
  isPhotoStagedOffline,
} from '../src/shared/storage/photoGalleryUtils';

describe('Photo Gallery & Offline Status Utils (C6)', () => {
  it('correctly classifies cloud vs offline data URLs', () => {
    expect(isPhotoCloudUploaded('https://r2.example.com/mast-photo.jpg')).toBe(true);
    expect(isPhotoCloudUploaded('/api/uploads/photo-123.webp')).toBe(true);
    expect(isPhotoCloudUploaded('data:image/png;base64,iVBORw0KGgo=')).toBe(false);

    expect(isPhotoStagedOffline('data:image/jpeg;base64,/9j/4AAQ=')).toBe(true);
    expect(isPhotoStagedOffline('https://r2.example.com/mast-photo.jpg')).toBe(false);
  });

  it('calculates Base64 byte sizes and formats them cleanly', () => {
    // 4 base64 chars without padding = 3 bytes
    const base64Data = 'data:image/png;base64,AAAA';
    expect(estimatePhotoSizeBytes(base64Data)).toBe(3);

    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1572864)).toBe('1.50 MB');
  });

  it('aggregates photos across daily logs, foundations, and vertical mast sections', () => {
    const project = createCleanBaselineProject();

    // 1 daily log with 2 photos (1 local staged, 1 cloud)
    project.dailyLogs = [
      {
        id: 'log-1',
        dayNumber: 1,
        date: '2026-11-16',
        weather: 'Sunny',
        foundationsWorked: [],
        workers: [],
        totalWorkers: 0,
        totalManHours: 0,
        cementUsedBags: 0,
        sandUsedBags: 0,
        gravelUsedBags: 0,
        activitiesSummary: '',
        issuesOrDelays: '',
        documentationItems: [
          {
            id: 'doc-1',
            photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD',
            photoName: 'rebar_layout.jpg',
            description: 'Foundation rebar cage inspection',
          },
          {
            id: 'doc-2',
            photoDataUrl: 'https://r2.example.com/uploads/tower-overview.webp',
            photoName: 'overview.webp',
            description: 'Site panoramic view',
          },
        ],
      },
    ];

    // 1 foundation inspection photo (staged)
    project.foundations[0].inspectionChecklist = {
      excavation_size_depth: {
        status: 'Passed',
        description: 'Excavation depth check',
        remarks: '2.1m depth verified',
        photoDataUrl: 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
        photoName: 'pit_depth.jpg',
      },
    };

    const photos = collectAllProjectPhotos(project);
    expect(photos.length).toBe(3);

    const stats = computePhotoGalleryStats(photos);
    expect(stats.totalCount).toBe(3);
    expect(stats.stagedOfflineCount).toBe(2);
    expect(stats.cloudUploadedCount).toBe(1);
    expect(stats.stagedSizeBytes).toBeGreaterThan(0);
    expect(stats.cloudSizeBytes).toBeGreaterThan(0);
    expect(stats.totalSizeBytes).toBe(stats.stagedSizeBytes + stats.cloudSizeBytes);
  });
});
