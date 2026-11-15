import * as THREE from 'three';
import { FOUNDATION_SPECS, STATUS_META } from '@/entities/project/mast2Baseline';
import {
  ANCHOR_GUY_STAGE_META,
  GUY_LAYER_DEFINITIONS,
  TOWER_SECTION_STATUS_META,
} from '@/entities/project/verticalMastBaseline';
import type {
  AnchorGuyStage,
  ClientFoundationSummary,
  FoundationResolvedDims,
  FoundationStatus,
  GuyLayerRecord,
  GuySectorProgress,
  SectorId,
  TowerSectionStatus,
} from '@/entities/project/types';

export type Tower3DColorMode = 'combined' | 'foundation' | 'mast_guying';
export type Tower3DGuyStrandStatus = 'pending' | 'pulled' | 'terminated' | 'tensioned';
export type GuySectorKey = Exclude<SectorId, 'CENTER'>;

export type Tower3DSelectionTarget =
  | { kind: 'foundation'; foundationId: string }
  | { kind: 'section'; sectionId: string }
  | { kind: 'guy_layer'; guyLayerId: string; sector?: GuySectorKey };

export const SECTOR_ANGLES_DEG: Record<GuySectorKey, number> = {
  I: 30,
  II: 150,
  III: 270,
};

export const GUY_SECTOR_KEYS: GuySectorKey[] = ['I', 'II', 'III'];

/** Radial offset of the Revit gusset clevis pin from tower centerline (m). */
export const GUSSET_PIN_RADIUS_M = 0.46;

/** Dual Ø25mm pull-anchor rod emergence above Natural Ground Level Y=0 (m). */
export const ANCHOR_ROD_EMERGENCE_Y_M = 0.3;

export const GUY_STRAND_COLOR_META: Record<
  Tower3DGuyStrandStatus,
  { color: string; label: string }
> = {
  pending: { color: ANCHOR_GUY_STAGE_META.pending.color, label: 'Pending' },
  pulled: { color: ANCHOR_GUY_STAGE_META.pulled.color, label: 'Strands Pulled' },
  terminated: { color: ANCHOR_GUY_STAGE_META.guy_3.color, label: 'Terminated / Anchored' },
  tensioned: { color: ANCHOR_GUY_STAGE_META.all_tensioned.color, label: 'Tensioned & Verified' },
};

export interface FoundationBoxMetrics {
  dims: FoundationResolvedDims;
  padBottomY: number;
  padTopY: number;
  padCenterY: number;
  leanCenterY: number;
  excavationCenterY: number;
  excavationHeightM: number;
  rodHeadY: number;
  attachmentWorld: THREE.Vector3;
}

/** Resolves footing dimensions using client summary overrides or canonical baseline specs. */
export function computeFoundationResolvedDims(
  foundation: Pick<ClientFoundationSummary, 'type' | 'resolvedDims'>,
): FoundationResolvedDims {
  if (foundation.resolvedDims) {
    return foundation.resolvedDims;
  }
  const spec = FOUNDATION_SPECS[foundation.type];
  return {
    lengthM: spec.lengthM,
    widthM: spec.widthM,
    thicknessM: spec.thicknessM,
    overburdenDepthM: spec.overburdenDepthM,
    leanThicknessM: spec.leanThicknessM,
  };
}

/** Computes exact Three.js Y-up elevation bands relative to N.G.L. (Y = 0). */
export function computeFoundationBoxMetrics(
  foundation: Pick<ClientFoundationSummary, 'type' | 'xM' | 'zM' | 'resolvedDims'>,
): FoundationBoxMetrics {
  const dims = computeFoundationResolvedDims(foundation);
  const padTopY = dims.overburdenDepthM === 0 ? 0 : -dims.overburdenDepthM;
  const padBottomY = padTopY - dims.thicknessM;
  const padCenterY = (padTopY + padBottomY) / 2;
  const leanCenterY = padBottomY - dims.leanThicknessM / 2;
  const excavationHeightM = Math.max(0.05, dims.overburdenDepthM + dims.thicknessM + dims.leanThicknessM);
  const excavationCenterY = -excavationHeightM / 2;
  const rodHeadY = foundation.type === 'principal' ? 0.03 : ANCHOR_ROD_EMERGENCE_Y_M;

  return {
    dims,
    padBottomY,
    padTopY,
    padCenterY,
    leanCenterY,
    excavationCenterY,
    excavationHeightM,
    rodHeadY,
    attachmentWorld: new THREE.Vector3(foundation.xM, rodHeadY, foundation.zM),
  };
}

/**
 * Converts a radial sector angle into the horizontal XZ coordinate aligned with both
 * mast2Baseline.ts (30° = +X/-Z, 150° = -X/-Z, 270° = +Z) and Tower Model.ifc.
 */
export function computeTowerGuyAttachmentVec3(
  elevationM: number,
  sector: GuySectorKey,
  radiusM = GUSSET_PIN_RADIUS_M,
): THREE.Vector3 {
  const rad = (SECTOR_ANGLES_DEG[sector] * Math.PI) / 180;
  return new THREE.Vector3(
    Number((radiusM * Math.cos(rad)).toFixed(4)),
    elevationM,
    Number((-radiusM * Math.sin(rad)).toFixed(4)),
  );
}

/** Classifies a single sector strand's progress flags into one of four visual states. */
export function getGuyStrandStatus(progress: GuySectorProgress): Tower3DGuyStrandStatus {
  if (progress.tensioned) return 'tensioned';
  if (progress.terminated) return 'terminated';
  if (progress.pulled) return 'pulled';
  return 'pending';
}

export function resolveGuyStrandColorHex(progress: GuySectorProgress): string {
  return GUY_STRAND_COLOR_META[getGuyStrandStatus(progress)].color;
}

/** Mirrors VerticalMastElevation2D anchor stage calculation for Mast & Guying mode. */
export function computeAnchorGuyStage(
  anchorId: string,
  sector: SectorId,
  guyLayers: GuyLayerRecord[],
): AnchorGuyStage | null {
  if (sector === 'CENTER') return null;
  const attached = guyLayers.filter((l) => l.anchorIds[sector] === anchorId);
  if (attached.length === 0) return 'pending';

  let anchoredCount = 0;
  let pulledCount = 0;
  let tensionedCount = 0;

  for (const layer of attached) {
    const p = layer.sectors[sector];
    if (p.tensioned) {
      tensionedCount++;
      anchoredCount++;
    } else if (p.terminated) {
      anchoredCount++;
    } else if (p.pulled) {
      pulledCount++;
    }
  }

  if (tensionedCount === attached.length) return 'all_tensioned';
  if (anchoredCount >= 4) return 'guy_4';
  if (anchoredCount === 3) return 'guy_3';
  if (anchoredCount === 2) return 'guy_2';
  if (anchoredCount === 1) return 'guy_1';
  if (pulledCount > 0) return 'pulled';
  return 'pending';
}

/** Updates material opacity and transparent/depthWrite queue flags only when needed. */
export function applyMaterialTransparency(
  mat: THREE.MeshStandardMaterial | THREE.LineBasicMaterial,
  opacity: number,
): void {
  const clamped = Math.max(0, Math.min(1, opacity));
  const shouldBeTransparent = clamped < 0.99;
  const shouldDepthWrite = clamped >= 0.65;
  if (mat.transparent !== shouldBeTransparent || mat.depthWrite !== shouldDepthWrite) {
    mat.transparent = shouldBeTransparent;
    mat.depthWrite = shouldDepthWrite;
    mat.needsUpdate = true;
  }
  mat.opacity = clamped;
}

/** Resolves pad display color according to active 3D legend mode. */
export function resolveFoundationColorHex(
  foundation: Pick<ClientFoundationSummary, 'id' | 'type' | 'sector' | 'status'>,
  mode: Tower3DColorMode,
  guyLayers?: GuyLayerRecord[],
  baseSectionStatus?: TowerSectionStatus,
): string {
  if (mode === 'mast_guying') {
    if (foundation.type === 'principal') {
      if (!baseSectionStatus || baseSectionStatus === 'not_started') {
        return ANCHOR_GUY_STAGE_META.pending.color;
      }
      if (baseSectionStatus === 'plumbed_verified') {
        return ANCHOR_GUY_STAGE_META.all_tensioned.color;
      }
      return TOWER_SECTION_STATUS_META[baseSectionStatus].color;
    }
    if (guyLayers) {
      const stage = computeAnchorGuyStage(foundation.id, foundation.sector, guyLayers);
      if (stage) return ANCHOR_GUY_STAGE_META[stage].color;
    }
  }
  return STATUS_META[foundation.status].color;
}

export function resolveSectionColorHex(
  status: TowerSectionStatus,
  mode: Tower3DColorMode,
): string {
  if (mode === 'foundation') {
    return '#cbd5e1';
  }
  return TOWER_SECTION_STATUS_META[status].color;
}

/**
 * Matches each of the 16 GuyLayerRecord entries to its real Revit IFC gusset Y coordinate
 * when available, falling back to canonical GUY_LAYER_DEFINITIONS elevationM.
 */
export function resolveLayerGussetElevationM(
  layer: Pick<GuyLayerRecord, 'layerNo' | 'sectionId' | 'elevationM'>,
  sortedGlbGussetNodes: { sectionId: string; gussetYM: number }[],
): number {
  const exactMatch = sortedGlbGussetNodes.find((n) => n.sectionId === layer.sectionId);
  if (exactMatch) return exactMatch.gussetYM;

  // Fallback by ascending gusset order (handles L15->S38 and L16->S40 Revit vs table naming)
  const indexMatch = sortedGlbGussetNodes[layer.layerNo - 1];
  if (indexMatch) return indexMatch.gussetYM;

  const def = GUY_LAYER_DEFINITIONS[layer.layerNo - 1];
  return layer.elevationM || def?.elevationM || 0;
}

/** Generates catenary-like curve control points between gusset lug and anchor tie rod. */
export function buildGuyCableCurvePoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  strandStatus: Tower3DGuyStrandStatus,
  segments = 12,
): THREE.Vector3[] {
  const span = start.distanceTo(end);
  const sagRatioByStatus: Record<Tower3DGuyStrandStatus, number> = {
    tensioned: 0.0012,
    terminated: 0.0045,
    pulled: 0.011,
    pending: 0.002,
  };
  const maxSagM = span * sagRatioByStatus[strandStatus];

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = new THREE.Vector3().lerpVectors(start, end, t);
    // Symmetric parabolic drop centered at midpoint t=0.5 (4*t*(1-t) = 1 at mid, 0 at ends)
    pt.y -= 4 * t * (1 - t) * maxSagM;
    points.push(pt);
  }
  return points;
}

/** Creates the translucent Y=0 N.G.L. survey ground disc, concentric rings, and sector lines. */
export function createSurveyDatumGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'SurveyDatumNGL';

  // Translucent ground surface so excavated/backfilled anchor blocks below Y=0 remain visible
  const groundGeom = new THREE.CircleGeometry(86, 72);
  groundGeom.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xeae6dc,
    roughness: 0.95,
    metalness: 0,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const groundMesh = new THREE.Mesh(groundGeom, groundMat);
  groundMesh.position.y = 0;
  group.add(groundMesh);

  // Subtle concentric ring lines for 18m / 36m / 54m / 72m anchor radii
  const ringMat = new THREE.LineBasicMaterial({
    color: 0xa8a29e,
    transparent: true,
    opacity: 0.55,
  });

  [18, 36, 54, 72].forEach((radiusM) => {
    const pts: THREE.Vector3[] = [];
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radiusM, 0.02, -Math.sin(a) * radiusM));
    }
    const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const ringLine = new THREE.Line(lineGeom, ringMat);
    group.add(ringLine);
  });

  // Three radial sector azimuth guide lines (30°, 150°, 270°)
  const axisMat = new THREE.LineBasicMaterial({
    color: 0x78716c,
    transparent: true,
    opacity: 0.45,
  });
  GUY_SECTOR_KEYS.forEach((sec) => {
    const rad = (SECTOR_ANGLES_DEG[sec] * Math.PI) / 180;
    const pts = [
      new THREE.Vector3(0, 0.025, 0),
      new THREE.Vector3(Math.cos(rad) * 78, 0.025, -Math.sin(rad) * 78),
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.Line(geom, axisMat));
  });

  return group;
}

export interface FoundationVisualHandle {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  leanMesh: THREE.Mesh;
  wireframe: THREE.LineSegments;
  hardwareMeshes: THREE.Mesh[];
  metrics: FoundationBoxMetrics;
  foundation: ClientFoundationSummary;
}

/**
 * Builds one interactive 3D foundation footing (`PF-0` or pull anchor) with subsurface pad,
 * lean concrete bed, wireframe edge highlight, and above-ground bolt plate or anchor tie-rod.
 */
export function createFoundationPadVisual(
  foundation: ClientFoundationSummary,
  initialColorHex: string,
): FoundationVisualHandle {
  const metrics = computeFoundationBoxMetrics(foundation);
  const { dims } = metrics;

  const group = new THREE.Group();
  group.name = `Foundation_${foundation.id}`;
  group.position.set(foundation.xM, 0, foundation.zM);

  // Align anchor pad facing directly toward mast center along sector azimuth
  const yawRad =
    foundation.type === 'principal' ? 0 : (foundation.angleDeg * Math.PI) / 180;
  const orientedGroup = new THREE.Group();
  orientedGroup.rotation.y = yawRad;
  group.add(orientedGroup);

  const pickMeta = { pickKind: 'foundation' as const, foundationId: foundation.id };

  // Main reinforced concrete pad / pedestal
  const bodyGeom = new THREE.BoxGeometry(dims.lengthM, dims.thicknessM, dims.widthM);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(initialColorHex),
    roughness: 0.72,
    metalness: 0.08,
  });
  applyMaterialTransparency(bodyMat, 1.0);
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  bodyMesh.position.y = metrics.padCenterY;
  bodyMesh.userData = { ...pickMeta };
  orientedGroup.add(bodyMesh);

  // Swiss technical edge outline around footing block
  const edgesGeom = new THREE.EdgesGeometry(bodyGeom);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x1e293b,
    transparent: true,
    opacity: 0.65,
  });
  const wireframe = new THREE.LineSegments(edgesGeom, edgeMat);
  wireframe.position.copy(bodyMesh.position);
  orientedGroup.add(wireframe);

  // 50mm lean concrete blinding bed under footing
  const leanGeom = new THREE.BoxGeometry(
    dims.lengthM + 0.2,
    Math.max(0.05, dims.leanThicknessM),
    dims.widthM + 0.2,
  );
  const leanMat = new THREE.MeshStandardMaterial({
    color: 0xd6d3d1,
    roughness: 0.92,
    metalness: 0.02,
  });
  const leanMesh = new THREE.Mesh(leanGeom, leanMat);
  leanMesh.position.y = metrics.leanCenterY;
  leanMesh.userData = { ...pickMeta };
  orientedGroup.add(leanMesh);

  // Vertical excavation shaft guide lines up to Y=0 for buried anchors
  if (dims.overburdenDepthM > 0) {
    const pitGeom = new THREE.BoxGeometry(
      dims.lengthM + 0.3,
      metrics.excavationHeightM,
      dims.widthM + 0.3,
    );
    const pitEdges = new THREE.EdgesGeometry(pitGeom);
    const pitMat = new THREE.LineBasicMaterial({
      color: 0xa8a29e,
      transparent: true,
      depthWrite: false,
      opacity: 0.28,
    });
    const pitLines = new THREE.LineSegments(pitEdges, pitMat);
    pitLines.position.y = metrics.excavationCenterY;
    orientedGroup.add(pitLines);
    pitGeom.dispose();
  }

  const hardwareMeshes: THREE.Mesh[] = [];
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.38,
    metalness: 0.65,
  });

  if (foundation.type === 'principal') {
    // 400 x 400 mm locating plate + 3 M27 bolts centered on PF-0 top at Y=0
    const plateGeom = new THREE.BoxGeometry(0.46, 0.04, 0.46);
    const plateMesh = new THREE.Mesh(plateGeom, steelMat);
    plateMesh.position.y = 0.02;
    plateMesh.userData = { ...pickMeta };
    orientedGroup.add(plateMesh);
    hardwareMeshes.push(plateMesh);
  } else {
    // Inclined anchor tie-rod pair rising from concrete block to +0.30m above N.G.L. at (0, +0.30, 0) local
    const startLocal = new THREE.Vector3(0, metrics.padCenterY, 0);
    const endLocal = new THREE.Vector3(0, metrics.rodHeadY, 0);
    const dir = new THREE.Vector3().subVectors(endLocal, startLocal);
    const len = dir.length();

    const rodGeom = new THREE.CylinderGeometry(0.055, 0.065, len, 8);
    const rodMesh = new THREE.Mesh(rodGeom, steelMat);
    rodMesh.position.copy(startLocal).addScaledVector(dir, 0.5);
    rodMesh.userData = { ...pickMeta };
    orientedGroup.add(rodMesh);
    hardwareMeshes.push(rodMesh);

    // Above-ground clevis lug head at +0.30 m N.G.L. where guy cables terminate
    const headGeom = new THREE.CylinderGeometry(0.16, 0.16, 0.14, 12);
    const headMesh = new THREE.Mesh(headGeom, steelMat);
    headMesh.position.set(0, metrics.rodHeadY, 0);
    headMesh.userData = { ...pickMeta };
    orientedGroup.add(headMesh);
    hardwareMeshes.push(headMesh);
  }

  return {
    group,
    bodyMesh,
    leanMesh,
    wireframe,
    hardwareMeshes,
    metrics,
    foundation,
  };
}

/** Updates an existing foundation handle's color and opacity without rebuilding geometry. */
export function updateFoundationPadVisual(
  handle: FoundationVisualHandle,
  foundation: ClientFoundationSummary,
  mode: Tower3DColorMode,
  isSelected: boolean,
  showPendingGhosts: boolean,
  guyLayers?: GuyLayerRecord[],
  baseSectionStatus?: TowerSectionStatus,
): void {
  handle.foundation = foundation;
  const status: FoundationStatus = foundation.status;
  const colorHex = resolveFoundationColorHex(foundation, mode, guyLayers, baseSectionStatus);

  const isMastBasePending =
    mode === 'mast_guying' &&
    foundation.type === 'principal' &&
    (!baseSectionStatus || baseSectionStatus === 'not_started');
  const isAnchorPending =
    mode === 'mast_guying' &&
    foundation.type !== 'principal' &&
    (!guyLayers ||
      computeAnchorGuyStage(foundation.id, foundation.sector, guyLayers) === 'pending');
  const isMuted =
    mode === 'mast_guying'
      ? isMastBasePending || isAnchorPending
      : status === 'not_started';

  const bodyMat = handle.bodyMesh.material as THREE.MeshStandardMaterial;
  bodyMat.color.set(colorHex);
  applyMaterialTransparency(bodyMat, isMuted ? 0.5 : 1.0);
  bodyMat.emissive.set(isSelected ? colorHex : '#000000');
  bodyMat.emissiveIntensity = isSelected ? 0.35 : 0;

  const lineMat = handle.wireframe.material as THREE.LineBasicMaterial;
  lineMat.color.set(isSelected ? 0x0f172a : 0x334155);
  applyMaterialTransparency(lineMat, isSelected ? 1.0 : 0.65);

  handle.group.visible = !(isMuted && !showPendingGhosts);
}

export interface GuyCableVisualHandle {
  mesh: THREE.Mesh;
  layerId: string;
  sector: GuySectorKey;
}

/** Builds a smooth catenary tube mesh connecting a tower gusset plate to an anchor clevis head. */
export function createGuyCableVisual(
  layer: GuyLayerRecord,
  sector: GuySectorKey,
  gussetElevationM: number,
  anchorPos: THREE.Vector3,
): GuyCableVisualHandle {
  const progress = layer.sectors[sector];
  const strandStatus = getGuyStrandStatus(progress);
  const start = computeTowerGuyAttachmentVec3(gussetElevationM, sector);
  const points = buildGuyCableCurvePoints(start, anchorPos, strandStatus);
  const curve = new THREE.CatmullRomCurve3(points);

  const geom = new THREE.TubeGeometry(curve, 14, 0.055, 5, false);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(resolveGuyStrandColorHex(progress)),
    roughness: 0.48,
    metalness: 0.14,
  });
  applyMaterialTransparency(mat, strandStatus === 'pending' ? 0.42 : 1.0);

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = `Cable_${layer.id}_${sector}`;
  mesh.userData = {
    pickKind: 'guy_layer',
    guyLayerId: layer.id,
    sector,
  };

  return { mesh, layerId: layer.id, sector };
}

export function updateGuyCableVisual(
  handle: GuyCableVisualHandle,
  layer: GuyLayerRecord,
  mode: Tower3DColorMode,
  isSelected: boolean,
  showPendingGhosts: boolean,
): void {
  const progress = layer.sectors[handle.sector];
  const strandStatus = getGuyStrandStatus(progress);
  const mat = handle.mesh.material as THREE.MeshStandardMaterial;

  if (mode === 'foundation') {
    mat.color.set('#cbd5e1');
    applyMaterialTransparency(mat, 0.3);
    mat.emissive.set('#000000');
    mat.emissiveIntensity = 0;
    handle.mesh.visible = showPendingGhosts;
    return;
  }

  const colorHex = resolveGuyStrandColorHex(progress);
  mat.color.set(colorHex);
  applyMaterialTransparency(mat, strandStatus === 'pending' ? 0.42 : 1.0);
  mat.emissive.set(isSelected ? colorHex : '#000000');
  mat.emissiveIntensity = isSelected ? 0.42 : 0;
  handle.mesh.visible = !(strandStatus === 'pending' && !showPendingGhosts);
}
