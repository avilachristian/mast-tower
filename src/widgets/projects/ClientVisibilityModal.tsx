import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Star,
  X,
} from 'lucide-react';
import {
  resolveClientShowcaseSettings,
  slugifyProjectSlug,
} from '@/entities/project/clientProjection';
import type {
  ClientShowcasePhaseMode,
  SavedProjectRecord,
} from '@/entities/project/types';
import { navigateTo } from '@/shared/lib/router';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { useProjectStore } from '@/shared/state/projectStore';

export function ClientVisibilityModal({
  projectId,
  open,
  onClose,
}: {
  projectId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const projects = useProjectStore((s) => s.projects);
  const updateProjectClientSettings = useProjectStore(
    (s) => s.updateProjectClientSettings
  );
  const pushToast = useFeedbackStore((s) => s.pushToast);

  const record: SavedProjectRecord | undefined = projectId
    ? projects.find((p) => p.id === projectId)
    : undefined;

  const resolved = record
    ? resolveClientShowcaseSettings(record)
    : null;

  const [enabled, setEnabled] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [slug, setSlug] = useState('');
  const [welcomeNote, setWelcomeNote] = useState('');
  const [phaseMode, setPhaseMode] = useState<ClientShowcasePhaseMode>('both');
  const [showPhotos, setShowPhotos] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !resolved) return;
    setEnabled(resolved.enabled);
    setFeatured(resolved.featured);
    setSlug(resolved.slug || '');
    setWelcomeNote(resolved.welcomeNote || '');
    setPhaseMode(resolved.phaseMode);
    setShowPhotos(resolved.showPhotos);
    setCopied(false);
  }, [open, projectId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !record || !resolved || typeof document === 'undefined') {
    return null;
  }

  const displayName =
    record.state.reportDetails?.projectName?.trim() || record.state.projectName;
  const cleanSlug = slugifyProjectSlug(slug || displayName, record.id);
  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/p/${encodeURIComponent(cleanSlug)}`
      : `/p/${cleanSlug}`;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProjectClientSettings(record.id, {
      enabled,
      featured,
      slug: cleanSlug,
      welcomeNote: welcomeNote.trim() || undefined,
      phaseMode,
      showPhotos,
    });
    pushToast({
      tone: 'success',
      title: enabled ? 'Published to Client Showcase' : 'Hidden from Client Showcase',
      message: enabled
        ? `"${displayName}" is now visible to clients at /p/${cleanSlug}.`
        : `"${displayName}" is now private (Admin only).`,
    });
    onClose();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      pushToast({
        tone: 'info',
        title: 'Client Showcase Link',
        message: shareUrl,
      });
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 truncate">
                Client Showcase Settings
              </h2>
              <p className="text-xs text-slate-500 truncate">{displayName}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
          {/* Visibility & Featured Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className={`rounded-xl border p-3.5 flex items-start gap-3 cursor-pointer transition ${
                enabled
                  ? 'border-emerald-300 bg-emerald-50/60'
                  : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  {enabled ? (
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>Visible to Client</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Show this project on the public Client Showcase page (wages, payroll, inventory &amp; internal remarks stay hidden).
                </p>
              </div>
            </label>

            <label
              className={`rounded-xl border p-3.5 flex items-start gap-3 cursor-pointer transition ${
                featured
                  ? 'border-amber-300 bg-amber-50/60'
                  : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  <span>Featured on Landing Page</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Open this project by default when clients visit the root site URL.
                </p>
              </div>
            </label>
          </div>

          {/* Share Link & Slug */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-800">Client Share Link</span>
              {enabled && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigateTo(`/p/${encodeURIComponent(cleanSlug)}`);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline cursor-pointer"
                >
                  <span>Open Client Page</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden">
                <span className="px-2.5 py-2 bg-slate-100 border-r border-slate-200 text-[11px] text-slate-500 shrink-0">
                  /p/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="project-slug"
                  className="w-full px-2.5 py-2 text-xs text-slate-900 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy URL</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Display Sections & Phase Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="font-bold text-slate-800 block">
                2D Diagrams Shown to Client
              </span>
              <select
                value={phaseMode}
                onChange={(e) =>
                  setPhaseMode(e.target.value as ClientShowcasePhaseMode)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="both">Both Phases (Foundation + Vertical Mast)</option>
                <option value="foundation">Foundation Phase Only (13 Pads)</option>
                <option value="vertical_mast">Vertical Mast Phase Only (41 Sec + 16 Guys)</option>
              </select>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-800 block">
                Optional Client Sections
              </span>
              <div className="flex flex-col gap-2 pt-0.5">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={showPhotos}
                    onChange={(e) => setShowPhotos(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600"
                  />
                  <span>Show Field Highlights &amp; Site Photo Gallery</span>
                </label>
              </div>
            </div>
          </div>

          {/* Client Welcome / Progress Note */}
          <label className="block space-y-1.5">
            <span className="font-bold text-slate-800">
              Client Progress Note (Optional)
            </span>
            <textarea
              rows={2}
              value={welcomeNote}
              onChange={(e) => setWelcomeNote(e.target.value)}
              placeholder="e.g., Foundation pouring for Sector I anchors is complete; tower erection is currently at 39m."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              Save Showcase Settings
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
