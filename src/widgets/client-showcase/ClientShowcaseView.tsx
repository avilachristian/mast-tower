import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  Lock,
  Printer,
  RefreshCw,
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
  PublicProjectSummary,
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
import type { Tower3DSelectionTarget } from './tower3dGeometry';

const LazyMastTower3DShowcase = lazy(() =>
  import('./MastTower3DShowcase').then((m) => ({ default: m.MastTower3DShowcase })),
);
const LazyOverallProjectStatusPrintModal = lazy(() =>
  import('@/widgets/project-status/OverallProjectStatusPrintModal').then((m) => ({
    default: m.OverallProjectStatusPrintModal,
  })),
);
const LazyOverallVerticalMastStatusPrintModal = lazy(() =>
  import('@/widgets/mast-tower/OverallVerticalMastStatusPrintModal').then((m) => ({
    default: m.OverallVerticalMastStatusPrintModal,
  })),
);
const LazyClientDailyLogPrintModal = lazy(() =>
  import('./ClientDailyLogPrintModal').then((m) => ({
    default: m.ClientDailyLogPrintModal,
  })),
);

const CLIENT_SHOWCASE_CACHE_KEY = 'mast2-client-showcase-cache-v1';
const SILENT_REFRESH_MIN_INTERVAL_MS = 120_000;

interface CachedShowcaseSnapshot {
  updatedAt: string;
  projects: ClientProjectShowcaseDto[];
  availableProjects?: PublicProjectSummary[];
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

export function ClientShowcaseView({ slug }: { slug?: string }) {
  const [projects, setProjects] = useState<ClientProjectShowcaseDto[]>([]);
  const [availableProjects, setAvailableProjects] = useState<PublicProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingCachedSnapshot, setUsingCachedSnapshot] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  // Diagram selection state (read-only)
  const [diagramMode, setDiagramMode] = useState<'foundation' | 'vertical_mast' | '3d_model'>(
    'foundation',
  );
  const [selectedFoundationId, setSelectedFoundationId] = useState<string>('PF-0');
  const [selectedMastTarget, setSelectedMastTarget] = useState<MastSelectionTarget>({
    kind: 'section',
    id: 'S01',
  });
  const [selectedGuyAnchorId, setSelectedGuyAnchorId] = useState<string | undefined>(undefined);
  const [selected3DTarget, setSelected3DTarget] = useState<Tower3DSelectionTarget | null>({
    kind: 'foundation',
    foundationId: 'PF-0',
  });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [progressReportTarget, setProgressReportTarget] = useState<
    'foundation' | 'vertical_mast' | null
  >(null);
  const [dailyLogPrintOpen, setDailyLogPrintOpen] = useState(false);
  const [dailyLogInitialId, setDailyLogInitialId] = useState<string | null>(null);

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

  const lastFetchAtRef = useRef<number>(0);
  const lastCachedSigRef = useRef<string | null>(null);
  const lastSyncedDiagramRef = useRef<{
    id: string;
    phaseMode: string;
    show3DModel: boolean;
  } | null>(null);

  const loadProjects = useCallback(
    async (isManualRefresh = false, silent = false) => {
      lastFetchAtRef.current = Date.now();
      if (!silent) {
        if (isManualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
      }
      setError(null);

      const cacheKey = slug
        ? `${CLIENT_SHOWCASE_CACHE_KEY}:${slug}`
        : CLIENT_SHOWCASE_CACHE_KEY;

      try {
        let list: ClientProjectShowcaseDto[] = [];
        let avail: PublicProjectSummary[] = [];

        if (slug) {
          const response = await apiClient.fetchClientProject(slug);
          list = response.project ? [response.project] : [];
          avail =
            Array.isArray(response.availableProjects) &&
            response.availableProjects.length > 0
              ? response.availableProjects
              : list.map((p) => ({
                  id: p.id,
                  slug: p.slug,
                  projectName: p.projectName,
                  location: p.location,
                  featured: p.featured,
                }));
        } else {
          const response = await apiClient.fetchClientProjects();
          list = Array.isArray(response.projects) ? response.projects : [];
          avail = list.map((p) => ({
            id: p.id,
            slug: p.slug,
            projectName: p.projectName,
            location: p.location,
            featured: p.featured,
          }));
        }

        setProjects(list);
        setAvailableProjects(avail);
        setUsingCachedSnapshot(false);
        setCachedAt(null);

        const nextSig = `${list.map((p) => `${p.id}:${p.updatedAt}`).join('|')}::${avail.map((a) => `${a.id}:${a.slug}:${a.featured}`).join(',')}`;
        if (nextSig !== lastCachedSigRef.current) {
          lastCachedSigRef.current = nextSig;
          await idbSet<CachedShowcaseSnapshot>(cacheKey, {
            updatedAt: new Date().toISOString(),
            projects: list,
            availableProjects: avail,
          });
        }
      } catch (err) {
        const cached =
          (await idbGet<CachedShowcaseSnapshot>(cacheKey)) ??
          (slug ? await idbGet<CachedShowcaseSnapshot>(CLIENT_SHOWCASE_CACHE_KEY) : undefined);
        const cachedList = Array.isArray(cached?.projects) ? cached.projects : [];
        const matchedList =
          slug && cachedList.length > 0
            ? cachedList.filter((p) => p.slug === slug || p.id === slug)
            : cachedList;

        if (matchedList.length > 0) {
          setProjects(matchedList);
          setAvailableProjects(
            cached?.availableProjects && cached.availableProjects.length > 0
              ? cached.availableProjects
              : cachedList.map((p) => ({
                  id: p.id,
                  slug: p.slug,
                  projectName: p.projectName,
                  location: p.location,
                  featured: p.featured,
                }))
          );
          setUsingCachedSnapshot(true);
          setCachedAt(cached?.updatedAt ?? null);
        } else if (!silent) {
          const message =
            err instanceof ApiError
              ? err.message
              : 'Unable to connect to the live project server right now.';
          setError(message);
        }
      } finally {
        if (!silent) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [slug]
  );

  useEffect(() => {
    void loadProjects(false);
  }, [loadProjects]);

  useEffect(() => {
    const maybeSilentRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }
      if (Date.now() - lastFetchAtRef.current < SILENT_REFRESH_MIN_INTERVAL_MS) {
        return;
      }
      void loadProjects(false, true);
    };
    document.addEventListener('visibilitychange', maybeSilentRefresh);
    return () => {
      document.removeEventListener('visibilitychange', maybeSilentRefresh);
    };
  }, [loadProjects]);

  const activeDto = useMemo(() => {
    if (projects.length === 0) return null;
    if (slug) {
      const matched = projects.find((p) => p.slug === slug || p.id === slug);
      if (matched) return matched;
    }
    return projects.find((p) => p.featured) ?? projects[0];
  }, [projects, slug]);

  const show3DModel = activeDto?.settings.show3DModel !== false;

  // Reset diagram selections on project switch and keep active diagram mode valid when phaseMode or 3D visibility updates
  useEffect(() => {
    if (!activeDto) return;

    const allow3D = activeDto.settings.show3DModel !== false;

    const resolveDefaultMode = (dto: ClientProjectShowcaseDto): 'foundation' | 'vertical_mast' => {
      if (dto.settings.phaseMode === 'vertical_mast') {
        return 'vertical_mast';
      }
      if (dto.settings.phaseMode === 'foundation') {
        return 'foundation';
      }
      const hasErectionProgress = Boolean(
        dto.verticalMastSummary?.sections.some((s) => s.status !== 'not_started') ||
          dto.verticalMastSummary?.guyLayers.some((l) => l.status !== 'not_started')
      );
      return hasErectionProgress ? 'vertical_mast' : 'foundation';
    };

    const prev = lastSyncedDiagramRef.current;
    const isNewProject = !prev || prev.id !== activeDto.id;
    const phaseChanged = !prev || prev.phaseMode !== activeDto.settings.phaseMode;

    if (isNewProject) {
      setDiagramMode(resolveDefaultMode(activeDto));
      const firstFoundation = activeDto.foundations[0]?.id ?? 'PF-0';
      const defaultMastAnchor =
        activeDto.foundations.find((f) => f.id === 'PF-0')?.id ?? firstFoundation;
      setSelectedFoundationId(firstFoundation);
      setSelectedMastTarget({ kind: 'section', id: 'S01' });
      setSelectedGuyAnchorId(defaultMastAnchor);
      setSelected3DTarget({ kind: 'foundation', foundationId: firstFoundation });
      setLightboxIndex(null);
      setProgressReportTarget(null);
      setDailyLogPrintOpen(false);
      setDailyLogInitialId(null);
    } else if (phaseChanged || !allow3D) {
      setDiagramMode((current) => {
        if (current === '3d_model') {
          return allow3D ? '3d_model' : resolveDefaultMode(activeDto);
        }
        return phaseChanged ? resolveDefaultMode(activeDto) : current;
      });
    }

    lastSyncedDiagramRef.current = {
      id: activeDto.id,
      phaseMode: activeDto.settings.phaseMode,
      show3DModel: allow3D,
    };
  }, [activeDto]);

  const openDailyLogReport = (highlightId?: string) => {
    setDailyLogInitialId(highlightId ?? activeDto?.highlights[0]?.id ?? null);
    setDailyLogPrintOpen(true);
  };

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
    if (selectedGuyLayer) {
      return Object.values(selectedGuyLayer.anchorIds);
    }
    if (selectedTowerSection && vmOverview) {
      if (selectedTowerSection.guyLayerIds.length > 0) {
        const anchors = new Set<string>();
        for (const layerId of selectedTowerSection.guyLayerIds) {
          const layer = vmOverview.vm.guyLayers.find((g) => g.id === layerId);
          if (layer) {
            Object.values(layer.anchorIds).forEach((aid) => anchors.add(aid));
          }
        }
        if (anchors.size > 0) return Array.from(anchors);
      }
      return ['PF-0'];
    }
    return [];
  }, [selectedGuyLayer, selectedTowerSection, vmOverview]);

  const handleSelectMastTarget = useCallback(
    (target: MastSelectionTarget) => {
      setSelectedMastTarget(target);
      if (target.kind === 'section') {
        setSelected3DTarget({ kind: 'section', sectionId: target.id });
        if (vmOverview) {
          const sec = vmOverview.vm.sections.find((s) => s.id === target.id);
          const linkedLayers = (sec?.guyLayerIds ?? [])
            .map((layerId) => vmOverview.vm.guyLayers.find((l) => l.id === layerId))
            .filter((l): l is NonNullable<typeof l> => Boolean(l));
          const linkedAnchorIds = linkedLayers.flatMap((l) => Object.values(l.anchorIds));
          if (linkedAnchorIds.length > 0) {
            setSelectedGuyAnchorId((prev) =>
              prev && linkedAnchorIds.includes(prev) ? prev : linkedLayers[0].anchorIds.I
            );
          } else {
            setSelectedGuyAnchorId('PF-0');
          }
        }
      } else if (target.kind === 'guy_layer') {
        setSelected3DTarget({ kind: 'guy_layer', guyLayerId: target.id });
        const layer = vmOverview?.vm.guyLayers.find((l) => l.id === target.id);
        if (layer) {
          const layerAnchorIds = Object.values(layer.anchorIds);
          setSelectedGuyAnchorId((prev) =>
            prev && layerAnchorIds.includes(prev) ? prev : layer.anchorIds.I
          );
        }
      }
    },
    [vmOverview]
  );

  const handleSelectMastAnchor = useCallback(
    (foundationId: string) => {
      setSelectedGuyAnchorId(foundationId);
      setSelectedFoundationId(foundationId);

      if (foundationId === 'PF-0') {
        setSelectedMastTarget({ kind: 'section', id: 'S01' });
        setSelected3DTarget({ kind: 'foundation', foundationId: 'PF-0' });
        return;
      }

      if (!vmOverview) return;
      const matchingLayers = vmOverview.vm.guyLayers.filter((g) =>
        Object.values(g.anchorIds).includes(foundationId)
      );
      if (matchingLayers.length === 0) {
        setSelected3DTarget({ kind: 'foundation', foundationId });
        return;
      }

      let chosenLayer = matchingLayers[0];
      if (selectedMastTarget.kind === 'guy_layer') {
        const currentIdx = matchingLayers.findIndex((g) => g.id === selectedMastTarget.id);
        if (currentIdx >= 0) {
          chosenLayer =
            selectedGuyAnchorId === foundationId
              ? matchingLayers[(currentIdx + 1) % matchingLayers.length]
              : matchingLayers[currentIdx];
        }
      } else if (selectedMastTarget.kind === 'section') {
        const sec = vmOverview.vm.sections.find((s) => s.id === selectedMastTarget.id);
        const linkedMatch = sec
          ? matchingLayers.find((g) => sec.guyLayerIds.includes(g.id))
          : undefined;
        if (linkedMatch) chosenLayer = linkedMatch;
      }

      setSelectedMastTarget({ kind: 'guy_layer', id: chosenLayer.id });
      const matchedSector = (['I', 'II', 'III'] as const).find(
        (sec) => chosenLayer.anchorIds[sec] === foundationId
      );
      setSelected3DTarget({
        kind: 'guy_layer',
        guyLayerId: chosenLayer.id,
        sector: matchedSector,
      });
    },
    [vmOverview, selectedMastTarget, selectedGuyAnchorId]
  );

  const handleSelect3D = useCallback(
    (target: Tower3DSelectionTarget | null) => {
      setSelected3DTarget(target);
      if (!target) return;
      if (target.kind === 'foundation') {
        setSelectedFoundationId(target.foundationId);
        setSelectedGuyAnchorId(target.foundationId);
      } else if (target.kind === 'section') {
        setSelectedMastTarget({ kind: 'section', id: target.sectionId });
      } else if (target.kind === 'guy_layer') {
        setSelectedMastTarget({ kind: 'guy_layer', id: target.guyLayerId });
        const matchedLayer = vmOverview?.vm.guyLayers.find(
          (l) => l.id === target.guyLayerId,
        );
        if (matchedLayer) {
          setSelectedGuyAnchorId(
            target.sector ? matchedLayer.anchorIds[target.sector] : matchedLayer.anchorIds.I,
          );
        }
      }
    },
    [vmOverview],
  );

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

  const safetyStatusIsAlert = (status: string) =>
    /issue|non|action|pending|open|warning|unsafe|fail/i.test(status);

  return (
    <div className="min-h-dvh flex flex-col bg-[#F7F6F2] text-neutral-900">
      {/* Slim Offline / Stale Snapshot Banner (full bleed hairline bar, zero rounded boxes) */}
      {(!isOnline || usingCachedSnapshot) && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 sm:px-8 py-2 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              {!isOnline
                ? 'Offline mode — displaying the last synchronized project snapshot.'
                : 'Live server unreachable — displaying the most recent saved snapshot.'}
            </span>
          </div>
          {cachedAt && (
            <span className="text-[11px] font-mono text-amber-800">
              Cached: {new Date(cachedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Minimal Header When Loading / Error / Empty */}
      {(loading || error || !activeDto) && (
        <div className="flex-1 flex flex-col">
          <header className="border-b border-stone-300 bg-[#F2F0EA] px-6 sm:px-10 py-4 flex items-center justify-between gap-4">
            <div className="text-xs font-mono uppercase tracking-widest text-neutral-700">
              Client Project Showcase // Dossier Portal
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <button
                type="button"
                onClick={() => void loadProjects(true)}
                disabled={refreshing}
                className="underline underline-offset-4 text-neutral-700 hover:text-neutral-950 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => navigateTo('/admin')}
                className="px-3.5 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-white uppercase tracking-wider text-[11px] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            </div>
          </header>

          <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-20 flex items-center justify-center">
            {loading && (
              <div className="text-center space-y-4">
                <RefreshCw className="w-6 h-6 text-neutral-800 animate-spin mx-auto" />
                <div className="text-xs font-mono uppercase tracking-widest text-neutral-600">
                  Loading Client Project Dossier...
                </div>
              </div>
            )}

            {!loading && error && (
              <div className="w-full border-t border-b border-stone-400 py-10 text-center space-y-4">
                <div className="text-[11px] font-mono uppercase tracking-widest text-rose-700">
                  Connection Notice
                </div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-950">
                  Unable to Load Project Showcase
                </h1>
                <p className="text-sm text-neutral-600 max-w-md mx-auto">{error}</p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void loadProjects(true)}
                    className="px-4 py-2 bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-mono uppercase tracking-wider cursor-pointer"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('/admin')}
                    className="px-4 py-2 border border-stone-400 hover:border-neutral-950 text-neutral-800 text-xs font-mono uppercase tracking-wider cursor-pointer"
                  >
                    Admin Login
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && !activeDto && (
              <div className="w-full border-t border-b border-stone-400 py-12 text-center space-y-4">
                <Compass className="w-6 h-6 text-neutral-800 mx-auto" />
                <div className="space-y-1.5 max-w-md mx-auto">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-neutral-500">
                    Index Empty
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-neutral-950">
                    No Client Projects Published Yet
                  </h1>
                  <p className="text-sm text-neutral-600">
                    Project dossiers will appear here once an administrator enables public Client Showcase visibility for a site.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => navigateTo('/admin')}
                    className="px-4 py-2 bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-mono uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Open Admin Workspace</span>
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Option 2 · Swiss Drafting Index Architectural Layout */}
      {!loading && activeDto && renderProject && civilOverview && vmOverview && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-start">
          {/* Sticky Left Architectural Dossier Rail */}
          <aside className="lg:col-span-3 bg-[#F2F0EA] border-b lg:border-b-0 lg:border-r border-stone-300 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto p-6 sm:p-8 flex flex-col justify-between gap-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono uppercase tracking-widest text-neutral-500">
                <span className="truncate">
                  Index · {activeDto.referenceNo || 'SITE'}
                </span>
                <span className="shrink-0 text-emerald-700 font-semibold">Live</span>
              </div>

              {availableProjects.length > 1 && (
                <div className="space-y-1">
                  <label
                    htmlFor="client-project-select"
                    className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500"
                  >
                    Active Dossier
                  </label>
                  <select
                    id="client-project-select"
                    aria-label="Select Client Project"
                    value={activeDto.slug}
                    onChange={(e) => navigateTo(`/p/${encodeURIComponent(e.target.value)}`)}
                    className="w-full rounded-none border border-stone-400 bg-[#F7F6F2] px-2.5 py-1.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-950 cursor-pointer"
                  >
                    {availableProjects.map((p) => (
                      <option key={p.id} value={p.slug}>
                        {p.projectName} ({p.location || 'Site'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {logoItems.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap pt-1">
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
                <h1 className="text-2xl font-bold tracking-tight text-neutral-950 leading-snug">
                  {activeDto.projectName}
                </h1>
                {activeDto.location && (
                  <p className="text-xs text-neutral-600 mt-1">{activeDto.location}</p>
                )}
              </div>

              {/* Razor-thin Overall Completion Rule */}
              <div className="space-y-1.5 pt-3 border-t border-stone-300">
                <div className="flex justify-between text-xs font-mono">
                  <span className="uppercase text-neutral-500">Completion</span>
                  <span className="font-bold text-neutral-950 tabular-nums">
                    {headlineProgressPct}%
                  </span>
                </div>
                <div className="h-1 bg-stone-300">
                  <div
                    className="h-full bg-neutral-950 transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, headlineProgressPct))}%` }}
                  />
                </div>
              </div>

              {/* Specification Metadata List */}
              <dl className="space-y-3 pt-3 border-t border-stone-300 text-xs">
                {activeDto.clientName && (
                  <div>
                    <dt className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                      Client
                    </dt>
                    <dd className="font-medium text-neutral-950 mt-0.5">{activeDto.clientName}</dd>
                  </div>
                )}
                {activeDto.contractor && (
                  <div>
                    <dt className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                      Contractor
                    </dt>
                    <dd className="font-medium text-neutral-950 mt-0.5">{activeDto.contractor}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                    Structure
                  </dt>
                  <dd className="font-medium text-neutral-950 mt-0.5">
                    {activeDto.towerHeightM}m Guyed Lattice Mast
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                    Report Date
                  </dt>
                  <dd className="font-medium text-neutral-950 mt-0.5">
                    {formatDateWithWeekday(activeDto.lastUpdated)}
                  </dd>
                </div>
              </dl>

              {/* Section Anchor Navigation */}
              <nav className="space-y-1.5 pt-4 border-t border-stone-300 text-[11px] font-mono uppercase tracking-wider">
                <a
                  href="#section-summary"
                  className="block text-neutral-900 font-bold hover:underline underline-offset-4"
                >
                  01 · Progress Summary
                </a>
                <a
                  href="#section-drawings"
                  className="block text-neutral-600 hover:text-neutral-950 hover:underline underline-offset-4"
                >
                  02 · Interactive Drawings
                </a>
                {activeDto.settings.showPhotos && (
                  <a
                    href="#section-logs"
                    className="block text-neutral-600 hover:text-neutral-950 hover:underline underline-offset-4"
                  >
                    03 · Daily Site Logs ({activeDto.highlights.length})
                  </a>
                )}
              </nav>

              {activeDto.settings.showReports && (
                <div className="pt-4 border-t border-stone-300 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                    Reports (PDF / Print)
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {activeDto.settings.phaseMode !== 'vertical_mast' && (
                      <button
                        type="button"
                        onClick={() => setProgressReportTarget('foundation')}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 border border-stone-300 bg-white hover:border-neutral-950 hover:bg-neutral-950 hover:text-white text-[11px] font-mono uppercase tracking-wider text-neutral-800 transition-colors cursor-pointer"
                      >
                        <span>Foundation Report</span>
                        <Printer className="w-3 h-3 shrink-0" />
                      </button>
                    )}
                    {activeDto.settings.phaseMode !== 'foundation' && (
                      <button
                        type="button"
                        onClick={() => setProgressReportTarget('vertical_mast')}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 border border-stone-300 bg-white hover:border-neutral-950 hover:bg-neutral-950 hover:text-white text-[11px] font-mono uppercase tracking-wider text-neutral-800 transition-colors cursor-pointer"
                      >
                        <span>Mast Erection Report</span>
                        <Printer className="w-3 h-3 shrink-0" />
                      </button>
                    )}
                    {activeDto.highlights.length > 0 && (
                      <button
                        type="button"
                        onClick={() => openDailyLogReport()}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 border border-stone-300 bg-white hover:border-neutral-950 hover:bg-neutral-950 hover:text-white text-[11px] font-mono uppercase tracking-wider text-neutral-800 transition-colors cursor-pointer"
                      >
                        <span>Daily Log ({activeDto.highlights.length})</span>
                        <FileText className="w-3 h-3 shrink-0" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-stone-300 flex items-center justify-between gap-2 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => void loadProjects(true)}
                disabled={refreshing}
                className="underline underline-offset-4 cursor-pointer text-neutral-700 hover:text-neutral-950 inline-flex items-center gap-1.5 disabled:opacity-50"
                title="Refresh latest project updates"
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => navigateTo('/admin')}
                className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-white uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3 h-3" />
                <span>Admin</span>
              </button>
            </div>
          </aside>

          {/* Right Continuous Stone Paper Canvas */}
          <main className="lg:col-span-9 p-6 sm:p-10 lg:p-12 space-y-14 min-w-0">
            {/* 01 · Project Overview & Bare Swiss KPI Metrics */}
            <section id="section-summary" className="space-y-6 border-b border-stone-300 pb-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] font-mono uppercase tracking-widest text-neutral-500">
                  01 · Project Summary
                </div>
                {activeDto.settings.showReports && (
                  <div className="flex flex-wrap items-center gap-2">
                    {activeDto.settings.phaseMode !== 'vertical_mast' && (
                      <button
                        type="button"
                        onClick={() => setProgressReportTarget('foundation')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-neutral-900 bg-white hover:bg-neutral-950 hover:text-white text-[11px] font-mono uppercase tracking-wider text-neutral-950 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3 h-3 shrink-0" />
                        <span>Foundation Report</span>
                      </button>
                    )}
                    {activeDto.settings.phaseMode !== 'foundation' && (
                      <button
                        type="button"
                        onClick={() => setProgressReportTarget('vertical_mast')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-neutral-900 bg-white hover:bg-neutral-950 hover:text-white text-[11px] font-mono uppercase tracking-wider text-neutral-950 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3 h-3 shrink-0" />
                        <span>Mast Erection Report</span>
                      </button>
                    )}
                    {activeDto.highlights.length > 0 && (
                      <button
                        type="button"
                        onClick={() => openDailyLogReport()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-400 bg-white hover:border-neutral-950 hover:bg-neutral-950 hover:text-white text-[11px] font-mono uppercase tracking-wider text-neutral-800 transition-colors cursor-pointer"
                      >
                        <FileText className="w-3 h-3 shrink-0" />
                        <span>Daily Log Report</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {activeDto.settings.welcomeNote?.trim() && (
                <p className="text-sm sm:text-base text-neutral-700 leading-relaxed max-w-3xl">
                  {activeDto.settings.welcomeNote}
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-5 border-t border-stone-300">
                {activeDto.settings.phaseMode !== 'vertical_mast' && (
                  <>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                        Civil Works
                      </div>
                      <div className="text-3xl font-bold tracking-tight text-neutral-950 mt-1 tabular-nums">
                        {civilOverview.metrics.overallProgressPct}%
                      </div>
                      <div className="text-xs text-neutral-600 mt-0.5">
                        {civilOverview.metrics.completedCount} /{' '}
                        {civilOverview.metrics.totalFoundations} pads backfilled
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                        Concrete Placed
                      </div>
                      <div className="text-3xl font-bold tracking-tight text-neutral-950 mt-1 tabular-nums">
                        {civilOverview.metrics.pouredConcreteCuM.toFixed(1)}m³
                      </div>
                      <div className="text-xs text-neutral-600 mt-0.5">
                        {civilOverview.metrics.pouredOrBeyondCount}/
                        {civilOverview.metrics.totalFoundations} pads ·{' '}
                        {civilOverview.metrics.totalConcreteCuM.toFixed(1)} m³ target
                      </div>
                    </div>
                  </>
                )}

                {activeDto.settings.phaseMode !== 'foundation' && (
                  <>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                        Mast Erected
                      </div>
                      <div className="text-3xl font-bold tracking-tight text-neutral-950 mt-1 tabular-nums">
                        {vmOverview.metrics.erectedHeightM}m
                      </div>
                      <div className="text-xs text-neutral-600 mt-0.5">
                        {vmOverview.metrics.verifiedSections}/{vmOverview.metrics.totalSections}{' '}
                        sections · {vmOverview.metrics.totalHeightM}m
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                        Guy Strands
                      </div>
                      <div className="text-3xl font-bold tracking-tight text-neutral-950 mt-1 tabular-nums">
                        {vmOverview.metrics.tensionedStrands}/{vmOverview.metrics.totalStrands}
                      </div>
                      <div className="text-xs text-neutral-600 mt-0.5">
                        {vmOverview.metrics.tensionedGuyLayers}/{vmOverview.metrics.totalGuyLayers}{' '}
                        levels tensioned
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* 02 · Interactive 2D Engineering Drawings */}
            <section id="section-drawings" className="space-y-6 border-b border-stone-300 pb-12">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-900 pb-2">
                <div>
                  <h2 className="text-sm font-mono uppercase tracking-widest font-bold text-neutral-950">
                    {show3DModel
                      ? '02 · Interactive Engineering Drawings & 3D Model'
                      : '02 · Interactive 2D Engineering Drawings'}
                  </h2>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    Select any foundation pad, mast section, or guy cable level below to inspect live telemetry.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(activeDto.settings.phaseMode === 'foundation' ||
                    activeDto.settings.phaseMode === 'both') && (
                    <button
                      type="button"
                      onClick={() => setDiagramMode('foundation')}
                      className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider cursor-pointer transition-colors ${
                        diagramMode === 'foundation'
                          ? 'bg-neutral-950 text-white'
                          : 'border border-stone-300 text-neutral-700 hover:text-neutral-950 hover:border-neutral-950'
                      }`}
                    >
                      Foundation &amp; Anchors
                    </button>
                  )}
                  {(activeDto.settings.phaseMode === 'vertical_mast' ||
                    activeDto.settings.phaseMode === 'both') && (
                    <button
                      type="button"
                      onClick={() => setDiagramMode('vertical_mast')}
                      className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider cursor-pointer transition-colors ${
                        diagramMode === 'vertical_mast'
                          ? 'bg-neutral-950 text-white'
                          : 'border border-stone-300 text-neutral-700 hover:text-neutral-950 hover:border-neutral-950'
                      }`}
                    >
                      Mast &amp; Guying
                    </button>
                  )}
                  {show3DModel && (
                    <button
                      type="button"
                      onClick={() => setDiagramMode('3d_model')}
                      className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider cursor-pointer transition-colors ${
                        diagramMode === '3d_model'
                          ? 'bg-neutral-950 text-white'
                          : 'border border-stone-300 text-neutral-700 hover:text-neutral-950 hover:border-neutral-950'
                      }`}
                    >
                      3D Model
                    </button>
                  )}
                </div>
              </div>

              {show3DModel && diagramMode === '3d_model' ? (
                <div className="space-y-6">
                  <Suspense
                    fallback={
                      <div className="border border-stone-300 bg-[#F7F6F2] h-[520px] sm:h-[580px] flex items-center justify-center text-xs font-mono uppercase tracking-widest text-neutral-500">
                        Initializing 3D Viewport...
                      </div>
                    }
                  >
                    <LazyMastTower3DShowcase
                      foundations={activeDto.foundations}
                      verticalMast={vmOverview.vm}
                      phaseMode={activeDto.settings.phaseMode}
                      selection={selected3DTarget}
                      onSelect={handleSelect3D}
                    />
                  </Suspense>

                  {/* 3D Selection Telemetry Ledger */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                    {selectedFoundation && (
                      <div className="border-t border-stone-900 pt-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                              Foundation · Sector {selectedFoundation.sector}
                            </div>
                            <div className="text-sm font-bold text-neutral-950 mt-0.5">
                              {selectedFoundation.code} — {selectedFoundation.name}
                            </div>
                            <div className="text-xs text-neutral-600">
                              Radius {selectedFoundation.radiusM}m ·{' '}
                              {selectedFoundation.resolvedDims
                                ? `${selectedFoundation.resolvedDims.lengthM}×${selectedFoundation.resolvedDims.widthM}×${selectedFoundation.resolvedDims.thicknessM}m`
                                : ''}
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-mono font-bold uppercase shrink-0 ${STATUS_META[selectedFoundation.status].textClass}`}
                          >
                            {STATUS_META[selectedFoundation.status].shortLabel}
                          </span>
                        </div>
                        <div className="h-1 bg-stone-200">
                          <div
                            className="h-full"
                            style={{
                              width: `${STATUS_META[selectedFoundation.status].pct}%`,
                              backgroundColor: STATUS_META[selectedFoundation.status].color,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {selectedTowerSection ? (
                      <div className="border-t border-stone-900 pt-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                              Mast Section Selected
                            </div>
                            <div className="text-sm font-bold text-neutral-950 mt-0.5">
                              {selectedTowerSection.id} · {selectedTowerSection.elevationFromM}m –{' '}
                              {selectedTowerSection.elevationToM}m
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-mono font-bold uppercase shrink-0 ${
                              getClientSectionStatusLabel(selectedTowerSection.status).textClass
                            }`}
                          >
                            {getClientSectionStatusLabel(selectedTowerSection.status).label}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-600">
                          Installed:{' '}
                          <strong className="text-neutral-900">
                            {selectedTowerSection.installedDate
                              ? formatDateWithWeekday(selectedTowerSection.installedDate)
                              : 'Scheduled'}
                          </strong>
                        </div>
                      </div>
                    ) : selectedGuyLayer ? (
                      <div className="border-t border-stone-900 pt-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                              Guy Cable Layer Selected
                            </div>
                            <div className="text-sm font-bold text-neutral-950 mt-0.5">
                              {selectedGuyLayer.id} · Elev. {selectedGuyLayer.elevationM}m
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-mono font-bold uppercase shrink-0 ${GUY_LAYER_STATUS_META[selectedGuyLayer.status].textClass}`}
                          >
                            {GUY_LAYER_STATUS_META[selectedGuyLayer.status].shortLabel}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-stone-200">
                          {(['I', 'II', 'III'] as const).map((sec) => {
                            const secProg = selectedGuyLayer.sectors[sec];
                            return (
                              <div key={sec}>
                                <div className="font-mono font-bold text-neutral-900">
                                  Sec {sec} ({selectedGuyLayer.anchorIds[sec]})
                                </div>
                                <div className="text-[10px] text-neutral-600">
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
                    ) : (
                      <div className="border-t border-stone-300 pt-3 text-xs text-neutral-500">
                        Click any mast section (S01–S41) or guy cable strand in the 3D scene to inspect elevation details.
                      </div>
                    )}

                    <div className="border-t border-stone-300 pt-3 space-y-2">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                        3D Inspection Tip
                      </div>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        The translucent survey plane marks Natural Ground Level (Y = 0.00m). Concrete
                        footings and anchor blocks extend below grade with guy tie-rods emerging
                        +0.30m to meet all 48 tension cables.
                      </p>
                    </div>
                  </div>
                </div>
              ) : diagramMode === 'foundation' ? (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                  <div className="xl:col-span-8">
                    <GroundAnchorPlan2D
                      frameless
                      foundations={renderProject.foundations}
                      selectedId={selectedFoundation?.id}
                      onSelect={(id) => {
                        setSelectedFoundationId(id);
                        setSelected3DTarget({ kind: 'foundation', foundationId: id });
                      }}
                      title="2D Foundation & Anchor Layout Plan"
                      subtitle="Tap any foundation pad to view completion stage and milestone dates"
                    />
                  </div>

                  <div className="xl:col-span-4 space-y-6">
                    {selectedFoundation && (
                      <div className="border-t border-stone-900 pt-3 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                              Selected Pad · Sector {selectedFoundation.sector}
                            </div>
                            <h3 className="text-base font-bold text-neutral-950 mt-0.5">
                              {selectedFoundation.code} — {selectedFoundation.name}
                            </h3>
                            <p className="text-xs text-neutral-600 mt-0.5">
                              Radius from mast center: {selectedFoundation.radiusM}m
                            </p>
                          </div>
                          <span
                            className={`text-[11px] font-mono font-bold uppercase shrink-0 ${STATUS_META[selectedFoundation.status].textClass}`}
                          >
                            {STATUS_META[selectedFoundation.status].shortLabel}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-mono text-neutral-600">
                            <span>STAGE PROGRESS</span>
                            <span className="font-bold text-neutral-950 tabular-nums">
                              {STATUS_META[selectedFoundation.status].pct}%
                            </span>
                          </div>
                          <div className="h-1 bg-stone-200">
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${STATUS_META[selectedFoundation.status].pct}%`,
                                backgroundColor: STATUS_META[selectedFoundation.status].color,
                              }}
                            />
                          </div>
                        </div>

                        <dl className="grid grid-cols-2 gap-4 pt-3 border-t border-stone-200 text-xs">
                          <div>
                            <dt className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                              Concrete Pour
                            </dt>
                            <dd className="font-semibold text-neutral-900 mt-0.5">
                              {selectedFoundation.pourDate
                                ? formatDateWithWeekday(selectedFoundation.pourDate)
                                : 'Scheduled'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                              Completion
                            </dt>
                            <dd className="font-semibold text-neutral-900 mt-0.5">
                              {selectedFoundation.completedDate
                                ? formatDateWithWeekday(selectedFoundation.completedDate)
                                : 'Pending'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    )}

                    <div className="border-t border-stone-300 pt-4 space-y-2.5">
                      <h3 className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                        Progress by Sector
                      </h3>
                      <div className="divide-y divide-stone-200">
                        {civilOverview.sectorSummaries.map((sector) => (
                          <div key={sector.sector} className="py-2 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-neutral-800">{sector.label}</span>
                              <span className="font-mono text-neutral-600 tabular-nums">
                                {sector.completedCount}/{sector.foundationCount} ·{' '}
                                <strong className="text-neutral-950">{sector.avgProgressPct}%</strong>
                              </span>
                            </div>
                            <div className="h-0.5 bg-stone-200">
                              <div
                                className="h-full bg-neutral-900"
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
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                  <div className="xl:col-span-6">
                    <VerticalMastElevation2D
                      frameless
                      verticalMast={vmOverview.vm}
                      selectedTarget={selectedMastTarget}
                      onSelectTarget={handleSelectMastTarget}
                      title="Vertical Mast & 16-Layer Guying Elevation"
                      subtitle="Click any tower section (S01–S41) or guy layer (L01–L16)"
                      enableVerticalScale
                      defaultVerticalScale={1.5}
                      scaleOptions={[1.5, 2]}
                    />
                  </div>

                  <div className="xl:col-span-6 space-y-8">
                    <GroundAnchorPlan2D
                      frameless
                      foundations={renderProject.foundations}
                      anchorGuyStates={vmOverview.anchorGuyStates}
                      selectedId={selectedGuyAnchorId ?? highlightedAnchorIds[0] ?? 'PF-0'}
                      highlightedIds={highlightedAnchorIds}
                      onSelect={handleSelectMastAnchor}
                      calloutTitle="GUY ANCHOR"
                      title="Ground Anchor Guying Connectivity Plan"
                      subtitle="Click any anchor pad to inspect linked guy levels & mast section"
                    />

                    {/* Selected Mast / Guy Layer / Anchor Telemetry Ledger */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-stone-300">
                      {selectedTowerSection && (
                        <div className="border-t border-stone-900 pt-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                                Tower Section Selected
                              </div>
                              <div className="text-sm font-bold text-neutral-950 mt-0.5">
                                {selectedTowerSection.id} · {selectedTowerSection.elevationFromM}m –{' '}
                                {selectedTowerSection.elevationToM}m
                              </div>
                            </div>
                            {(() => {
                              const st = getClientSectionStatusLabel(selectedTowerSection.status);
                              return (
                                <span
                                  className={`text-[10px] font-mono font-bold uppercase shrink-0 ${st.textClass}`}
                                >
                                  {st.label}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="text-xs text-neutral-600 flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-stone-200">
                            <span>
                              Installed:{' '}
                              <strong className="text-neutral-900">
                                {selectedTowerSection.installedDate
                                  ? formatDateWithWeekday(selectedTowerSection.installedDate)
                                  : 'Scheduled'}
                              </strong>
                            </span>
                            {selectedTowerSection.verifiedDate && (
                              <span>
                                Verified:{' '}
                                <strong className="text-neutral-900">
                                  {formatDateWithWeekday(selectedTowerSection.verifiedDate)}
                                </strong>
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {selectedGuyLayer && (
                        <div className="border-t border-stone-900 pt-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                                Guy Cable Layer Selected
                              </div>
                              <div className="text-sm font-bold text-neutral-950 mt-0.5">
                                {selectedGuyLayer.id} · Elev. {selectedGuyLayer.elevationM}m
                              </div>
                              <div className="text-[11px] text-neutral-600">
                                {selectedGuyLayer.anchorRingLabel} ({selectedGuyLayer.anchorRadiusM}m radius)
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-mono font-bold uppercase shrink-0 ${GUY_LAYER_STATUS_META[selectedGuyLayer.status].textClass}`}
                            >
                              {GUY_LAYER_STATUS_META[selectedGuyLayer.status].shortLabel}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[11px] pt-2 border-t border-stone-200">
                            {(['I', 'II', 'III'] as const).map((sec) => {
                              const secProg = selectedGuyLayer.sectors[sec];
                              const anchorCode = selectedGuyLayer.anchorIds[sec];
                              return (
                                <div key={sec}>
                                  <div className="font-mono font-bold text-neutral-900">
                                    Sec {sec} ({anchorCode})
                                  </div>
                                  <div className="text-[10px] text-neutral-600">
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
                        <div className="sm:col-span-2 pt-3 border-t border-stone-200 flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                              Anchor Pad Selected
                            </div>
                            <div className="text-sm font-bold text-neutral-950 mt-0.5">
                              {selectedGuyAnchor.code} (Sector {selectedGuyAnchor.sector})
                            </div>
                            <div className="text-xs text-neutral-600 mt-0.5">
                              {vmOverview.anchorGuyStates[selectedGuyAnchor.id]?.totalGuys
                                ? `${vmOverview.anchorGuyStates[selectedGuyAnchor.id].anchoredCount} anchored / ${vmOverview.anchorGuyStates[selectedGuyAnchor.id].tensionedCount} tensioned of ${vmOverview.anchorGuyStates[selectedGuyAnchor.id].totalGuys} guy cables`
                                : 'Center Mast Base Pedestal'}
                            </div>
                          </div>
                          {vmOverview.anchorGuyStates[selectedGuyAnchor.id] && (
                            <span className="text-[11px] font-mono font-bold uppercase text-sky-700">
                              {
                                ANCHOR_GUY_STAGE_META[
                                  vmOverview.anchorGuyStates[selectedGuyAnchor.id].stage
                                ].shortLabel
                              }
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* 03 · Recent Site Updates & Photo Highlights */}
            {activeDto.settings.showPhotos && (
              <section id="section-logs" className="space-y-8">
                <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-900 pb-2">
                  <div>
                    <h2 className="text-sm font-mono uppercase tracking-widest font-bold text-neutral-950">
                      03 · Recent Site Updates &amp; Photo Highlights
                    </h2>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      Daily field engineering records, safety compliance logs, and site photography
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">
                      {activeDto.highlights.length}{' '}
                      {activeDto.highlights.length === 1 ? 'Entry' : 'Entries'} ·{' '}
                      {galleryPhotos.length} {galleryPhotos.length === 1 ? 'Photo' : 'Photos'}
                    </span>
                    {activeDto.settings.showReports && activeDto.highlights.length > 0 && (
                      <button
                        type="button"
                        onClick={() => openDailyLogReport()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-stone-400 bg-white hover:border-neutral-950 hover:bg-neutral-950 hover:text-white text-[10px] font-mono uppercase tracking-wider text-neutral-800 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3 h-3 shrink-0" />
                        <span>Daily Log PDF</span>
                      </button>
                    )}
                  </div>
                </div>

                {activeDto.highlights.length === 0 ? (
                  <div className="py-10 border-b border-stone-200 text-xs font-mono text-neutral-500">
                    Site photos and daily progress highlights will appear here once field logs are recorded.
                  </div>
                ) : (
                  <div className="divide-y divide-stone-300">
                    {activeDto.highlights.map((highlight: ClientDailyHighlightDto, index: number) => {
                      const safetyLogs = highlight.safetyLogs ?? [];
                      const equipment = highlight.equipment ?? [];
                      const delays = highlight.delays ?? [];
                      const foundationsWorked = highlight.foundationsWorked ?? [];
                      const totalWorkers = highlight.totalWorkers ?? 0;
                      const preparedBy = highlight.preparedBy?.trim() || '';
                      const safetyOfficer = highlight.safetyOfficer?.trim() || '';
                      const weatherLabel =
                        WEATHER_BADGE_MAP[highlight.weather] ?? highlight.weather;
                      const hasSafetyAlert = safetyLogs.some((item) =>
                        safetyStatusIsAlert(item.status)
                      );

                      return (
                        <article
                          key={highlight.id}
                          className={`${index === 0 ? 'pb-10' : 'py-10'} space-y-5`}
                        >
                          {/* Log Entry Day Header */}
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="flex items-baseline gap-3">
                              <span className="text-xl font-bold tracking-tight text-neutral-950 font-mono">
                                DAY {String(highlight.dayNumber).padStart(2, '0')}
                              </span>
                              <span className="text-sm font-medium text-neutral-700">
                                {formatDateWithWeekday(highlight.date)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono uppercase tracking-wider text-neutral-600">
                                {weatherLabel}
                              </span>
                              {activeDto.settings.showReports && (
                                <button
                                  type="button"
                                  onClick={() => openDailyLogReport(highlight.id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 border border-stone-300 bg-white hover:border-neutral-950 hover:bg-neutral-950 hover:text-white text-[10px] font-mono uppercase tracking-wider text-neutral-700 transition-colors cursor-pointer"
                                  title={`Print / Save PDF for Day ${highlight.dayNumber}`}
                                >
                                  <Printer className="w-2.5 h-2.5 shrink-0" />
                                  <span>Day {String(highlight.dayNumber).padStart(2, '0')} PDF</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Narrative Summary */}
                          {highlight.activitiesSummary && (
                            <p className="text-sm sm:text-[15px] text-neutral-800 leading-relaxed max-w-3xl whitespace-pre-line">
                              {highlight.activitiesSummary}
                            </p>
                          )}

                          {/* 4-Column Borderless Specification Ledger */}
                          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 pt-4 border-t border-stone-200 text-xs">
                            <div>
                              <dt className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                                Engineer / Prepared By
                              </dt>
                              <dd className="font-semibold text-neutral-950 mt-1">
                                {preparedBy || 'Field Engineering Team'}
                              </dd>
                            </div>

                            <div>
                              <dt className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                                Workers On Site
                              </dt>
                              <dd className="font-semibold text-neutral-950 mt-1 tabular-nums">
                                {totalWorkers > 0 ? `${totalWorkers} Personnel` : '—'}
                              </dd>
                            </div>

                            <div>
                              <dt className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                                Safety Officer &amp; Logs
                              </dt>
                              <dd
                                className={`font-semibold mt-1 ${
                                  safetyLogs.length > 0
                                    ? hasSafetyAlert
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                    : 'text-neutral-700'
                                }`}
                              >
                                {safetyLogs.length > 0
                                  ? `${safetyLogs.length} ${safetyLogs.length === 1 ? 'Entry' : 'Entries'}${
                                      safetyOfficer ? ` · ${safetyOfficer}` : ''
                                    }`
                                  : safetyOfficer || 'Standard Site PPE'}
                              </dd>
                            </div>

                            <div>
                              <dt className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                                Work Areas / Weather
                              </dt>
                              <dd className="font-medium text-neutral-900 mt-1">
                                {foundationsWorked.length > 0
                                  ? foundationsWorked.join(', ')
                                  : 'General Site'}{' '}
                                · {weatherLabel}
                              </dd>
                            </div>
                          </dl>

                          {/* Safety Observations & Equipment Deployed Strip */}
                          {(safetyLogs.length > 0 ||
                            equipment.length > 0 ||
                            Boolean(highlight.weatherNotes?.trim())) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-stone-200/80 text-xs">
                              {safetyLogs.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-2">
                                    Safety Log Entries
                                  </div>
                                  <ul className="divide-y divide-stone-200">
                                    {safetyLogs.map((entry) => (
                                      <li
                                        key={entry.id}
                                        className="flex items-baseline justify-between gap-3 py-1.5"
                                      >
                                        <span className="text-neutral-800">
                                          {entry.timeOrActivity && (
                                            <span className="font-medium text-neutral-950">
                                              {entry.timeOrActivity}
                                              {entry.hazardOrFinding || entry.actionTaken
                                                ? ' — '
                                                : ''}
                                            </span>
                                          )}
                                          {entry.hazardOrFinding}
                                          {entry.actionTaken && (
                                            <span className="text-neutral-500">
                                              {entry.hazardOrFinding ? ` (${entry.actionTaken})` : entry.actionTaken}
                                            </span>
                                          )}
                                        </span>
                                        <span
                                          className={`font-mono text-[10px] uppercase shrink-0 ${
                                            safetyStatusIsAlert(entry.status)
                                              ? 'text-amber-700 font-bold'
                                              : 'text-emerald-700'
                                          }`}
                                        >
                                          {entry.status || 'Compliant'}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {(equipment.length > 0 || Boolean(highlight.weatherNotes?.trim())) && (
                                <div>
                                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-2">
                                    Equipment Deployed &amp; Weather Note
                                  </div>
                                  {equipment.length > 0 && (
                                    <p className="text-neutral-800 leading-relaxed">
                                      {equipment
                                        .map(
                                          (eq) =>
                                            `${eq.qty}× ${eq.name}${
                                              eq.status && eq.status !== 'Operational'
                                                ? ` (${eq.status})`
                                                : ''
                                            }`
                                        )
                                        .join(' · ')}
                                    </p>
                                  )}
                                  {highlight.weatherNotes?.trim() && (
                                    <p className="text-neutral-600 mt-1.5 font-mono text-[11px]">
                                      Weather note: {highlight.weatherNotes}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Conditional Issue / Delay Notice (left hairline rule only, no enclosing box) */}
                          {delays.length > 0 && (
                            <div className="pl-4 border-l-2 border-amber-600 py-1 text-xs space-y-1">
                              <div className="text-[10px] font-mono uppercase tracking-wider text-amber-800 font-bold">
                                Issue / Delay Recorded
                              </div>
                              {delays.map((delay) => (
                                <div key={delay.id} className="text-neutral-900">
                                  {delay.description}
                                  {delay.impact && (
                                    <span className="text-neutral-600 font-mono">
                                      {' '}
                                      ({delay.impact})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Flush Sharp-Corner Photo Plates */}
                          {highlight.photos.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                              {highlight.photos.map((photo) => {
                                const idx = galleryPhotos.findIndex(
                                  (item) => item.id === `${highlight.id}-${photo.id}`
                                );
                                return (
                                  <button
                                    key={photo.id}
                                    type="button"
                                    onClick={() => idx >= 0 && setLightboxIndex(idx)}
                                    className="group text-left cursor-pointer focus:outline-none"
                                  >
                                    <div className="aspect-[4/3] overflow-hidden bg-stone-200">
                                      <img
                                        src={photo.url}
                                        alt={photo.description || 'Site progress photo'}
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                                      />
                                    </div>
                                    {photo.description && (
                                      <div className="pt-2 text-xs text-neutral-600 leading-snug group-hover:text-neutral-950 transition-colors line-clamp-2">
                                        {photo.description}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Architectural Portal Footer */}
            <footer className="pt-8 border-t border-stone-300 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono uppercase tracking-wider text-neutral-500">
              <span>Read-Only Client Showcase Portal</span>
              <span>
                {activeDto.projectName} · Updated {formatDateWithWeekday(activeDto.lastUpdated)}
              </span>
            </footer>
          </main>
        </div>
      )}

      {/* Client-Safe Print / PDF Report Modals (Controlled by Admin showReports setting) */}
      {activeDto && renderProject && activeDto.settings.showReports && (
        <Suspense fallback={null}>
          {progressReportTarget === 'foundation' &&
            activeDto.settings.phaseMode !== 'vertical_mast' && (
              <LazyOverallProjectStatusPrintModal
                open
                onClose={() => setProgressReportTarget(null)}
                project={renderProject}
                clientSafe
              />
            )}
          {progressReportTarget === 'vertical_mast' &&
            activeDto.settings.phaseMode !== 'foundation' && (
              <LazyOverallVerticalMastStatusPrintModal
                open
                onClose={() => setProgressReportTarget(null)}
                project={renderProject}
                clientSafe
              />
            )}
          {dailyLogPrintOpen && (
            <LazyClientDailyLogPrintModal
              open
              onClose={() => setDailyLogPrintOpen(false)}
              dto={activeDto}
              renderProject={renderProject}
              initialHighlightId={dailyLogInitialId}
            />
          )}
        </Suspense>
      )}

      {/* Architectural Fullscreen Photo Lightbox (Sharp Geometry) */}
      {lightboxIndex !== null && galleryPhotos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-neutral-950/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative max-w-5xl w-full bg-neutral-950 border border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 text-neutral-200 font-mono text-xs uppercase tracking-wider">
              <div>
                Day {String(galleryPhotos[lightboxIndex].dayNumber).padStart(2, '0')} ·{' '}
                {formatDateWithWeekday(galleryPhotos[lightboxIndex].date)}
              </div>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="p-1.5 border border-neutral-700 hover:border-white text-neutral-300 hover:text-white cursor-pointer"
                aria-label="Close photo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative bg-black flex items-center justify-center max-h-[72dvh]">
              <img
                src={galleryPhotos[lightboxIndex].url}
                alt={galleryPhotos[lightboxIndex].description}
                className="max-h-[72dvh] w-auto object-contain"
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
                    className="absolute left-3 p-2.5 bg-neutral-950/85 border border-neutral-700 text-white hover:bg-neutral-900 cursor-pointer"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxIndex((lightboxIndex + 1) % galleryPhotos.length)}
                    className="absolute right-3 p-2.5 bg-neutral-950/85 border border-neutral-700 text-white hover:bg-neutral-900 cursor-pointer"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            <div className="px-4 py-3 text-xs sm:text-sm text-neutral-300 bg-neutral-950 border-t border-neutral-800">
              {galleryPhotos[lightboxIndex].description}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
