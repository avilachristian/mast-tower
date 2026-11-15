import type {
  ClientDailyHighlightDto,
  ClientFoundationSummary,
  ClientProjectShowcaseDto,
  ClientShowcaseSettings,
  DailyActivityLogEntry,
  FoundationRecord,
  FoundationResolvedDims,
  FoundationType,
  MastProjectState,
  SavedProjectRecord,
  VerticalMastState,
} from './types';

// Worker-safe dimension defaults matching mast2Baseline.ts (avoids pulling PNG imports into worker bundle)
const DEFAULT_FOUNDATION_DIMS: Record<FoundationType, FoundationResolvedDims> = {
  principal: {
    lengthM: 2.0,
    widthM: 2.0,
    thicknessM: 1.0,
    overburdenDepthM: 0.0,
    leanThicknessM: 0.05,
  },
  anchor_a: {
    lengthM: 2.0,
    widthM: 2.0,
    thicknessM: 1.4,
    overburdenDepthM: 0.6,
    leanThicknessM: 0.05,
  },
  anchor_b: {
    lengthM: 2.0,
    widthM: 2.0,
    thicknessM: 1.0,
    overburdenDepthM: 1.0,
    leanThicknessM: 0.05,
  },
  anchor_c: {
    lengthM: 1.5,
    widthM: 1.5,
    thicknessM: 0.7,
    overburdenDepthM: 1.3,
    leanThicknessM: 0.05,
  },
};

function resolveClientFoundationDims(f: FoundationRecord): FoundationResolvedDims {
  const base = DEFAULT_FOUNDATION_DIMS[f.type];
  const custom = f.customSpecs;
  return {
    lengthM: custom?.lengthM ?? base.lengthM,
    widthM: custom?.widthM ?? base.widthM,
    thicknessM: custom?.thicknessM ?? base.thicknessM,
    overburdenDepthM: custom?.overburdenDepthM ?? base.overburdenDepthM,
    leanThicknessM: custom?.leanThicknessM ?? base.leanThicknessM,
  };
}

export const DEFAULT_CLIENT_SHOWCASE_SETTINGS: ClientShowcaseSettings = {
  enabled: false,
  featured: false,
  phaseMode: 'both',
  showPhotos: true,
};

export function slugifyProjectSlug(value: string, fallbackId = 'project'): string {
  const clean = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (clean) return clean;
  const fallback = fallbackId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return fallback || 'mast-project';
}

export function resolveClientShowcaseSettings(
  record: Pick<SavedProjectRecord, 'id' | 'clientSettings' | 'state'>
): ClientShowcaseSettings {
  const displayName =
    record.state.reportDetails?.projectName?.trim() || record.state.projectName;
  const raw = record.clientSettings;
  const rawSlug = raw?.slug?.trim();
  return {
    enabled: Boolean(raw?.enabled),
    featured: Boolean(raw?.featured),
    slug: rawSlug
      ? slugifyProjectSlug(rawSlug, record.id)
      : slugifyProjectSlug(displayName, record.id),
    welcomeNote: raw?.welcomeNote?.trim() || undefined,
    phaseMode:
      raw?.phaseMode === 'foundation' ||
      raw?.phaseMode === 'vertical_mast' ||
      raw?.phaseMode === 'both'
        ? raw.phaseMode
        : 'both',
    showPhotos: raw?.showPhotos ?? true,
  };
}

function sanitizeFoundationForClient(f: FoundationRecord): ClientFoundationSummary {
  return {
    id: f.id,
    code: f.code,
    name: f.name,
    type: f.type,
    sector: f.sector,
    radiusM: f.radiusM,
    angleDeg: f.angleDeg,
    xM: f.xM,
    zM: f.zM,
    status: f.status,
    pourDate: f.pourDate,
    completedDate: f.completedDate,
    resolvedDims: resolveClientFoundationDims(f),
  };
}

function sanitizeVerticalMastForClient(
  vm: VerticalMastState | undefined
): VerticalMastState | undefined {
  if (!vm) return undefined;
  return {
    platformStatus: vm.platformStatus,
    lightningRodStatus: vm.lightningRodStatus,
    sections: vm.sections.map((sec) => ({
      id: sec.id,
      sectionNo: sec.sectionNo,
      label: sec.label,
      kind: sec.kind,
      elevationFromM: sec.elevationFromM,
      elevationToM: sec.elevationToM,
      legSpec: sec.legSpec,
      boltSpec: sec.boltSpec,
      guyLayerIds: [...sec.guyLayerIds],
      guyElevationsM: [...sec.guyElevationsM],
      hasPlatform: sec.hasPlatform,
      hasLightningRod: sec.hasLightningRod,
      status: sec.status,
      checklist: { ...sec.checklist },
      installedDate: sec.installedDate,
      verifiedDate: sec.verifiedDate,
      verticalityMm: sec.verticalityMm,
      notes: '',
    })),
    guyLayers: vm.guyLayers.map((layer) => ({
      id: layer.id,
      layerNo: layer.layerNo,
      elevationM: layer.elevationM,
      sectionId: layer.sectionId,
      anchorRingType: layer.anchorRingType,
      anchorRingLabel: layer.anchorRingLabel,
      anchorRadiusM: layer.anchorRadiusM,
      anchorIds: { ...layer.anchorIds },
      cableSpec: layer.cableSpec,
      status: layer.status,
      sectors: {
        I: {
          pulled: layer.sectors.I.pulled,
          terminated: layer.sectors.I.terminated,
          tensioned: layer.sectors.I.tensioned,
        },
        II: {
          pulled: layer.sectors.II.pulled,
          terminated: layer.sectors.II.terminated,
          tensioned: layer.sectors.II.tensioned,
        },
        III: {
          pulled: layer.sectors.III.pulled,
          terminated: layer.sectors.III.terminated,
          tensioned: layer.sectors.III.tensioned,
        },
      },
      installedDate: layer.installedDate,
      verifiedDate: layer.verifiedDate,
      notes: '',
    })),
  };
}

/**
 * Projects a single daily log entry into a sanitized client-safe update record,
 * keeping worker headcount, lead engineer, safety entries, equipment, and delays
 * while stripping individual worker names, hours, payroll rates, and internal notes.
 */
function projectClientDailyHighlight(
  log: DailyActivityLogEntry,
  fallbackEngineer: string
): ClientDailyHighlightDto {
  const equipment =
    log.equipmentItems && log.equipmentItems.length > 0
      ? log.equipmentItems
          .filter((eq) => Boolean(eq.name?.trim()))
          .map((eq) => ({
            id: eq.id,
            name: eq.name.trim(),
            qty: Number.isFinite(eq.qty) ? Math.max(0, eq.qty) : 1,
            status: eq.status?.trim() || 'Operational',
          }))
      : log.equipmentOnSite?.trim()
        ? [
            {
              id: 'legacy-equip',
              name: log.equipmentOnSite.trim(),
              qty: 1,
              status: 'Operational',
            },
          ]
        : [];

  const isEmptyDelayText = (text: string | undefined) => {
    const t = (text ?? '').trim().toLowerCase();
    return !t || t === 'none' || t === 'none.' || t === 'n/a' || t === 'nil' || t === '-';
  };

  const delays =
    log.delayItems && log.delayItems.length > 0
      ? log.delayItems
          .filter((d) => !isEmptyDelayText(d.description))
          .map((d) => ({
            id: d.id,
            description: d.description.trim(),
            impact: d.impact?.trim() || '',
          }))
      : !isEmptyDelayText(log.issuesOrDelays)
        ? [
            {
              id: 'legacy-delay',
              description: log.issuesOrDelays.trim(),
              impact: '',
            },
          ]
        : [];

  const safetyLogs = (log.safetyLogs ?? [])
    .filter(
      (s) =>
        Boolean(s.timeOrActivity?.trim()) ||
        Boolean(s.hazardOrFinding?.trim()) ||
        Boolean(s.actionTaken?.trim())
    )
    .map((s) => ({
      id: s.id,
      timeOrActivity: s.timeOrActivity?.trim() || '',
      hazardOrFinding: s.hazardOrFinding?.trim() || '',
      actionTaken: s.actionTaken?.trim() || '',
      status: s.status?.trim() || 'Compliant',
    }));

  const resolvedWorkers =
    Number.isFinite(log.totalWorkers) && log.totalWorkers > 0
      ? log.totalWorkers
      : (log.workers ?? []).reduce((sum, w) => sum + Math.max(0, w.count || 0), 0);

  return {
    id: log.id,
    date: log.date,
    dayNumber: log.dayNumber,
    weather: log.weather,
    ...(log.weatherNotes?.trim() ? { weatherNotes: log.weatherNotes.trim() } : {}),
    preparedBy: log.preparedBy?.trim() || fallbackEngineer,
    totalWorkers: resolvedWorkers,
    foundationsWorked: [...(log.foundationsWorked ?? [])],
    activitiesSummary: log.activitiesSummary?.trim() || '',
    ...(log.safetyOfficer?.trim() ? { safetyOfficer: log.safetyOfficer.trim() } : {}),
    safetyLogs,
    equipment,
    delays,
    photos: (log.documentationItems ?? [])
      .filter((item) => Boolean(item.photoDataUrl))
      .map((item) => ({
        id: item.id,
        url: item.photoDataUrl!,
        description:
          item.description?.trim() || item.photoName || 'Site progress photo',
      })),
  };
}

/**
 * Produces a strictly sanitized, client-safe showcase payload.
 * Strips manpower, payroll, hauler rates/payouts, inventory, inspection remarks, and internal delays.
 */
export function buildClientShowcaseDto(
  record: SavedProjectRecord
): ClientProjectShowcaseDto {
  const { state } = record;
  const settings = resolveClientShowcaseSettings(record);
  const projectName = state.reportDetails?.projectName?.trim() || state.projectName;
  const location = state.reportDetails?.projectLocation?.trim() || state.location;
  const contractor = state.reportDetails?.contractor?.trim() || state.contractor;
  const clientName = state.reportDetails?.clientName?.trim() || '';
  const referenceNo = state.reportDetails?.referenceNo?.trim() || '';

  const sortedLogs = [...(state.dailyLogs ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const fallbackEngineer =
    state.reportDetails?.preparedBy?.trim() || state.preparedBy?.trim() || '';

  const highlights: ClientDailyHighlightDto[] = settings.showPhotos
    ? sortedLogs
        .map((log) => projectClientDailyHighlight(log, fallbackEngineer))
        .filter(
          (h) =>
            h.photos.length > 0 ||
            h.activitiesSummary.length > 0 ||
            h.totalWorkers > 0 ||
            h.safetyLogs.length > 0 ||
            h.delays.length > 0
        )
    : [];

  return {
    id: record.id,
    slug: settings.slug || slugifyProjectSlug(projectName, record.id),
    featured: settings.featured,
    updatedAt: record.updatedAt,
    lastUpdated: state.lastUpdated,
    projectName,
    location,
    clientName,
    contractor,
    referenceNo,
    towerHeightM: state.towerHeightM,
    projectType: state.projectType ?? 'foundation',
    logos: state.reportDetails?.logos
      ? {
          ...(state.reportDetails.logos.left ? { left: { ...state.reportDetails.logos.left } } : {}),
          ...(state.reportDetails.logos.center
            ? { center: { ...state.reportDetails.logos.center } }
            : {}),
          ...(state.reportDetails.logos.right ? { right: { ...state.reportDetails.logos.right } } : {}),
        }
      : undefined,
    settings,
    foundations: state.foundations.map(sanitizeFoundationForClient),
    verticalMastSummary:
      settings.phaseMode === 'foundation'
        ? undefined
        : sanitizeVerticalMastForClient(state.verticalMast),
    highlights,
  };
}

export function deriveClientMetaFromState(
  id: string,
  state: MastProjectState,
  clientSettings?: ClientShowcaseSettings
) {
  const settings = resolveClientShowcaseSettings({ id, state, clientSettings });
  const name = state.reportDetails?.projectName?.trim() || state.projectName || 'Mast Project';
  const projectType = state.projectType ?? 'foundation';
  return { name, projectType, settings };
}
