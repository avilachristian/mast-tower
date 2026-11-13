import type { FoundationActivityInspectionRow } from './calculations';
import type {
  AnchorGuyNodeState,
  AnchorGuyStage,
  FoundationStatus,
  GuyLayerRecord,
  GuyLayerStatus,
  MastProjectState,
  SectorId,
  TowerSectionRecord,
  TowerSectionStatus,
  VerticalMastState,
} from './types';
import {
  ANCHOR_GUY_STAGE_META,
  GUY_LAYER_STATUS_META,
  SIMPLIFIED_TOWER_SECTION_STATUSES,
  TOWER_SECTION_STATUS_META,
  VERTICAL_MAST_DESIGN_SPECS,
  createInitialVerticalMastState,
  getSectionGuyChecklistItems,
  getTowerSectionChecklistSteps,
  getVerticalMastInspectionChecklistItems,
  normalizeVerticalMastState,
} from './verticalMastBaseline';

export function resolveVerticalMastState(state: MastProjectState): VerticalMastState {
  return state.verticalMast
    ? normalizeVerticalMastState(state.verticalMast)
    : createInitialVerticalMastState();
}

export interface VerticalMastMetrics {
  overallProgressPct: number;
  totalSections: number;
  erectedSections: number; // bolted_torqued or plumbed_verified
  verifiedSections: number; // plumbed_verified
  erectedHeightM: number;
  verifiedHeightM: number;
  totalHeightM: number;
  totalGuyLayers: number;
  tensionedGuyLayers: number;
  anchoredOrBeyondGuyLayers: number;
  totalStrands: number;
  pulledStrands: number;
  terminatedStrands: number;
  tensionedStrands: number;
  totalManDays: number;
  totalManHours: number;
}

export interface VerticalMastStageCountRow<TStatus extends string> {
  status: TStatus;
  label: string;
  color: string;
  count: number;
  pct: number;
  ids: string[];
}

export interface AnchorRingGuySummary {
  ringKey: 'C1' | 'B1' | 'A1' | 'B2';
  ringLabel: string;
  radiusM: number;
  layerIds: string[];
  elevationsLabel: string;
  totalStrands: number;
  tensionedStrands: number;
  avgProgressPct: number;
}

export function computeVerticalMastMetrics(
  state: MastProjectState
): VerticalMastMetrics {
  const vm = resolveVerticalMastState(state);
  const sectionSum = vm.sections.reduce(
    (sum, s) => sum + TOWER_SECTION_STATUS_META[s.status].pct,
    0
  );
  const guySum = vm.guyLayers.reduce((sum, g) => {
    const sectorScores = [g.sectors.I, g.sectors.II, g.sectors.III].map((sec) =>
      sec.tensioned ? 100 : sec.terminated ? 70 : sec.pulled ? 35 : 0
    );
    const avg = (sectorScores[0] + sectorScores[1] + sectorScores[2]) / 3;
    return sum + avg;
  }, 0);

  const sectionAvg = vm.sections.length > 0 ? sectionSum / vm.sections.length : 0;
  const guyAvg = vm.guyLayers.length > 0 ? guySum / vm.guyLayers.length : 0;
  const overallProgressPct = Math.round(sectionAvg * 0.6 + guyAvg * 0.4);

  const erectedSections = vm.sections.filter(
    (s) => s.status === 'bolted_torqued' || s.status === 'plumbed_verified'
  ).length;
  const verifiedSections = vm.sections.filter(
    (s) => s.status === 'plumbed_verified'
  ).length;

  const tensionedGuyLayers = vm.guyLayers.filter(
    (g) => g.status === 'tensioned_verified'
  ).length;
  const anchoredOrBeyondGuyLayers = vm.guyLayers.filter(
    (g) => g.status === 'anchored' || g.status === 'tensioned_verified'
  ).length;

  let pulledStrands = 0;
  let terminatedStrands = 0;
  let tensionedStrands = 0;
  for (const g of vm.guyLayers) {
    for (const secKey of ['I', 'II', 'III'] as const) {
      const sec = g.sectors[secKey];
      if (sec.pulled || sec.terminated || sec.tensioned) pulledStrands += 1;
      if (sec.terminated || sec.tensioned) terminatedStrands += 1;
      if (sec.tensioned) tensionedStrands += 1;
    }
  }

  const totalManDays = state.dailyLogs.reduce((s, d) => s + d.totalWorkers, 0);
  const totalManHours = state.dailyLogs.reduce((s, d) => s + d.totalManHours, 0);

  return {
    overallProgressPct,
    totalSections: vm.sections.length,
    erectedSections,
    verifiedSections,
    erectedHeightM: erectedSections * VERTICAL_MAST_DESIGN_SPECS.sectionLengthM,
    verifiedHeightM: verifiedSections * VERTICAL_MAST_DESIGN_SPECS.sectionLengthM,
    totalHeightM: vm.sections.length * VERTICAL_MAST_DESIGN_SPECS.sectionLengthM,
    totalGuyLayers: vm.guyLayers.length,
    tensionedGuyLayers,
    anchoredOrBeyondGuyLayers,
    totalStrands: vm.guyLayers.length * 3,
    pulledStrands,
    terminatedStrands,
    tensionedStrands,
    totalManDays,
    totalManHours,
  };
}

export function buildVerticalMastOverviewData(state: MastProjectState): {
  vm: VerticalMastState;
  metrics: VerticalMastMetrics;
  sectionStageCounts: VerticalMastStageCountRow<TowerSectionStatus>[];
  guyStageCounts: VerticalMastStageCountRow<GuyLayerStatus>[];
  anchorRingSummaries: AnchorRingGuySummary[];
  /** Anchor statuses projected from guy layer readiness for 2D plan overlay. */
  projectedAnchorStatuses: Map<string, FoundationStatus>;
  /** Dedicated per-anchor guy cable count & stage for 2D Ground Anchor Plan guying legend. */
  anchorGuyStates: Record<string, AnchorGuyNodeState>;
} {
  const vm = resolveVerticalMastState(state);
  const metrics = computeVerticalMastMetrics(state);

  const sectionStageCounts = SIMPLIFIED_TOWER_SECTION_STATUSES.map((status) => {
    const matching = vm.sections.filter((s) => s.status === status);
    return {
      status,
      label: TOWER_SECTION_STATUS_META[status].label,
      color: TOWER_SECTION_STATUS_META[status].color,
      count: matching.length,
      pct: Math.round((matching.length / Math.max(1, vm.sections.length)) * 100),
      ids: matching.map((s) => s.id),
    };
  });

  const guyStageCounts = (Object.keys(GUY_LAYER_STATUS_META) as GuyLayerStatus[]).map(
    (status) => {
      const matching = vm.guyLayers.filter((g) => g.status === status);
      return {
        status,
        label: GUY_LAYER_STATUS_META[status].label,
        color: GUY_LAYER_STATUS_META[status].color,
        count: matching.length,
        pct: Math.round((matching.length / Math.max(1, vm.guyLayers.length)) * 100),
        ids: matching.map((g) => g.id),
      };
    }
  );

  const rings: {
    ringKey: 'C1' | 'B1' | 'A1' | 'B2';
    ringLabel: string;
    radiusM: number;
  }[] = [
    { ringKey: 'C1', ringLabel: 'Pull Anchor C1 (18m)', radiusM: 18 },
    { ringKey: 'B1', ringLabel: 'Pull Anchor B1 (36m)', radiusM: 36 },
    { ringKey: 'A1', ringLabel: 'Pull Anchor A1 (54m)', radiusM: 54 },
    { ringKey: 'B2', ringLabel: 'Pull Anchor B2 (72m)', radiusM: 72 },
  ];

  const projectedAnchorStatuses = new Map<string, FoundationStatus>();
  const anchorGuyStates: Record<string, AnchorGuyNodeState> = {};

  // PF-0 reflects base tower & overall erected sections
  const s01 = vm.sections[0];
  const totalErectedSections = vm.sections.filter(
    (s) => s.status === 'bolted_torqued' || s.status === 'plumbed_verified'
  ).length;
  if (s01) {
    projectedAnchorStatuses.set(
      'PF-0',
      s01.status === 'plumbed_verified'
        ? 'completed'
        : s01.status === 'bolted_torqued'
          ? 'concreted'
          : s01.status === 'hoisted'
            ? 'rebar_and_anchor'
            : s01.status === 'pre_assembled'
              ? 'lean_concrete'
              : 'not_started'
    );
    const baseStage: AnchorGuyStage =
      s01.status === 'plumbed_verified' ? 'all_tensioned' : 'pending';
    anchorGuyStates['PF-0'] = {
      stage: baseStage,
      pulledCount: s01.status !== 'not_started' ? 1 : 0,
      anchoredCount: totalErectedSections,
      tensionedCount: metrics.verifiedSections,
      totalGuys: vm.sections.length,
      summaryLabel: `${totalErectedSections}/${vm.sections.length} Sec Erected`,
    };
  }

  const anchorRingSummaries: AnchorRingGuySummary[] = rings.map((r) => {
    const layers = vm.guyLayers.filter((g) => g.anchorRadiusM === r.radiusM);
    const totalStrands = layers.length * 3;
    let tensionedStrands = 0;
    let sumPct = 0;
    for (const g of layers) {
      sumPct += GUY_LAYER_STATUS_META[g.status].pct;
      for (const secKey of ['I', 'II', 'III'] as const) {
        if (g.sectors[secKey].tensioned) tensionedStrands += 1;
      }
    }

    for (const secKey of ['I', 'II', 'III'] as Exclude<SectorId, 'CENTER'>[]) {
      const fid = `${secKey}-${r.ringKey}`;
      const pulledCount = layers.filter(
        (g) =>
          g.sectors[secKey].pulled ||
          g.sectors[secKey].terminated ||
          g.sectors[secKey].tensioned
      ).length;
      const anchoredCount = layers.filter(
        (g) => g.sectors[secKey].terminated || g.sectors[secKey].tensioned
      ).length;
      const tensionedCount = layers.filter((g) => g.sectors[secKey].tensioned).length;
      const totalGuys = layers.length;

      const stage: AnchorGuyStage =
        totalGuys > 0 && tensionedCount >= totalGuys
          ? 'all_tensioned'
          : anchoredCount >= 4
            ? 'guy_4'
            : anchoredCount === 3
              ? 'guy_3'
              : anchoredCount === 2
                ? 'guy_2'
                : anchoredCount === 1
                  ? 'guy_1'
                  : pulledCount > 0
                    ? 'pulled'
                    : 'pending';

      anchorGuyStates[fid] = {
        stage,
        pulledCount,
        anchoredCount,
        tensionedCount,
        totalGuys,
        summaryLabel:
          tensionedCount > 0 && tensionedCount < anchoredCount
            ? `${anchoredCount}/${totalGuys} Anchored (${tensionedCount} Tensioned)`
            : `${anchoredCount}/${totalGuys} Guys · ${ANCHOR_GUY_STAGE_META[stage].shortLabel}`,
      };

      const allTensioned =
        layers.length > 0 && layers.every((g) => g.sectors[secKey].tensioned);
      const anyTerminated = layers.some((g) => g.sectors[secKey].terminated);
      const anyPulled = layers.some((g) => g.sectors[secKey].pulled);
      projectedAnchorStatuses.set(
        fid,
        allTensioned
          ? 'completed'
          : anyTerminated
            ? 'rebar_and_anchor'
            : anyPulled
              ? 'lean_concrete'
              : 'not_started'
      );
    }

    return {
      ringKey: r.ringKey,
      ringLabel: r.ringLabel,
      radiusM: r.radiusM,
      layerIds: layers.map((l) => l.id),
      elevationsLabel: layers.map((l) => `${l.elevationM}m`).join(', '),
      totalStrands,
      tensionedStrands,
      avgProgressPct: layers.length > 0 ? Math.round(sumPct / layers.length) : 0,
    };
  });

  return {
    vm,
    metrics,
    sectionStageCounts,
    guyStageCounts,
    anchorRingSummaries,
    projectedAnchorStatuses,
    anchorGuyStates,
  };
}

export function buildVerticalMastInspectionRows(
  targetKind: 'section' | 'guy_layer',
  section?: TowerSectionRecord,
  guyLayer?: GuyLayerRecord
): FoundationActivityInspectionRow[] {
  const holder = targetKind === 'section' ? section : guyLayer;
  const removed = new Set(holder?.removedInspectionKeys ?? []);
  const builtIn = getVerticalMastInspectionChecklistItems(
    targetKind,
    section,
    guyLayer
  )
    .filter((i) => !removed.has(i.key))
    .map((i) => ({ ...i, isCustom: false }));
  const custom = (holder?.customInspectionItems ?? []).map((i) => ({
    key: i.key,
    description: i.description,
    planMeasurement: i.planMeasurement,
    isCustom: true,
  }));

  return [...builtIn, ...custom].map((item) => {
    const entry = holder?.inspectionChecklist?.[item.key];
    return {
      key: item.key,
      description: entry?.description ?? item.description,
      planMeasurement: entry?.planMeasurement ?? item.planMeasurement,
      actualMeasurement: entry?.actualMeasurement ?? '',
      status: entry?.status ?? 'Pending',
      remarks: entry?.remarks ?? '',
      photoDataUrl: entry?.photoDataUrl,
      photoName: entry?.photoName,
      isCustom: item.isCustom,
    };
  });
}

export function buildSectionActivityReportData(
  section: TowerSectionRecord,
  attachedGuyLayer?: GuyLayerRecord
) {
  const legTasks = getTowerSectionChecklistSteps(section).map((step) => ({
    key: step.key as string,
    description: step.label,
    done: Boolean(section.checklist[step.key]),
    statusLabel: section.checklist[step.key] ? 'Installed' : 'Pending',
  }));

  const guyTasks = getSectionGuyChecklistItems(attachedGuyLayer).map((item) => {
    if (item.sectorKey && attachedGuyLayer) {
      const sec = attachedGuyLayer.sectors[item.sectorKey];
      const installed = Boolean(sec.terminated || sec.tensioned);
      return {
        key: item.key,
        description: item.label,
        done: installed,
        statusLabel: sec.tensioned
          ? 'Tensioned'
          : installed
            ? 'Installed'
            : 'Pending',
      };
    }
    const allTensioned = attachedGuyLayer
      ? (['I', 'II', 'III'] as const).every(
          (k) => attachedGuyLayer.sectors[k].tensioned
        )
      : false;
    return {
      key: item.key,
      description: item.label,
      done: allTensioned,
      statusLabel: allTensioned ? 'Tensioned' : 'Pending',
    };
  });

  const tasks = [...legTasks, ...guyTasks];

  return {
    section,
    attachedGuyLayer,
    title: `${section.id} — ${section.label} (${section.elevationFromM.toFixed(1)}–${section.elevationToM.toFixed(1)} m)`,
    tasks,
    inspections: buildVerticalMastInspectionRows('section', section, undefined),
  };
}

