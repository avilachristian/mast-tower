import {
  BAGS_PER_CUBIC_METER,
  DEFAULT_KG_PER_BAG,
  PROJECT_MATERIAL_TARGETS,
  STATUS_META,
  formatConcreteCuM,
  formatDimensionM,
  getFoundationChecklistSteps,
  getFoundationInspectionChecklistItems,
  resolveFoundationSpec,
} from './mast2Baseline';
import type {
  DailyActivityLogEntry,
  DailyLogActivityItem,
  DailyLogDelayItem,
  DailyLogEquipmentItem,
  DailyLogMaterialItem,
  DailyLogSafetyItem,
  DailyLogVisitorItem,
  FoundationCustomSpecs,
  FoundationInspectionItemKey,
  FoundationInspectionStatus,
  FoundationRecord,
  FoundationStageChecklist,
  FoundationStatus,
  FoundationType,
  HaulingLogEntry,
  MastProjectState,
  ProjectType,
  SectorId,
} from './types';

export interface ProjectSummaryMetrics {
  completedCount: number;
  pouredOrBeyondCount: number;
  totalFoundations: number;
  overallProgressPct: number;
  pouredConcreteCuM: number;
  totalConcreteCuM: number;
  cementHauledBags: number;
  cementHauledKg: number;
  cementConsumedBags: number;
  cementOnSiteBags: number;
  sandHauledBags: number;
  sandHauledCuM: number;
  sandHauledKg: number;
  sandConsumedBags: number;
  sandOnSiteBags: number;
  gravelHauledBags: number;
  gravelHauledCuM: number;
  gravelHauledKg: number;
  gravelConsumedBags: number;
  gravelOnSiteBags: number;
  totalHorseTrips: number;
  totalHauledKg: number;
  totalManDays: number;
  totalManHours: number;
  peakWorkersLogged: number;
}

import { formatDateWithWeekday } from '@/shared/lib/dateUtils';
export { formatDateWithWeekday, getWeekdayName } from '@/shared/lib/dateUtils';

export function bagsToCuM(bags: number): number {
  return bags / BAGS_PER_CUBIC_METER;
}

export function cuMToBags(cuM: number): number {
  return Math.ceil(cuM * BAGS_PER_CUBIC_METER);
}

/** Converts hauled weight in kilograms to standard 40kg bags. */
export function kgToBags(kg: number, kgPerBag = DEFAULT_KG_PER_BAG): number {
  return kgPerBag > 0 ? Number((kg / kgPerBag).toFixed(2)) : 0;
}

export function isPouredStatus(status: FoundationRecord['status']): boolean {
  return status === 'concreted' || status === 'curing' || status === 'completed';
}

export function computeHaulingTotals(logs: HaulingLogEntry[]) {
  let cementBags = 0;
  let cementKg = 0;
  let sandBags = 0;
  let sandKg = 0;
  let gravelBags = 0;
  let gravelKg = 0;
  let totalTrips = 0;
  let totalKg = 0;

  for (const log of logs) {
    totalTrips += log.tripsCount;
    totalKg += log.totalKg;
    if (log.material === 'cement') {
      cementBags += log.quantity;
      cementKg += log.totalKg;
    } else if (log.material === 'sand') {
      sandBags += log.quantity;
      sandKg += log.totalKg;
    } else if (log.material === 'gravel') {
      gravelBags += log.quantity;
      gravelKg += log.totalKg;
    }
  }

  return {
    cementBags,
    cementKg,
    sandBags,
    sandKg,
    sandCuM: bagsToCuM(sandBags),
    gravelBags,
    gravelKg,
    gravelCuM: bagsToCuM(gravelBags),
    totalTrips,
    totalKg,
  };
}

export function computeProjectMetrics(state: MastProjectState): ProjectSummaryMetrics {
  const totalFoundations = state.foundations.length;
  let completedCount = 0;
  let pouredOrBeyondCount = 0;
  let pctSum = 0;
  let pouredConcreteCuM = 0;
  let totalConcreteCuM = 0;
  let cementConsumedBags = 0;
  let sandConsumedBags = 0;
  let gravelConsumedBags = 0;

  for (const f of state.foundations) {
    const spec = resolveFoundationSpec(f.type, f.customSpecs);
    const foundationTotalCuM = spec.totalConcreteCuM;
    totalConcreteCuM += foundationTotalCuM;
    pctSum += STATUS_META[f.status].pct;

    if (f.status === 'completed') completedCount += 1;
    if (isPouredStatus(f.status)) {
      pouredOrBeyondCount += 1;
      pouredConcreteCuM += foundationTotalCuM;
    }

    cementConsumedBags += f.actualCementBagsUsed;
    sandConsumedBags += f.actualSandBagsUsed;
    gravelConsumedBags += f.actualGravelBagsUsed;
  }

  const hauling = computeHaulingTotals(state.haulingLogs);

  let totalManDays = 0;
  let totalManHours = 0;
  let peakWorkersLogged = 0;
  for (const dl of state.dailyLogs) {
    totalManDays += dl.totalWorkers;
    totalManHours += dl.totalManHours;
    if (dl.totalWorkers > peakWorkersLogged) peakWorkersLogged = dl.totalWorkers;
  }

  return {
    completedCount,
    pouredOrBeyondCount,
    totalFoundations,
    overallProgressPct: totalFoundations > 0 ? Math.round(pctSum / totalFoundations) : 0,
    pouredConcreteCuM: Number(pouredConcreteCuM.toFixed(2)),
    totalConcreteCuM: Number(totalConcreteCuM.toFixed(2)),
    cementHauledBags: hauling.cementBags,
    cementHauledKg: hauling.cementKg,
    cementConsumedBags,
    cementOnSiteBags: hauling.cementBags - cementConsumedBags,
    sandHauledBags: hauling.sandBags,
    sandHauledCuM: Number(hauling.sandCuM.toFixed(2)),
    sandHauledKg: hauling.sandKg,
    sandConsumedBags,
    sandOnSiteBags: hauling.sandBags - sandConsumedBags,
    gravelHauledBags: hauling.gravelBags,
    gravelHauledCuM: Number(hauling.gravelCuM.toFixed(2)),
    gravelHauledKg: hauling.gravelKg,
    gravelConsumedBags,
    gravelOnSiteBags: hauling.gravelBags - gravelConsumedBags,
    totalHorseTrips: hauling.totalTrips,
    totalHauledKg: hauling.totalKg,
    totalManDays,
    totalManHours,
    peakWorkersLogged,
  };
}

export function checkFoundationMaterialReadiness(
  foundation: FoundationRecord,
  metrics: ProjectSummaryMetrics
): { ready: boolean; missing: string[] } {
  const spec = resolveFoundationSpec(foundation.type, foundation.customSpecs);
  const missing: string[] = [];
  if (metrics.cementOnSiteBags < spec.cementBags) {
    missing.push(`${spec.cementBags - Math.max(0, metrics.cementOnSiteBags)} bags cement`);
  }
  if (metrics.sandOnSiteBags < spec.sandBags) {
    missing.push(`${spec.sandBags - Math.max(0, metrics.sandOnSiteBags)} bags sand`);
  }
  if (metrics.gravelOnSiteBags < spec.gravelBags) {
    missing.push(`${spec.gravelBags - Math.max(0, metrics.gravelOnSiteBags)} bags gravel`);
  }
  return { ready: missing.length === 0, missing };
}

export interface OverallStageCountRow {
  status: FoundationStatus;
  label: string;
  shortLabel: string;
  color: string;
  pct: number;
  count: number;
  foundationIds: string[];
}

export interface OverallSectorSummaryRow {
  sector: SectorId;
  label: string;
  foundationCount: number;
  completedCount: number;
  pouredCount: number;
  avgProgressPct: number;
}

export interface OverallFoundationStatusRow {
  id: string;
  type: FoundationType;
  name: string;
  typeLabel: string;
  sector: SectorId;
  sectorLabel: string;
  radiusM: number;
  sizeLabel: string;
  totalVolumeCuM: number;
  status: FoundationStatus;
  statusLabel: string;
  statusShortLabel: string;
  statusColor: string;
  progressPct: number;
  completedSteps: number;
  totalSteps: number;
  pourDate?: string;
  completedDate?: string;
  notes: string;
}

export interface OverallProjectStatusReportData {
  metrics: ProjectSummaryMetrics;
  stageCounts: OverallStageCountRow[];
  sectorSummaries: OverallSectorSummaryRow[];
  foundationRows: OverallFoundationStatusRow[];
}

const ORDERED_STATUSES: FoundationStatus[] = [
  'completed',
  'curing',
  'concreted',
  'formwork',
  'rebar_and_anchor',
  'lean_concrete',
  'excavation_inspected',
  'excavated',
  'not_started',
];

const SECTOR_DISPLAY: { sector: SectorId; label: string }[] = [
  { sector: 'CENTER', label: 'Center (PF-0)' },
  { sector: 'I', label: 'Sector I (30°)' },
  { sector: 'II', label: 'Sector II (150°)' },
  { sector: 'III', label: 'Sector III (270°)' },
];

/** Builds overall project status, stage distribution, sector rollups, and per-foundation rows. */
export function buildOverallProjectStatusReportData(
  project: MastProjectState
): OverallProjectStatusReportData {
  const metrics = computeProjectMetrics(project);

  const stageCounts: OverallStageCountRow[] = ORDERED_STATUSES.map((status) => {
    const meta = STATUS_META[status];
    const matching = project.foundations.filter((f) => f.status === status);
    return {
      status,
      label: meta.label,
      shortLabel: meta.shortLabel,
      color: meta.color,
      pct: meta.pct,
      count: matching.length,
      foundationIds: matching.map((f) => f.id),
    };
  });

  const sectorSummaries: OverallSectorSummaryRow[] = SECTOR_DISPLAY.map(({ sector, label }) => {
    const items = project.foundations.filter((f) => f.sector === sector);
    const completedCount = items.filter((f) => f.status === 'completed').length;
    const pouredCount = items.filter((f) => isPouredStatus(f.status)).length;
    const avgProgressPct =
      items.length > 0
        ? Math.round(
            items.reduce((sum, f) => sum + STATUS_META[f.status].pct, 0) / items.length
          )
        : 0;
    return {
      sector,
      label,
      foundationCount: items.length,
      completedCount,
      pouredCount,
      avgProgressPct,
    };
  });

  const foundationRows: OverallFoundationStatusRow[] = project.foundations.map((f) => {
    const spec = resolveFoundationSpec(f.type, f.customSpecs);
    const meta = STATUS_META[f.status];
    const steps = getFoundationChecklistSteps(f.type);
    const completedSteps = steps.filter((s) => Boolean(f.checklist[s.key])).length;
    const defaults = getDefaultFoundationSpecFields(f.type, f.customSpecs);
    const sizeLabel = f.customSpecs?.size?.trim() || defaults.size;
    return {
      id: f.id,
      type: f.type,
      name: f.name,
      typeLabel: spec.label,
      sector: f.sector,
      sectorLabel: f.sector === 'CENTER' ? 'Center (0m)' : `Sector ${f.sector} (${f.radiusM}m)`,
      radiusM: f.radiusM,
      sizeLabel,
      totalVolumeCuM: spec.totalConcreteCuM,
      status: f.status,
      statusLabel: meta.label,
      statusShortLabel: meta.shortLabel,
      statusColor: meta.color,
      progressPct: meta.pct,
      completedSteps,
      totalSteps: steps.length,
      pourDate: f.pourDate,
      completedDate: f.completedDate,
      notes: f.notes,
    };
  });

  return {
    metrics,
    stageCounts,
    sectorSummaries,
    foundationRows,
  };
}

export type FoundationActivityMaterialKey =
  | 'cement'
  | 'sand'
  | 'gravel'
  | 'main_rebar'
  | 'chair_bar'
  | 'phenolic';

export interface FoundationActivityMaterialRow {
  key: FoundationActivityMaterialKey;
  description: string;
  unit: 'bags' | 'pcs';
  required: number;
  onSite: number;
  needed: number;
  remarks: string;
  siteAvailableHint?: number;
}

export interface FoundationActivityTaskRow {
  key: keyof FoundationStageChecklist;
  description: string;
  done: boolean;
  statusLabel: string;
}

export interface FoundationActivityMaterialOverride {
  onSite?: number;
  remarks?: string;
}

export interface FoundationActivityInspectionRow {
  key: FoundationInspectionItemKey;
  description: string;
  planMeasurement: string;
  actualMeasurement: string;
  status: FoundationInspectionStatus;
  remarks: string;
  photoDataUrl?: string;
  photoName?: string;
  isCustom?: boolean;
}

export interface FoundationSpecDetails {
  size: string;
  foundationVolume: string;
  leanConcreteVolume: string;
  excavationDepth: string;
  cover: string;
  mainRebar: string;
  chairBar: string;
  towerAccessoriesLabel: string;
  towerAccessories: string;
}

export interface FoundationActivityReportData {
  foundationId: string;
  foundationTitle: string;
  sizeLabel: string;
  volumeLabel: string;
  specDetails: FoundationSpecDetails;
  rebarDetails: string[];
  tasks: FoundationActivityTaskRow[];
  inspections: FoundationActivityInspectionRow[];
  materials: FoundationActivityMaterialRow[];
}

/** Returns organized foundation specification fields derived from baseline or custom dimensions. */
export function getDefaultFoundationSpecFields(
  foundationType: FoundationType,
  customSpecs?: FoundationCustomSpecs
): FoundationSpecDetails {
  const spec = resolveFoundationSpec(foundationType, customSpecs);
  const totalDepthM = spec.totalExcavationDepthM;
  const totalDepthMm = Math.round(totalDepthM * 1000);
  const leanMm = Math.round(spec.leanThicknessM * 1000);
  return {
    size: `${formatDimensionM(spec.lengthM)} × ${formatDimensionM(spec.widthM)} × ${formatDimensionM(spec.thicknessM)} m`,
    foundationVolume: `${formatConcreteCuM(spec.structuralConcreteCuM)} m³ (Class AA)`,
    leanConcreteVolume: `${spec.leanConcreteCuM.toFixed(2)} m³ (${leanMm} mm)`,
    excavationDepth: `${totalDepthM.toFixed(2)} m (${totalDepthMm.toLocaleString('en-US')} mm from N.G.L.)`,
    cover: `${Math.round(spec.concreteCoverMm)} mm`,
    mainRebar: `M_02: ${spec.rebarM02Count} pcs (Ø20 mm @ 200 mm O.C.)`,
    chairBar: `M_26: ${spec.rebarM26Count} pcs`,
    towerAccessoriesLabel:
      foundationType === 'principal' ? 'Bolt Frame' : 'Ground Anchor Rods',
    towerAccessories: spec.anchorSummary,
  };
}

/** Excludes inspection items whose Plan Measurement has been cleared to blank. */
export function getReportableInspections(
  inspections: FoundationActivityInspectionRow[]
): FoundationActivityInspectionRow[] {
  return inspections.filter((item) => item.planMeasurement.trim().length > 0);
}

/**
 * Derives the structured activity status and organized specification details for a single
 * foundation's CURRENT FOUNDATION ACTIVITY REPORT sheet.
 */
export function buildFoundationActivityReportData(
  _project: MastProjectState,
  _metrics: ProjectSummaryMetrics | null | undefined,
  foundation: FoundationRecord,
  overrides: Partial<Record<FoundationActivityMaterialKey, FoundationActivityMaterialOverride>> = {}
): FoundationActivityReportData {
  const spec = resolveFoundationSpec(foundation.type, foundation.customSpecs);
  const foundationTitle =
    foundation.sector === 'CENTER'
      ? `${foundation.id} — ${spec.label}`
      : `${foundation.id} — ${spec.label} (Sector ${foundation.sector} · ${foundation.radiusM}m)`;

  const defaults = getDefaultFoundationSpecFields(
    foundation.type,
    foundation.customSpecs
  );
  const custom = foundation.customSpecs;
  const specDetails: FoundationSpecDetails = {
    size: custom?.size !== undefined ? custom.size : defaults.size,
    foundationVolume:
      custom?.foundationVolume !== undefined
        ? custom.foundationVolume
        : defaults.foundationVolume,
    leanConcreteVolume:
      custom?.leanConcreteVolume !== undefined
        ? custom.leanConcreteVolume
        : defaults.leanConcreteVolume,
    excavationDepth:
      custom?.excavationDepth !== undefined
        ? custom.excavationDepth
        : defaults.excavationDepth,
    cover: custom?.cover !== undefined ? custom.cover : defaults.cover,
    mainRebar: custom?.mainRebar !== undefined ? custom.mainRebar : defaults.mainRebar,
    chairBar: custom?.chairBar !== undefined ? custom.chairBar : defaults.chairBar,
    towerAccessoriesLabel: defaults.towerAccessoriesLabel,
    towerAccessories:
      custom?.towerAccessories !== undefined
        ? custom.towerAccessories
        : defaults.towerAccessories,
  };

  const totalVolumeCuM = spec.totalConcreteCuM;
  const sizeLabel = specDetails.size || defaults.size;
  const volumeLabel = `${totalVolumeCuM.toFixed(2)} m³ total (${formatConcreteCuM(spec.structuralConcreteCuM)} m³ AA + ${spec.leanConcreteCuM.toFixed(2)} m³ lean)`;

  const rebarDetails = [
    `Main Rebar (M_02): ${spec.rebarM02Count} pcs`,
    `Chair Bar (M_26): ${spec.rebarM26Count} pcs`,
    `Anchors: ${specDetails.towerAccessories}`,
  ];

  const tasks: FoundationActivityTaskRow[] = getFoundationChecklistSteps(
    foundation.type
  ).map((step) => {
    const done = Boolean(foundation.checklist[step.key]);
    return {
      key: step.key,
      description: step.shortLabel,
      done,
      statusLabel: done ? 'Done' : 'Pending',
    };
  });

  const rawRows: Array<{
    key: FoundationActivityMaterialKey;
    description: string;
    unit: 'bags' | 'pcs';
    required: number;
    defaultRemarks: string;
  }> = [
    {
      key: 'cement',
      description: 'Cement',
      unit: 'bags',
      required: spec.cementBags,
      defaultRemarks: '',
    },
    {
      key: 'sand',
      description: 'Sand',
      unit: 'bags',
      required: spec.sandBags,
      defaultRemarks: '',
    },
    {
      key: 'gravel',
      description: 'Gravel',
      unit: 'bags',
      required: spec.gravelBags,
      defaultRemarks: '',
    },
    {
      key: 'main_rebar',
      description: 'Main Rebar',
      unit: 'pcs',
      required: spec.rebarM02Count,
      defaultRemarks: `For ${foundation.id}`,
    },
    {
      key: 'chair_bar',
      description: 'Chair Bar',
      unit: 'pcs',
      required: spec.rebarM26Count,
      defaultRemarks: `For ${foundation.id}`,
    },
    {
      key: 'phenolic',
      description: 'Phenolic',
      unit: 'pcs',
      required: spec.phenolicBoards,
      defaultRemarks: '',
    },
  ];

  const materials: FoundationActivityMaterialRow[] = rawRows.map((row) => {
    const manual = foundation.manualMaterials?.[row.key];
    const ov = overrides[row.key];
    const onSite = Math.max(0, ov?.onSite ?? manual?.onSite ?? 0);
    const needed = Math.max(0, row.required - onSite);
    const remarks = ov?.remarks ?? manual?.remarks ?? row.defaultRemarks;
    return {
      key: row.key,
      description: row.description,
      unit: row.unit,
      required: row.required,
      onSite,
      needed,
      remarks,
    };
  });

  const removedKeys = new Set(foundation.removedInspectionKeys ?? []);
  const builtInItems = getFoundationInspectionChecklistItems(
    foundation.type,
    foundation.customSpecs
  )
    .filter((item) => !removedKeys.has(item.key))
    .map((item) => ({ ...item, isCustom: false }));
  const customItems = (foundation.customInspectionItems ?? []).map((item) => ({
    key: item.key,
    description: item.description,
    planMeasurement: item.planMeasurement,
    isCustom: true,
  }));

  const inspections: FoundationActivityInspectionRow[] = [
    ...builtInItems,
    ...customItems,
  ].map((item) => {
    const entry = foundation.inspectionChecklist?.[item.key];
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

  return {
    foundationId: foundation.id,
    foundationTitle,
    sizeLabel,
    volumeLabel,
    specDetails,
    rebarDetails,
    tasks,
    inspections,
    materials,
  };
}

export interface DailyHaulerRow {
  haulerName: string;
  trip1: HaulingLogEntry[];
  trip2: HaulingLogEntry[];
  tripsCompleted: number;
  dailyTotalKg: number;
  dailyTotalBags: number;
  dailyTotalPcs: number;
}

export interface DailyHaulingSheet {
  date: string;
  haulers: DailyHaulerRow[];
  dayTotalKg: number;
  dayTotalBags: number;
  dayTotalPcs: number;
}

export interface HaulerSettlementRow {
  haulerName: string;
  activeDays: number;
  tripsCompleted: number;
  cementKg: number;
  cementBags: number;
  sandKg: number;
  sandBags: number;
  gravelKg: number;
  gravelBags: number;
  rebarAndHardwarePcs: number;
  totalKg: number;
  totalBags: number;
}

function isBulkAggregate(mat: HaulingLogEntry['material']): boolean {
  return mat === 'cement' || mat === 'sand' || mat === 'gravel';
}

/**
 * Groups hauling logs into:
 * 1) Daily sheets per date with individual Name -> Trip 1 / Trip 2 columns (up to 2 trips/day)
 * 2) Per-individual settlement totals across all dates for payout calculation (40 kg = 1 bag).
 */
export function summarizeHaulingData(logs: HaulingLogEntry[]): {
  dailySheets: DailyHaulingSheet[];
  settlements: HaulerSettlementRow[];
} {
  const byDate = new Map<string, Map<string, { trip1: HaulingLogEntry[]; trip2: HaulingLogEntry[] }>>();
  const settlementMap = new Map<
    string,
    {
      dates: Set<string>;
      tripsSet: Set<string>;
      cementKg: number;
      sandKg: number;
      gravelKg: number;
      rebarAndHardwarePcs: number;
      totalKg: number;
    }
  >();

  for (const log of logs) {
    const haulerName = log.haulerName.trim() || 'Unnamed Hauler';
    const slot: 1 | 2 = log.tripNumber === 2 ? 2 : 1;

    if (!byDate.has(log.date)) {
      byDate.set(log.date, new Map());
    }
    const dayMap = byDate.get(log.date)!;
    if (!dayMap.has(haulerName)) {
      dayMap.set(haulerName, { trip1: [], trip2: [] });
    }
    const row = dayMap.get(haulerName)!;
    if (slot === 2) {
      row.trip2.push(log);
    } else {
      row.trip1.push(log);
    }

    if (!settlementMap.has(haulerName)) {
      settlementMap.set(haulerName, {
        dates: new Set(),
        tripsSet: new Set(),
        cementKg: 0,
        sandKg: 0,
        gravelKg: 0,
        rebarAndHardwarePcs: 0,
        totalKg: 0,
      });
    }
    const st = settlementMap.get(haulerName)!;
    st.dates.add(log.date);
    st.tripsSet.add(`${log.date}#${slot}`);
    st.totalKg += log.totalKg;

    if (log.material === 'cement') {
      st.cementKg += log.totalKg;
    } else if (log.material === 'sand') {
      st.sandKg += log.totalKg;
    } else if (log.material === 'gravel') {
      st.gravelKg += log.totalKg;
    } else {
      st.rebarAndHardwarePcs += log.quantity;
    }
  }

  const dailySheets: DailyHaulingSheet[] = Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayMap]) => {
      let dayTotalKg = 0;
      let dayTotalBags = 0;
      let dayTotalPcs = 0;

      const haulers: DailyHaulerRow[] = Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([haulerName, slots]) => {
          const allDayItems = [...slots.trip1, ...slots.trip2];
          let dailyTotalKg = 0;
          let dailyTotalBags = 0;
          let dailyTotalPcs = 0;

          for (const item of allDayItems) {
            dailyTotalKg += item.totalKg;
            if (isBulkAggregate(item.material)) {
              dailyTotalBags += kgToBags(item.totalKg);
            } else {
              dailyTotalPcs += item.quantity;
            }
          }

          dayTotalKg += dailyTotalKg;
          dayTotalBags += dailyTotalBags;
          dayTotalPcs += dailyTotalPcs;

          return {
            haulerName,
            trip1: slots.trip1,
            trip2: slots.trip2,
            tripsCompleted:
              (slots.trip1.length > 0 ? 1 : 0) + (slots.trip2.length > 0 ? 1 : 0),
            dailyTotalKg: Number(dailyTotalKg.toFixed(1)),
            dailyTotalBags: Number(dailyTotalBags.toFixed(2)),
            dailyTotalPcs,
          };
        });

      return {
        date,
        haulers,
        dayTotalKg: Number(dayTotalKg.toFixed(1)),
        dayTotalBags: Number(dayTotalBags.toFixed(2)),
        dayTotalPcs,
      };
    });

  const settlements: HaulerSettlementRow[] = Array.from(settlementMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([haulerName, st]) => {
      const cementBags = kgToBags(st.cementKg);
      const sandBags = kgToBags(st.sandKg);
      const gravelBags = kgToBags(st.gravelKg);
      return {
        haulerName,
        activeDays: st.dates.size,
        tripsCompleted: st.tripsSet.size,
        cementKg: Number(st.cementKg.toFixed(1)),
        cementBags,
        sandKg: Number(st.sandKg.toFixed(1)),
        sandBags,
        gravelKg: Number(st.gravelKg.toFixed(1)),
        gravelBags,
        rebarAndHardwarePcs: st.rebarAndHardwarePcs,
        totalKg: Number(st.totalKg.toFixed(1)),
        totalBags: Number((cementBags + sandBags + gravelBags).toFixed(2)),
      };
    });

  return { dailySheets, settlements };
}

export const TARGETS = PROJECT_MATERIAL_TARGETS;

/** Computes remaining stock on site at end of day: On Site + Delivered - Used (clamped >= 0). */
export function computeDailyLogMaterialRemaining(
  item: Pick<DailyLogMaterialItem, 'onSiteQty' | 'deliveredQty' | 'usedTodayQty'>
): number {
  const onSite = Math.max(0, Number(item.onSiteQty) || 0);
  const delivered = Math.max(0, Number(item.deliveredQty) || 0);
  const used = Math.max(0, Number(item.usedTodayQty) || 0);
  return Math.max(0, Number((onSite + delivered - used).toFixed(2)));
}

/** Returns the default manual Materials / Tower Parts on Site list for a new Daily Log. */
export function createDefaultDailyLogMaterials(
  projectType: ProjectType = 'foundation'
): DailyLogMaterialItem[] {
  if (projectType === 'vertical_mast') {
    return [
      { id: 'part-tower-section', name: 'Modular Tower Section (3.0m)', unit: 'sec', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
      { id: 'part-flange-bolts', name: 'Flange Splice Bolt (M16×70)', unit: 'pcs', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
      { id: 'part-guy-cable', name: 'Guy Wire Strand (Ø11.4mm)', unit: 'pcs', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
      { id: 'part-turnbuckle', name: 'Turnbuckle & Shackle Set', unit: 'sets', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
      { id: 'part-uring-nut3', name: 'U-Ring & NUT-3 Clamp', unit: 'sets', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
      { id: 'part-accessories', name: 'Working Platform / Lightning Rod', unit: 'sets', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
    ];
  }
  return [
    { id: 'mat-cement', name: 'Cement', unit: 'bags', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
    { id: 'mat-sand', name: 'Sand', unit: 'bags', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
    { id: 'mat-gravel', name: 'Gravel', unit: 'bags', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
    { id: 'mat-main-rebar', name: 'Main Rebar', unit: 'pcs', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
    { id: 'mat-chair-bar', name: 'Chair Bar', unit: 'pcs', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
    { id: 'mat-phenolic', name: 'Phenolic', unit: 'pcs', onSiteQty: 0, deliveredQty: 0, usedTodayQty: 0, remainingQty: 0, remarks: '' },
  ];
}

/**
 * Auto-fills the next day's starting `onSiteQty` from the previous day's `remainingQty`,
 * keeping standard phase defaults (Foundation Materials or Vertical Mast Tower Parts)
 * plus any custom or carried-over items recorded on the previous log.
 */
export function buildNextDayMaterialsFromLog(
  prevLog?: DailyActivityLogEntry | null,
  projectType: ProjectType = 'foundation'
): DailyLogMaterialItem[] {
  const defaults = createDefaultDailyLogMaterials(projectType);
  if (!prevLog) return defaults;

  const prevRows = getDailyLogMaterialRows(prevLog);
  if (prevRows.length === 0) return defaults;

  const normalizeName = (s: string) => s.trim().toLowerCase();
  const otherPhaseType: ProjectType =
    projectType === 'vertical_mast' ? 'foundation' : 'vertical_mast';
  const otherPhaseNames = new Set(
    createDefaultDailyLogMaterials(otherPhaseType).map((d) => normalizeName(d.name))
  );
  const prevByName = new Map(prevRows.map((m) => [normalizeName(m.name), m]));
  const usedNames = new Set<string>();

  const merged = defaults.map((def) => {
    const key = normalizeName(def.name);
    const match = prevByName.get(key);
    usedNames.add(key);
    const carryOver = match ? computeDailyLogMaterialRemaining(match) : 0;
    return {
      ...def,
      unit: match?.unit || def.unit,
      onSiteQty: carryOver,
      deliveredQty: 0,
      usedTodayQty: 0,
      remainingQty: carryOver,
      remarks: '',
    };
  });

  for (const row of prevRows) {
    const key = normalizeName(row.name);
    if (!key || usedNames.has(key)) continue;
    const carryOver = computeDailyLogMaterialRemaining(row);
    // Avoid pulling zero-quantity defaults from the opposite phase when toggling phases
    if (otherPhaseNames.has(key) && carryOver === 0) continue;
    usedNames.add(key);
    merged.push({
      ...row,
      onSiteQty: carryOver,
      deliveredQty: 0,
      usedTodayQty: 0,
      remainingQty: carryOver,
      remarks: '',
    });
  }

  return merged;
}

/** Sorts daily logs newest-first by date, then dayNumber, preserving store order on ties. */
export function sortDailyLogsNewestFirst(
  logs: DailyActivityLogEntry[]
): DailyActivityLogEntry[] {
  return [...logs].sort((a, b) => {
    const dateDiff = (b.date || '').localeCompare(a.date || '');
    if (dateDiff !== 0) return dateDiff;
    return b.dayNumber - a.dayNumber;
  });
}

/** Finds the latest saved log strictly preceding the given draft date / dayNumber. */
export function findPreviousDailyLogForDraft(
  logs: DailyActivityLogEntry[],
  draftDate: string,
  draftDayNumber: number
): DailyActivityLogEntry | null {
  if (logs.length === 0) return null;
  const newestFirst = sortDailyLogsNewestFirst(logs);
  const olderMatch = newestFirst.find(
    (log) =>
      (log.date || '') < draftDate ||
      ((log.date || '') === draftDate && log.dayNumber < draftDayNumber)
  );
  if (olderMatch) return olderMatch;
  // If draft matches/exceeds newest entry, fall back to latest saved log unless draft is earlier than all logs
  const oldest = newestFirst[newestFirst.length - 1];
  const isBeforeAll =
    draftDate < (oldest.date || '') ||
    (draftDate === (oldest.date || '') && draftDayNumber <= oldest.dayNumber);
  return isBeforeAll ? null : newestFirst[0];
}

/**
 * Propagates end-of-day `remainingQty` into subsequent chronological logs' `onSiteQty`
 * whenever an earlier day's materials are added, edited, or deleted.
 */
export function recalculateDailyLogCarryOver(
  logs: DailyActivityLogEntry[],
  startAfterId?: string
): DailyActivityLogEntry[] {
  if (logs.length <= 1) return logs;

  // Chronological oldest -> newest (reverse of sortDailyLogsNewestFirst so earlier inserted items stay first on ties)
  const chronological = [...sortDailyLogsNewestFirst(logs)].reverse();
  const startIdx = startAfterId
    ? chronological.findIndex((l) => l.id === startAfterId)
    : 0;
  if (startIdx < 0 || startIdx >= chronological.length - 1) return logs;

  const updatedById = new Map<string, DailyActivityLogEntry>();
  const currentChain = chronological.map((l) => ({ ...l }));

  for (let i = Math.max(1, startIdx + 1); i < currentChain.length; i++) {
    const prev = updatedById.get(currentChain[i - 1].id) ?? currentChain[i - 1];
    const curr = currentChain[i];

    // Only cascade when the preceding log tracks structured material rows
    if (!prev.materialsOnSite || prev.materialsOnSite.length === 0) continue;

    const prevRows = getDailyLogMaterialRows(prev);
    const normalizeName = (s: string) => s.trim().toLowerCase();
    const prevRemainingByName = new Map<string, { qty: number; item: DailyLogMaterialItem }>();
    for (const row of prevRows) {
      const key = normalizeName(row.name);
      if (!key) continue;
      prevRemainingByName.set(key, {
        qty: computeDailyLogMaterialRemaining(row),
        item: row,
      });
    }

    const currRows = getDailyLogMaterialRows(curr);
    const seenNames = new Set<string>();
    const nextRows: DailyLogMaterialItem[] = currRows.map((row) => {
      const key = normalizeName(row.name);
      if (key) seenNames.add(key);
      const prevEntry = prevRemainingByName.get(key);
      const nextOnSite = prevEntry ? prevEntry.qty : row.onSiteQty;
      const deliveredQty = Math.max(0, Number(row.deliveredQty) || 0);
      const usedTodayQty = Math.max(0, Number(row.usedTodayQty) || 0);
      return {
        ...row,
        onSiteQty: nextOnSite,
        deliveredQty,
        usedTodayQty,
        remainingQty: computeDailyLogMaterialRemaining({
          onSiteQty: nextOnSite,
          deliveredQty,
          usedTodayQty,
        }),
      };
    });

    // Ensure non-zero carried-over items from prev day aren't missing on next day
    for (const [key, { qty, item }] of prevRemainingByName.entries()) {
      if (seenNames.has(key) || qty <= 0) continue;
      seenNames.add(key);
      nextRows.push({
        id: item.id,
        name: item.name,
        unit: item.unit,
        onSiteQty: qty,
        deliveredQty: 0,
        usedTodayQty: 0,
        remainingQty: qty,
        remarks: '',
      });
    }

    const rowsUnchanged =
      currRows.length === nextRows.length &&
      currRows.every((row, idx) => {
        const next = nextRows[idx];
        return (
          row.name === next.name &&
          row.onSiteQty === next.onSiteQty &&
          row.deliveredQty === next.deliveredQty &&
          row.usedTodayQty === next.usedTodayQty &&
          row.remainingQty === next.remainingQty
        );
      });

    if (rowsUnchanged) {
      // Carried-over quantities match what this log already had; downstream logs are already consistent
      break;
    }

    const updatedCurr: DailyActivityLogEntry = {
      ...curr,
      materialsOnSite: nextRows,
    };
    updatedById.set(curr.id, updatedCurr);
    currentChain[i] = updatedCurr;
  }

  if (updatedById.size === 0) return logs;
  return logs.map((log) => updatedById.get(log.id) ?? log);
}

/** Resolves explicit daily log material rows or derives legacy aggregate rows for display. */
export function getDailyLogMaterialRows(log: DailyActivityLogEntry): DailyLogMaterialItem[] {
  if (log.materialsOnSite && log.materialsOnSite.length > 0) {
    return log.materialsOnSite.map((m) => {
      const deliveredQty = Math.max(0, Number(m.deliveredQty) || 0);
      const remainingQty =
        m.remainingQty !== undefined
          ? Math.max(0, Number(m.remainingQty) || 0)
          : computeDailyLogMaterialRemaining({ ...m, deliveredQty });
      return {
        ...m,
        deliveredQty,
        remainingQty,
      };
    });
  }
  const rows: DailyLogMaterialItem[] = [];
  if (log.cementUsedBags > 0) {
    rows.push({
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
  if (log.sandUsedBags > 0) {
    rows.push({
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
  if (log.gravelUsedBags > 0) {
    rows.push({
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
  return rows;
}

/** Resolves explicit daily log activity rows or derives a fallback row from activitiesSummary. */
export function getDailyLogActivityRows(log: DailyActivityLogEntry): DailyLogActivityItem[] {
  if (log.activities && log.activities.length > 0) {
    return log.activities;
  }
  if (log.activitiesSummary.trim()) {
    return [
      {
        id: 'legacy-activity',
        foundationId: log.foundationsWorked[0] ?? '',
        description: log.activitiesSummary.trim(),
        status: 'Completed',
        remarks: '',
      },
    ];
  }
  return [];
}

/** Resolves equipment table rows or falls back to legacy equipmentOnSite text. */
export function getDailyLogEquipmentRows(log: DailyActivityLogEntry): DailyLogEquipmentItem[] {
  if (log.equipmentItems && log.equipmentItems.length > 0) {
    return log.equipmentItems;
  }
  if (log.equipmentOnSite?.trim()) {
    return [
      {
        id: 'legacy-equip',
        name: log.equipmentOnSite.trim(),
        qty: 1,
        status: 'Operational',
        remarks: '',
      },
    ];
  }
  return [];
}

/** Resolves delay table rows or falls back to legacy issuesOrDelays text. */
export function getDailyLogDelayRows(log: DailyActivityLogEntry): DailyLogDelayItem[] {
  if (log.delayItems && log.delayItems.length > 0) {
    return log.delayItems;
  }
  if (log.issuesOrDelays?.trim() && log.issuesOrDelays.trim() !== 'None.') {
    return [
      {
        id: 'legacy-delay',
        description: log.issuesOrDelays.trim(),
        impact: '—',
        remarks: '',
      },
    ];
  }
  return [];
}

/** Resolves visitor table rows or falls back to legacy safetyAndVisitors text. */
export function getDailyLogVisitorRows(log: DailyActivityLogEntry): DailyLogVisitorItem[] {
  if (log.visitorItems && log.visitorItems.length > 0) {
    return log.visitorItems;
  }
  // Legacy records packed both values into one string, e.g.
  // "Safety Officer: Jane Doe | Client QA, Supplier". Never display the
  // officer portion as a visitor when reading those records.
  const legacyVisitorText = (log.safetyAndVisitors ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => !/^safety\s*officer\s*:/i.test(part))
    .join(' | ')
    .trim();
  if (legacyVisitorText) {
    return [
      {
        id: 'legacy-visitor',
        name: legacyVisitorText,
        roleOrCompany: '—',
        purpose: 'Site Visit / Note',
        remarks: '',
      },
    ];
  }
  return [];
}

/** Resolves explicit safety log rows recorded by the Safety Officer. */
export function getDailyLogSafetyRows(log: DailyActivityLogEntry): DailyLogSafetyItem[] {
  return log.safetyLogs ?? [];
}

/** Formats a Daily Log as compact plain text for mobile SMS/chat reporting when signal is limited. */
export function formatDailyLogPlainText(
  log: DailyActivityLogEntry,
  fallbackProject: Pick<MastProjectState, 'projectName' | 'location' | 'preparedBy'>
): string {
  const projectTitle = log.projectName?.trim() || fallbackProject.projectName;
  const siteLocation = log.location?.trim() || fallbackProject.location;
  const author = log.preparedBy?.trim() || fallbackProject.preparedBy;
  const weatherLine = log.weatherNotes?.trim()
    ? `${log.weather} (${log.weatherNotes.trim()})`
    : log.weather;

  const lines: string[] = [
    `DAILY SITE LOG — Day ${log.dayNumber} (${formatDateWithWeekday(log.date)})`,
    `Project: ${projectTitle}`,
    `Location: ${siteLocation}`,
    `Prepared By: ${author}`,
    `Weather: ${weatherLine}`,
    `Foundations: ${log.foundationsWorked.length > 0 ? log.foundationsWorked.join(', ') : 'None specified'}`,
    '',
    `MANPOWER (${log.totalWorkers} workers):`,
  ];

  if (log.workers.length === 0) {
    lines.push('- None logged');
  } else {
    for (const w of log.workers) {
      lines.push(`- ${w.count}x ${w.role}${w.names ? ` — ${w.names}` : ''}`);
    }
  }

  lines.push('', 'ACTIVITIES & STATUS:');
  const actRows = getDailyLogActivityRows(log);
  if (actRows.length === 0) {
    lines.push('- None logged');
  } else {
    for (const act of actRows) {
      const fTag = act.foundationId ? `[${act.foundationId}] ` : '';
      const rem = act.remarks?.trim() ? ` (${act.remarks.trim()})` : '';
      lines.push(`- ${fTag}${act.description} — ${act.status}${rem}`);
    }
  }
  if (log.activitiesSummary.trim() && log.activities && log.activities.length > 0) {
    lines.push(`Summary: ${log.activitiesSummary.trim()}`);
  }

  const safetyRows = getDailyLogSafetyRows(log);
  if (safetyRows.length > 0 || log.safetyOfficer?.trim()) {
    lines.push(
      '',
      `SAFETY LOGS (Safety Officer: ${log.safetyOfficer?.trim() || 'Not specified'}):`
    );
    if (safetyRows.length === 0) {
      lines.push('- No safety entries recorded');
    } else {
      for (const s of safetyRows) {
        const finding = s.hazardOrFinding?.trim() ? ` — ${s.hazardOrFinding.trim()}` : '';
        const action = s.actionTaken?.trim() ? ` | Action: ${s.actionTaken.trim()}` : '';
        lines.push(`- ${s.timeOrActivity}${finding}${action} [${s.status || 'Compliant'}]`);
      }
    }
  }

  const mats = getDailyLogMaterialRows(log).filter(
    (m) =>
      m.onSiteQty > 0 ||
      (m.deliveredQty ?? 0) > 0 ||
      m.usedTodayQty > 0 ||
      (m.remainingQty ?? 0) > 0 ||
      Boolean(m.remarks?.trim())
  );
  lines.push('', 'MATERIALS ON SITE:');
  if (mats.length === 0) {
    lines.push('- No material counts recorded');
  } else {
    for (const m of mats) {
      const delivered = m.deliveredQty ?? 0;
      const remaining = m.remainingQty ?? computeDailyLogMaterialRemaining(m);
      const rem = m.remarks?.trim() ? ` | ${m.remarks.trim()}` : '';
      lines.push(
        `- ${m.name} (${m.unit}): On Site ${m.onSiteQty}, Delivered ${delivered}, Used ${m.usedTodayQty}, Remaining ${remaining}${rem}`
      );
    }
  }

  const equips = getDailyLogEquipmentRows(log);
  lines.push('', 'EQUIPMENTS:');
  if (equips.length === 0) {
    lines.push('- None recorded');
  } else {
    for (const eq of equips) {
      const rem = eq.remarks?.trim() ? ` (${eq.remarks.trim()})` : '';
      lines.push(`- ${eq.qty}x ${eq.name} — ${eq.status}${rem}`);
    }
  }

  const delays = getDailyLogDelayRows(log);
  lines.push('', 'DELAYS:');
  if (delays.length === 0) {
    lines.push('- None');
  } else {
    for (const d of delays) {
      const imp = d.impact?.trim() ? ` [${d.impact.trim()}]` : '';
      const rem = d.remarks?.trim() ? ` (${d.remarks.trim()})` : '';
      lines.push(`- ${d.description}${imp}${rem}`);
    }
  }

  const visitors = getDailyLogVisitorRows(log);
  lines.push('', 'VISITORS:');
  if (visitors.length === 0) {
    lines.push('- None');
  } else {
    for (const v of visitors) {
      const role = v.roleOrCompany?.trim() ? ` (${v.roleOrCompany.trim()})` : '';
      const purp = v.purpose?.trim() ? ` — ${v.purpose.trim()}` : '';
      lines.push(`- ${v.name}${role}${purp}`);
    }
  }

  const docs = (log.documentationItems ?? []).filter(
    (d) => d.photoDataUrl || d.description.trim() || Boolean(d.remarks?.trim())
  );
  if (docs.length > 0) {
    lines.push('', 'DOCUMENTATION:');
    for (const doc of docs) {
      const photoTag = doc.photoDataUrl ? '[Photo attached] ' : '';
      const rem = doc.remarks?.trim() ? ` (${doc.remarks.trim()})` : '';
      lines.push(`- ${photoTag}${doc.description.trim() || 'Site Photo'}${rem}`);
    }
  }

  return lines.join('\n');
}

/** Derives overall QA/QC inspection outcome from an optional explicit override or row statuses. */
export function deriveOverallInspectionStatus(
  explicitStatus: FoundationInspectionStatus | undefined,
  items: { status: FoundationInspectionStatus }[]
): FoundationInspectionStatus {
  if (explicitStatus) return explicitStatus;
  if (items.some((i) => i.status === 'For Rectification')) return 'For Rectification';
  const relevant = items.filter((i) => i.status !== 'N/A');
  if (relevant.length > 0 && relevant.every((i) => i.status === 'Passed')) return 'Passed';
  return 'Pending';
}


