import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Cloud,
  Download,
  HardDrive,
  Info,
  Maximize2,
  Search,
  X,
} from 'lucide-react';
import type { MastProjectState } from '@/entities/project/types';
import {
  collectAllProjectPhotos,
  computePhotoGalleryStats,
  type GalleryPhotoItem,
  type PhotoSourceKind,
} from '@/shared/storage/photoGalleryUtils';

export interface PhotoGalleryModalProps {
  project: MastProjectState;
  isOpen: boolean;
  onClose: () => void;
  initialPhotoId?: string;
}

export function PhotoGalleryModal({
  project,
  isOpen,
  onClose,
  initialPhotoId,
}: PhotoGalleryModalProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'staged' | 'cloud'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | PhotoSourceKind>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Collect all photos from project
  const allPhotos = useMemo(() => {
    return collectAllProjectPhotos(project);
  }, [project]);

  // Compute stats
  const stats = useMemo(() => {
    return computePhotoGalleryStats(allPhotos);
  }, [allPhotos]);

  // Open initial photo if provided
  useEffect(() => {
    if (isOpen && initialPhotoId) {
      const idx = allPhotos.findIndex((p) => p.id === initialPhotoId);
      if (idx !== -1) {
        setLightboxIndex(idx);
      }
    } else if (isOpen) {
      setLightboxIndex(null);
    }
  }, [isOpen, initialPhotoId, allPhotos]);

  // Filtered photos
  const filteredPhotos = useMemo(() => {
    return allPhotos.filter((p) => {
      if (statusFilter === 'staged' && !p.isStagedOffline) return false;
      if (statusFilter === 'cloud' && !p.isCloudUploaded) return false;
      if (sourceFilter !== 'all' && p.source !== sourceFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const text = `${p.description} ${p.remarks ?? ''} ${p.photoName ?? ''} ${p.sourceLabel} ${p.date ?? ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [allPhotos, statusFilter, sourceFilter, searchQuery]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setLightboxIndex((prev) =>
          prev !== null && prev > 0 ? prev - 1 : filteredPhotos.length - 1
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setLightboxIndex((prev) =>
          prev !== null && prev < filteredPhotos.length - 1 ? prev + 1 : 0
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, filteredPhotos.length]);

  if (!isOpen) return null;

  const activeLightboxPhoto =
    lightboxIndex !== null ? filteredPhotos[lightboxIndex] : null;

  const handleDownloadPhoto = (photo: GalleryPhotoItem) => {
    const link = document.createElement('a');
    link.href = photo.photoDataUrl;
    link.download = photo.photoName || `photo-${photo.id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Documentation Photo Gallery"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-6xl h-[92vh] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-700">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Project Photo Gallery</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                  {allPhotos.length} photos
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Documentation & inspection photos with staged vs cloud storage tracking
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            aria-label="Close photo gallery"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 px-5 py-3 border-b border-slate-200 bg-white shrink-0 text-xs">
          <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Total Photos
            </div>
            <div className="text-lg font-bold text-slate-800 mt-0.5">
              {stats.totalCount}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Across all project phases
            </div>
          </div>

          <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">
                Staged Locally (Offline)
              </span>
              <HardDrive className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-lg font-bold text-amber-900 mt-0.5">
              {stats.stagedOfflineCount}{' '}
              <span className="text-xs font-normal text-amber-700">
                ({stats.stagedSizeFormatted})
              </span>
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5">
              IndexedDB • Uploads on Cloud Sync
            </div>
          </div>

          <div className="p-2.5 rounded-lg border border-sky-200 bg-sky-50/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-sky-800 uppercase tracking-wide">
                Cloud R2 Uploaded
              </span>
              <Cloud className="w-3.5 h-3.5 text-sky-600" />
            </div>
            <div className="text-lg font-bold text-sky-900 mt-0.5">
              {stats.cloudUploadedCount}{' '}
              <span className="text-xs font-normal text-sky-700">
                ({stats.cloudSizeFormatted})
              </span>
            </div>
            <div className="text-[11px] text-sky-700 mt-0.5">
              Fast CDN • WebP/JPEG in bucket
            </div>
          </div>

          <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Total Storage Used
            </div>
            <div className="text-lg font-bold text-slate-800 mt-0.5">
              {stats.totalSizeFormatted}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Local base64 + cloud storage
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="px-5 py-2.5 border-b border-slate-200 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider mr-1">
              Status:
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              All ({allPhotos.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('staged')}
              className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1 ${
                statusFilter === 'staged'
                  ? 'bg-amber-600 text-white'
                  : 'bg-white border border-slate-200 text-amber-800 hover:bg-amber-50'
              }`}
            >
              <HardDrive className="w-3 h-3" />
              <span>Staged ({stats.stagedOfflineCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('cloud')}
              className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1 ${
                statusFilter === 'cloud'
                  ? 'bg-sky-600 text-white'
                  : 'bg-white border border-slate-200 text-sky-800 hover:bg-sky-50'
              }`}
            >
              <Cloud className="w-3 h-3" />
              <span>Cloud R2 ({stats.cloudUploadedCount})</span>
            </button>

            <span className="hidden md:inline font-semibold text-slate-500 text-[11px] uppercase tracking-wider ml-2 mr-1">
              Source:
            </span>
            <select
              aria-label="Filter photos by source module"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as 'all' | PhotoSourceKind)}
              className="px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-semibold text-slate-700 cursor-pointer focus:outline-sky-500"
            >
              <option value="all">All Sources</option>
              <option value="daily_log">Daily Logs</option>
              <option value="foundation_inspection">Foundations</option>
              <option value="vertical_mast_inspection">Vertical Mast</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by caption, day, date..."
                className="w-full pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-md text-xs text-slate-800 placeholder:text-slate-400 focus:outline-sky-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Photos Grid Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-100/50">
          {filteredPhotos.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <Camera className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600">No photos match your filters</p>
              <p className="text-xs text-slate-400 mt-1">
                {allPhotos.length === 0
                  ? 'Attach documentation photos in Daily Logs or Inspections to see them here.'
                  : 'Try selecting "All" status or clearing the search query.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredPhotos.map((photo, index) => {
                return (
                  <div
                    key={photo.id}
                    onClick={() => setLightboxIndex(index)}
                    className="group bg-white rounded-lg border border-slate-200 shadow-2xs hover:shadow-md hover:border-sky-300 transition-all flex flex-col overflow-hidden cursor-pointer"
                  >
                    {/* Thumbnail Image Container */}
                    <div className="relative aspect-4/3 bg-slate-900 overflow-hidden">
                      <img
                        src={photo.photoDataUrl}
                        alt={photo.description}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      {/* Storage Status Badge */}
                      <div className="absolute top-2 left-2 flex items-center gap-1">
                        {photo.isStagedOffline ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/90 text-white backdrop-blur-xs shadow-xs">
                            <HardDrive className="w-2.5 h-2.5" />
                            <span>Staged ({photo.sizeFormatted})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-600/90 text-white backdrop-blur-xs shadow-xs">
                            <Cloud className="w-2.5 h-2.5" />
                            <span>Cloud R2</span>
                          </span>
                        )}
                      </div>

                      {/* Source Badge */}
                      <div className="absolute bottom-2 left-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white backdrop-blur-xs">
                          {photo.sourceLabel}
                        </span>
                      </div>

                      {/* Expand Overlay on Hover */}
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Maximize2 className="w-6 h-6 drop-shadow-md" />
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-900 line-clamp-1 group-hover:text-sky-700">
                          {photo.description}
                        </p>
                        {photo.remarks && (
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {photo.remarks}
                          </p>
                        )}
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{photo.date || 'Undated'}</span>
                        <span className="font-mono">{photo.photoName || 'attachment.jpg'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Offline staged photos sync seamlessly to Cloudflare R2 when online.
            </span>
          </div>
          <div className="font-semibold text-slate-700">
            Showing {filteredPhotos.length} of {allPhotos.length}
          </div>
        </div>
      </div>

      {/* Lightbox / Fullscreen Viewer */}
      {activeLightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo Viewer"
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm flex flex-col animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxIndex(null);
          }}
        >
          {/* Lightbox Header */}
          <div className="px-4 py-3 bg-black/50 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-400">
                {lightboxIndex! + 1} / {filteredPhotos.length}
              </span>
              <h3 className="text-sm font-semibold text-white truncate max-w-md">
                {activeLightboxPhoto.description}
              </h3>
              {activeLightboxPhoto.isStagedOffline ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">
                  Offline Staged ({activeLightboxPhoto.sizeFormatted})
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500 text-white">
                  Cloud R2
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadPhoto(activeLightboxPhoto)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition cursor-pointer"
                title="Download original photo"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label="Close photo viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Image Stage */}
          <div className="flex-1 relative flex items-center justify-center p-4 min-h-0">
            {/* Prev button */}
            <button
              type="button"
              onClick={() =>
                setLightboxIndex((prev) =>
                  prev !== null && prev > 0 ? prev - 1 : filteredPhotos.length - 1
                )
              }
              className="absolute left-4 p-3 rounded-full bg-black/40 hover:bg-black/70 text-white transition cursor-pointer z-10"
              aria-label="Previous photo"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Photo */}
            <img
              src={activeLightboxPhoto.photoDataUrl}
              alt={activeLightboxPhoto.description}
              className="max-h-full max-w-full object-contain rounded shadow-2xl"
            />

            {/* Next button */}
            <button
              type="button"
              onClick={() =>
                setLightboxIndex((prev) =>
                  prev !== null && prev < filteredPhotos.length - 1 ? prev + 1 : 0
                )
              }
              className="absolute right-4 p-3 rounded-full bg-black/40 hover:bg-black/70 text-white transition cursor-pointer z-10"
              aria-label="Next photo"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Lightbox Footer Details */}
          <div className="px-6 py-3 bg-black/60 text-white text-xs shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-white/10">
            <div>
              <p className="font-semibold text-slate-200">
                {activeLightboxPhoto.sourceLabel} • {activeLightboxPhoto.date || 'Undated'}
              </p>
              {activeLightboxPhoto.remarks && (
                <p className="text-slate-400 mt-0.5">{activeLightboxPhoto.remarks}</p>
              )}
            </div>

            <div className="text-[11px] font-mono text-slate-400">
              {activeLightboxPhoto.photoName || 'attachment.jpg'} •{' '}
              {activeLightboxPhoto.sizeFormatted}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
