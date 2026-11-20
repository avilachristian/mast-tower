import type {
  ClientDailyHighlightDto,
  ClientFoundationSummary,
  ClientProjectShowcaseDto,
  ClientShowcaseSettings,
  DailyActivityLogEntry,
  DailyLogActivityItem,
  DailyLogMaterialItem,
  FoundationRecord,
  FoundationResolvedDims,
  FoundationType,
  MastProjectState,
  ReportDetailsSpec,
  SavedProjectRecord,
  VerticalMastState,
} from './types';

export const CLIENT_SHOWCASE_DTO_VERSION = 2;

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
  showReports: true,
  show3DModel: true,
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
    showReports: raw?.showReports ?? true,
    show3DModel: raw?.show3DModel ?? true,
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
          ...(layer.sectors.I.tensionKn?.trim()
            ? { tensionKn: layer.sectors.I.tensionKn.trim() }
            : {}),
        },
        II: {
          pulled: layer.sectors.II.pulled,
          terminated: layer.sectors.II.terminated,
          tensioned: layer.sectors.II.tensioned,
          ...(layer.sectors.II.tensionKn?.trim()
            ? { tensionKn: layer.sectors.II.tensionKn.trim() }
            : {}),
        },
        III: {
          pulled: layer.sectors.III.pulled,
          terminated: layer.sectors.III.terminated,
          tensioned: layer.sectors.III.tensioned,
          ...(layer.sectors.III.tensionKn?.trim()
            ? { tensionKn: layer.sectors.III.tensionKn.trim() }
            : {}),
        },
      },
      installedDate: layer.installedDate,
      verifiedDate: layer.verifiedDate,
      notes: '',
    })),
  };
}

function sanitizeReportDetailsForClient(state: MastProjectState): ReportDetailsSpec {
  const rd = state.reportDetails;
  const logos = rd?.logos
    ? {
        ...(rd.logos.left ? { left: { ...rd.logos.left } } : {}),
        ...(rd.logos.center ? { center: { ...rd.logos.center } } : {}),
        ...(rd.logos.right ? { right: { ...rd.logos.right } } : {}),
      }
    : undefined;

  return {
    projectName: rd?.projectName?.trim() || state.projectName,
    projectLocation: rd?.projectLocation?.trim() || state.location,
    clientName: rd?.clientName?.trim() || '',
    contractor: rd?.contractor?.trim() || state.contractor,
    referenceNo: rd?.referenceNo?.trim() || '',
    ...(rd?.documentTitle?.trim() ? { documentTitle: rd.documentTitle.trim() } : {}),
    ...(rd?.revision?.trim() ? { revision: rd.revision.trim() } : {}),
    ...(rd?.reportDate?.trim() ? { reportDate: rd.reportDate.trim() } : {}),
    preparedBy: rd?.preparedBy?.trim() || state.preparedBy?.trim() || '',
    ...(rd?.preparedTitle?.trim() ? { preparedTitle: rd.preparedTitle.trim() } : {}),
    ...(rd?.preparedSignatureUrl?.trim()
      ? { preparedSignatureUrl: rd.preparedSignatureUrl.trim() }
      : {}),
    ...(rd?.checkedBy?.trim() ? { checkedBy: rd.checkedBy.trim() } : {}),
    ...(rd?.checkedTitle?.trim() ? { checkedTitle: rd.checkedTitle.trim() } : {}),
    ...(rd?.checkedSignatureUrl?.trim()
      ? { checkedSignatureUrl: rd.checkedSignatureUrl.trim() }
      : {}),
    ...(rd?.approvedBy?.trim() ? { approvedBy: rd.approvedBy.trim() } : {}),
    ...(rd?.approvedTitle?.trim() ? { approvedTitle: rd.approvedTitle.trim() } : {}),
    ...(rd?.approvedSignatureUrl?.trim()
      ? { approvedSignatureUrl: rd.approvedSignatureUrl.trim() }
      : {}),
    ...(rd?.safetyOfficerBy !== undefined
      ? { safetyOfficerBy: rd.safetyOfficerBy.trim() }
      : {}),
    ...(rd?.safetyOfficerSignatureUrl?.trim()
      ? { safetyOfficerSignatureUrl: rd.safetyOfficerSignatureUrl.trim() }
      : {}),
    ...(typeof rd?.logoHeightPx === 'number' && Number.isFinite(rd.logoHeightPx)
      ? { logoHeightPx: rd.logoHeightPx }
      : {}),
    ...(logos ? { logos } : {}),
    ...(rd?.notes?.trim() ? { notes: rd.notes.trim() } : {}),
  };
}

function projectClientDailyMaterials(
  log: DailyActivityLogEntry
): DailyLogMaterialItem[] {
  const computeRemaining = (onSite: number, delivered: number, used: number) =>
    Math.max(0, Number((onSite + delivered - used).toFixed(2)));

  if (log.materialsOnSite && log.materialsOnSite.length > 0) {
    return log.materialsOnSite
      .filter((m) => Boolean(m.name?.trim()))
      .map((m) => {
        const onSiteQty = Math.max(0, Number(m.onSiteQty) || 0);
        const deliveredQty = Math.max(0, Number(m.deliveredQty) || 0);
        const usedTodayQty = Math.max(0, Number(m.usedTodayQty) || 0);
        const remainingQty =
          m.remainingQty !== undefined
            ? Math.max(0, Number(m.remainingQty) || 0)
            : computeRemaining(onSiteQty, deliveredQty, usedTodayQty);
        return {
          id: m.id,
          name: m.name.trim(),
          unit: m.unit?.trim() || 'pcs',
          onSiteQty,
          deliveredQty,
          usedTodayQty,
          remainingQty,
          ...(m.remarks?.trim() ? { remarks: m.remarks.trim() } : {}),
        };
      });
  }

  const legacy: DailyLogMaterialItem[] = [];
  if ((log.cementUsedBags ?? 0) > 0) {
    legacy.push({
      id: 'legacy-cement',
      name: 'Cement',
      unit: 'bags',
      onSiteQty: 0,
      deliveredQty: 0,
      usedTodayQty: log.cementUsedBags,
      remainingQty: 0,
      remarks: 'Used today',
    });
  }
  if ((log.sandUsedBags ?? 0) > 0) {
    legacy.push({
      id: 'legacy-sand',
      name: 'Sand',
      unit: 'sacks',
      onSiteQty: 0,
      deliveredQty: 0,
      usedTodayQty: log.sandUsedBags,
      remainingQty: 0,
      remarks: 'Used today',
    });
  }
  if ((log.gravelUsedBags ?? 0) > 0) {
    legacy.push({
      id: 'legacy-gravel',
      name: 'Gravel',
      unit: 'sacks',
      onSiteQty: 0,
      deliveredQty: 0,
      usedTodayQty: log.gravelUsedBags,
      remainingQty: 0,
      remarks: 'Used today',
    });
  }
  return legacy;
}

/**
 * Projects a single daily log entry into a sanitized client-safe update record,
 * keeping worker role headcounts, lead engineer, activities, materials, safety entries, equipment, and delays
 * while stripping individual worker names, hours, payroll rates, visitors, and internal notes.
 */
function projectClientDailyHighlight(
  log: DailyActivityLogEntry,
  fallbackEngineer: string,
  includePhotos: boolean
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

  const workers = (log.workers ?? [])
    .filter(
      (w) => Boolean(w.role?.trim()) && (Number.isFinite(w.count) ? w.count : 0) > 0
    )
    .map((w) => ({
      role: w.role,
      count: Math.max(0, Number(w.count) || 0),
    }));

  const activities: DailyLogActivityItem[] = (log.activities ?? [])
    .filter((a) => Boolean(a.description?.trim()))
    .map((a) => ({
      id: a.id,
      foundationId: a.foundationId?.trim() || '',
      description: a.description.trim(),
      status: a.status,
      ...(a.remarks?.trim() ? { remarks: a.remarks.trim() } : {}),
    }));

  const materials = projectClientDailyMaterials(log);

  const resolvedWorkers =
    Number.isFinite(log.totalWorkers) && log.totalWorkers > 0
      ? log.totalWorkers
      : workers.reduce((sum, w) => sum + w.count, 0);

  return {
    id: log.id,
    date: log.date,
    dayNumber: log.dayNumber,
    weather: log.weather,
    ...(log.weatherNotes?.trim() ? { weatherNotes: log.weatherNotes.trim() } : {}),
    preparedBy: log.preparedBy?.trim() || fallbackEngineer,
    totalWorkers: resolvedWorkers,
    ...(workers.length > 0 ? { workers } : {}),
    foundationsWorked: [...(log.foundationsWorked ?? [])],
    activitiesSummary: log.activitiesSummary?.trim() || '',
    ...(activities.length > 0 ? { activities } : {}),
    ...(materials.length > 0 ? { materials } : {}),
    ...(log.safetyOfficer?.trim() ? { safetyOfficer: log.safetyOfficer.trim() } : {}),
    safetyLogs,
    equipment,
    delays,
    photos: includePhotos
      ? (log.documentationItems ?? [])
          .filter((item) => Boolean(item.photoDataUrl))
          .map((item) => ({
            id: item.id,
            url: item.photoDataUrl!,
            description:
              item.description?.trim() || item.photoName || 'Site progress photo',
          }))
      : [],
  };
}

/**
 * Produces a strictly sanitized, client-safe showcase payload.
 * Strips manpower names/payroll, hauler rates/payouts, inventory, inspection remarks, visitors, and internal delays.
 */
export function buildClientShowcaseDto(
  record: SavedProjectRecord
): ClientProjectShowcaseDto {
  const { state } = record;
  const settings = resolveClientShowcaseSettings(record);
  const reportDetails = sanitizeReportDetailsForClient(state);
  const projectName = reportDetails.projectName || state.projectName;
  const location = reportDetails.projectLocation || state.location;
  const contractor = reportDetails.contractor || state.contractor;
  const clientName = reportDetails.clientName || '';
  const referenceNo = reportDetails.referenceNo || '';

  const sortedLogs = [...(state.dailyLogs ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const fallbackEngineer =
    reportDetails.preparedBy?.trim() || state.preparedBy?.trim() || '';

  const highlights: ClientDailyHighlightDto[] =
    settings.showPhotos || settings.showReports
      ? sortedLogs
          .map((log) =>
            projectClientDailyHighlight(
              log,
              fallbackEngineer,
              settings.showPhotos
            )
          )
          .filter(
            (h) =>
              h.photos.length > 0 ||
              h.activitiesSummary.length > 0 ||
              (h.activities?.length ?? 0) > 0 ||
              (h.materials?.length ?? 0) > 0 ||
              h.totalWorkers > 0 ||
              h.safetyLogs.length > 0 ||
              h.delays.length > 0
          )
      : [];

  return {
    id: record.id,
    dtoVersion: CLIENT_SHOWCASE_DTO_VERSION,
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
    ...(reportDetails.logos ? { logos: reportDetails.logos } : {}),
    reportDetails,
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
