import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildClientShowcaseDto } from '../src/entities/project/clientProjection';
import {
  FOUNDATION_SPECS,
  STATUS_META,
  createInitialFoundations,
  createSampleMast2Project,
} from '../src/entities/project/mast2Baseline';
import {
  ANCHOR_GUY_STAGE_META,
  TOWER_SECTION_STATUS_META,
  createInitialVerticalMastState,
} from '../src/entities/project/verticalMastBaseline';
import type { SavedProjectRecord } from '../src/entities/project/types';
import {
  ANCHOR_ROD_EMERGENCE_Y_M,
  GUSSET_PIN_RADIUS_M,
  GUY_SECTOR_KEYS,
  GUY_STRAND_COLOR_META,
  SECTOR_ANGLES_DEG,
  applyMaterialTransparency,
  buildGuyCableCurvePoints,
  computeAnchorGuyStage,
  computeFoundationBoxMetrics,
  computeTowerGuyAttachmentVec3,
  createFoundationPadVisual,
  createGuyCableVisual,
  resolveFoundationColorHex,
  resolveGuyStrandColorHex,
  resolveLayerGussetElevationM,
  resolveSectionColorHex,
  updateFoundationPadVisual,
  updateGuyCableVisual,
} from '../src/widgets/client-showcase/tower3dGeometry';

describe('Tower 3D Geometry & Legend Color Mapping', () => {
  it('resolves exact XZ coordinates, subsurface elevations, and custom overrides for all 13 foundations', () => {
    const foundations = createInitialFoundations();
    expect(foundations).toHaveLength(13);

    const baseState = createSampleMast2Project();
    baseState.foundations = foundations;
    baseState.verticalMast = createInitialVerticalMastState();

    // Custom override on II-C1 should propagate into ClientFoundationSummary.resolvedDims
    const customC1 = baseState.foundations.find((f) => f.id === 'II-C1')!;
    customC1.customSpecs = {
      lengthM: 1.8,
      widthM: 1.8,
      thicknessM: 0.9,
      overburdenDepthM: 1.1,
      leanThicknessM: 0.08,
    };

    const record: SavedProjectRecord = {
      id: 'p-3d',
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
      version: 1,
      clientSettings: { enabled: true, featured: true, phaseMode: 'both', showPhotos: false, showReports: false },
      state: baseState,
    };

    const dto = buildClientShowcaseDto(record);
    expect(dto.foundations).toHaveLength(13);

    const pf0 = computeFoundationBoxMetrics(dto.foundations.find((f) => f.id === 'PF-0')!);
    expect(pf0.dims).toEqual({
      lengthM: FOUNDATION_SPECS.principal.lengthM,
      widthM: FOUNDATION_SPECS.principal.widthM,
      thicknessM: FOUNDATION_SPECS.principal.thicknessM,
      overburdenDepthM: FOUNDATION_SPECS.principal.overburdenDepthM,
      leanThicknessM: FOUNDATION_SPECS.principal.leanThicknessM,
    });
    expect(pf0.padTopY).toBe(0);
    expect(pf0.padBottomY).toBe(-1);
    expect(pf0.attachmentWorld.x).toBe(0);
    expect(pf0.attachmentWorld.z).toBe(0);

    const iia1 = computeFoundationBoxMetrics(dto.foundations.find((f) => f.id === 'I-A1')!);
    expect(iia1.padTopY).toBeCloseTo(-0.6, 5);
    expect(iia1.padBottomY).toBeCloseTo(-2.0, 5);
    expect(iia1.rodHeadY).toBe(ANCHOR_ROD_EMERGENCE_Y_M);
    expect(Math.hypot(iia1.attachmentWorld.x, iia1.attachmentWorld.z)).toBeCloseTo(54, 2);

    const iic1 = computeFoundationBoxMetrics(dto.foundations.find((f) => f.id === 'II-C1')!);
    expect(iic1.dims.lengthM).toBe(1.8);
    expect(iic1.dims.thicknessM).toBe(0.9);
    expect(iic1.padTopY).toBeCloseTo(-1.1, 5);
    expect(iic1.padBottomY).toBeCloseTo(-2.0, 5);
  });

  it('connects all 48 guy cables from exact sector gusset positions to anchor rod emergence heads', () => {
    const foundations = createInitialFoundations();
    const vm = createInitialVerticalMastState();
    const anchorMap = new Map(
      foundations.map((f) => [f.id, computeFoundationBoxMetrics(f).attachmentWorld]),
    );

    // Simulate real GLB gusset elevation extraction (16 gusset nodes incl. S38 & S40)
    const glbGussets = [
      { sectionId: 'S03', gussetYM: 7.5632 },
      { sectionId: 'S05', gussetYM: 15.0332 },
      { sectionId: 'S08', gussetYM: 22.7217 },
      { sectionId: 'S10', gussetYM: 30.1916 },
      { sectionId: 'S13', gussetYM: 37.8802 },
      { sectionId: 'S15', gussetYM: 45.3501 },
      { sectionId: 'S18', gussetYM: 53.0387 },
      { sectionId: 'S20', gussetYM: 60.5086 },
      { sectionId: 'S23', gussetYM: 68.1971 },
      { sectionId: 'S25', gussetYM: 75.6671 },
      { sectionId: 'S28', gussetYM: 83.3556 },
      { sectionId: 'S30', gussetYM: 90.8255 },
      { sectionId: 'S33', gussetYM: 98.5141 },
      { sectionId: 'S35', gussetYM: 105.984 },
      { sectionId: 'S38', gussetYM: 113.6726 },
      { sectionId: 'S40', gussetYM: 120.8174 },
    ];

    let cableCount = 0;
    for (const layer of vm.guyLayers) {
      const gussetY = resolveLayerGussetElevationM(layer, glbGussets);
      expect(gussetY).toBeGreaterThan(7);

      for (const sec of GUY_SECTOR_KEYS) {
        const start = computeTowerGuyAttachmentVec3(gussetY, sec);
        const end = anchorMap.get(layer.anchorIds[sec]);
        expect(end).toBeDefined();
        expect(end!.y).toBe(ANCHOR_ROD_EMERGENCE_Y_M);

        // Sector angle alignment check: radial unit vectors match between gusset lug and anchor
        const gussetAngle = Math.atan2(-start.z, start.x);
        const anchorAngle = Math.atan2(-end!.z, end!.x);
        const expectedRad = (SECTOR_ANGLES_DEG[sec] * Math.PI) / 180;
        expect(Math.cos(gussetAngle - anchorAngle)).toBeCloseTo(1, 3);
        expect(Math.cos(gussetAngle - expectedRad)).toBeCloseTo(1, 3);
        expect(Math.hypot(start.x, start.z)).toBeCloseTo(GUSSET_PIN_RADIUS_M, 3);

        const curvePoints = buildGuyCableCurvePoints(start, end!, 'tensioned', 10);
        expect(curvePoints).toHaveLength(11);
        expect(curvePoints[0].distanceTo(start)).toBeCloseTo(0, 5);
        expect(curvePoints[10].distanceTo(end!)).toBeCloseTo(0, 5);
        // Midpoint exhibits gentle positive sag beneath straight chord
        const chordMidY = (start.y + end!.y) / 2;
        expect(curvePoints[5].y).toBeLessThan(chordMidY);

        cableCount++;
      }
    }

    expect(cableCount).toBe(48);
    // L15 & L16 cleanly snap to GLB's 15th/16th gussets (S38/S40)
    expect(resolveLayerGussetElevationM(vm.guyLayers[14], glbGussets)).toBeCloseTo(113.6726, 4);
    expect(resolveLayerGussetElevationM(vm.guyLayers[15], glbGussets)).toBeCloseTo(120.8174, 4);
  });

  it('matches foundation, mast section, anchor guy stage, and strand colors strictly to baseline legends', () => {
    const foundations = createInitialFoundations();
    const vm = createInitialVerticalMastState();

    const a1 = foundations.find((f) => f.id === 'I-A1')!;
    a1.status = 'concreted';
    expect(resolveFoundationColorHex(a1, 'combined')).toBe(STATUS_META.concreted.color);
    expect(resolveFoundationColorHex(a1, 'foundation')).toBe(STATUS_META.concreted.color);

    // Mark L09 & L10 Sector I as anchored (terminated), L11 pulled
    vm.guyLayers[8].sectors.I = { pulled: true, terminated: true, tensioned: false };
    vm.guyLayers[9].sectors.I = { pulled: true, terminated: true, tensioned: true };
    vm.guyLayers[10].sectors.I = { pulled: true, terminated: false, tensioned: false };

    const stage = computeAnchorGuyStage('I-A1', 'I', vm.guyLayers);
    expect(stage).toBe('guy_2');
    expect(resolveFoundationColorHex(a1, 'mast_guying', vm.guyLayers)).toBe(
      ANCHOR_GUY_STAGE_META.guy_2.color,
    );

    expect(resolveSectionColorHex('hoisted', 'combined')).toBe(
      TOWER_SECTION_STATUS_META.hoisted.color,
    );
    expect(resolveSectionColorHex('plumbed_verified', 'mast_guying')).toBe(
      TOWER_SECTION_STATUS_META.plumbed_verified.color,
    );
    expect(resolveSectionColorHex('plumbed_verified', 'foundation')).toBe('#cbd5e1');

    expect(resolveGuyStrandColorHex({ pulled: false, terminated: false, tensioned: false })).toBe(
      GUY_STRAND_COLOR_META.pending.color,
    );
    expect(resolveGuyStrandColorHex({ pulled: true, terminated: false, tensioned: false })).toBe(
      GUY_STRAND_COLOR_META.pulled.color,
    );
    expect(resolveGuyStrandColorHex({ pulled: true, terminated: true, tensioned: false })).toBe(
      GUY_STRAND_COLOR_META.terminated.color,
    );
    expect(resolveGuyStrandColorHex({ pulled: true, terminated: true, tensioned: true })).toBe(
      GUY_STRAND_COLOR_META.tensioned.color,
    );
  });

  it('colors PF-0 from S01 stage in mast_guying mode and toggles opaque/transparent depthWrite flags cleanly', () => {
    const foundations = createInitialFoundations();
    const vm = createInitialVerticalMastState();
    const pf0 = foundations.find((f) => f.id === 'PF-0')!;
    pf0.status = 'completed';

    // In mast_guying mode, PF-0 reflects S01 erection stage rather than civil completed status
    expect(resolveFoundationColorHex(pf0, 'mast_guying', vm.guyLayers)).toBe(
      ANCHOR_GUY_STAGE_META.pending.color,
    );
    expect(resolveFoundationColorHex(pf0, 'mast_guying', vm.guyLayers, 'not_started')).toBe(
      ANCHOR_GUY_STAGE_META.pending.color,
    );
    expect(resolveFoundationColorHex(pf0, 'mast_guying', vm.guyLayers, 'hoisted')).toBe(
      TOWER_SECTION_STATUS_META.hoisted.color,
    );
    expect(
      resolveFoundationColorHex(pf0, 'mast_guying', vm.guyLayers, 'plumbed_verified'),
    ).toBe(ANCHOR_GUY_STAGE_META.all_tensioned.color);

    // Civil modes still honor PF-0 civil completion color
    expect(resolveFoundationColorHex(pf0, 'foundation', vm.guyLayers, 'not_started')).toBe(
      STATUS_META.completed.color,
    );

    const mat = new THREE.MeshStandardMaterial({ color: '#10b981' });
    applyMaterialTransparency(mat, 1.0);
    expect(mat.transparent).toBe(false);
    expect(mat.depthWrite).toBe(true);
    expect(mat.opacity).toBe(1);

    applyMaterialTransparency(mat, 0.72);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.72, 5);

    applyMaterialTransparency(mat, 0.35);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.opacity).toBeCloseTo(0.35, 5);

    // Pad visual reflects mast_guying pending visibility when showPendingGhosts=false
    const pf0Handle = createFoundationPadVisual(pf0, STATUS_META.completed.color);
    updateFoundationPadVisual(
      pf0Handle,
      pf0,
      'mast_guying',
      false,
      false,
      vm.guyLayers,
      'not_started',
    );
    expect(pf0Handle.group.visible).toBe(false);

    updateFoundationPadVisual(
      pf0Handle,
      pf0,
      'mast_guying',
      true,
      true,
      vm.guyLayers,
      'plumbed_verified',
    );
    expect(pf0Handle.group.visible).toBe(true);
    const bodyMat = pf0Handle.bodyMesh.material as THREE.MeshStandardMaterial;
    expect(bodyMat.transparent).toBe(false);
    expect(bodyMat.opacity).toBe(1);
    expect(bodyMat.color.getHexString()).toBe(
      ANCHOR_GUY_STAGE_META.all_tensioned.color.slice(1).toLowerCase(),
    );

    // Guy cable active vs pending opacity & metalness
    const anchorPos = computeFoundationBoxMetrics(
      foundations.find((f) => f.id === 'I-A1')!,
    ).attachmentWorld;
    const cable = createGuyCableVisual(vm.guyLayers[0], 'I', 7.56, anchorPos);
    const cableMat = cable.mesh.material as THREE.MeshStandardMaterial;
    expect(cableMat.metalness).toBeCloseTo(0.14, 2);
    expect(cableMat.transparent).toBe(true);
    expect(cableMat.depthWrite).toBe(false);

    vm.guyLayers[0].sectors.I = { pulled: true, terminated: true, tensioned: true };
    updateGuyCableVisual(cable, vm.guyLayers[0], 'mast_guying', false, true);
    expect(cableMat.transparent).toBe(false);
    expect(cableMat.depthWrite).toBe(true);
    expect(cableMat.opacity).toBe(1);
  });
});
