import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RotateCcw, Eye, EyeOff, Box, AlertTriangle, Download } from 'lucide-react';
import {
  compositeWebglSnapshotWithLegend,
  sanitizeDiagramFilename,
  triggerDataUrlDownload,
  type CanvasLegendGroup,
} from '@/shared/lib/diagramExport';
import { useFeedbackStore } from '@/shared/state/feedbackStore';
import { STATUS_META } from '@/entities/project/mast2Baseline';
import {
  ANCHOR_GUY_STAGE_META,
  TOWER_SECTION_STATUS_META,
} from '@/entities/project/verticalMastBaseline';
import type {
  ClientFoundationSummary,
  FoundationStatus,
  TowerSectionStatus,
  VerticalMastState,
} from '@/entities/project/types';
import {
  GUY_SECTOR_KEYS,
  GUY_STRAND_COLOR_META,
  applyMaterialTransparency,
  buildDynamicStructureKey,
  createFoundationPadVisual,
  createGuyCableVisual,
  createSurveyDatumGroup,
  resolveLayerGussetElevationM,
  resolveSectionColorHex,
  tagSharedMaterial,
  updateFoundationPadVisual,
  updateGuyCableVisual,
  type FoundationVisualHandle,
  type GuyCableVisualHandle,
  type Tower3DColorMode,
  type Tower3DSelectionTarget,
} from './tower3dGeometry';

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'envMap',
  'lightMap',
] as const;

const SHARED_PICK_PROXY_MAT = tagSharedMaterial(
  new THREE.MeshBasicMaterial({ visible: false }),
);

function disposeMaterial(mat: THREE.Material | THREE.Material[] | null | undefined): void {
  if (!mat) return;
  const list = Array.isArray(mat) ? mat : [mat];
  for (const m of list) {
    if (m.userData?.sharedMaterial) continue;
    const record = m as unknown as Record<string, unknown>;
    for (const slot of TEXTURE_SLOTS) {
      const tex = record[slot];
      if (tex instanceof THREE.Texture) {
        tex.dispose();
      }
    }
    m.dispose();
  }
}

function isHierarchyVisible(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (!cur.visible) return false;
    cur = cur.parent;
  }
  return true;
}

interface MastTower3DShowcaseProps {
  foundations: ClientFoundationSummary[];
  verticalMast?: VerticalMastState;
  phaseMode: 'foundation' | 'vertical_mast' | 'both';
  selection: Tower3DSelectionTarget | null;
  onSelect: (target: Tower3DSelectionTarget | null) => void;
}

type CameraPresetKey = 'overview' | 'foundations' | 'elevation' | 'plan';

interface CameraPreset {
  key: CameraPresetKey;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: CameraPreset[] = [
  {
    key: 'overview',
    label: 'Overview',
    position: [128, 104, 148],
    target: [0, 50, 0],
  },
  {
    key: 'foundations',
    label: 'Foundations',
    position: [52, 34, 64],
    target: [0, -1, 0],
  },
  {
    key: 'elevation',
    label: 'Elevation',
    position: [112, 62, 0],
    target: [0, 58, 0],
  },
  {
    key: 'plan',
    label: 'Plan',
    position: [0, 195, 1.5],
    target: [0, 0, 0],
  },
];

const FOUNDATION_LEGEND_ORDER: FoundationStatus[] = [
  'not_started',
  'excavated',
  'excavation_inspected',
  'lean_concrete',
  'rebar_and_anchor',
  'formwork',
  'concreted',
  'curing',
  'completed',
];

const MAST_SECTION_LEGEND_ORDER: TowerSectionStatus[] = [
  'not_started',
  'pre_assembled',
  'hoisted',
  'bolted_torqued',
  'plumbed_verified',
];

interface SectionVisualHandle {
  sectionId: string;
  group: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
}

export const MastTower3DShowcase: React.FC<MastTower3DShowcaseProps> = ({
  foundations,
  verticalMast,
  phaseMode,
  selection,
  onSelect,
}) => {
  const initialMode: Tower3DColorMode =
    phaseMode === 'foundation'
      ? 'foundation'
      : phaseMode === 'vertical_mast'
        ? 'mast_guying'
        : 'combined';

  const [colorMode, setColorMode] = useState<Tower3DColorMode>(initialMode);
  const [showPendingGhosts, setShowPendingGhosts] = useState(true);
  const [activePreset, setActivePreset] = useState<CameraPresetKey>('overview');
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [webglError, setWebglError] = useState<string | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const pushToast = useFeedbackStore((s) => s.pushToast);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const foundationsRef = useRef(foundations);
  const verticalMastRef = useRef(verticalMast);
  const colorModeRef = useRef(colorMode);
  const selectionRef = useRef(selection);
  const showPendingRef = useRef(showPendingGhosts);
  const onSelectRef = useRef(onSelect);

  foundationsRef.current = foundations;
  verticalMastRef.current = verticalMast;
  colorModeRef.current = colorMode;
  selectionRef.current = selection;
  showPendingRef.current = showPendingGhosts;
  onSelectRef.current = onSelect;

  // Imperative scene handles synchronized by lightweight effect updates
  const sceneHandlesRef = useRef<{
    foundationHandles: FoundationVisualHandle[];
    sectionHandles: SectionVisualHandle[];
    cableHandles: GuyCableVisualHandle[];
    rebuildDynamicData: () => void;
    syncAppearances: () => void;
    tweenCamera: (preset: CameraPreset) => void;
    captureSnapshotDataUrl: (
      legendGroups: CanvasLegendGroup[],
      headerLabel?: string
    ) => string | null;
  } | null>(null);

  useEffect(() => {
    setColorMode(
      phaseMode === 'foundation'
        ? 'foundation'
        : phaseMode === 'vertical_mast'
          ? 'mast_guying'
          : 'combined',
    );
  }, [phaseMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      setWebglError(
        err instanceof Error ? err.message : 'WebGL context could not be initialized.',
      );
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const initialWidth = Math.max(320, container.clientWidth);
    const initialHeight = Math.max(460, container.clientHeight);
    renderer.setSize(initialWidth, initialHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#F7F6F2');
    scene.fog = new THREE.Fog('#F7F6F2', 260, 520);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();

    const camera = new THREE.PerspectiveCamera(38, initialWidth / initialHeight, 0.5, 900);
    const defaultPreset = CAMERA_PRESETS[0];
    camera.position.set(...defaultPreset.position);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...defaultPreset.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 8;
    controls.maxDistance = 320;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.update();

    // Neutral studio lighting matching warm drafting palette with IBL
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#d6d3cd', 0.85);
    scene.add(hemiLight);

    const keyDirLight = new THREE.DirectionalLight('#fffdf8', 1.25);
    keyDirLight.position.set(110, 165, 95);
    scene.add(keyDirLight);

    const fillDirLight = new THREE.DirectionalLight('#e2e8f0', 0.65);
    fillDirLight.position.set(-100, 75, -90);
    scene.add(fillDirLight);

    // Subsurface ground plane + polar distance rings (18m / 36m / 54m / 72m)
    const surveyDatum = createSurveyDatumGroup();
    scene.add(surveyDatum);

    const foundationLayerGroup = new THREE.Group();
    foundationLayerGroup.name = 'FoundationLayer';
    scene.add(foundationLayerGroup);

    const mastLayerGroup = new THREE.Group();
    mastLayerGroup.name = 'MastTowerLayer';
    scene.add(mastLayerGroup);

    const cableLayerGroup = new THREE.Group();
    cableLayerGroup.name = 'GuyCableLayer';
    scene.add(cableLayerGroup);

  const mastColliderGroup = new THREE.Group();
    mastColliderGroup.name = 'MastColliderLayer';
    scene.add(mastColliderGroup);

    const foundationHandles: FoundationVisualHandle[] = [];
    const sectionHandles: SectionVisualHandle[] = [];
    const cableHandles: GuyCableVisualHandle[] = [];
    let sortedGlbGussetNodes: { sectionId: string; gussetYM: number }[] = [];

    let disposed = false;
    let tweenActive = false;
    let tweenProgress = 0;
    const tweenStartPos = new THREE.Vector3();
    const tweenEndPos = new THREE.Vector3();
    const tweenStartTarget = new THREE.Vector3();
    const tweenEndTarget = new THREE.Vector3();

    let rafId = 0;
    let needsRender = false;
    let inRenderFrame = false;
    let interacting = false;
    let lastTime = performance.now();

    const scheduleFrame = () => {
      if (rafId !== 0 || disposed || document.hidden) return;
      rafId = requestAnimationFrame(renderFrame);
    };

    const requestRender = () => {
      needsRender = true;
      scheduleFrame();
    };

    const renderFrame = () => {
      rafId = 0;
      if (disposed || document.hidden) return;

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      let animating = false;
      if (tweenActive) {
        tweenProgress = Math.min(1, tweenProgress + dt * 3.2);
        const eased = 1 - Math.pow(1 - tweenProgress, 3);
        camera.position.lerpVectors(tweenStartPos, tweenEndPos, eased);
        controls.target.lerpVectors(tweenStartTarget, tweenEndTarget, eased);
        if (tweenProgress >= 1) {
          tweenActive = false;
        } else {
          animating = true;
        }
        needsRender = true;
      }

      inRenderFrame = true;
      const controlsMoved = controls.update();
      inRenderFrame = false;
      if (controlsMoved) {
        needsRender = true;
      }

      if (needsRender) {
        needsRender = false;
        renderer.render(scene, camera);
      }

      if (interacting || tweenActive || animating || controlsMoved) {
        scheduleFrame();
      }
    };

    const disposeGroupChildren = (grp: THREE.Group) => {
      grp.traverse((obj) => {
        const meshOrLine = obj as THREE.Mesh | THREE.LineSegments;
        if (meshOrLine.geometry) {
          meshOrLine.geometry.dispose();
        }
        disposeMaterial(meshOrLine.material);
      });
      grp.clear();
    };

    const syncAppearances = () => {
      const mode = colorModeRef.current;
      const sel = selectionRef.current;
      const showPending = showPendingRef.current;
      const currentFoundations = foundationsRef.current;
      const currentMast = verticalMastRef.current;
      const sMap = new Map((currentMast?.sections ?? []).map((s) => [s.id, s]));
      const baseSectionStatus: TowerSectionStatus =
        sMap.get('S01')?.status ?? 'not_started';

      // 1. Update Foundations (PF-0 + 12 Pull Anchors)
      const fMap = new Map(currentFoundations.map((f) => [f.id, f]));
      for (const fh of foundationHandles) {
        const latest = fMap.get(fh.foundation.id) ?? fh.foundation;
        const isSelected = sel?.kind === 'foundation' && sel.foundationId === latest.id;
        updateFoundationPadVisual(
          fh,
          latest,
          mode,
          isSelected,
          showPending,
          currentMast?.guyLayers,
          baseSectionStatus,
        );
      }

      // 2. Update 41 Tower Sections (S01..S41)
      for (const sh of sectionHandles) {
        const secRec = sMap.get(sh.sectionId);
        const status: TowerSectionStatus = secRec?.status ?? 'not_started';
        const isSelected = sel?.kind === 'section' && sel.sectionId === sh.sectionId;
        const colorHex = resolveSectionColorHex(status, mode);
        const sectionOpacity =
          mode === 'foundation' ? 0.35 : status === 'not_started' ? 0.72 : 1.0;

        for (const mat of sh.materials) {
          mat.color.set(colorHex);
          applyMaterialTransparency(mat, sectionOpacity);
          mat.emissive.set(isSelected ? colorHex : '#000000');
          mat.emissiveIntensity = isSelected ? 0.42 : 0;
        }
        sh.group.visible =
          mode === 'foundation'
            ? showPending
            : !(status === 'not_started' && !showPending);
      }

      // 3. Update 48 Guy Cables
      const lMap = new Map((currentMast?.guyLayers ?? []).map((l) => [l.id, l]));
      for (const ch of cableHandles) {
        const layer = lMap.get(ch.layerId);
        if (!layer) continue;
        const isSelected =
          sel?.kind === 'guy_layer' &&
          sel.guyLayerId === ch.layerId &&
          (!sel.sector || sel.sector === ch.sector);
        updateGuyCableVisual(ch, layer, mode, isSelected, showPending);
      }

      requestRender();
    };

    const rebuildDynamicData = () => {
      disposeGroupChildren(foundationLayerGroup);
      foundationHandles.length = 0;

      disposeGroupChildren(cableLayerGroup);
      cableHandles.length = 0;

      const currentFoundations = foundationsRef.current;
      const anchorAttachmentMap = new Map<string, THREE.Vector3>();

      for (const f of currentFoundations) {
        const fh = createFoundationPadVisual(f, STATUS_META[f.status].color);
        foundationLayerGroup.add(fh.group);
        foundationHandles.push(fh);
        anchorAttachmentMap.set(f.id, fh.metrics.attachmentWorld);
      }

      const guyLayers = verticalMastRef.current?.guyLayers ?? [];
      for (const layer of guyLayers) {
        const gussetY = resolveLayerGussetElevationM(layer, sortedGlbGussetNodes);
        for (const sec of GUY_SECTOR_KEYS) {
          const anchorId = layer.anchorIds[sec];
          const anchorVec = anchorAttachmentMap.get(anchorId);
          if (!anchorVec) continue;
          const handle = createGuyCableVisual(layer, sec, gussetY, anchorVec);
          cableLayerGroup.add(handle.mesh);
          cableHandles.push(handle);
        }
      }

      syncAppearances();
    };

    // Smooth camera preset tween & interaction listeners for demand-driven rendering
    const handleControlsStart = () => {
      tweenActive = false;
      interacting = true;
      lastTime = performance.now();
      requestRender();
    };
    const handleControlsEnd = () => {
      interacting = false;
      requestRender();
    };
    const handleControlsChange = () => {
      if (inRenderFrame) {
        needsRender = true;
      } else {
        requestRender();
      }
    };
    const handleWindowBlur = () => {
      interacting = false;
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (rafId !== 0) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else {
        lastTime = performance.now();
        requestRender();
      }
    };

    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('end', handleControlsEnd);
    controls.addEventListener('change', handleControlsChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const tweenCamera = (preset: CameraPreset) => {
      tweenStartPos.copy(camera.position);
      tweenEndPos.set(...preset.position);
      tweenStartTarget.copy(controls.target);
      tweenEndTarget.set(...preset.target);
      tweenProgress = 0;
      tweenActive = true;
      lastTime = performance.now();
      requestRender();
    };

    const captureSnapshotDataUrl = (
      legendGroups: CanvasLegendGroup[],
      headerLabel?: string
    ): string | null => {
      if (disposed || !container) return null;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(460, container.clientHeight);
      const prevPixelRatio = renderer.getPixelRatio();
      const exportPixelRatio = Math.max(2, prevPixelRatio);
      try {
        if (exportPixelRatio !== prevPixelRatio) {
          renderer.setPixelRatio(exportPixelRatio);
          renderer.setSize(w, h, false);
        }
        renderer.render(scene, camera);
        return compositeWebglSnapshotWithLegend(
          renderer.domElement,
          legendGroups,
          headerLabel
        );
      } finally {
        if (exportPixelRatio !== prevPixelRatio) {
          renderer.setPixelRatio(prevPixelRatio);
          renderer.setSize(w, h, false);
        }
        renderer.render(scene, camera);
      }
    };

    sceneHandlesRef.current = {
      foundationHandles,
      sectionHandles,
      cableHandles,
      rebuildDynamicData,
      syncAppearances,
      tweenCamera,
      captureSnapshotDataUrl,
    };

    rebuildDynamicData();

    // Load pre-converted Revit IFC -> GLB tower assembly
    const loader = new GLTFLoader();
    const glbUrl = `${import.meta.env.BASE_URL}models/tower-model.glb`;
    loader.load(
      glbUrl,
      (gltf) => {
        if (disposed) {
          gltf.scene.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
            disposeMaterial(m.material);
          });
          return;
        }

        const collectedGussets: { sectionId: string; gussetYM: number }[] = [];
        const sectionNodes: THREE.Object3D[] = [];

        gltf.scene.traverse((obj) => {
          if (/^S\d{2}$/.test(obj.name)) {
            sectionNodes.push(obj);
            const gussetYM = obj.userData?.gussetYM;
            if (typeof gussetYM === 'number') {
              collectedGussets.push({ sectionId: obj.name, gussetYM });
            }
          }
        });

        collectedGussets.sort((a, b) => a.gussetYM - b.gussetYM);
        sortedGlbGussetNodes = collectedGussets;

        mastLayerGroup.add(gltf.scene);
        gltf.scene.updateMatrixWorld(true);
        const colliderBox = new THREE.Box3();
        const colliderSize = new THREE.Vector3();
        const colliderCenter = new THREE.Vector3();

        sectionNodes.forEach((secObj) => {
          const sectionId = secObj.name;
          const secMats: THREE.MeshStandardMaterial[] = [];

          secObj.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              const prevMat = mesh.material;
              const perSectionMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color('#94a3b8'),
                roughness: 0.52,
                metalness: 0.14,
                side: THREE.DoubleSide,
              });
              mesh.material = perSectionMat;
              mesh.userData = {
                ...mesh.userData,
                pickKind: 'section',
                sectionId,
              };
              secMats.push(perSectionMat);

              disposeMaterial(prevMat);
            }
          });

          colliderBox.setFromObject(secObj);
          if (!colliderBox.isEmpty()) {
            colliderBox.getSize(colliderSize);
            colliderBox.getCenter(colliderCenter);
            const colliderGeom = new THREE.BoxGeometry(
              Math.max(0.2, colliderSize.x),
              Math.max(0.2, colliderSize.y),
              Math.max(0.2, colliderSize.z),
            );
            const colliderMesh = new THREE.Mesh(colliderGeom, SHARED_PICK_PROXY_MAT);
            colliderMesh.position.copy(colliderCenter);
            colliderMesh.visible = false;
            colliderMesh.userData = {
              pickKind: 'section',
              sectionId,
              visibilityTarget: secObj,
            };
            mastColliderGroup.add(colliderMesh);
          }

          sectionHandles.push({
            sectionId,
            group: secObj,
            materials: secMats,
          });
        });

        mastColliderGroup.updateMatrixWorld(true);
        setModelStatus('ready');
        rebuildDynamicData();
      },
      undefined,
      () => {
        if (!disposed) {
          setModelStatus('error');
        }
      },
    );

    // Pointer click & hover raycasting (ignores drags > 5px)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownClient = { x: 0, y: 0 };

    const getPickHit = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      const pickRoots: THREE.Object3D[] = [
        foundationLayerGroup,
        cableLayerGroup,
        mastColliderGroup,
      ];
      const intersects = raycaster.intersectObjects(pickRoots, true);
      return (
        intersects.find((hit) => {
          const ud = hit.object.userData;
          if (!ud?.pickKind) return false;
          const visibilityObj =
            (ud.visibilityTarget as THREE.Object3D | undefined) ?? hit.object;
          return isHierarchyVisible(visibilityObj);
        }) ?? null
      );
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownClient = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownClient.x;
      const dy = e.clientY - pointerDownClient.y;
      if (Math.hypot(dx, dy) > 5) return;

      const hit = getPickHit(e.clientX, e.clientY);
      if (!hit) {
        onSelectRef.current(null);
        return;
      }

      const ud = hit.object.userData;
      if (ud.pickKind === 'foundation') {
        onSelectRef.current({ kind: 'foundation', foundationId: ud.foundationId });
      } else if (ud.pickKind === 'section') {
        onSelectRef.current({ kind: 'section', sectionId: ud.sectionId });
      } else if (ud.pickKind === 'guy_layer') {
        onSelectRef.current({
          kind: 'guy_layer',
          guyLayerId: ud.guyLayerId,
          sector: ud.sector,
        });
      }
    };

    let lastHoverCheck = 0;
    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;

      const hit = getPickHit(e.clientX, e.clientY);
      if (!hit) {
        renderer.domElement.style.cursor = 'grab';
        setHoverLabel(null);
        return;
      }
      renderer.domElement.style.cursor = 'pointer';
      const ud = hit.object.userData;
      if (ud.pickKind === 'foundation') {
        setHoverLabel(`Pad ${ud.foundationId}`);
      } else if (ud.pickKind === 'section') {
        setHoverLabel(`Mast Section ${ud.sectionId}`);
      } else if (ud.pickKind === 'guy_layer') {
        setHoverLabel(`Guy ${ud.guyLayerId} · Sector ${ud.sector}`);
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(460, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    requestRender();

    return () => {
      disposed = true;
      sceneHandlesRef.current = null;
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('end', handleControlsEnd);
      controls.removeEventListener('change', handleControlsChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      controls.dispose();

      disposeGroupChildren(foundationLayerGroup);
      disposeGroupChildren(mastColliderGroup);
      disposeGroupChildren(mastLayerGroup);
      disposeGroupChildren(cableLayerGroup);
      disposeGroupChildren(surveyDatum);

      scene.environment = null;
      envRT.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const dynamicStructureKey = useMemo(
    () => buildDynamicStructureKey(foundations, verticalMast),
    [foundations, verticalMast],
  );

  // Rebuild dynamic blocks & cables only when structural geometry/sag class updates
  useEffect(() => {
    sceneHandlesRef.current?.rebuildDynamicData();
  }, [dynamicStructureKey]);

  // Synchronize materials, emissive highlights, and ghosts when view or status state changes
  useEffect(() => {
    sceneHandlesRef.current?.syncAppearances();
  }, [foundations, verticalMast, colorMode, selection, showPendingGhosts]);

  const handlePresetClick = (preset: CameraPreset) => {
    setActivePreset(preset.key);
    sceneHandlesRef.current?.tweenCamera(preset);
  };

  const handleDownload3DPng = () => {
    const modeLabel =
      colorMode === 'combined'
        ? 'Combined'
        : colorMode === 'foundation'
          ? 'Foundations Only'
          : 'Mast & Guying';
    const presetLabel =
      CAMERA_PRESETS.find((p) => p.key === activePreset)?.label ?? activePreset;
    const headerLabel = `120m Guyed Mast Tower 3D Model — ${modeLabel} (${presetLabel} View)`;
    const dataUrl = sceneHandlesRef.current?.captureSnapshotDataUrl(
      legendSections,
      headerLabel
    );
    if (!dataUrl) {
      pushToast({
        tone: 'error',
        message: 'Could not capture 3D viewport image.',
      });
      return;
    }
    const filename = sanitizeDiagramFilename(
      `mast-tower-3d-${activePreset}-${colorMode}`,
      'png'
    );
    triggerDataUrlDownload(dataUrl, filename);
    pushToast({
      tone: 'success',
      message: `Downloaded ${filename}`,
      durationMs: 2800,
    });
  };

  const legendSections = useMemo(() => {
    const groups: {
      title: string;
      items: { key: string; color: string; label: string }[];
    }[] = [];

    if (colorMode === 'combined' || colorMode === 'foundation') {
      groups.push({
        title: 'Foundations & Anchors',
        items: FOUNDATION_LEGEND_ORDER.map((statusKey) => ({
          key: `f-${statusKey}`,
          color: STATUS_META[statusKey].color,
          label: STATUS_META[statusKey].shortLabel,
        })),
      });
    }

    if (colorMode === 'combined' || colorMode === 'mast_guying') {
      groups.push({
        title: 'Mast Sections (S01–S41)',
        items: MAST_SECTION_LEGEND_ORDER.map((statusKey) => ({
          key: `m-${statusKey}`,
          color: TOWER_SECTION_STATUS_META[statusKey].color,
          label: TOWER_SECTION_STATUS_META[statusKey].shortLabel,
        })),
      });
      groups.push({
        title: 'Guy Strands (48 Cables)',
        items: (['pending', 'pulled', 'terminated', 'tensioned'] as const).map((k) => ({
          key: `g-${k}`,
          color: GUY_STRAND_COLOR_META[k].color,
          label: GUY_STRAND_COLOR_META[k].label,
        })),
      });
    }

    if (colorMode === 'mast_guying') {
      groups.push({
        title: 'Anchor Guy Stage',
        items: (
          ['pending', 'pulled', 'guy_1', 'guy_2', 'guy_3', 'guy_4', 'all_tensioned'] as const
        ).map((stage) => ({
          key: `ag-${stage}`,
          color: ANCHOR_GUY_STAGE_META[stage].color,
          label: ANCHOR_GUY_STAGE_META[stage].shortLabel,
        })),
      });
    }

    return groups;
  }, [colorMode]);

  if (webglError) {
    return (
      <div className="border border-slate-300 bg-[#F7F6F2] p-8 text-center">
        <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-900">
          3D Viewport Unavailable on This Device
        </p>
        <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
          {webglError} Please switch to the 2D Foundation Plan or Mast &amp; Guying elevation
          tabs above to inspect live field progress.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-slate-300 bg-[#F7F6F2]">
      {/* Swiss drafting toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-300 bg-[#F3F2EE]">
        <div className="flex flex-wrap items-center gap-1">
          {phaseMode === 'both' && (
            <>
              {(
                [
                  { id: 'combined', label: 'Combined' },
                  { id: 'foundation', label: 'Foundations Only' },
                  { id: 'mast_guying', label: 'Mast & Guying' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setColorMode(m.id)}
                  className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider border transition-colors ${
                    colorMode === m.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
              <span className="h-4 w-px bg-slate-300 mx-1" aria-hidden />
            </>
          )}

          {CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => handlePresetClick(preset)}
              className={`px-2 py-1 text-[11px] font-medium border transition-colors ${
                activePreset === preset.key
                  ? 'bg-slate-200 text-slate-900 border-slate-500'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPendingGhosts((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
            title="Toggle unstarted sections and pending cables"
          >
            {showPendingGhosts ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {showPendingGhosts ? 'Showing Pending' : 'Built Only'}
          </button>
          <button
            type="button"
            onClick={() => handlePresetClick(CAMERA_PRESETS[0])}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 cursor-pointer"
            title="Reset 3D camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleDownload3DPng}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-slate-900 text-white border border-slate-900 hover:bg-slate-800 cursor-pointer print:hidden"
            title="Download high-resolution PNG snapshot of current 3D view with legend"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PNG</span>
          </button>
        </div>
      </div>

      {/* Interactive WebGL canvas */}
      <div className="relative w-full h-[500px] sm:h-[560px]">
        <div ref={containerRef} className="w-full h-full" />

        {/* Coordinate & status HUD overlay */}
        <div className="pointer-events-none absolute top-3 left-3 right-3 flex flex-col items-start gap-1">
          <div className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 bg-white/90 border border-slate-300 text-[10px] font-mono uppercase tracking-wider text-slate-700 truncate">
            <Box className="w-3 h-3 text-slate-900 shrink-0" />
            <span className="hidden sm:inline truncate">
              Revit 41-Section Mast + 13 Footings + 48 Guys · N.G.L. Y = 0.00m
            </span>
            <span className="sm:hidden truncate">
              41-Sec Mast · 13 Pads · 48 Guys
            </span>
          </div>
          {modelStatus === 'loading' && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 text-white text-[10px] font-mono uppercase tracking-wider">
              Loading 3D Mast CAD Assembly...
            </div>
          )}
          {modelStatus === 'error' && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 border border-amber-400 text-amber-900 text-[10px] font-mono uppercase tracking-wider">
              Tower .glb unavailable — showing foundations &amp; guy geometry
            </div>
          )}
        </div>

        {/* Hover badge & interaction hint */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider">
          <span className="px-2 py-1 bg-white/85 border border-slate-300 text-slate-600 truncate">
            <span className="hidden sm:inline">
              Drag Orbit · Scroll Zoom · Right-Drag Pan · Click Pad / Section / Guy
            </span>
            <span className="sm:hidden">Drag · Pinch · Tap</span>
          </span>
          {hoverLabel && (
            <span className="px-2.5 py-1 bg-slate-900 text-white border border-slate-900 truncate max-w-[48%] sm:max-w-none shrink-0">
              {hoverLabel}
            </span>
          )}
        </div>
      </div>

      {/* Sharp hairline legend footer */}
      <div className="border-t border-slate-300 bg-white px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {legendSections.map((group) => (
          <div key={group.title}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {group.title}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {group.items.map((item) => (
                <span
                  key={item.key}
                  className="inline-flex items-center gap-1.5 text-[11px] text-slate-700"
                >
                  <span
                    className="w-2.5 h-2.5 inline-block border border-slate-400/50 shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
