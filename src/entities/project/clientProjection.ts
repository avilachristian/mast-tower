import type {
  ClientDailyHighlightDto,
  ClientFoundationSummary,
  ClientProjectShowcaseDto,
  ClientShowcaseSettings,
  FoundationRecord,
  MastProjectState,
  SavedProjectRecord,
  VerticalMastState,
} from './types';

export const DEFAULT_CLIENT_SHOWCASE_SETTINGS: ClientShowcaseSettings = {
  enabled: false,
  featured: false,
  phaseMode: 'both',
  showSchedule: true,
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
    showSchedule: raw?.showSchedule ?? true,
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

  const highlights: ClientDailyHighlightDto[] = settings.showPhotos
    ? sortedLogs
        .map((log) => ({
          id: log.id,
          date: log.date,
          dayNumber: log.dayNumber,
          weather: log.weather,
          activitiesSummary: log.activitiesSummary?.trim() || '',
          photos: (log.documentationItems ?? [])
            .filter((item) => Boolean(item.photoDataUrl))
            .map((item) => ({
              id: item.id,
              url: item.photoDataUrl!,
              description:
                item.description?.trim() || item.photoName || 'Site progress photo',
            })),
        }))
        .filter((h) => h.photos.length > 0 || h.activitiesSummary.length > 0)
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
    schedule: settings.showSchedule
      ? (state.schedule ?? []).map((item) => ({ ...item }))
      : [],
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
