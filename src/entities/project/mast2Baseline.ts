import { createDefaultReportLogos } from '@/shared/assets/defaultLogos';
import { todayLocalIso } from '@/shared/lib/dateUtils';
import type {
  FoundationCustomSpecs,
  FoundationInspectionItemKey,
  FoundationRecord,
  FoundationSpec,
  FoundationStageChecklist,
  FoundationStatus,
  FoundationType,
  MastProjectState,
  SectorId,
  SiteEquipmentItem,
} from './types';

export const BAGS_PER_CUBIC_METER = 36; // From Pull Anchor Details - DRAFT.pdf
export const DEFAULT_KG_PER_BAG = 40; // Standard 40kg cement bag / empty cement sack for aggregates

export const PROJECT_MATERIAL_TARGETS = {
  cementBagsExact: 618,
  cementBagsTotal: 649, // incl 5% wastage
  sandCuMExact: 26,
  sandCuMTotal: 28,
  gravelCuMExact: 52,
  gravelCuMTotal: 55,
  rebar20mmCommercialPcs: 146, // Net 6m bars after using existing cuts
  phenolicBoardsPcs: 32,
  peakManpower: 18,
} as const;

export const FOUNDATION_SPECS: Record<FoundationType, FoundationSpec> = {
  principal: {
    type: 'principal',
    label: 'Principal Foundation',
    lengthM: 2.0,
    widthM: 2.0,
    thicknessM: 1.0,
    overburdenDepthM: 0.0,
    leanThicknessM: 0.05,
    structuralConcreteCuM: 4.0,
    leanConcreteCuM: 0.2,
    cementBags: 50,
    sandCuM: 2.1,
    sandBags: 76,
    gravelCuM: 4.2,
    gravelBags: 152,
    rebarM02Count: 40,
    rebarM02CutM: 3.0,
    rebarM26Count: 9,
    rebarM26CutM: 2.24,
    anchorSummary: 'M27 Bolt Frame (3×M27 Embedded Bolts, 1200mm, 400×400 Locating Plate)',
    guyElevationsM: [],
  },
  anchor_a: {
    type: 'anchor_a',
    label: 'Pull Anchor A',
    lengthM: 2.0,
    widthM: 2.0,
    thicknessM: 1.4,
    overburdenDepthM: 0.6,
    leanThicknessM: 0.05,
    structuralConcreteCuM: 5.6,
    leanConcreteCuM: 0.2,
    cementBags: 70,
    sandCuM: 3.0,
    sandBags: 110,
    gravelCuM: 6.0,
    gravelBags: 220,
    rebarM02Count: 40,
    rebarM02CutM: 3.5,
    rebarM26Count: 9,
    rebarM26CutM: 3.04,
    anchorSummary: 'Dual Ø25mm Ground Anchor Rods (2500mm, +300mm above N.G.L.)',
    guyElevationsM: [67.5, 75.0, 82.5, 90.0],
  },
  anchor_b: {
    type: 'anchor_b',
    label: 'Pull Anchor B',
    lengthM: 2.0,
    widthM: 2.0,
    thicknessM: 1.0,
    overburdenDepthM: 1.0,
    leanThicknessM: 0.05,
    structuralConcreteCuM: 4.0,
    leanConcreteCuM: 0.2,
    cementBags: 50,
    sandCuM: 2.1,
    sandBags: 80,
    gravelCuM: 4.2,
    gravelBags: 160,
    rebarM02Count: 40,
    rebarM02CutM: 3.0,
    rebarM26Count: 9,
    rebarM26CutM: 2.24,
    anchorSummary: 'Dual Ø25mm Ground Anchor Rods (2500mm, +300mm above N.G.L.)',
    guyElevationsM: [37.5, 45.0, 52.5, 60.0, 97.5, 105.0, 111.0, 117.0],
  },
  anchor_c: {
    type: 'anchor_c',
    label: 'Pull Anchor C',
    lengthM: 1.5,
    widthM: 1.5,
    thicknessM: 0.7,
    overburdenDepthM: 1.3,
    leanThicknessM: 0.05,
    structuralConcreteCuM: 1.6,
    leanConcreteCuM: 0.12,
    cementBags: 21,
    sandCuM: 1.0,
    sandBags: 36,
    gravelCuM: 1.8,
    gravelBags: 65,
    rebarM02Count: 32,
    rebarM02CutM: 2.2,
    rebarM26Count: 4,
    rebarM26CutM: 1.64,
    anchorSummary: 'Dual Ø25mm Ground Anchor Rods (2500mm, +300mm above N.G.L.)',
    guyElevationsM: [7.5, 15.0, 22.5, 30.0],
  },
};

export const STATUS_META: Record<
  FoundationStatus,
  { label: string; shortLabel: string; color: string; bgClass: string; textClass: string; pct: number }
> = {
  not_started: {
    label: 'Pending / Not Started',
    shortLabel: 'Pending',
    color: '#94a3b8',
    bgClass: 'bg-slate-100 border-slate-300',
    textClass: 'text-slate-700',
    pct: 0,
  },
  excavated: {
    label: '1–2. Excavated & Retrofitted',
    shortLabel: 'Excavated & Retrofitted',
    color: '#b97a57',
    bgClass: 'bg-stone-100 border-stone-400',
    textClass: 'text-stone-800',
    pct: 15,
  },
  lean_concrete: {
    label: '3. Lean Concrete Poured',
    shortLabel: 'Lean Concrete Poured',
    color: '#facc15',
    bgClass: 'bg-yellow-50 border-yellow-400',
    textClass: 'text-yellow-800',
    pct: 30,
  },
  rebar_and_anchor: {
    label: '4. Rebar, Anchor/Bolt & Forms Installed',
    shortLabel: 'Rebar & Forms Installed',
    color: '#06b6d4',
    bgClass: 'bg-cyan-50 border-cyan-400',
    textClass: 'text-cyan-800',
    pct: 50,
  },
  formwork: {
    label: '5. Rebar, Anchor/Bolt & Forms Inspected',
    shortLabel: 'Rebar & Forms Inspected',
    color: '#f97316',
    bgClass: 'bg-orange-50 border-orange-400',
    textClass: 'text-orange-800',
    pct: 65,
  },
  concreted: {
    label: '6. Concrete Poured',
    shortLabel: 'Concrete Poured',
    color: '#ec4899',
    bgClass: 'bg-pink-50 border-pink-400',
    textClass: 'text-pink-800',
    pct: 80,
  },
  curing: {
    label: '7. Cured',
    shortLabel: 'Cured',
    color: '#8b5cf6',
    bgClass: 'bg-violet-50 border-violet-400',
    textClass: 'text-violet-800',
    pct: 90,
  },
  completed: {
    label: '8. Backfilled',
    shortLabel: 'Backfilled',
    color: '#10b981',
    bgClass: 'bg-emerald-50 border-emerald-400',
    textClass: 'text-emerald-800',
    pct: 100,
  },
};

export interface FoundationChecklistStepDef {
  key: keyof FoundationStageChecklist;
  label: string;
  shortLabel: string;
}

/**
 * Returns the 8 canonical foundation activities, differentiating Principal Foundation (PF-0)
 * Bolt Frame steps from Pull Anchor Ground Anchor Rod steps.
 */
export function getFoundationChecklistSteps(
  foundationType: FoundationType
): FoundationChecklistStepDef[] {
  const hardwareLabel =
    foundationType === 'principal' ? 'Bolt Frame' : 'Ground Anchor Rod';
  return [
    {
      key: 'excavationVerified',
      label: '1. Excavated',
      shortLabel: 'Excavated',
    },
    {
      key: 'excavationInspectionDone',
      label: '2. Excavation Inspected & Retrofitted',
      shortLabel: 'Excavation Inspected & Retrofitted',
    },
    {
      key: 'leanConcretePoured',
      label: '3. Lean Concrete Poured',
      shortLabel: 'Lean Concrete Poured',
    },
    {
      key: 'rebarCageInstalled',
      label: `4. Rebar, ${hardwareLabel}, and Formworks Installed`,
      shortLabel: `Rebar, ${hardwareLabel}, and Formworks Installed`,
    },
    {
      key: 'formworkBraced',
      label: `5. Rebar, ${hardwareLabel}, and Formworks Inspected`,
      shortLabel: `Rebar, ${hardwareLabel}, and Formworks Inspected`,
    },
    {
      key: 'concretePoured',
      label: '6. Concrete Poured',
      shortLabel: 'Concrete Poured',
    },
    {
      key: 'curingStarted',
      label: '7. Cured',
      shortLabel: 'Cured',
    },
    {
      key: 'curingAndBackfillDone',
      label: '8. Backfilled',
      shortLabel: 'Backfilled',
    },
  ];
}

/** Canonical foundation activity list (default pull-anchor phrasing). */
export const FOUNDATION_CHECKLIST_STEPS: FoundationChecklistStepDef[] =
  getFoundationChecklistSteps('anchor_a');

export interface FoundationInspectionItemDef {
  key: FoundationInspectionItemKey;
  description: string;
  planMeasurement: string;
}

const INSPECTION_PLAN_BY_TYPE: Record<
  FoundationType,
  {
    excavation: string;
    leanConcrete: string;
    coversAndCage: string;
    rebarCutAndSpacing: string;
    rebarLapLength: string;
    anchorHardwareDesc: string;
    anchorHardwarePlan: string;
  }
> = {
  principal: {
    excavation: '2000 × 2000 mm pad; 1050 mm depth from N.G.L. (1000 mm pad + 50 mm lean, flush top)',
    leanConcrete: '50 mm thickness (Class A, 0.20 m³)',
    coversAndCage: '50 mm top & bottom cover; 900 mm inner rebar cage height',
    rebarCutAndSpacing: 'Ø20 mm @ 200 mm O.C. both ways · Main: 40 pcs @ 3.00 m · Chair: 9 pcs @ 2.24 m',
    rebarLapLength: '200 mm outer lap / 240 mm inner lap',
    anchorHardwareDesc: 'Bolt Frame (M27) Installation & Alignment',
    anchorHardwarePlan: '3×M27 Embedded Bolts (1200 mm) + 400×400 Locating Plate — plumb & elevation vs N.G.L.',
  },
  anchor_a: {
    excavation: '2000 × 2000 mm pad; 2050 mm total depth (600 mm overburden + 1400 mm pad + 50 mm lean)',
    leanConcrete: '50 mm thickness (Class A, 0.20 m³)',
    coversAndCage: '50 mm top & bottom cover; 1300 mm inner rebar cage height',
    rebarCutAndSpacing: 'Ø20 mm @ 200 mm O.C. both ways · Main: 40 pcs @ 3.50 m · Chair: 9 pcs @ 3.04 m',
    rebarLapLength: '300 mm outer lap / 340 mm inner lap',
    anchorHardwareDesc: 'Ground Anchor Rod Installation & Alignment',
    anchorHardwarePlan: 'Dual Ø25 mm Rods (2500 mm overall, +300 mm above N.G.L.) — alignment & inclination',
  },
  anchor_b: {
    excavation: '2000 × 2000 mm pad; 2050 mm total depth (1000 mm overburden + 1000 mm pad + 50 mm lean)',
    leanConcrete: '50 mm thickness (Class A, 0.20 m³)',
    coversAndCage: '50 mm top & bottom cover; 900 mm inner rebar cage height',
    rebarCutAndSpacing: 'Ø20 mm @ 200 mm O.C. both ways · Main: 40 pcs @ 3.00 m · Chair: 9 pcs @ 2.24 m',
    rebarLapLength: '200 mm outer lap / 240 mm inner lap',
    anchorHardwareDesc: 'Ground Anchor Rod Installation & Alignment',
    anchorHardwarePlan: 'Dual Ø25 mm Rods (2500 mm overall, +300 mm above N.G.L.) — alignment & inclination',
  },
  anchor_c: {
    excavation: '1500 × 1500 mm pad; 2050 mm total depth (1300 mm overburden + 700 mm pad + 50 mm lean)',
    leanConcrete: '50 mm thickness (Class A, 0.12 m³)',
    coversAndCage: '50 mm top & bottom cover; 600 mm inner rebar cage height',
    rebarCutAndSpacing: 'Ø20 mm @ 200 mm O.C. both ways · Main: 32 pcs @ 2.20 m · Chair: 4 pcs @ 1.64 m',
    rebarLapLength: '200 mm outer lap / 240 mm inner lap',
    anchorHardwareDesc: 'Ground Anchor Rod Installation & Alignment',
    anchorHardwarePlan: 'Dual Ø25 mm Rods (2500 mm overall, +300 mm above N.G.L.) — alignment & inclination',
  },
};

/** 4ft × 8ft (1.22m × 2.44m) phenolic boards required to shutter all 4 sides of a single pad. */
export const FOUNDATION_PHENOLIC_BOARDS: Record<FoundationType, number> = {
  principal: 4,
  anchor_a: 5,
  anchor_b: 4,
  anchor_c: 2,
};

/** Returns civil-works QA/QC inspection items with PDF plan measurements for a foundation type and optional custom dimensions. */
export function getFoundationInspectionChecklistItems(
  foundationType: FoundationType,
  customSpecs?: FoundationCustomSpecs
): FoundationInspectionItemDef[] {
  const basePlan = INSPECTION_PLAN_BY_TYPE[foundationType];
  const resolved = resolveFoundationSpec(foundationType, customSpecs);

  let excavation = basePlan.excavation;
  let leanConcrete = basePlan.leanConcrete;
  let coversAndCage = basePlan.coversAndCage;
  let rebarCutAndSpacing = basePlan.rebarCutAndSpacing;

  if (resolved.hasCustomDimensions) {
    const lenMm = Math.round(resolved.lengthM * 1000);
    const widMm = Math.round(resolved.widthM * 1000);
    const padMm = Math.round(resolved.thicknessM * 1000);
    const overMm = Math.round(resolved.overburdenDepthM * 1000);
    const leanMm = Math.round(resolved.leanThicknessM * 1000);
    const totalDepthMm = Math.round(resolved.totalExcavationDepthM * 1000);
    excavation =
      overMm === 0
        ? `${lenMm} × ${widMm} mm pad; ${totalDepthMm} mm depth from N.G.L. (${padMm} mm pad + ${leanMm} mm lean, flush top)`
        : `${lenMm} × ${widMm} mm pad; ${totalDepthMm} mm total depth (${overMm} mm overburden + ${padMm} mm pad + ${leanMm} mm lean)`;
    leanConcrete = `${leanMm} mm thickness (Class A, ${resolved.leanConcreteCuM.toFixed(2)} m³)`;
  }

  if (resolved.hasCustomDimensions || customSpecs?.concreteCoverMm !== undefined) {
    const padMm = Math.round(resolved.thicknessM * 1000);
    const coverMm = Math.round(resolved.concreteCoverMm);
    const cageHeightMm = Math.max(0, padMm - coverMm * 2);
    coversAndCage = `${coverMm} mm top & bottom cover; ${cageHeightMm} mm inner rebar cage height`;
  }

  if (
    customSpecs?.rebarM02Count !== undefined ||
    customSpecs?.rebarM26Count !== undefined
  ) {
    const baseSpec = FOUNDATION_SPECS[foundationType];
    rebarCutAndSpacing = `Ø20 mm @ 200 mm O.C. both ways · Main: ${resolved.rebarM02Count} pcs @ ${baseSpec.rebarM02CutM.toFixed(2)} m · Chair: ${resolved.rebarM26Count} pcs @ ${baseSpec.rebarM26CutM.toFixed(2)} m`;
  }

  return [
    {
      key: 'excavation_size_depth',
      description: 'Excavation Size & Depth (vs N.G.L.)',
      planMeasurement: excavation,
    },
    {
      key: 'lean_concrete_50mm',
      description: 'Lean Concrete Bedding (Class A)',
      planMeasurement: leanConcrete,
    },
    {
      key: 'concrete_covers_50mm',
      description: 'Concrete Covers & Rebar Cage Height',
      planMeasurement: coversAndCage,
    },
    {
      key: 'bars_spacing_200mm',
      description: 'Main & Chair Rebar Size, Count, Cut & Spacing',
      planMeasurement: rebarCutAndSpacing,
    },
    {
      key: 'rebar_lap_length',
      description: 'Rebar Lap Lengths (Outer / Inner)',
      planMeasurement: basePlan.rebarLapLength,
    },
    {
      key: 'anchor_rod_alignment',
      description: basePlan.anchorHardwareDesc,
      planMeasurement:
        customSpecs?.towerAccessories?.trim() || basePlan.anchorHardwarePlan,
    },
  ];
}

/** Default pull-anchor QA/QC inspection items (civil works only). */
export const FOUNDATION_INSPECTION_ITEMS: FoundationInspectionItemDef[] =
  getFoundationInspectionChecklistItems('anchor_a');

export interface ResolvedFoundationSpec {
  type: FoundationType;
  label: string;
  lengthM: number;
  widthM: number;
  thicknessM: number;
  overburdenDepthM: number;
  leanThicknessM: number;
  concreteCoverMm: number;
  totalExcavationDepthM: number;
  structuralConcreteCuM: number;
  leanConcreteCuM: number;
  totalConcreteCuM: number;
  cementBags: number;
  sandBags: number;
  gravelBags: number;
  rebarM02Count: number;
  rebarM26Count: number;
  phenolicBoards: number;
  anchorSummary: string;
  hasCustomDimensions: boolean;
}

function finitePositive(val: unknown, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : fallback;
}

function finiteNonNegative(val: unknown, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : fallback;
}

/** Formats dimension in meters using 1 decimal when clean (e.g. 2.0), 2 decimals otherwise (e.g. 2.25). */
export function formatDimensionM(val: number): string {
  return Math.abs(val * 10 - Math.round(val * 10)) < 1e-6
    ? val.toFixed(1)
    : val.toFixed(2);
}

/** Formats volume in m³ using 1 decimal when clean (e.g. 4.0), 2 decimals otherwise (e.g. 6.75). */
export function formatConcreteCuM(val: number): string {
  return Math.abs(val * 10 - Math.round(val * 10)) < 1e-6
    ? val.toFixed(1)
    : val.toFixed(2);
}

/**
 * Resolves a foundation's effective dimensions, excavation depth, dynamic concrete
 * pour volumes (L × W × Depth), and scaled concrete material estimates from either
 * per-foundation overrides or baseline engineering defaults.
 */
export function resolveFoundationSpec(
  foundationType: FoundationType,
  custom?: FoundationCustomSpecs
): ResolvedFoundationSpec {
  const defaults = FOUNDATION_SPECS[foundationType];
  const lengthM = finitePositive(custom?.lengthM, defaults.lengthM);
  const widthM = finitePositive(custom?.widthM, defaults.widthM);
  const thicknessM = finitePositive(custom?.thicknessM, defaults.thicknessM);
  const overburdenDepthM = finiteNonNegative(
    custom?.overburdenDepthM,
    defaults.overburdenDepthM
  );
  const leanThicknessM = finiteNonNegative(
    custom?.leanThicknessM,
    defaults.leanThicknessM
  );
  const concreteCoverMm = finiteNonNegative(custom?.concreteCoverMm, 50);

  const structuralDimsChanged =
    Math.abs(lengthM - defaults.lengthM) > 1e-6 ||
    Math.abs(widthM - defaults.widthM) > 1e-6 ||
    Math.abs(thicknessM - defaults.thicknessM) > 1e-6;
  const leanDimsChanged =
    Math.abs(lengthM - defaults.lengthM) > 1e-6 ||
    Math.abs(widthM - defaults.widthM) > 1e-6 ||
    Math.abs(leanThicknessM - defaults.leanThicknessM) > 1e-6;
  const hasCustomDimensions =
    structuralDimsChanged ||
    leanDimsChanged ||
    Math.abs(overburdenDepthM - defaults.overburdenDepthM) > 1e-6;

  const structuralConcreteCuM = structuralDimsChanged
    ? Number((lengthM * widthM * thicknessM).toFixed(2))
    : defaults.structuralConcreteCuM;
  const leanConcreteCuM = leanDimsChanged
    ? Number((lengthM * widthM * leanThicknessM).toFixed(2))
    : defaults.leanConcreteCuM;
  const totalConcreteCuM = Number(
    (structuralConcreteCuM + leanConcreteCuM).toFixed(2)
  );
  const totalExcavationDepthM = Number(
    (overburdenDepthM + thicknessM + leanThicknessM).toFixed(3)
  );

  const volRatio =
    defaults.structuralConcreteCuM > 0
      ? structuralConcreteCuM / defaults.structuralConcreteCuM
      : 1;

  const cementBags =
    custom?.cementBags !== undefined
      ? Math.round(finiteNonNegative(custom.cementBags, defaults.cementBags))
      : structuralDimsChanged
        ? Math.round(defaults.cementBags * volRatio)
        : defaults.cementBags;
  const sandBags =
    custom?.sandBags !== undefined
      ? Math.round(finiteNonNegative(custom.sandBags, defaults.sandBags))
      : structuralDimsChanged
        ? Math.round(defaults.sandBags * volRatio)
        : defaults.sandBags;
  const gravelBags =
    custom?.gravelBags !== undefined
      ? Math.round(finiteNonNegative(custom.gravelBags, defaults.gravelBags))
      : structuralDimsChanged
        ? Math.round(defaults.gravelBags * volRatio)
        : defaults.gravelBags;

  const rebarM02Count = Math.round(
    finiteNonNegative(custom?.rebarM02Count, defaults.rebarM02Count)
  );
  const rebarM26Count = Math.round(
    finiteNonNegative(custom?.rebarM26Count, defaults.rebarM26Count)
  );
  const phenolicBoards = Math.round(
    finiteNonNegative(
      custom?.phenolicBoards,
      FOUNDATION_PHENOLIC_BOARDS[foundationType]
    )
  );

  return {
    type: foundationType,
    label: defaults.label,
    lengthM,
    widthM,
    thicknessM,
    overburdenDepthM,
    leanThicknessM,
    concreteCoverMm,
    totalExcavationDepthM,
    structuralConcreteCuM,
    leanConcreteCuM,
    totalConcreteCuM,
    cementBags,
    sandBags,
    gravelBags,
    rebarM02Count,
    rebarM26Count,
    phenolicBoards,
    anchorSummary: custom?.towerAccessories?.trim() || defaults.anchorSummary,
    hasCustomDimensions,
  };
}

export function emptyChecklist(): FoundationStageChecklist {
  return {
    excavationVerified: false,
    excavationInspectionDone: false,
    leanConcretePoured: false,
    rebarCageInstalled: false,
    anchorHardwareAligned: false,
    formworkBraced: false,
    concretePoured: false,
    curingStarted: false,
    curingAndBackfillDone: false,
  };
}

export function deriveStatusFromChecklist(c: FoundationStageChecklist): FoundationStatus {
  if (c.curingAndBackfillDone && c.concretePoured) return 'completed';
  if (c.curingStarted && c.concretePoured) return 'curing';
  if (c.concretePoured) return 'concreted';
  if (c.formworkBraced) return 'formwork';
  if (c.rebarCageInstalled || c.anchorHardwareAligned) return 'rebar_and_anchor';
  if (c.leanConcretePoured) return 'lean_concrete';
  if (c.excavationVerified || c.excavationInspectionDone) return 'excavated';
  return 'not_started';
}

export function checklistFromStatus(status: FoundationStatus): FoundationStageChecklist {
  const order: FoundationStatus[] = [
    'not_started',
    'excavated',
    'lean_concrete',
    'rebar_and_anchor',
    'formwork',
    'concreted',
    'curing',
    'completed',
  ];
  const idx = order.indexOf(status);
  return {
    excavationVerified: idx >= 1,
    excavationInspectionDone: idx >= 2,
    leanConcretePoured: idx >= 2,
    rebarCageInstalled: idx >= 3,
    anchorHardwareAligned: idx >= 4,
    formworkBraced: idx >= 4,
    concretePoured: idx >= 5,
    curingStarted: idx >= 6,
    curingAndBackfillDone: idx >= 7,
  };
}

const SECTORS: { sector: SectorId; label: string; angleDeg: number }[] = [
  { sector: 'I', label: 'Sector I (NE 30°)', angleDeg: 30 },
  { sector: 'II', label: 'Sector II (NW 150°)', angleDeg: 150 },
  { sector: 'III', label: 'Sector III (South 270°)', angleDeg: 270 },
];

const RADIAL_RING_DEF: { suffix: string; type: FoundationType; radiusM: number; title: string }[] = [
  { suffix: 'C1', type: 'anchor_c', radiusM: 18, title: 'Pull Anchor C (18m)' },
  { suffix: 'B1', type: 'anchor_b', radiusM: 36, title: 'Pull Anchor B-Inner (36m)' },
  { suffix: 'A1', type: 'anchor_a', radiusM: 54, title: 'Pull Anchor A (54m)' },
  { suffix: 'B2', type: 'anchor_b', radiusM: 72, title: 'Pull Anchor B-Outer (72m)' },
];

export function createInitialFoundations(): FoundationRecord[] {
  const list: FoundationRecord[] = [
    {
      id: 'PF-0',
      code: 'PF-0',
      name: 'Principal Foundation (Mast Base)',
      type: 'principal',
      sector: 'CENTER',
      radiusM: 0,
      angleDeg: 0,
      xM: 0,
      zM: 0,
      status: 'not_started',
      checklist: emptyChecklist(),
      actualCementBagsUsed: 0,
      actualSandBagsUsed: 0,
      actualGravelBagsUsed: 0,
      notes: '',
    },
  ];

  for (const sec of SECTORS) {
    const rad = (sec.angleDeg * Math.PI) / 180;
    for (const ring of RADIAL_RING_DEF) {
      const id = `${sec.sector}-${ring.suffix}`;
      // In plan SVG/3D XZ plane: 270° is +Z (down on Ground Anchor Plan), 30° is +X/-Z (upper-right), 150° is -X/-Z (upper-left)
      const xM = Number((ring.radiusM * Math.cos(rad)).toFixed(3));
      const zM = Number((-ring.radiusM * Math.sin(rad)).toFixed(3));
      list.push({
        id,
        code: id,
        name: `${sec.sector} · ${ring.title}`,
        type: ring.type,
        sector: sec.sector,
        radiusM: ring.radiusM,
        angleDeg: sec.angleDeg,
        xM,
        zM,
        status: 'not_started',
        checklist: emptyChecklist(),
        actualCementBagsUsed: 0,
        actualSandBagsUsed: 0,
        actualGravelBagsUsed: 0,
        notes: '',
      });
    }
  }
  return list;
}

export function createInitialInventory(): SiteEquipmentItem[] {
  return [
    { id: 'eq-1', category: 'Tools & Equipment', name: 'Shovel', unit: 'pcs', requiredQty: 7, onHandQty: 0, deliveredQty: 0, remarks: 'Existing shovels damaged/unusable' },
    { id: 'eq-2', category: 'Tools & Equipment', name: 'Concrete Vibrator', unit: 'pc', requiredQty: 1, onHandQty: 1, deliveredQty: 1, remarks: 'Operational' },
    { id: 'eq-3', category: 'Tools & Equipment', name: 'Generator', unit: 'pc', requiredQty: 1, onHandQty: 1, deliveredQty: 1, remarks: 'Needs minor maintenance' },
    { id: 'eq-4', category: 'Tools & Equipment', name: 'Solar Light', unit: 'pcs', requiredQty: 3, onHandQty: 0, deliveredQty: 0, remarks: 'Previous units broken' },
    { id: 'eq-5', category: 'Tools & Equipment', name: 'Water Pump', unit: 'pc', requiredQty: 1, onHandQty: 1, deliveredQty: 1, remarks: 'Assess head/elevation capacity' },
    { id: 'eq-6', category: 'Tools & Equipment', name: 'Level Bar', unit: 'pc', requiredQty: 1, onHandQty: 0, deliveredQty: 0, remarks: 'For rebar and anchor leveling' },
    { id: 'eq-7', category: 'Tools & Equipment', name: 'Bar Cutter / Cutting Machine', unit: 'pc', requiredQty: 1, onHandQty: 0, deliveredQty: 0, remarks: 'Availability to be verified' },
    { id: 'eq-8', category: 'Tools & Equipment', name: 'Compactor Machine', unit: 'pc', requiredQty: 1, onHandQty: 1, deliveredQty: 1, remarks: 'Needs minor maintenance' },
    { id: 'eq-9', category: 'Tools & Equipment', name: '150mm DIA × 3m PVC Pipe (Sample Mold)', unit: 'pc', requiredQty: 1, onHandQty: 0, deliveredQty: 0, remarks: 'Old pipes deformed' },
    { id: 'eq-10', category: 'Tools & Equipment', name: 'Steel Water Drum', unit: 'pcs', requiredQty: 4, onHandQty: 4, deliveredQty: 4, remarks: '1 drum needs epoxy leak repair' },
    { id: 'ppe-1', category: 'PPE', name: 'Hard Hat', unit: 'pcs', requiredQty: 18, onHandQty: 7, deliveredQty: 7, remarks: '10 on-hand, only 7 good quality' },
    { id: 'ppe-2', category: 'PPE', name: 'Safety Boots', unit: 'pairs', requiredQty: 18, onHandQty: 0, deliveredQty: 0, remarks: 'Required for muddy/rainy conditions' },
    { id: 'ppe-3', category: 'PPE', name: 'High-Visibility Vest', unit: 'pcs', requiredQty: 18, onHandQty: 0, deliveredQty: 0, remarks: 'Old vests torn/unusable' },
    { id: 'ppe-4', category: 'PPE', name: 'Work Gloves', unit: 'pairs', requiredQty: 18, onHandQty: 0, deliveredQty: 0, remarks: 'For handling rebar' },
    { id: 'ppe-5', category: 'PPE', name: 'Raincoat', unit: 'pcs', requiredQty: 18, onHandQty: 0, deliveredQty: 0, remarks: 'Maintain pouring during rain' },
    { id: 'bar-1', category: 'Barracks & Warehouse', name: 'Thick Waterproof Covers', unit: 'pcs', requiredQty: 2, onHandQty: 2, deliveredQty: 2, remarks: 'For barracks roofing' },
    { id: 'bar-2', category: 'Barracks & Warehouse', name: 'Blue Tarpaulin (Trapal)', unit: 'pcs', requiredQty: 6, onHandQty: 4, deliveredQty: 4, remarks: 'Barracks & warehouse walls' },
    { id: 'bar-3', category: 'Barracks & Warehouse', name: 'Insulation Foam', unit: 'pcs', requiredQty: 18, onHandQty: 0, deliveredQty: 0, remarks: 'Worker sleeping mats' },
    { id: 'con-1', category: 'Consumables', name: 'Tie Wire', unit: 'kg', requiredQty: 40, onHandQty: 0, deliveredQty: 0, remarks: 'Binding Ø20mm rebar cages' },
    { id: 'con-2', category: 'Consumables', name: 'Phenolic Board (4ft × 8ft)', unit: 'pcs', requiredQty: 32, onHandQty: 0, deliveredQty: 0, remarks: 'Reusable formwork molds' },
  ];
}

export function createSampleMast2Project(): MastProjectState {
  const foundations = createInitialFoundations();

  // Sample realistic initial progress so user can immediately interact with partial/completed states
  const setSampleStatus = (
    id: string,
    status: FoundationStatus,
    pourDate?: string,
    notes?: string
  ) => {
    const f = foundations.find((item) => item.id === id);
    if (!f) return;
    const spec = FOUNDATION_SPECS[f.type];
    f.status = status;
    f.checklist = checklistFromStatus(status);
    if (pourDate) f.pourDate = pourDate;
    if (status === 'completed') f.completedDate = pourDate;
    if (status === 'concreted' || status === 'curing' || status === 'completed') {
      f.actualCementBagsUsed = spec.cementBags;
      f.actualSandBagsUsed = spec.sandBags;
      f.actualGravelBagsUsed = spec.gravelBags;
    }
    if (notes) f.notes = notes;
  };

  setSampleStatus('PF-0', 'completed', '2026-11-08', 'M27 bolt frame checked ±1.5mm; concrete cured and backfilled.');
  setSampleStatus('I-C1', 'completed', '2026-11-10', 'Anchor rod inclination verified; compacted backfill complete.');
  setSampleStatus('II-C1', 'curing', '2026-11-11', 'Curing wet burlap active; ready for backfill after 7 days.');
  setSampleStatus('III-C1', 'rebar_and_anchor', undefined, '50mm lean concrete cured; M_02/M_26 cage & dual anchor rod tied.');
  setSampleStatus('I-B1', 'lean_concrete', undefined, 'Pit bottom compacted; 50mm lean concrete poured.');
  setSampleStatus('II-B1', 'excavated', undefined, 'Pit dimensions 2.0m×2.0m×2.0m verified.');
  setSampleStatus('III-B1', 'excavated', undefined, 'Dewatered and leveled.');

  return {
    projectName: 'Guyed Mast Tower – Mast 2',
    location: 'Mt. Labo, Camarines Norte',
    preparedBy: 'Engr. Christian C. Avila',
    contractor: 'GSL Utility Builders',
    towerHeightM: 120,
    lastUpdated: '2026-11-13',
    reportDetails: {
      logos: createDefaultReportLogos(),
    },
    foundations,
    inventory: createInitialInventory(),
    haulingLogs: [
      {
        id: 'hl-1',
        date: '2026-11-05',
        haulerName: 'Team Mangyan / Pack Horses',
        horsesUsed: 6,
        tripsCount: 4,
        material: 'cement',
        unitLabel: 'bags',
        quantity: 48,
        kgPerUnit: 40,
        totalKg: 1920,
        equivalentCuM: 0,
        destinationFoundationId: 'PF-0',
        weather: 'Cloudy',
        remarks: 'Initial cement batch for PF-0 stored inside temporary warehouse.',
      },
      {
        id: 'hl-2',
        date: '2026-11-06',
        haulerName: 'Team Mangyan / Pack Horses',
        horsesUsed: 8,
        tripsCount: 5,
        material: 'sand',
        unitLabel: 'sacks',
        quantity: 80,
        kgPerUnit: 40,
        totalKg: 3200,
        equivalentCuM: Number((80 / BAGS_PER_CUBIC_METER).toFixed(2)),
        destinationFoundationId: 'PF-0',
        weather: 'Sunny',
        remarks: 'Black sand hauled in 40kg empty cement sacks (2 sacks/horse/trip).',
      },
      {
        id: 'hl-3',
        date: '2026-11-07',
        haulerName: 'Team Labo / Pack Horses',
        horsesUsed: 10,
        tripsCount: 8,
        material: 'gravel',
        unitLabel: 'sacks',
        quantity: 160,
        kgPerUnit: 40,
        totalKg: 6400,
        equivalentCuM: Number((160 / BAGS_PER_CUBIC_METER).toFixed(2)),
        destinationFoundationId: 'PF-0',
        weather: 'Light Rain',
        remarks: 'Crushed gravel for PF-0 structural & lean mix.',
      },
      {
        id: 'hl-4',
        date: '2026-11-09',
        haulerName: 'Team Mangyan / Pack Horses',
        horsesUsed: 7,
        tripsCount: 4,
        material: 'cement',
        unitLabel: 'bags',
        quantity: 56,
        kgPerUnit: 40,
        totalKg: 2240,
        equivalentCuM: 0,
        destinationFoundationId: 'I-C1',
        weather: 'Sunny',
        remarks: 'Cement for Sector I & II Anchor C pours.',
      },
      {
        id: 'hl-5',
        date: '2026-11-09',
        haulerName: 'Team Labo / Pack Horses',
        horsesUsed: 8,
        tripsCount: 5,
        material: 'sand',
        unitLabel: 'sacks',
        quantity: 80,
        kgPerUnit: 40,
        totalKg: 3200,
        equivalentCuM: Number((80 / BAGS_PER_CUBIC_METER).toFixed(2)),
        destinationFoundationId: 'I-C1',
        weather: 'Sunny',
        remarks: 'Black sand for Anchor C foundations.',
      },
      {
        id: 'hl-6',
        date: '2026-11-10',
        haulerName: 'Team Labo / Pack Horses',
        horsesUsed: 9,
        tripsCount: 8,
        material: 'gravel',
        unitLabel: 'sacks',
        quantity: 144,
        kgPerUnit: 40,
        totalKg: 5760,
        equivalentCuM: Number((144 / BAGS_PER_CUBIC_METER).toFixed(2)),
        destinationFoundationId: 'II-C1',
        weather: 'Cloudy',
        remarks: 'Crushed gravel stockpiled at Sector II & III C1 pads.',
      },
      {
        id: 'hl-7',
        date: '2026-11-11',
        haulerName: 'Team Mangyan / Pack Horses',
        horsesUsed: 6,
        tripsCount: 5,
        material: 'cement',
        unitLabel: 'bags',
        quantity: 60,
        kgPerUnit: 40,
        totalKg: 2400,
        equivalentCuM: 0,
        destinationFoundationId: 'STOCKPILE',
        weather: 'Light Rain',
        remarks: 'Wrapped in trapal tarps at main warehouse for Anchor B1 pours.',
      },
    ],
    dailyLogs: [
      {
        id: 'dl-1',
        date: '2026-11-08',
        dayNumber: 15,
        weather: 'Cloudy',
        activitiesSummary: 'Poured Principal Foundation (PF-0) 4.0 cu.m Class AA concrete with vibrator. Verified M27 bolt frame & locating plate alignment (±1.5mm).',
        foundationsWorked: ['PF-0'],
        workers: [
          { role: 'Foreman', count: 1, names: 'Emmarote', hours: 8 },
          { role: 'Mason', count: 4, names: 'R. Santos, J. Cruz, D. Reyes, M. Garcia', hours: 8 },
          { role: 'Laborer', count: 6, names: 'Mixing & concrete bucket crew', hours: 8 },
          { role: 'Horse Hauler', count: 3, names: 'Trail replenishment', hours: 8 },
        ],
        totalWorkers: 14,
        totalManHours: 112,
        materialsOnSite: [
          { id: 'mat-cement', name: 'Cement', unit: 'bags', onSiteQty: 12, deliveredQty: 48, usedTodayQty: 50, remainingQty: 10, remarks: 'PF-0 pour' },
          { id: 'mat-sand', name: 'Sand', unit: 'bags', onSiteQty: 16, deliveredQty: 80, usedTodayQty: 76, remainingQty: 20, remarks: 'PF-0 pour' },
          { id: 'mat-gravel', name: 'Gravel', unit: 'bags', onSiteQty: 20, deliveredQty: 160, usedTodayQty: 152, remainingQty: 28, remarks: 'PF-0 pour' },
          { id: 'mat-main-rebar', name: 'Main Rebar', unit: 'pcs', onSiteQty: 120, deliveredQty: 0, usedTodayQty: 0, remainingQty: 120, remarks: '' },
          { id: 'mat-chair-bar', name: 'Chair Bar', unit: 'pcs', onSiteQty: 32, deliveredQty: 0, usedTodayQty: 0, remainingQty: 32, remarks: '' },
          { id: 'mat-phenolic', name: 'Phenolic', unit: 'pcs', onSiteQty: 20, deliveredQty: 0, usedTodayQty: 4, remainingQty: 16, remarks: 'PF-0 forms' },
        ],
        cementUsedBags: 50,
        sandUsedBags: 76,
        gravelUsedBags: 152,
        issuesOrDelays: 'Brief drizzle at 2:00 PM; tarpaulin shelter deployed over mixer.',
      },
      {
        id: 'dl-2',
        date: '2026-11-10',
        dayNumber: 17,
        weather: 'Sunny',
        activitiesSummary: 'Completed rebar cage, dual Ø25mm ground anchor rod installation, and Class AA concrete pour for I-C1 (Sector I 18m). Prepared II-C1 formwork.',
        foundationsWorked: ['I-C1', 'II-C1'],
        workers: [
          { role: 'Foreman', count: 1, names: 'Emmarote', hours: 8 },
          { role: 'Steelman', count: 3, names: 'Rebar bending & anchor rod alignment', hours: 8 },
          { role: 'Mason', count: 3, names: 'Concrete mixing & finishing', hours: 8 },
          { role: 'Carpenter', count: 2, names: 'Phenolic formwork bracing', hours: 8 },
          { role: 'Laborer', count: 4, names: 'Excavation dewatering & mixing', hours: 8 },
          { role: 'Horse Hauler', count: 4, names: 'Gravel & sand delivery to Sector II', hours: 8 },
        ],
        totalWorkers: 17,
        totalManHours: 136,
        materialsOnSite: [
          { id: 'mat-cement', name: 'Cement', unit: 'bags', onSiteQty: 10, deliveredQty: 56, usedTodayQty: 21, remainingQty: 45, remarks: 'I-C1 pour' },
          { id: 'mat-sand', name: 'Sand', unit: 'bags', onSiteQty: 20, deliveredQty: 80, usedTodayQty: 36, remainingQty: 64, remarks: 'I-C1 pour' },
          { id: 'mat-gravel', name: 'Gravel', unit: 'bags', onSiteQty: 28, deliveredQty: 144, usedTodayQty: 65, remainingQty: 107, remarks: 'I-C1 & II-C1' },
          { id: 'mat-main-rebar', name: 'Main Rebar', unit: 'pcs', onSiteQty: 120, deliveredQty: 0, usedTodayQty: 40, remainingQty: 80, remarks: 'I-C1 cage' },
          { id: 'mat-chair-bar', name: 'Chair Bar', unit: 'pcs', onSiteQty: 32, deliveredQty: 0, usedTodayQty: 8, remainingQty: 24, remarks: 'I-C1 chairs' },
          { id: 'mat-phenolic', name: 'Phenolic', unit: 'pcs', onSiteQty: 16, deliveredQty: 0, usedTodayQty: 2, remainingQty: 14, remarks: 'II-C1 forms' },
        ],
        cementUsedBags: 21,
        sandUsedBags: 36,
        gravelUsedBags: 65,
        issuesOrDelays: 'None.',
      },
      {
        id: 'dl-3',
        date: '2026-11-11',
        dayNumber: 18,
        weather: 'Light Rain',
        activitiesSummary: 'Poured II-C1 (Sector II 18m) concrete. Installed lean concrete and started M_02/M_26 rebar assembly for III-C1.',
        foundationsWorked: ['II-C1', 'III-C1', 'I-B1'],
        workers: [
          { role: 'Foreman', count: 1, names: 'Emmarote', hours: 8 },
          { role: 'Steelman', count: 3, names: 'III-C1 cage & anchor rod tie-in', hours: 8 },
          { role: 'Mason', count: 3, names: 'II-C1 pour & I-B1 lean mix', hours: 8 },
          { role: 'Laborer', count: 5, names: 'Aggregate staging & mixing', hours: 8 },
          { role: 'Horse Hauler', count: 3, names: 'Cement replenishment to warehouse', hours: 8 },
        ],
        totalWorkers: 15,
        totalManHours: 120,
        materialsOnSite: [
          { id: 'mat-cement', name: 'Cement', unit: 'bags', onSiteQty: 45, deliveredQty: 60, usedTodayQty: 21, remainingQty: 84, remarks: 'Covered w/ tarp' },
          { id: 'mat-sand', name: 'Sand', unit: 'bags', onSiteQty: 64, deliveredQty: 0, usedTodayQty: 36, remainingQty: 28, remarks: 'II-C1 pour' },
          { id: 'mat-gravel', name: 'Gravel', unit: 'bags', onSiteQty: 107, deliveredQty: 0, usedTodayQty: 65, remainingQty: 42, remarks: 'II-C1 pour' },
          { id: 'mat-main-rebar', name: 'Main Rebar', unit: 'pcs', onSiteQty: 80, deliveredQty: 0, usedTodayQty: 32, remainingQty: 48, remarks: 'III-C1 cage' },
          { id: 'mat-chair-bar', name: 'Chair Bar', unit: 'pcs', onSiteQty: 24, deliveredQty: 0, usedTodayQty: 4, remainingQty: 20, remarks: 'III-C1 chairs' },
          { id: 'mat-phenolic', name: 'Phenolic', unit: 'pcs', onSiteQty: 14, deliveredQty: 0, usedTodayQty: 2, remainingQty: 12, remarks: 'II-C1 forms' },
        ],
        cementUsedBags: 21,
        sandUsedBags: 36,
        gravelUsedBags: 65,
        issuesOrDelays: 'Muddy haul trail slowed afternoon horse trips; raincoats needed for crew.',
      },
    ],
  };
}

export function createCleanBaselineProject(): MastProjectState {
  return {
    projectName: 'Guyed Mast Tower – Mast 2',
    location: 'Mt. Labo, Camarines Norte',
    preparedBy: 'Engr. Christian C. Avila',
    contractor: 'GSL Utility Builders',
    towerHeightM: 120,
    lastUpdated: todayLocalIso(),
    reportDetails: {
      logos: createDefaultReportLogos(),
    },
    foundations: createInitialFoundations(),
    inventory: createInitialInventory(),
    haulingLogs: [],
    dailyLogs: [],
  };
}

