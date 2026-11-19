import { createDefaultReportLogos } from '@/shared/assets/defaultLogos';
import { todayLocalIso } from '@/shared/lib/dateUtils';
import { DEFAULT_SAFETY_OFFICER_NAME } from './materialConstants';
import {
  checklistFromStatus,
  createInitialFoundations,
  createInitialInventory,
} from './mast2Baseline';
import type {
  AnchorGuyStage,
  FoundationType,
  GuyLayerRecord,
  GuyLayerStatus,
  GuySectorProgress,
  MastProjectState,
  SectorId,
  TowerSectionChecklist,
  TowerSectionRecord,
  TowerSectionStatus,
  VerticalMastState,
} from './types';

export const VERTICAL_MAST_DESIGN_SPECS = {
  drawingNo: 'ZT-120-01',
  towerHeightM: 120,
  mastTopElevationM: 123,
  lightningRodHeightM: 6,
  overallPeakHeightM: 129,
  sectionCount: 41,
  sectionLengthM: 3,
  faceWidthMm: 600,
  guyLayerCount: 16,
  guySectorCount: 3,
  totalGuyStrands: 48,
  platformElevationM: 7.0,
  mainLegMaterial: 'Q355B / 20# Seamless Steel Pipe',
  roundSteelMaterial: 'Q235B (Cross Ø16 mm, Diagonal Ø22 mm)',
  bottomLegSpec: 'Ø89×6 mm (3 pcs × 3000 mm)',
  standardLegSpec: 'Ø76×6 mm / Ø76×7.5 mm (3 pcs × 3000 mm)',
  flangeBoltSpec: '12 × M16×70 Grade 6.8 (Ø180 flange / Ø130 BCD)',
  guyCableSpec: 'Ø11.4 mm Galvanized Steel Strand',
  guyHardwareSpec: '100 kN U-Ring + NUT-3 Clamp + -16 mm Guy Plate',
  galvanizingSpec: 'Hot-dip galvanized ≥ 90 μm',
  verticalityTolerance: 'Overall ≤ 1/1500 height (Limit ≤ 1/1000)',
  windDesignParam: '55 m/s (10-min) / 77 m/s (3-s gust) · 1.89 kN/m²',
} as const;

export const SIMPLIFIED_TOWER_SECTION_STATUSES: TowerSectionStatus[] = [
  'plumbed_verified',
  'not_started',
];

export const TOWER_SECTION_STATUS_META: Record<
  TowerSectionStatus,
  {
    label: string;
    shortLabel: string;
    color: string;
    bgClass: string;
    textClass: string;
    pct: number;
  }
> = {
  not_started: {
    label: 'Pending / Not Started',
    shortLabel: 'Pending',
    color: '#94a3b8',
    bgClass: 'bg-slate-100 border-slate-300',
    textClass: 'text-slate-700',
    pct: 0,
  },
  pre_assembled: {
    label: '1. Ground Pre-Assembled',
    shortLabel: 'Pre-Assembled',
    color: '#f59e0b',
    bgClass: 'bg-amber-50 border-amber-300',
    textClass: 'text-amber-800',
    pct: 25,
  },
  hoisted: {
    label: '2. Hoisted / Positioned',
    shortLabel: 'Hoisted',
    color: '#06b6d4',
    bgClass: 'bg-cyan-50 border-cyan-400',
    textClass: 'text-cyan-800',
    pct: 55,
  },
  bolted_torqued: {
    label: 'Bolted / Partial',
    shortLabel: 'Bolted',
    color: '#3b82f6',
    bgClass: 'bg-blue-50 border-blue-400',
    textClass: 'text-blue-800',
    pct: 80,
  },
  plumbed_verified: {
    label: 'Tower Leg Installed',
    shortLabel: 'Installed',
    color: '#10b981',
    bgClass: 'bg-emerald-50 border-emerald-400',
    textClass: 'text-emerald-800',
    pct: 100,
  },
};

export const GUY_LAYER_STATUS_META: Record<
  GuyLayerStatus,
  {
    label: string;
    shortLabel: string;
    color: string;
    bgClass: string;
    textClass: string;
    pct: number;
  }
> = {
  not_started: {
    label: 'Pending / Not Installed',
    shortLabel: 'Pending',
    color: '#94a3b8',
    bgClass: 'bg-slate-100 border-slate-300',
    textClass: 'text-slate-700',
    pct: 0,
  },
  strands_pulled: {
    label: '1. Partial Sectors Installed',
    shortLabel: 'Partial',
    color: '#f97316',
    bgClass: 'bg-orange-50 border-orange-300',
    textClass: 'text-orange-800',
    pct: 35,
  },
  anchored: {
    label: '2. All 3 Sectors Installed',
    shortLabel: 'Anchored',
    color: '#3b82f6',
    bgClass: 'bg-blue-50 border-blue-400',
    textClass: 'text-blue-800',
    pct: 70,
  },
  tensioned_verified: {
    label: '3. All Cables Tensioned',
    shortLabel: 'Tensioned',
    color: '#10b981',
    bgClass: 'bg-emerald-50 border-emerald-400',
    textClass: 'text-emerald-800',
    pct: 100,
  },
};

export const ANCHOR_GUY_STAGE_META: Record<
  AnchorGuyStage,
  {
    label: string;
    shortLabel: string;
    legendLabel: string;
    color: string;
  }
> = {
  pending: {
    label: 'Pending (0/4 Guys)',
    shortLabel: '0 Guys',
    legendLabel: 'Pending (0-Guy Anchored)',
    color: '#94a3b8',
  },
  pulled: {
    label: 'Strands Pulled (Unclamped)',
    shortLabel: 'Pulled',
    legendLabel: 'Strands Pulled (Unclamped)',
    color: '#eab308',
  },
  guy_1: {
    label: '1-Guy Anchored (1/4)',
    shortLabel: '1-Guy',
    legendLabel: '1. 1-Guy Anchored (1/4)',
    color: '#f97316',
  },
  guy_2: {
    label: '2-Guys Anchored (2/4)',
    shortLabel: '2-Guys',
    legendLabel: '2. 2-Guys Anchored (2/4)',
    color: '#06b6d4',
  },
  guy_3: {
    label: '3-Guys Anchored (3/4)',
    shortLabel: '3-Guys',
    legendLabel: '3. 3-Guys Anchored (3/4)',
    color: '#3b82f6',
  },
  guy_4: {
    label: '4-Guys Anchored (4/4)',
    shortLabel: '4-Guys',
    legendLabel: '4. 4-Guys Anchored (4/4)',
    color: '#8b5cf6',
  },
  all_tensioned: {
    label: 'All 4-Guys Tensioned & Verified',
    shortLabel: '4/4 Tensioned',
    legendLabel: '5. All 4-Guys Tensioned (4/4)',
    color: '#10b981',
  },
};

export interface GuyLayerSeedDef {
  layerNo: number;
  id: string;
  elevationM: number;
  sectionNo: number;
  sectionId: string;
  anchorRingType: Exclude<FoundationType, 'principal'>;
  anchorSuffix: 'C1' | 'B1' | 'A1' | 'B2';
  anchorRingLabel: string;
  anchorRadiusM: number;
}

/** Canonical 16 guy cable elevations from ZT-120-01 structure chart. */
export const GUY_LAYER_DEFINITIONS: GuyLayerSeedDef[] = [
  { layerNo: 1, id: 'L01', elevationM: 7.5, sectionNo: 3, sectionId: 'S03', anchorRingType: 'anchor_c', anchorSuffix: 'C1', anchorRingLabel: 'Pull Anchor C (18m)', anchorRadiusM: 18 },
  { layerNo: 2, id: 'L02', elevationM: 15.0, sectionNo: 5, sectionId: 'S05', anchorRingType: 'anchor_c', anchorSuffix: 'C1', anchorRingLabel: 'Pull Anchor C (18m)', anchorRadiusM: 18 },
  { layerNo: 3, id: 'L03', elevationM: 22.5, sectionNo: 8, sectionId: 'S08', anchorRingType: 'anchor_c', anchorSuffix: 'C1', anchorRingLabel: 'Pull Anchor C (18m)', anchorRadiusM: 18 },
  { layerNo: 4, id: 'L04', elevationM: 30.0, sectionNo: 10, sectionId: 'S10', anchorRingType: 'anchor_c', anchorSuffix: 'C1', anchorRingLabel: 'Pull Anchor C (18m)', anchorRadiusM: 18 },
  { layerNo: 5, id: 'L05', elevationM: 37.5, sectionNo: 13, sectionId: 'S13', anchorRingType: 'anchor_b', anchorSuffix: 'B1', anchorRingLabel: 'Pull Anchor B-Inner (36m)', anchorRadiusM: 36 },
  { layerNo: 6, id: 'L06', elevationM: 45.0, sectionNo: 15, sectionId: 'S15', anchorRingType: 'anchor_b', anchorSuffix: 'B1', anchorRingLabel: 'Pull Anchor B-Inner (36m)', anchorRadiusM: 36 },
  { layerNo: 7, id: 'L07', elevationM: 52.5, sectionNo: 18, sectionId: 'S18', anchorRingType: 'anchor_b', anchorSuffix: 'B1', anchorRingLabel: 'Pull Anchor B-Inner (36m)', anchorRadiusM: 36 },
  { layerNo: 8, id: 'L08', elevationM: 60.0, sectionNo: 20, sectionId: 'S20', anchorRingType: 'anchor_b', anchorSuffix: 'B1', anchorRingLabel: 'Pull Anchor B-Inner (36m)', anchorRadiusM: 36 },
  { layerNo: 9, id: 'L09', elevationM: 67.5, sectionNo: 23, sectionId: 'S23', anchorRingType: 'anchor_a', anchorSuffix: 'A1', anchorRingLabel: 'Pull Anchor A (54m)', anchorRadiusM: 54 },
  { layerNo: 10, id: 'L10', elevationM: 75.0, sectionNo: 25, sectionId: 'S25', anchorRingType: 'anchor_a', anchorSuffix: 'A1', anchorRingLabel: 'Pull Anchor A (54m)', anchorRadiusM: 54 },
  { layerNo: 11, id: 'L11', elevationM: 82.5, sectionNo: 28, sectionId: 'S28', anchorRingType: 'anchor_a', anchorSuffix: 'A1', anchorRingLabel: 'Pull Anchor A (54m)', anchorRadiusM: 54 },
  { layerNo: 12, id: 'L12', elevationM: 90.0, sectionNo: 30, sectionId: 'S30', anchorRingType: 'anchor_a', anchorSuffix: 'A1', anchorRingLabel: 'Pull Anchor A (54m)', anchorRadiusM: 54 },
  { layerNo: 13, id: 'L13', elevationM: 97.5, sectionNo: 33, sectionId: 'S33', anchorRingType: 'anchor_b', anchorSuffix: 'B2', anchorRingLabel: 'Pull Anchor B-Outer (72m)', anchorRadiusM: 72 },
  { layerNo: 14, id: 'L14', elevationM: 105.0, sectionNo: 35, sectionId: 'S35', anchorRingType: 'anchor_b', anchorSuffix: 'B2', anchorRingLabel: 'Pull Anchor B-Outer (72m)', anchorRadiusM: 72 },
  { layerNo: 15, id: 'L15', elevationM: 111.0, sectionNo: 37, sectionId: 'S37', anchorRingType: 'anchor_b', anchorSuffix: 'B2', anchorRingLabel: 'Pull Anchor B-Outer (72m)', anchorRadiusM: 72 },
  { layerNo: 16, id: 'L16', elevationM: 117.0, sectionNo: 39, sectionId: 'S39', anchorRingType: 'anchor_b', anchorSuffix: 'B2', anchorRingLabel: 'Pull Anchor B-Outer (72m)', anchorRadiusM: 72 },
];

export function emptySectionChecklist(): TowerSectionChecklist {
  return {
    stagedAndVerified: false,
    hoistedInPosition: false,
    flangeBolted: false,
    guyPlatesOrFixturesReady: false,
    plumbedAndInspected: false,
  };
}

export function sectionChecklistFromStatus(status: TowerSectionStatus): TowerSectionChecklist {
  const rank =
    status === 'plumbed_verified'
      ? 5
      : status === 'bolted_torqued'
        ? 4
        : status === 'hoisted'
          ? 2
          : status === 'pre_assembled'
            ? 1
            : 0;
  return {
    stagedAndVerified: rank >= 1,
    hoistedInPosition: rank >= 2,
    flangeBolted: rank >= 3,
    guyPlatesOrFixturesReady: rank >= 4,
    plumbedAndInspected: rank >= 5,
  };
}

export function deriveSectionStatusFromChecklist(c: TowerSectionChecklist): TowerSectionStatus {
  if (c.plumbedAndInspected) return 'plumbed_verified';
  if (c.flangeBolted && c.guyPlatesOrFixturesReady) return 'bolted_torqued';
  if (c.hoistedInPosition) return 'hoisted';
  if (c.stagedAndVerified) return 'pre_assembled';
  return 'not_started';
}

export interface TowerSectionChecklistStepDef {
  key: keyof TowerSectionChecklist;
  label: string;
}

export function getTowerSectionChecklistSteps(
  section: Pick<TowerSectionRecord, 'kind' | 'hasPlatform' | 'hasLightningRod' | 'guyLayerIds'>
): TowerSectionChecklistStepDef[] {
  const activityLabel =
    section.kind === 'bottom'
      ? 'Tower Leg Installed (Base Section seated on PF-0 & bolted)'
      : section.hasPlatform
        ? 'Tower Leg Installed (incl. 7.0 m Working Platform)'
        : section.hasLightningRod
          ? 'Tower Leg Installed (incl. 6.0 m Lightning Rod)'
          : section.guyLayerIds.length > 0
            ? `Tower Leg Installed (incl. ${section.guyLayerIds.join(', ')} Guy Plates)`
            : 'Tower Leg Installed';

  return [{ key: 'plumbedAndInspected', label: activityLabel }];
}

export interface SectionGuyChecklistItemDef {
  key: 'sector_I' | 'sector_II' | 'sector_III' | 'all_tensioned';
  stepNumber: number;
  label: string;
  sectorKey?: Exclude<SectorId, 'CENTER'>;
}

export function getSectionGuyChecklistItems(
  guyLayer?: GuyLayerRecord
): SectionGuyChecklistItemDef[] {
  if (!guyLayer) return [];
  return [
    {
      key: 'sector_I',
      stepNumber: 2,
      sectorKey: 'I',
      label: `Sector I (30°) · Anchor ${guyLayer.anchorIds.I} installed`,
    },
    {
      key: 'sector_II',
      stepNumber: 3,
      sectorKey: 'II',
      label: `Sector II (150°) · Anchor ${guyLayer.anchorIds.II} installed`,
    },
    {
      key: 'sector_III',
      stepNumber: 4,
      sectorKey: 'III',
      label: `Sector III (270°) · Anchor ${guyLayer.anchorIds.III} installed`,
    },
    {
      key: 'all_tensioned',
      stepNumber: 5,
      label: 'All Cables Tensioned',
    },
  ];
}

export function deriveGuyLayerStatusFromSectors(
  sectors: Record<Exclude<SectorId, 'CENTER'>, GuySectorProgress>
): GuyLayerStatus {
  const list = [sectors.I, sectors.II, sectors.III];
  if (list.every((s) => s.tensioned)) return 'tensioned_verified';
  if (list.every((s) => s.terminated || s.tensioned)) return 'anchored';
  if (list.some((s) => s.pulled || s.terminated || s.tensioned)) return 'strands_pulled';
  return 'not_started';
}

export function guySectorsFromStatus(
  status: GuyLayerStatus
): Record<Exclude<SectorId, 'CENTER'>, GuySectorProgress> {
  const make = (): GuySectorProgress => ({
    pulled: status !== 'not_started',
    terminated: status === 'anchored' || status === 'tensioned_verified',
    tensioned: status === 'tensioned_verified',
  });
  return {
    I: make(),
    II: make(),
    III: make(),
  };
}

export interface VerticalMastInspectionItemDef {
  key: string;
  description: string;
  planMeasurement: string;
}

export function getVerticalMastInspectionChecklistItems(
  targetKind: 'section' | 'guy_layer',
  section?: TowerSectionRecord,
  guyLayer?: GuyLayerRecord
): VerticalMastInspectionItemDef[] {
  if (targetKind === 'guy_layer') {
    const elev = guyLayer ? `${guyLayer.elevationM.toFixed(1)} m` : 'Target elevation';
    const anchorInfo = guyLayer
      ? `${guyLayer.anchorRingLabel} (${guyLayer.anchorIds.I} / ${guyLayer.anchorIds.II} / ${guyLayer.anchorIds.III})`
      : 'Pull Anchors C1/B1/A1/B2';
    return [
      {
        key: 'guy_strand_spec',
        description: 'Guy Strand Diameter & Galvanizing Coat',
        planMeasurement: `Ø11.4 mm steel strand; undamaged hot-dip zinc ≥ 90 μm at ${elev}`,
      },
      {
        key: 'tower_guy_plate_shackle',
        description: 'Tower Section Guy Plate Connection',
        planMeasurement: `230×130×20 mm welded guy plate on ${guyLayer?.sectionId ?? 'section'} with locked shackle pin`,
      },
      {
        key: 'anchor_uring_nut3',
        description: 'Ground Anchor U-Ring & NUT-3 Termination',
        planMeasurement: `100 kN U-Ring + NUT-3 clamp & -16 mm guy plate at ${anchorInfo}`,
      },
      {
        key: 'three_sector_pretension',
        description: 'Balanced 3-Sector Cable Tension & Mast Plumb',
        planMeasurement: '120° balanced tension across Sectors I / II / III; axis plumb ≤ 1/1500',
      },
      {
        key: 'corrosion_and_locknuts',
        description: 'Turnbuckle Locking & Exposed Hardware Protection',
        planMeasurement: 'Double lock-nuts / cotter pins secured; anti-corrosion coat applied',
      },
    ];
  }

  const isBottom = section?.kind === 'bottom';
  const isPlatform = Boolean(section?.hasPlatform);
  const isTop = Boolean(section?.hasLightningRod);
  const hasGuys = (section?.guyLayerIds.length ?? 0) > 0;
  const heightRange = section
    ? `${section.elevationFromM.toFixed(1)}–${section.elevationToM.toFixed(1)} m`
    : '3.0 m module';

  const hardwareItem: VerticalMastInspectionItemDef = isBottom
    ? {
        key: 'section_special_hardware',
        description: 'Base Sphere Seat & PF-0 M27 Bolt Interface',
        planMeasurement: 'SR500 sphere seat flush on 300×300 base plate; PF-0 exposed steel coated w/ Vaseline oil',
      }
    : isPlatform
      ? {
          key: 'section_special_hardware',
          description: '7.0 m Working Platform & Lockable Hatch Cover',
          planMeasurement: 'L50×5/L40×4 platform + movable cover w/ lock; 12×M16×45 & 78×M12×35 bolts tight',
        }
      : isTop
        ? {
            key: 'section_special_hardware',
            description: 'Top Cap & 6.0 m Modular Lightning Rod Installation',
            planMeasurement: '6000 mm (3×2000 mm) lightning rod plumb on -20×450 top plate + down-conductor bond',
          }
        : hasGuys
          ? {
              key: 'section_special_hardware',
              description: 'Guy Wire Attachment Plates & Stiffeners',
              planMeasurement: `3× (230×130×20 mm) guy plates at ${section?.guyElevationsM.map((e) => `${e}m`).join(', ')}; weld h ≥ 4 mm`,
            }
          : {
              key: 'section_special_hardware',
              description: 'Modular Flange & Gusset Weld Integrity',
              planMeasurement: 'Ø180×16 flange plates flush; continuous weld height h ≥ 4 mm',
            };

  return [
    {
      key: 'member_galv_straightness',
      description: 'Member Straightness & Hot-Dip Galvanizing',
      planMeasurement: `Triangular 600×600 mm (${heightRange}); bend ≤ L/1000; zinc coat ≥ 90 μm`,
    },
    {
      key: 'leg_and_bracing_fit',
      description: 'Main Legs, Crosspiece & Inclined Diagonal Bracing',
      planMeasurement: `${section?.legSpec ?? 'Ø76×6 mm'} Q355B legs; Ø16 mm crosspieces @ 500 mm; Ø22 mm diagonals`,
    },
    {
      key: 'flange_bolts_tightness',
      description: 'Flange Joint Splice Bolts & No Field Torch Cutting',
      planMeasurement: `${section?.boltSpec ?? '12 × M16×70 Grade 6.8'}; 1 nut + 1 washer each; no gas/arc hole enlarging`,
    },
    hardwareItem,
    {
      key: 'verticality_plumb_check',
      description: 'Tower Section Verticality & Theodolite Plumb Check',
      planMeasurement: 'Overall axis deviation ≤ 1/1500 of height (Max limit ≤ 1/1000); local bend ≤ 1/50',
    },
  ];
}

export function createInitialVerticalMastState(): VerticalMastState {
  const guyBySectionNo = new Map<number, GuyLayerSeedDef[]>();
  for (const g of GUY_LAYER_DEFINITIONS) {
    const arr = guyBySectionNo.get(g.sectionNo) ?? [];
    arr.push(g);
    guyBySectionNo.set(g.sectionNo, arr);
  }

  const sections: TowerSectionRecord[] = Array.from(
    { length: VERTICAL_MAST_DESIGN_SPECS.sectionCount },
    (_, i) => {
      const sectionNo = i + 1;
      const id = `S${String(sectionNo).padStart(2, '0')}`;
      const elevationFromM = i * 3;
      const elevationToM = (i + 1) * 3;
      const sectionGuys = guyBySectionNo.get(sectionNo) ?? [];
      const hasPlatform = sectionNo === 3; // Working platform at 7m
      const hasLightningRod = sectionNo === 41; // Top 120–123m section (un-guyed) + 6m lightning rod (to 129m)
      const kind =
        sectionNo === 1
          ? 'bottom'
          : hasLightningRod
            ? 'top'
            : hasPlatform
              ? 'platform'
              : sectionGuys.length > 0
                ? 'guy_attach'
                : 'standard';

      const label =
        sectionNo === 1
          ? 'Base Tapered Section (SR500 Ball Seat)'
          : hasLightningRod
            ? 'Top Section (No Guy) + 6m Lightning Rod'
            : hasPlatform
              ? 'Platform Section (Elev. 7.0 m) + L01'
              : sectionGuys.length > 0
                ? `Guy Plate Section (${sectionGuys.map((g) => `${g.elevationM}m`).join(', ')})`
                : 'Standard Modular Section';

      return {
        id,
        sectionNo,
        label,
        kind,
        elevationFromM,
        elevationToM,
        legSpec:
          sectionNo === 1
            ? VERTICAL_MAST_DESIGN_SPECS.bottomLegSpec
            : VERTICAL_MAST_DESIGN_SPECS.standardLegSpec,
        boltSpec: VERTICAL_MAST_DESIGN_SPECS.flangeBoltSpec,
        guyLayerIds: sectionGuys.map((g) => g.id),
        guyElevationsM: sectionGuys.map((g) => g.elevationM),
        hasPlatform,
        hasLightningRod,
        status: 'not_started',
        checklist: emptySectionChecklist(),
        notes: '',
      };
    }
  );

  const guyLayers: GuyLayerRecord[] = GUY_LAYER_DEFINITIONS.map((g) => ({
    id: g.id,
    layerNo: g.layerNo,
    elevationM: g.elevationM,
    sectionId: g.sectionId,
    anchorRingType: g.anchorRingType,
    anchorRingLabel: g.anchorRingLabel,
    anchorRadiusM: g.anchorRadiusM,
    anchorIds: {
      I: `I-${g.anchorSuffix}`,
      II: `II-${g.anchorSuffix}`,
      III: `III-${g.anchorSuffix}`,
    },
    cableSpec: VERTICAL_MAST_DESIGN_SPECS.guyCableSpec,
    status: 'not_started',
    sectors: guySectorsFromStatus('not_started'),
    notes: '',
  }));

  return {
    sections,
    guyLayers,
    platformStatus: 'not_started',
    lightningRodStatus: 'not_started',
  };
}

/** Upgrades earlier 40-section or multi-stage projects to 41 sections (S01–S41) with simplified Installed/Pending states. */
export function normalizeVerticalMastState(vm: VerticalMastState): VerticalMastState {
  const migratedSections = vm.sections.map((sec) => {
    const baseUpdated =
      sec.sectionNo === 40 && sec.hasLightningRod
        ? {
            ...sec,
            kind: sec.guyLayerIds.length > 0 ? ('guy_attach' as const) : ('standard' as const),
            hasLightningRod: false,
            label:
              sec.guyLayerIds.length > 0
                ? `Guy Plate Section (${sec.guyElevationsM.join(', ')}m)`
                : 'Standard Modular Section',
          }
        : sec;

    const normalizedStatus: TowerSectionStatus =
      baseUpdated.status === 'plumbed_verified' ||
      Boolean(baseUpdated.checklist?.plumbedAndInspected)
        ? 'plumbed_verified'
        : 'not_started';

    if (baseUpdated.status === normalizedStatus && baseUpdated === sec) {
      return sec;
    }

    return {
      ...baseUpdated,
      status: normalizedStatus,
      checklist: sectionChecklistFromStatus(normalizedStatus),
    };
  });

  const has41 = migratedSections.some((s) => s.sectionNo === 41);
  if (!has41) {
    migratedSections.push({
      id: 'S41',
      sectionNo: 41,
      label: 'Top Section (No Guy) + 6m Lightning Rod',
      kind: 'top',
      elevationFromM: 120,
      elevationToM: 123,
      legSpec: VERTICAL_MAST_DESIGN_SPECS.standardLegSpec,
      boltSpec: VERTICAL_MAST_DESIGN_SPECS.flangeBoltSpec,
      guyLayerIds: [],
      guyElevationsM: [],
      hasPlatform: false,
      hasLightningRod: true,
      status: 'not_started',
      checklist: emptySectionChecklist(),
      notes: '',
    });
  }

  migratedSections.sort((a, b) => a.sectionNo - b.sectionNo);
  return {
    ...vm,
    sections: migratedSections,
  };
}

function createCompletedSiteFoundationsForTower() {
  return createInitialFoundations().map((f) => ({
    ...f,
    status: 'completed' as const,
    checklist: checklistFromStatus('completed'),
    notes: '',
  }));
}

export function createCleanVerticalMastProject(): MastProjectState {
  const today = todayLocalIso();
  return {
    projectType: 'vertical_mast',
    projectName: '120m Vertical Met Mast Erection',
    location: 'Mt. Labo, Camarines Norte',
    preparedBy: 'Engr. Christian C. Avila',
    contractor: 'GSL Utility Builders',
    towerHeightM: 120,
    lastUpdated: today,
    reportDetails: {
      projectName: '120m Vertical Met Mast Erection',
      projectLocation: 'Mt. Labo, Camarines Norte',
      contractor: 'GSL Utility Builders',
      preparedBy: 'Engr. Christian C. Avila',
      safetyOfficerBy: DEFAULT_SAFETY_OFFICER_NAME,
      documentTitle: 'VERTICAL MAST TOWER ERECTION STATUS REPORT',
      referenceNo: 'ZT-120-01',
      logos: createDefaultReportLogos(),
    },
    foundations: createCompletedSiteFoundationsForTower(),
    verticalMast: createInitialVerticalMastState(),
    inventory: createInitialInventory(),
    haulingLogs: [],
    dailyLogs: [],
  };
}

export function createSampleVerticalMastProject(): MastProjectState {
  const base = createCleanVerticalMastProject();
  const vm = createInitialVerticalMastState();

  // Sample progress: S01-S13 tower legs installed (39m); L01-L03 tensioned, L04 all 3 sectors anchored, L05 Sector I installed
  vm.sections = vm.sections.map((sec) => {
    let status: TowerSectionStatus = 'not_started';
    let notes = '';
    let verticalityMm = '';
    if (sec.sectionNo <= 13) {
      status = 'plumbed_verified';
      verticalityMm = '±4 mm (Pass)';
      notes =
        sec.sectionNo === 1
          ? 'SR500 base sphere seated on PF-0; exposed M27 hardware Vaseline-coated.'
          : sec.hasPlatform
            ? '7.0 m working platform + lockable cover installed and verified.'
            : 'Tower leg installed, flange bolted & plumb checked.';
    }
    return {
      ...sec,
      status,
      checklist: sectionChecklistFromStatus(status),
      verticalityMm: verticalityMm || undefined,
      installedDate: status !== 'not_started' ? '2026-11-12' : undefined,
      verifiedDate: status === 'plumbed_verified' ? '2026-11-13' : undefined,
      notes,
    };
  });

  vm.guyLayers = vm.guyLayers.map((g) => {
    if (g.layerNo === 5) {
      return {
        ...g,
        status: 'strands_pulled',
        sectors: {
          I: { pulled: true, terminated: true, tensioned: false },
          II: { pulled: false, terminated: false, tensioned: false },
          III: { pulled: false, terminated: false, tensioned: false },
        },
        installedDate: '2026-11-13',
        notes: 'Sector I (30°) cable installed at Anchor I-B1; Sectors II & III pending.',
      };
    }
    let status: GuyLayerStatus = 'not_started';
    let notes = '';
    if (g.layerNo <= 3) {
      status = 'tensioned_verified';
      notes = `All 3 sectors tensioned & terminated at ${g.anchorRingLabel}.`;
    } else if (g.layerNo === 4) {
      status = 'anchored';
      notes = 'All 3 sector anchors (C1) installed; final tensioning scheduled.';
    }
    return {
      ...g,
      status,
      sectors: guySectorsFromStatus(status),
      installedDate: status !== 'not_started' ? '2026-11-12' : undefined,
      verifiedDate: status === 'tensioned_verified' ? '2026-11-13' : undefined,
      notes,
    };
  });

  vm.platformStatus = 'verified';

  return {
    ...base,
    verticalMast: vm,
    dailyLogs: [
      {
        id: 'dl-mast-1',
        date: '2026-11-13',
        dayNumber: 5,
        weather: 'Sunny',
        activitiesSummary:
          'Completed plumb verification up to S10 (30m) and tensioned Guy Layers L01–L03 to Inner Anchor Ring C1. Hoisted S13–S14 via gin pole.',
        activities: [
          {
            id: 'act-m1',
            foundationId: 'S08',
            description: 'Flange bolt torque & plumb check S08–S10 (21–30 m)',
            status: 'Completed',
            remarks: '±4 mm deviation (within 1/1500)',
          },
          {
            id: 'act-m2',
            foundationId: 'L03',
            description: 'Guy cable L03 (22.5 m) U-Ring/NUT-3 termination & tensioning @ C1',
            status: 'Completed',
            remarks: '3/3 sectors balanced',
          },
        ],
        foundationsWorked: ['S08', 'S09', 'S10', 'S13', 'S14', 'L03', 'L04'],
        workers: [
          { role: 'Site Engineer', count: 1, names: 'Engr. Christian', hours: 8 },
          { role: 'Foreman', count: 1, names: 'Tower Rigging Lead', hours: 8 },
          { role: 'Skilled', count: 6, names: 'Tower Riggers & Bolt Crew', hours: 8 },
          { role: 'Safety Officer', count: 1, names: DEFAULT_SAFETY_OFFICER_NAME, hours: 8 },
        ],
        totalWorkers: 9,
        totalManHours: 72,
        materialsOnSite: [
          {
            id: 'part-tower-section',
            name: 'Modular Tower Section (3.0m)',
            unit: 'sec',
            onSiteQty: 41,
            deliveredQty: 0,
            usedTodayQty: 13,
            remainingQty: 28,
            remarks: 'S01–S13 erected',
          },
          {
            id: 'part-flange-bolts',
            name: 'Flange Splice Bolt (M16×70)',
            unit: 'pcs',
            onSiteQty: 492,
            deliveredQty: 0,
            usedTodayQty: 156,
            remainingQty: 336,
            remarks: '12 pcs / joint',
          },
          {
            id: 'part-guy-cable',
            name: 'Guy Wire Strand (Ø11.4mm)',
            unit: 'pcs',
            onSiteQty: 48,
            deliveredQty: 0,
            usedTodayQty: 10,
            remainingQty: 38,
            remarks: 'L01–L03 + L05 Sector I',
          },
          {
            id: 'part-turnbuckle',
            name: 'Turnbuckle & Shackle Set',
            unit: 'sets',
            onSiteQty: 48,
            deliveredQty: 0,
            usedTodayQty: 10,
            remainingQty: 38,
            remarks: 'C1 ring + B1 ring',
          },
          {
            id: 'part-uring-nut3',
            name: 'U-Ring & NUT-3 Clamp',
            unit: 'sets',
            onSiteQty: 48,
            deliveredQty: 0,
            usedTodayQty: 10,
            remainingQty: 38,
            remarks: '',
          },
          {
            id: 'part-accessories',
            name: 'Working Platform / Lightning Rod',
            unit: 'sets',
            onSiteQty: 2,
            deliveredQty: 0,
            usedTodayQty: 1,
            remainingQty: 1,
            remarks: '7.0m platform installed',
          },
        ],
        cementUsedBags: 0,
        sandUsedBags: 0,
        gravelUsedBags: 0,
        safetyOfficer: DEFAULT_SAFETY_OFFICER_NAME,
        issuesOrDelays: 'Afternoon gusty wind paused gin-pole lift for 45 mins after 3:00 PM.',
      },
    ],
  };
}

