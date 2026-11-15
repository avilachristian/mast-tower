import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudSun,
  Compass,
  HardHat,
  Layers,
  Lock,
  MapPin,
  RefreshCw,
  Ruler,
  WifiOff,
  X,
} from 'lucide-react';
import {
  buildOverallProjectStatusReportData,
  formatDateWithWeekday,
} from '@/entities/project/calculations';
import { toClientRenderProjectState } from '@/entities/project/clientRender';
import { STATUS_META } from '@/entities/project/mast2Baseline';
import type {
  ClientDailyHighlightDto,
  ClientProjectShowcaseDto,
  ScheduleActivityItem,
} from '@/entities/project/types';
import {
  ANCHOR_GUY_STAGE_META,
  GUY_LAYER_STATUS_META,
  TOWER_SECTION_STATUS_META,
} from '@/entities/project/verticalMastBaseline';
import { buildVerticalMastOverviewData } from '@/entities/project/verticalMastCalculations';
import { apiClient, ApiError } from '@/shared/api/client';
import { resolveReportLogos } from '@/shared/assets/defaultLogos';
import { navigateTo } from '@/shared/lib/router';
import type { MastSelectionTarget } from '@/shared/state/uiStore';
import { idbGet, idbSet } from '@/shared/storage/indexedDb';
import { GroundAnchorPlan2D } from '@/widgets/layout-plan/GroundAnchorPlan2D';
import { VerticalMastElevation2D } from '@/widgets/mast-tower/VerticalMastElevation2D';

const CLIENT_SHOWCASE_CACHE_KEY = 'mast2-client-showcase-cache-v1';

interface CachedShowcaseSnapshot {
  updatedAt: string;
  projects: ClientProjectShowcaseDto[];
}

interface GalleryPhotoItem {
  id: string;
  url: string;
  description: string;
  date: string;
  dayNumber: number;
  summary: string;
}

const WEATHER_BADGE_MAP: Record<string, string> = {
  Sunny: 'Sunny',
  Cloudy: 'Cloudy',
  'Light Rain': 'Light Rain',
  'Heavy Rain / Stoppage': 'Weather Hold',
  'High Wind / Stoppage': 'Wind Hold',
};

function getClientSectionStatusLabel(status: keyof typeof TOWER_SECTION_STATUS_META): {
  label: string;
  pct: number;
  bgClass: string;
  textClass: string;
  color: string;
} {
  if (status === 'plumbed_verified') {
    return {
      label: 'Erected & Verified',
      pct: 100,
      bgClass: 'bg-emerald-50 border-emerald-300',
      textClass: 'text-emerald-800',
      color: '#10b981',
    };
  }
  const meta = TOWER_SECTION_STATUS_META[status];
  if (status === 'not_started') {
    return {
      label: 'Scheduled',
      pct: meta.pct,
      bgClass: meta.bgClass,
      textClass: meta.textClass,
      color: meta.color,
    };
  }
  return {
    label: 'In Progress',
    pct: meta.pct,
    bgClass: meta.bgClass,
    textClass: meta.textClass,
    color: meta.color,
  };
}

function getScheduleStatusBadge(status: ScheduleActivityItem['status']): {
  label: string;
  classes: string;
} {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'in_progress':
      return {
        label: 'In Progress',
        classes: 'bg-sky-50 text-sky-700 border-sky-200',
      };
    default:
      return {
        label: 'Upcoming',
        classes: 'bg-slate-100 text-slate-600 border-slate-200',
      };
  }
}

export function ClientShowcaseView({ slug }: { slug?: string }) {
  const [projects, setProjects] = useState<ClientProjectShowcaseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingCachedSnapshot, setUsingCachedSnapshot] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  // Diagram selection state (read-only)
  const [diagramMode, setDiagramMode] = useState<'foundation' | 'vertical_mast'>('foundation');
  const [selectedFoundationId, setSelectedFoundationId] = useState<string>('PF-0');
  const [selectedMastTarget, setSelectedMastTarget] = useState<MastSelectionTarget>({
    kind: 'section',
    id: 'S01',
  });
  const [selectedGuyAnchorId, setSelectedGuyAnchorId] = useState<string | undefined>(undefined);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const loadProjects = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await apiClient.fetchClientProjects();
      const list = Array.isArray(response.projects) ? response.projects : [];
      setProjects(list);
      setUsingCachedSnapshot(false);
      setCachedAt(null);

      await idbSet<CachedShowcaseSnapshot>(CLIENT_SHOWCASE_CACHE_KEY, {
        updatedAt: new Date().toISOString(),
        projects: list,
      });
    } catch (err) {
      const cached = await idbGet<CachedShowcaseSnapshot>(CLIENT_SHOWCASE_CACHE_KEY);
      if (cached && Array.isArray(cached.projects) && cached.projects.length > 0) {
        setProjects(cached.projects);
        setUsingCachedSnapshot(true);
        setCachedAt(cached.updatedAt);
      } else {
        const message =
          err instanceof ApiError
            ? err.message
            : 'Unable to connect to the live project server right now.';
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects(false);
  }, [loadProjects]);

  const activeDto = useMemo(() => {
    if (projects.length === 0) return null;
    if (slug) {
      const matched = projects.find((p) => p.slug === slug || p.id === slug);
      if (matched) return matched;
    }
    return projects.find((p) => p.featured) ?? projects[0];
  }, [projects, slug]);

  // Reset diagram selections cleanly when switching showcase projects
  useEffect(() => {
    if (!activeDto) return;
    if (activeDto.settings.phaseMode === 'vertical_mast') {
      setDiagramMode('vertical_mast');
    } else if (activeDto.settings.phaseMode === 'foundation') {
      setDiagramMode('foundation');
    } else {
      // For 'both', auto-focus Vertical Mast when mast erection has started, else Foundation
      const hasErectionProgress = Boolean(
        activeDto.verticalMastSummary?.sections.some((s) => s.status !== 'not_started') ||
          activeDto.verticalMastSummary?.guyLayers.some((l) => l.status !== 'not_started')
      );
      setDiagramMode(hasErectionProgress ? 'vertical_mast' : 'foundation');
    }

    const firstFoundation = activeDto.foundations[0]?.id ?? 'PF-0';
    setSelectedFoundationId(firstFoundation);
    setSelectedMastTarget({ kind: 'section', id: 'S01' });
    setSelectedGuyAnchorId(undefined);
    setLightboxIndex(null);
  }, [activeDto?.id]);

  const renderProject = useMemo(
    () => (activeDto ? toClientRenderProjectState(activeDto) : null),
    [activeDto]
  );

  const civilOverview = useMemo(
    () => (renderProject ? buildOverallProjectStatusReportData(renderProject) : null),
    [renderProject]
  );

  const vmOverview = useMemo(
    () => (renderProject ? buildVerticalMastOverviewData(renderProject) : null),
    [renderProject]
  );

  const logoItems = useMemo(() => {
    const resolved = resolveReportLogos(activeDto?.logos);
    return [resolved.left, resolved.center, resolved.right].filter(
      (item): item is NonNullable<typeof item> => Boolean(item?.dataUrl)
    );
  }, [activeDto?.logos]);

  const galleryPhotos = useMemo<GalleryPhotoItem[]>(() => {
    if (!activeDto || !activeDto.settings.showPhotos) return [];
    const items: GalleryPhotoItem[] = [];
    for (const highlight of activeDto.highlights) {
      for (const photo of highlight.photos) {
        items.push({
          id: `${highlight.id}-${photo.id}`,
          url: photo.url,
          description: photo.description || highlight.activitiesSummary,
          date: highlight.date,
          dayNumber: highlight.dayNumber,
          summary: highlight.activitiesSummary,
        });
      }
    }
    return items;
  }, [activeDto]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxIndex(null);
      if (event.key === 'ArrowRight' && galleryPhotos.length > 0) {
        setLightboxIndex((prev) =>
          prev === null ? null : (prev + 1) % galleryPhotos.length
        );
      }
      if (event.key === 'ArrowLeft' && galleryPhotos.length > 0) {
        setLightboxIndex((prev) =>
          prev === null ? null : (prev - 1 + galleryPhotos.length) % galleryPhotos.length
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex, galleryPhotos.length]);

  const selectedFoundation = useMemo(
    () =>
      activeDto?.foundations.find((f) => f.id === selectedFoundationId) ??
      activeDto?.foundations[0] ??
      null,
    [activeDto, selectedFoundationId]
  );

  const selectedTowerSection = useMemo(() => {
    if (!vmOverview || selectedMastTarget.kind !== 'section') return null;
    return (
      vmOverview.vm.sections.find((s) => s.id === selectedMastTarget.id) ??
      vmOverview.vm.sections[0] ??
      null
    );
  }, [vmOverview, selectedMastTarget]);

  const selectedGuyLayer = useMemo(() => {
    if (!vmOverview || selectedMastTarget.kind !== 'guy_layer') return null;
    return (
      vmOverview.vm.guyLayers.find((l) => l.id === selectedMastTarget.id) ??
      vmOverview.vm.guyLayers[0] ??
      null
    );
  }, [vmOverview, selectedMastTarget]);

  const selectedGuyAnchor = useMemo(() => {
    if (!activeDto || !selectedGuyAnchorId) return null;
    return activeDto.foundations.find((f) => f.id === selectedGuyAnchorId) ?? null;
  }, [activeDto, selectedGuyAnchorId]);

  const highlightedAnchorIds = useMemo(() => {
    if (!selectedGuyLayer) return [];
    return Object.values(selectedGuyLayer.anchorIds);
  }, [selectedGuyLayer]);

  const scheduleSummary = useMemo(() => {
    const items = activeDto?.schedule ?? [];
    if (items.length === 0) return { completed: 0, inProgress: 0, total: 0, avgPct: 0 };
    const completed = items.filter((s) => s.status === 'completed').length;
    const inProgress = items.filter((s) => s.status === 'in_progress').length;
    const avgPct = Math.round(
      items.reduce((sum, s) => sum + (Number.isFinite(s.progressPct) ? s.progressPct : 0), 0) /
        items.length
    );
    return { completed, inProgress, total: items.length, avgPct };
  }, [activeDto?.schedule]);

  // Combined friendly completion percentage for header badge
  const headlineProgressPct = useMemo(() => {
    if (!activeDto || !civilOverview || !vmOverview) return 0;
    const mode = activeDto.settings.phaseMode;
    if (mode === 'foundation') return civilOverview.metrics.overallProgressPct;
    if (mode === 'vertical_mast') return vmOverview.metrics.overallProgressPct;
    return Math.round(
      (civilOverview.metrics.overallProgressPct + vmOverview.metrics.overallProgressPct) / 2
    );
  }, [activeDto, civilOverview, vmOverview]);

  return (
    <div className="min-h-dvh flex flex-col bg-slate-50 text-slate-900">
      {/* Top Client Showcase Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                  Client Project Showcase
                </span>
                {activeDto?.referenceNo && (
                  <span className="text-[11px] font-mono text-slate-500">
                    Ref: {activeDto.referenceNo}
                  </span>
                )}
              </div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate mt-0.5">
                {activeDto ? activeDto.projectName : 'Mast & Tower Live Progress Portal'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {projects.length > 1 && activeDto && (
              <select
                aria-label="Select Client Project"
                value={activeDto.slug}
                onChange={(e) => navigateTo(`/p/${encodeURIComponent(e.target.value)}`)}
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.projectName} ({p.location || 'Site'})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => void loadProjects(true)}
              disabled={refreshing}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              title="Refresh latest project updates"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('/admin')}
              className="h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Admin Login</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 space-y-6">
        {(!isOnline || usingCachedSnapshot) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium">
              <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {!isOnline
                  ? 'You are currently offline — showing the last saved project snapshot.'
                  : 'Server unreachable — showing the most recent offline snapshot.'}
              </span>
            </div>
            {cachedAt && (
              <span className="text-[11px] text-amber-700 font-mono">
                Cached: {new Date(cachedAt).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3 shadow-xs">
            <div className="w-10 h-10 rounded-full border-2 border-sky-600 border-t-transparent animate-spin mx-auto" />
            <div className="text-sm font-semibold text-slate-700">
              Loading live client project progress...
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center space-y-3 shadow-xs">
            <div className="text-base font-bold text-slate-900">Unable to Load Project Showcase</div>
            <p className="text-sm text-slate-600 max-w-md mx-auto">{error}</p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => void loadProjects(true)}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => navigateTo('/admin')}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Admin Login
              </button>
            </div>
          </div>
        )}

        {!loading && !error && !activeDto && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
              <Compass className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h2 className="text-lg font-bold text-slate-900">
                No Client Projects Published Yet
              </h2>
              <p className="text-sm text-slate-500">
                Project progress reports will appear here once an administrator enables client showcase visibility for a site.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('/admin')}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              Open Admin Workspace
            </button>
          </div>
        )}

        {!loading && activeDto && renderProject && civilOverview && vmOverview && (
          <>
            {/* Hero Overview Card */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    {logoItems.length > 0 && (
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                        {logoItems.map((logo, idx) => (
                          <img
                            key={`${logo.caption ?? 'logo'}-${idx}`}
                            src={logo.dataUrl}
                            alt={logo.caption || 'Company Logo'}
                            className="h-7 w-auto object-contain"
                          />
                        ))}
                      </div>
                    )}
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
                        {activeDto.projectName}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
                        {activeDto.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-sky-600" />
                            {activeDto.location}
                          </span>
                        )}
                        {activeDto.clientName && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            Client: <strong className="text-slate-800">{activeDto.clientName}</strong>
                          </span>
                        )}
                        {activeDto.contractor && (
                          <span className="inline-flex items-center gap-1">
                            <HardHat className="w-3.5 h-3.5 text-slate-400" />
                            Contractor: <strong className="text-slate-800">{activeDto.contractor}</strong>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Ruler className="w-3.5 h-3.5 text-slate-400" />
                          {activeDto.towerHeightM}m Guyed Mast Structure
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Headline Progress Ring / Pill */}
                <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 shrink-0">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Overall Milestone Progress
                    </div>
                    <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
                      {headlineProgressPct}%
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Updated {formatDateWithWeekday(activeDto.lastUpdated)}
                    </div>
                  </div>
                  <div className="w-24 sm:w-28 space-y-1.5">
                    <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, headlineProgressPct))}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-semibold text-right text-emerald-700">
                      Live Site Status
                    </div>
                  </div>
                </div>
              </div>

              {activeDto.settings.welcomeNote?.trim() && (
                <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-slate-700 leading-relaxed">
                  {activeDto.settings.welcomeNote}
                </div>
              )}

              {/* Friendly Client KPI Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {activeDto.settings.phaseMode !== 'vertical_mast' && (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                      <div className="text-xs font-medium text-slate-500">
                        Foundation Civil Works
                      </div>
                      <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                        {civilOverview.metrics.overallProgressPct}%
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1">
                        {civilOverview.metrics.completedCount} of{' '}
                        {civilOverview.metrics.totalFoundations} pads fully backfilled
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                      <div className="text-xs font-medium text-slate-500">
                        Concrete Foundations Poured
                      </div>
                      <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                        {civilOverview.metrics.pouredOrBeyondCount} /{' '}
                        {civilOverview.metrics.totalFoundations}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1">
                        {civilOverview.metrics.pouredConcreteCuM.toFixed(1)} of{' '}
                        {civilOverview.metrics.totalConcreteCuM.toFixed(1)} m³ placed
                      </div>
                    </div>
                  </>
                )}

                {activeDto.settings.phaseMode !== 'foundation' && (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                      <div className="text-xs font-medium text-slate-500">
                        Vertical Mast Erection
                      </div>
                      <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                        {vmOverview.metrics.erectedHeightM}m / {vmOverview.metrics.totalHeightM}m
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1">
                        {vmOverview.metrics.verifiedSections} of{' '}
                        {vmOverview.metrics.totalSections} tower sections verified
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                      <div className="text-xs font-medium text-slate-500">
                        Guy Cable Tensioning
                      </div>
                      <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                        {vmOverview.metrics.tensionedGuyLayers} /{' '}
                        {vmOverview.metrics.totalGuyLayers}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1">
                        {vmOverview.metrics.tensionedStrands} of{' '}
                        {vmOverview.metrics.totalStrands} guy strands tensioned
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Interactive Read-Only 2D Diagrams */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-sky-600" />
                    Interactive 2D Site &amp; Tower Diagrams
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click any foundation pad, tower section, or guy cable layer in the diagrams below to inspect current status.
                  </p>
                </div>

                {activeDto.settings.phaseMode === 'both' && (
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setDiagramMode('foundation')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        diagramMode === 'foundation'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Foundation &amp; Anchors
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiagramMode('vertical_mast')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        diagramMode === 'vertical_mast'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Tower Erection &amp; Guying
                    </button>
                  </div>
                )}
              </div>

              {diagramMode === 'foundation' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  <div className="lg:col-span-8">
                    <GroundAnchorPlan2D
                      foundations={renderProject.foundations}
                      selectedId={selectedFoundation?.id}
                      onSelect={setSelectedFoundationId}
                      title="2D Foundation & Anchor Layout Plan (Read-Only)"
                      subtitle="Tap any foundation pad to view completion stage and milestone dates"
                    />
                  </div>

                  <div className="lg:col-span-4 space-y-4">
                    {/* Selected Pad Info */}
                    {selectedFoundation && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                              Selected Pad · Sector {selectedFoundation.sector}
                            </div>
                            <h4 className="text-base font-bold text-slate-900">
                              {selectedFoundation.code} — {selectedFoundation.name}
                            </h4>
                            <p className="text-xs text-slate-500">
                              Distance from tower center: {selectedFoundation.radiusM}m
                            </p>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-bold shrink-0 ${STATUS_META[selectedFoundation.status].bgClass} ${STATUS_META[selectedFoundation.status].textClass}`}
                          >
                            {STATUS_META[selectedFoundation.status].shortLabel}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-medium text-slate-600">
                            <span>Stage Progress</span>
                            <span>{STATUS_META[selectedFoundation.status].pct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${STATUS_META[selectedFoundation.status].pct}%`,
                                backgroundColor: STATUS_META[selectedFoundation.status].color,
                              }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                            <div className="text-[10px] font-semibold uppercase text-slate-400">
                              Concrete Pour Date
                            </div>
                            <div className="font-semibold text-slate-800 mt-0.5">
                              {selectedFoundation.pourDate
                                ? formatDateWithWeekday(selectedFoundation.pourDate)
                                : 'Scheduled'}
                            </div>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                            <div className="text-[10px] font-semibold uppercase text-slate-400">
                              Completion Date
                            </div>
                            <div className="font-semibold text-slate-800 mt-0.5">
                              {selectedFoundation.completedDate
                                ? formatDateWithWeekday(selectedFoundation.completedDate)
                                : 'Pending'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sector Summary Card */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                        Progress by Sector
                      </h4>
                      <div className="space-y-2">
                        {civilOverview.sectorSummaries.map((sector) => (
                          <div key={sector.sector} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-700">{sector.label}</span>
                              <span className="text-slate-500 tabular-nums">
                                {sector.completedCount}/{sector.foundationCount} done ·{' '}
                                <strong className="text-slate-800">{sector.avgProgressPct}%</strong>
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-sky-500"
                                style={{ width: `${sector.avgProgressPct}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  <div className="lg:col-span-5">
                    <VerticalMastElevation2D
                      verticalMast={vmOverview.vm}
                      selectedTarget={selectedMastTarget}
                      onSelectTarget={(target) => {
                        setSelectedMastTarget(target);
                        if (target.kind === 'guy_layer') {
                          const layer = vmOverview.vm.guyLayers.find((l) => l.id === target.id);
                          if (layer) setSelectedGuyAnchorId(layer.anchorIds.I);
                        }
                      }}
                      title="Vertical Mast & 16-Layer Guying Elevation"
                      subtitle="Click any tower section (S01–S41) or guy layer (L01–L16)"
                      enableVerticalScale={false}
                    />
                  </div>

                  <div className="lg:col-span-7 space-y-4">
                    <GroundAnchorPlan2D
                      foundations={renderProject.foundations}
                      anchorGuyStates={vmOverview.anchorGuyStates}
                      selectedId={selectedGuyAnchorId}
                      highlightedIds={highlightedAnchorIds}
                      onSelect={setSelectedGuyAnchorId}
                      calloutTitle="GUY ANCHOR"
                      title="Ground Anchor Guying Connectivity Plan"
                      subtitle="Colors show how many guy cable levels are anchored at each pad"
                    />

                    {/* Selected Mast Section / Guy Layer / Anchor Card */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedTowerSection && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                Tower Section Selected
                              </div>
                              <div className="text-sm font-bold text-slate-900">
                                {selectedTowerSection.id} · {selectedTowerSection.elevationFromM}m –{' '}
                                {selectedTowerSection.elevationToM}m
                              </div>
                            </div>
                            {(() => {
                              const st = getClientSectionStatusLabel(selectedTowerSection.status);
                              return (
                                <span
                                  className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${st.bgClass} ${st.textClass}`}
                                >
                                  {st.label}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="text-xs text-slate-600 flex flex-wrap gap-3">
                            <span>
                              Installed:{' '}
                              <strong>
                                {selectedTowerSection.installedDate
                                  ? formatDateWithWeekday(selectedTowerSection.installedDate)
                                  : 'Scheduled'}
                              </strong>
                            </span>
                            {selectedTowerSection.verifiedDate && (
                              <span>
                                Verified:{' '}
                                <strong>
                                  {formatDateWithWeekday(selectedTowerSection.verifiedDate)}
                                </strong>
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {selectedGuyLayer && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                Guy Cable Layer Selected
                              </div>
                              <div className="text-sm font-bold text-slate-900">
                                {selectedGuyLayer.id} · Elev. {selectedGuyLayer.elevationM}m
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {selectedGuyLayer.anchorRingLabel} ({selectedGuyLayer.anchorRadiusM}m radius)
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${GUY_LAYER_STATUS_META[selectedGuyLayer.status].bgClass} ${GUY_LAYER_STATUS_META[selectedGuyLayer.status].textClass}`}
                            >
                              {GUY_LAYER_STATUS_META[selectedGuyLayer.status].shortLabel}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                            {(['I', 'II', 'III'] as const).map((sec) => {
                              const secProg = selectedGuyLayer.sectors[sec];
                              const anchorCode = selectedGuyLayer.anchorIds[sec];
                              return (
                                <div
                                  key={sec}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-center"
                                >
                                  <div className="font-bold text-slate-700">
                                    Sec {sec} ({anchorCode})
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {secProg.tensioned
                                      ? 'Tensioned'
                                      : secProg.terminated
                                        ? 'Anchored'
                                        : secProg.pulled
                                          ? 'Pulled'
                                          : 'Pending'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selectedGuyAnchor && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-bold text-slate-900">
                              Anchor Pad {selectedGuyAnchor.code} (Sector {selectedGuyAnchor.sector})
                            </div>
                            {vmOverview.anchorGuyStates[selectedGuyAnchor.id] && (
                              <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                                {
                                  ANCHOR_GUY_STAGE_META[
                                    vmOverview.anchorGuyStates[selectedGuyAnchor.id].stage
                                  ].shortLabel
                                }
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600">
                            {vmOverview.anchorGuyStates[selectedGuyAnchor.id]?.totalGuys
                              ? `${vmOverview.anchorGuyStates[selectedGuyAnchor.id].anchoredCount} anchored / ${vmOverview.anchorGuyStates[selectedGuyAnchor.id].tensionedCount} tensioned of ${vmOverview.anchorGuyStates[selectedGuyAnchor.id].totalGuys} guy cables`
                              : 'Center Mast Base Pedestal'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Project Schedule Milestones */}
            {activeDto.settings.showSchedule && activeDto.schedule.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-sky-600" />
                      Project Milestone Timeline
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Simplified construction sequence from mobilization to final tower commissioning
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                      {scheduleSummary.completed} / {scheduleSummary.total} Phases Complete
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {activeDto.schedule.map((item) => {
                    const badge = getScheduleStatusBadge(item.status);
                    const pct = Math.min(100, Math.max(0, Math.round(item.progressPct ?? 0)));
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex flex-col justify-between gap-2.5"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[11px] font-bold text-slate-500">
                              Phase {item.stepNo} · {item.indicativeTiming}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${badge.classes}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                          <p className="text-xs text-slate-600 line-clamp-2">{item.workDetails}</p>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Target: {item.plannedDurationDays} days
                            </span>
                            <span className="font-bold text-slate-700 tabular-nums">{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                item.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : item.status === 'in_progress'
                                    ? 'bg-sky-500'
                                    : 'bg-slate-400'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Field Highlights & Photo Gallery */}
            {activeDto.settings.showPhotos && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Camera className="w-5 h-5 text-sky-600" />
                      Recent Site Updates &amp; Photo Highlights
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Latest field progress summaries and documented site photos
                    </p>
                  </div>
                  {galleryPhotos.length > 0 && (
                    <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                      {galleryPhotos.length} Site {galleryPhotos.length === 1 ? 'Photo' : 'Photos'}
                    </span>
                  )}
                </div>

                {activeDto.highlights.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                    Site photos and daily progress highlights will appear here once field logs are recorded.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeDto.highlights.map((highlight: ClientDailyHighlightDto) => (
                      <article
                        key={highlight.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-slate-900 text-white text-[11px] font-bold">
                              Day {highlight.dayNumber}
                            </span>
                            <span className="text-xs font-bold text-slate-900">
                              {formatDateWithWeekday(highlight.date)}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-slate-200 bg-white text-[11px] font-medium text-slate-700">
                            <CloudSun className="w-3.5 h-3.5 text-amber-500" />
                            {WEATHER_BADGE_MAP[highlight.weather] ?? highlight.weather}
                          </span>
                        </div>

                        {highlight.activitiesSummary && (
                          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                            {highlight.activitiesSummary}
                          </p>
                        )}

                        {highlight.photos.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                            {highlight.photos.map((photo) => {
                              const idx = galleryPhotos.findIndex(
                                (item) => item.id === `${highlight.id}-${photo.id}`
                              );
                              return (
                                <button
                                  key={photo.id}
                                  type="button"
                                  onClick={() => idx >= 0 && setLightboxIndex(idx)}
                                  className="group relative rounded-xl overflow-hidden border border-slate-200 bg-white text-left cursor-pointer hover:ring-2 hover:ring-sky-500 transition"
                                >
                                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                                    <img
                                      src={photo.url}
                                      alt={photo.description || 'Site progress photo'}
                                      loading="lazy"
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                  </div>
                                  {photo.description && (
                                    <div className="p-2 text-[11px] text-slate-700 line-clamp-2">
                                      {photo.description}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Subtle Client Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-4 text-center text-[11px] text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Read-Only Client Showcase Portal
          </span>
          <span>
            {activeDto
              ? `${activeDto.projectName} · Last updated ${formatDateWithWeekday(activeDto.lastUpdated)}`
              : 'Mast & Tower Progress Reporter'}
          </span>
        </div>
      </footer>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && galleryPhotos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 text-white">
              <div className="text-xs font-semibold">
                Day {galleryPhotos[lightboxIndex].dayNumber} ·{' '}
                {formatDateWithWeekday(galleryPhotos[lightboxIndex].date)}
              </div>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                aria-label="Close photo"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative bg-black flex items-center justify-center max-h-[70dvh]">
              <img
                src={galleryPhotos[lightboxIndex].url}
                alt={galleryPhotos[lightboxIndex].description}
                className="max-h-[70dvh] w-auto object-contain"
              />
              {galleryPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex(
                        (lightboxIndex - 1 + galleryPhotos.length) % galleryPhotos.length
                      )
                    }
                    className="absolute left-3 p-2 rounded-full bg-slate-900/75 text-white hover:bg-slate-900 cursor-pointer"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxIndex((lightboxIndex + 1) % galleryPhotos.length)}
                    className="absolute right-3 p-2 rounded-full bg-slate-900/75 text-white hover:bg-slate-900 cursor-pointer"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            <div className="px-4 py-3 text-xs sm:text-sm text-slate-200 bg-slate-900">
              {galleryPhotos[lightboxIndex].description}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
