import type {
  FoundationInspectionItemKey,
  FoundationRecord,
  FoundationSpec,
  FoundationStageChecklist,
  FoundationStatus,
  FoundationType,
  MastProjectState,
  ScheduleActivityItem,
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
    label: '1–2. Excavation & Retrofit',
    shortLabel: 'Excavation & Retrofit',
    color: '#b97a57',
    bgClass: 'bg-stone-100 border-stone-400',
    textClass: 'text-stone-800',
    pct: 15,
  },
  lean_concrete: {
    label: '3. Lean Concrete Pour',
    shortLabel: 'Lean Concrete Pour',
    color: '#facc15',
    bgClass: 'bg-yellow-50 border-yellow-400',
    textClass: 'text-yellow-800',
    pct: 30,
  },
  rebar_and_anchor: {
    label: '4. Rebar, Anchor/Bolt & Forms Install',
    shortLabel: 'Rebar & Forms Install',
    color: '#06b6d4',
    bgClass: 'bg-cyan-50 border-cyan-400',
    textClass: 'text-cyan-800',
    pct: 50,
  },
  formwork: {
    label: '5. Rebar, Anchor/Bolt & Forms Inspect',
    shortLabel: 'Rebar & Forms Inspect',
    color: '#f97316',
    bgClass: 'bg-orange-50 border-orange-400',
    textClass: 'text-orange-800',
    pct: 65,
  },
  concreted: {
    label: '6. Concrete Pouring',
    shortLabel: 'Concrete Pouring',
    color: '#ec4899',
    bgClass: 'bg-pink-50 border-pink-400',
    textClass: 'text-pink-800',
    pct: 80,
  },
  curing: {
    label: '7. Curing',
    shortLabel: 'Curing',
    color: '#8b5cf6',
    bgClass: 'bg-violet-50 border-violet-400',
    textClass: 'text-violet-800',
    pct: 90,
  },
  completed: {
    label: '8. Backfill (Completed)',
    shortLabel: 'Backfill (Done)',
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
      label: '1. Excavation',
      shortLabel: 'Excavation',
    },
    {
      key: 'excavationInspectionDone',
      label: '2. Excavation Inspection and Retrofit',
      shortLabel: 'Excavation Inspection and Retrofit',
    },
    {
      key: 'leanConcretePoured',
      label: '3. Lean Concrete Pour',
      shortLabel: 'Lean Concrete Pour',
    },
    {
      key: 'rebarCageInstalled',
      label: `4. Rebar, ${hardwareLabel}, and Formworks Installation`,
      shortLabel: `Rebar, ${hardwareLabel}, and Formworks Installation`,
    },
    {
      key: 'formworkBraced',
      label: `5. Rebar, ${hardwareLabel}, and Formworks Inspection`,
      shortLabel: `Rebar, ${hardwareLabel}, and Formworks Inspection`,
    },
    {
      key: 'concretePoured',
      label: '6. Concrete Pouring',
      shortLabel: 'Concrete Pouring',
    },
    {
      key: 'curingStarted',
      label: '7. Curing',
      shortLabel: 'Curing',
    },
    {
      key: 'curingAndBackfillDone',
      label: '8. Backfill',
      shortLabel: 'Backfill',
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

/** Returns civil-works QA/QC inspection items with PDF plan measurements for a foundation type. */
export function getFoundationInspectionChecklistItems(
  foundationType: FoundationType
): FoundationInspectionItemDef[] {
  const plan = INSPECTION_PLAN_BY_TYPE[foundationType];
  return [
    {
      key: 'excavation_size_depth',
      description: 'Excavation Size & Depth (vs N.G.L.)',
      planMeasurement: plan.excavation,
    },
    {
      key: 'lean_concrete_50mm',
      description: 'Lean Concrete Bedding (Class A)',
      planMeasurement: plan.leanConcrete,
    },
    {
      key: 'concrete_covers_50mm',
      description: 'Concrete Covers & Rebar Cage Height',
      planMeasurement: plan.coversAndCage,
    },
    {
      key: 'bars_spacing_200mm',
      description: 'Main & Chair Rebar Size, Count, Cut & Spacing',
      planMeasurement: plan.rebarCutAndSpacing,
    },
    {
      key: 'rebar_lap_length',
      description: 'Rebar Lap Lengths (Outer / Inner)',
      planMeasurement: plan.rebarLapLength,
    },
    {
      key: 'anchor_rod_alignment',
      description: plan.anchorHardwareDesc,
      planMeasurement: plan.anchorHardwarePlan,
    },
  ];
}

/** Default pull-anchor QA/QC inspection items (civil works only). */
export const FOUNDATION_INSPECTION_ITEMS: FoundationInspectionItemDef[] =
  getFoundationInspectionChecklistItems('anchor_a');

/** 4ft × 8ft (1.22m × 2.44m) phenolic boards required to shutter all 4 sides of a single pad. */
export const FOUNDATION_PHENOLIC_BOARDS: Record<FoundationType, number> = {
  principal: 4,
  anchor_a: 5,
  anchor_b: 4,
  anchor_c: 2,
};

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
      status: 'excavated',
      checklist: { ...emptyChecklist(), excavationVerified: true },
      actualCementBagsUsed: 0,
      actualSandBagsUsed: 0,
      actualGravelBagsUsed: 0,
      notes: 'Excavation completed by previous contractor. Principal base with M27 embedded bolt frame & locating plate.',
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
        status: 'excavated',
        checklist: { ...emptyChecklist(), excavationVerified: true },
        actualCementBagsUsed: 0,
        actualSandBagsUsed: 0,
        actualGravelBagsUsed: 0,
        notes: 'Excavation completed by previous contractor.',
      });
    }
  }
  return list;
}

export function createInitialSchedule(): ScheduleActivityItem[] {
  return [
    {
      id: 'phase-1',
      stepNo: 1,
      title: 'Mobilization & Site Setup',
      plannedDurationDays: '2 days',
      indicativeTiming: 'Days 1–2',
      workDetails: 'Bring tools and initial supplies; establish safe work areas, storage locations, access routes, and water arrangements.',
      status: 'pending',
      progressPct: 0,
    },
    {
      id: 'phase-2',
      stepNo: 2,
      title: 'Construct Temporary Barracks',
      plannedDurationDays: '3 days',
      indicativeTiming: 'Days 3–5',
      workDetails: 'Build simple timber/tree-post structure with blue-sheet covering; provide sleeping/rest area and basic sanitation.',
      status: 'pending',
      progressPct: 0,
    },
    {
      id: 'phase-3',
      stepNo: 3,
      title: 'Construct Temporary Warehouse',
      plannedDurationDays: '2 days',
      indicativeTiming: 'Days 6–7',
      workDetails: 'Build dry, secure storage area for cement, tools, reinforcement, and site materials.',
      status: 'pending',
      progressPct: 0,
    },
    {
      id: 'phase-4',
      stepNo: 4,
      title: 'Initial & Continuing Horse Material Hauling',
      plannedDurationDays: '8 days initial + parallel',
      indicativeTiming: 'Days 1–8, ongoing',
      workDetails: 'Dedicated horse haulers bring cement, sand, gravel, and rebar up Mt. Labo for the main mast and anchor pours.',
      status: 'pending',
      progressPct: 0,
    },
    {
      id: 'phase-5',
      stepNo: 5,
      title: 'Inspect & Prepare Excavations',
      plannedDurationDays: '4 days',
      indicativeTiming: 'Days 8–11',
      workDetails: 'Check dimensions, levels, bearing conditions (>150 kPa), cleanliness, and drainage; excavation pits already dug.',
      status: 'pending',
      progressPct: 0,
    },
    {
      id: 'phase-6',
      stepNo: 6,
      title: 'Prepare Reinforcement, Anchor Rods & Formwork',
      plannedDurationDays: '6 days',
      indicativeTiming: 'Days 9–14',
      workDetails: 'Cut/bend Ø20mm rebar (M_02 & M_26), prepare phenolic forms, anchor-bolt templates, and Ø25mm ground anchor rods.',
      status: 'pending',
      progressPct: 0,
    },
    {
      id: 'phase-7',
      stepNo: 7,
      title: 'Main Mast Foundation Pour (PF-0)',
      plannedDurationDays: '2 days',
      indicativeTiming: 'Days 15–16',
      workDetails: 'Pre-pour inspection, mix and place Class AA concrete (4.0 cu.m), vibrate, level M27 bolt frame (±3mm), and record pour.',
      status: 'pending',
      progressPct: 0,
    },
    {
      id: 'phase-8',
      stepNo: 8,
      title: 'Initial Curing & Protection of Main Foundation',
      plannedDurationDays: '7 days min',
      indicativeTiming: 'Days 17–23',
      workDetails: 'Protect PF-0 from disturbance, runoff, and moisture loss while crew prepares anchor foundations in parallel.',
      status: 'pending',
      progressPct: 0,
    },
    {
      id: 'phase-9',
      stepNo: 9,
      title: '12 Anchor Foundation Preparations & Pours',
      plannedDurationDays: '42–60 days',
      indicativeTiming: 'Days 17–75',
      workDetails: 'Pour the 12 pull anchor foundations (3×A, 6×B, 3×C) sequentially with lean concrete, rebar cages, and anchor rods.',
      status: 'pending',
      progressPct: 0,
    },
    {
      id: 'phase-10',
      stepNo: 10,
      title: 'Final Curing, Backfilling & Site Cleanup',
      plannedDurationDays: '5–8 days',
      indicativeTiming: 'Days 76–83',
      workDetails: 'Compact backfill soil in layers (>=16 kN/m³), clear waste, and inspect all completed foundations.',
      status: 'pending',
      progressPct: 0,
    },
    {
      id: 'phase-11',
      stepNo: 11,
      title: 'Final Inspection & Handover',
      plannedDurationDays: '2 days',
      indicativeTiming: 'Days 84–85',
      workDetails: 'Verify final foundation dimensions, levels, anchor rod & M27 bolt frame alignments, and as-built civil records.',
      status: 'pending',
      progressPct: 0,
    },
  ];
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

  const schedule = createInitialSchedule();
  schedule[0].status = 'completed';
  schedule[0].progressPct = 100;
  schedule[1].status = 'completed';
  schedule[1].progressPct = 100;
  schedule[2].status = 'completed';
  schedule[2].progressPct = 100;
  schedule[3].status = 'in_progress';
  schedule[3].progressPct = 42;
  schedule[4].status = 'completed';
  schedule[4].progressPct = 100;
  schedule[5].status = 'in_progress';
  schedule[5].progressPct = 45;
  schedule[6].status = 'completed';
  schedule[6].progressPct = 100;
  schedule[7].status = 'in_progress';
  schedule[7].progressPct = 85;
  schedule[8].status = 'in_progress';
  schedule[8].progressPct = 22;

  return {
    projectName: 'Guyed Mast Tower – Mast 2',
    location: 'Mt. Labo, Camarines Norte',
    preparedBy: 'Engr. Christian C. Avila',
    contractor: 'GSL Utility Builders',
    towerHeightM: 120,
    lastUpdated: '2026-11-13',
    foundations,
    schedule,
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
        schedulePhaseId: 'phase-7',
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
        schedulePhaseId: 'phase-9',
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
        schedulePhaseId: 'phase-9',
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
    lastUpdated: new Date().toISOString().slice(0, 10),
    foundations: createInitialFoundations(),
    schedule: createInitialSchedule(),
    inventory: createInitialInventory(),
    haulingLogs: [],
    dailyLogs: [],
  };
}

