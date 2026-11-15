import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebIFC from 'web-ifc';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const INPUT_IFC_PATH = path.join(ROOT_DIR, 'src', 'assets', 'defaults', 'Tower Model.ifc');
const OUTPUT_GLB_PATH = path.join(ROOT_DIR, 'public', 'models', 'tower-model.glb');

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Extracts all sub-geometries of an IFC proxy into world coordinates (Y-up meters,
 * directly matching web-ifc's internal matrix convention).
 */
function extractProxyData(api, modelID, flatMesh) {
  const line = api.GetLine(modelID, flatMesh.expressID);
  const fullName = line?.Name?.value || `Proxy_${flatMesh.expressID}`;
  const nameParts = fullName.split(':');
  const familyName =
    nameParts.length >= 2 ? `${nameParts[0]}:${nameParts[1]}` : fullName;

  let minY = Infinity;
  let maxY = -Infinity;
  const parts = [];

  for (let i = 0; i < flatMesh.geometries.size(); i++) {
    const pg = flatMesh.geometries.get(i);
    const geom = api.GetGeometry(modelID, pg.geometryExpressID);
    const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
    const indices = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
    const mat = Array.from(pg.flatTransformation);

    // Normal 3x3 cofactor/inverse-transpose (uniform 0.001 orthogonal axis permutation)
    const det =
      mat[0] * (mat[5] * mat[10] - mat[6] * mat[9]) -
      mat[4] * (mat[1] * mat[10] - mat[2] * mat[9]) +
      mat[8] * (mat[1] * mat[6] - mat[2] * mat[5]);
    const flipWinding = det < 0;

    let pMinX = Infinity;
    let pMaxX = -Infinity;
    let pMinY = Infinity;
    let pMaxY = -Infinity;
    let pMinZ = Infinity;
    let pMaxZ = -Infinity;

    const worldPositions = new Float32Array((verts.length / 6) * 3);
    const worldNormals = new Float32Array((verts.length / 6) * 3);

    for (let v = 0, dst = 0; v < verts.length; v += 6, dst += 3) {
      const x = verts[v];
      const y = verts[v + 1];
      const z = verts[v + 2];
      const nx = verts[v + 3];
      const ny = verts[v + 4];
      const nz = verts[v + 5];

      const wx = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
      const wy = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
      const wz = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];

      worldPositions[dst] = wx;
      worldPositions[dst + 1] = wy;
      worldPositions[dst + 2] = wz;

      // Orthogonal rotation+scale matrix -> transform direction and re-normalize
      let wnx = mat[0] * nx + mat[4] * ny + mat[8] * nz;
      let wny = mat[1] * nx + mat[5] * ny + mat[9] * nz;
      let wnz = mat[2] * nx + mat[6] * ny + mat[10] * nz;
      const nLen = Math.hypot(wnx, wny, wnz) || 1;
      wnx /= nLen;
      wny /= nLen;
      wnz /= nLen;

      worldNormals[dst] = wnx;
      worldNormals[dst + 1] = wny;
      worldNormals[dst + 2] = wnz;

      if (wx < pMinX) pMinX = wx;
      if (wx > pMaxX) pMaxX = wx;
      if (wy < pMinY) pMinY = wy;
      if (wy > pMaxY) pMaxY = wy;
      if (wz < pMinZ) pMinZ = wz;
      if (wz > pMaxZ) pMaxZ = wz;
    }

    if (pMinY < minY) minY = pMinY;
    if (pMaxY > maxY) maxY = pMaxY;

    const copyIndices = new Uint32Array(indices.length);
    for (let k = 0; k < indices.length; k += 3) {
      if (flipWinding) {
        copyIndices[k] = indices[k];
        copyIndices[k + 1] = indices[k + 2];
        copyIndices[k + 2] = indices[k + 1];
      } else {
        copyIndices[k] = indices[k];
        copyIndices[k + 1] = indices[k + 1];
        copyIndices[k + 2] = indices[k + 2];
      }
    }

    parts.push({
      positions: worldPositions,
      normals: worldNormals,
      indices: copyIndices,
      bounds: { pMinX, pMaxX, pMinY, pMaxY, pMinZ, pMaxZ },
    });

    geom.delete();
  }

  return {
    expressID: flatMesh.expressID,
    fullName,
    familyName,
    minY,
    maxY,
    parts,
  };
}

/**
 * Finds the exact tower centerline (cx, cz) from S01's circular base-plate / bearing
 * sub-part whose horizontal span is square/circular and symmetric around the centroid.
 */
function detectBaseCenterline(baseSection) {
  // Prefer the circular base plate (0.44m x 0.44m around Y = [-0.03, 0.005])
  const centerCandidates = baseSection.parts.filter((p) => {
    const spanX = p.bounds.pMaxX - p.bounds.pMinX;
    const spanZ = p.bounds.pMaxZ - p.bounds.pMinZ;
    return (
      p.bounds.pMinY <= -0.02 &&
      spanX >= 0.2 &&
      spanX <= 0.5 &&
      spanZ >= 0.2 &&
      spanZ <= 0.5 &&
      Math.abs(spanX - spanZ) < 0.01
    );
  });

  if (centerCandidates.length > 0) {
    // Pick the one with smallest |spanX - spanZ| (circular plate = 0.0000 difference)
    centerCandidates.sort(
      (a, b) =>
        Math.abs(a.bounds.pMaxX - a.bounds.pMinX - (a.bounds.pMaxZ - a.bounds.pMinZ)) -
        Math.abs(b.bounds.pMaxX - b.bounds.pMinX - (b.bounds.pMaxZ - b.bounds.pMinZ)),
    );
    const p = centerCandidates[0];
    return {
      cx: (p.bounds.pMinX + p.bounds.pMaxX) / 2,
      cz: (p.bounds.pMinZ + p.bounds.pMaxZ) / 2,
    };
  }

  // Fallback: bounding-box midpoint (slightly off circumcenter for triangles, should not trigger)
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of baseSection.parts) {
    if (p.bounds.pMinX < minX) minX = p.bounds.pMinX;
    if (p.bounds.pMaxX > maxX) maxX = p.bounds.pMaxX;
    if (p.bounds.pMinZ < minZ) minZ = p.bounds.pMinZ;
    if (p.bounds.pMaxZ > maxZ) maxZ = p.bounds.pMaxZ;
  }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

/**
 * Merges a family prototype's parts into a compact indexed local mesh (shifted by cx, minY, cz)
 * with exact (position, normal) vertex welding, and extracts gusset plate local Y if present.
 */
function buildPrototypeMesh(section, cx, cz) {
  const vertMap = new Map();
  const posList = [];
  const normList = [];
  const idxList = [];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const sectionHeight = section.maxY - section.minY;
  const isGussetFamily = /Center Gusset|Base Gusset/i.test(section.familyName);
  const gussetYCenters = [];

  for (const part of section.parts) {
    // Detect gusset plate sub-parts only on gusseted families:
    // outer edge reaches R > 0.43 m while vertical height is compact (< 0.25 m) inside [0.2m, H-0.08m]
    const maxR = Math.max(
      Math.hypot(part.bounds.pMinX - cx, part.bounds.pMinZ - cz),
      Math.hypot(part.bounds.pMaxX - cx, part.bounds.pMinZ - cz),
      Math.hypot(part.bounds.pMinX - cx, part.bounds.pMaxZ - cz),
      Math.hypot(part.bounds.pMaxX - cx, part.bounds.pMaxZ - cz),
    );
    const partHeight = part.bounds.pMaxY - part.bounds.pMinY;
    const localMidY = (part.bounds.pMinY + part.bounds.pMaxY) / 2 - section.minY;
    if (
      isGussetFamily &&
      maxR > 0.43 &&
      partHeight < 0.25 &&
      localMidY > 0.2 &&
      localMidY < sectionHeight - 0.08
    ) {
      gussetYCenters.push(localMidY);
    }

    const localVertexIndices = new Uint32Array(part.positions.length / 3);
    for (let v = 0, p = 0; p < part.positions.length; v++, p += 3) {
      const lx = part.positions[p] - cx;
      const ly = part.positions[p + 1] - section.minY;
      const lz = part.positions[p + 2] - cz;

      const nx = part.normals[p];
      const ny = part.normals[p + 1];
      const nz = part.normals[p + 2];

      const key = `${Math.round(lx * 1e4)},${Math.round(ly * 1e4)},${Math.round(lz * 1e4)}|${Math.round(nx * 1e2)},${Math.round(ny * 1e2)},${Math.round(nz * 1e2)}`;
      let weldedIdx = vertMap.get(key);
      if (weldedIdx === undefined) {
        weldedIdx = posList.length / 3;
        vertMap.set(key, weldedIdx);
        posList.push(lx, ly, lz);
        normList.push(nx, ny, nz);

        if (lx < minX) minX = lx;
        if (lx > maxX) maxX = lx;
        if (ly < minY) minY = ly;
        if (ly > maxY) maxY = ly;
        if (lz < minZ) minZ = lz;
        if (lz > maxZ) maxZ = lz;
      }
      localVertexIndices[v] = weldedIdx;
    }

    for (let k = 0; k < part.indices.length; k += 3) {
      const a = localVertexIndices[part.indices[k]];
      const b = localVertexIndices[part.indices[k + 1]];
      const c = localVertexIndices[part.indices[k + 2]];
      if (a !== b && b !== c && a !== c) {
        idxList.push(a, b, c);
      }
    }
  }

  const vertexCount = posList.length / 3;
  const positions = new Float32Array(posList);
  const normals = new Float32Array(normList);
  const useUint16 = vertexCount < 65535;
  const indices = useUint16 ? new Uint16Array(idxList) : new Uint32Array(idxList);

  const gussetLocalY =
    gussetYCenters.length > 0
      ? round4(gussetYCenters.reduce((sum, y) => sum + y, 0) / gussetYCenters.length)
      : null;

  return {
    familyName: section.familyName,
    positions,
    normals,
    indices,
    useUint16,
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    gussetLocalY,
    vertexCount,
    triangleCount: idxList.length / 3,
  };
}

/**
 * Serializes deduplicated prototype meshes and 41 section nodes into a glTF 2.0 .glb Buffer.
 */
function buildGlbBuffer(prototypes, sectionPlacements, baseYDatumOffset) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  let byteOffset = 0;

  function pushTypedArray(typedArray) {
    const raw = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = (4 - (raw.length % 4)) % 4;
    chunks.push(raw);
    if (pad > 0) chunks.push(Buffer.alloc(pad));
    const offset = byteOffset;
    byteOffset += raw.length + pad;
    return { offset, byteLength: raw.length };
  }

  for (let i = 0; i < prototypes.length; i++) {
    const proto = prototypes[i];

    const posSlice = pushTypedArray(proto.positions);
    const posViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: posSlice.offset,
      byteLength: posSlice.byteLength,
      target: 34962, // ARRAY_BUFFER
    });

    const normSlice = pushTypedArray(proto.normals);
    const normViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: normSlice.offset,
      byteLength: normSlice.byteLength,
      target: 34962,
    });

    const idxSlice = pushTypedArray(proto.indices);
    const idxViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: idxSlice.offset,
      byteLength: idxSlice.byteLength,
      target: 34963, // ELEMENT_ARRAY_BUFFER
    });

    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx,
      componentType: 5126, // FLOAT
      count: proto.vertexCount,
      type: 'VEC3',
      min: proto.min.map((v) => Number(v.toFixed(6))),
      max: proto.max.map((v) => Number(v.toFixed(6))),
    });

    const normAccIdx = accessors.length;
    accessors.push({
      bufferView: normViewIdx,
      componentType: 5126,
      count: proto.vertexCount,
      type: 'VEC3',
    });

    const idxAccIdx = accessors.length;
    accessors.push({
      bufferView: idxViewIdx,
      componentType: proto.useUint16 ? 5123 : 5125, // UNSIGNED_SHORT : UNSIGNED_INT
      count: proto.indices.length,
      type: 'SCALAR',
    });

    meshes.push({
      name: proto.familyName,
      primitives: [
        {
          attributes: {
            POSITION: posAccIdx,
            NORMAL: normAccIdx,
          },
          indices: idxAccIdx,
          material: 0,
        },
      ],
    });
  }

  // Nodes: index 0 = TowerMastRoot, indices 1..N = S01..S41
  const childIndices = sectionPlacements.map((_, idx) => idx + 1);
  const nodes = [
    {
      name: 'TowerMastRoot',
      children: childIndices,
      extras: {
        source: 'Tower Model.ifc',
        sectionCount: sectionPlacements.length,
        totalHeightM: round4(
          sectionPlacements[sectionPlacements.length - 1].maxY - baseYDatumOffset,
        ),
      },
    },
    ...sectionPlacements.map((sec) => ({
      name: sec.sectionId,
      mesh: sec.prototypeIndex,
      translation: [0, Number((sec.minY - baseYDatumOffset).toFixed(6)), 0],
      extras: {
        sectionId: sec.sectionId,
        family: sec.familyName,
        minYM: round4(sec.minY - baseYDatumOffset),
        maxYM: round4(sec.maxY - baseYDatumOffset),
        gussetYM:
          sec.gussetLocalY !== null
            ? round4(sec.minY - baseYDatumOffset + sec.gussetLocalY)
            : null,
        gussetRadiusM: sec.gussetLocalY !== null ? 0.46 : null,
      },
    })),
  ];

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'mast-tower-ifc-to-glb',
    },
    scene: 0,
    scenes: [{ name: 'MastTowerScene', nodes: [0] }],
    nodes,
    meshes,
    materials: [
      {
        name: 'GalvanizedSteelDefault',
        pbrMetallicRoughness: {
          baseColorFactor: [0.58, 0.64, 0.72, 1.0],
          metallicFactor: 0.35,
          roughnessFactor: 0.55,
        },
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonBufRaw = Buffer.from(jsonStr, 'utf8');
  const jsonPad = (4 - (jsonBufRaw.length % 4)) % 4;
  const jsonBuf =
    jsonPad > 0 ? Buffer.concat([jsonBufRaw, Buffer.from(' '.repeat(jsonPad), 'utf8')]) : jsonBufRaw;

  const binBuf = Buffer.concat(chunks);
  const totalLength = 12 + 8 + jsonBuf.length + 8 + binBuf.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuf.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

  return Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBuf]);
}

async function main() {
  if (!fs.existsSync(INPUT_IFC_PATH)) {
    throw new Error(`Input IFC file not found: ${INPUT_IFC_PATH}`);
  }

  console.log(`Reading IFC: ${INPUT_IFC_PATH}`);
  const ifcBytes = fs.readFileSync(INPUT_IFC_PATH);

  const api = new WebIFC.IfcAPI();
  await api.Init();
  const modelID = api.OpenModel(ifcBytes);

  const sections = [];
  api.StreamAllMeshes(modelID, (flatMesh) => {
    sections.push(extractProxyData(api, modelID, flatMesh));
  });
  api.CloseModel(modelID);

  if (sections.length === 0) {
    throw new Error('No meshes extracted from IFC file');
  }

  sections.sort((a, b) => a.minY - b.minY);
  const { cx, cz } = detectBaseCenterline(sections[0]);

  // Pedestal base datum Y=0 corresponds to Y=0 in IFC (S01 base pin dips to -0.10m into pedestal)
  const baseYDatumOffset = 0;

  const protoIndexByFamily = new Map();
  const prototypes = [];
  const placements = [];

  sections.forEach((sec, idx) => {
    const sectionId = `S${String(idx + 1).padStart(2, '0')}`;
    let prototypeIndex = protoIndexByFamily.get(sec.familyName);
    if (prototypeIndex === undefined) {
      const proto = buildPrototypeMesh(sec, cx, cz);
      prototypeIndex = prototypes.length;
      prototypes.push(proto);
      protoIndexByFamily.set(sec.familyName, prototypeIndex);
    }

    const proto = prototypes[prototypeIndex];
    placements.push({
      sectionId,
      familyName: sec.familyName,
      prototypeIndex,
      minY: sec.minY,
      maxY: sec.maxY,
      gussetLocalY: proto.gussetLocalY,
    });
  });

  const glbBuffer = buildGlbBuffer(prototypes, placements, baseYDatumOffset);
  fs.mkdirSync(path.dirname(OUTPUT_GLB_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_GLB_PATH, glbBuffer);

  console.log(`Generated GLB: ${OUTPUT_GLB_PATH} (${(glbBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(
    `Centerline offset subtracted: cx=${cx.toFixed(6)}m, cz=${cz.toFixed(6)}m | Prototypes=${prototypes.length} | Sections=${placements.length}`,
  );
  prototypes.forEach((p, idx) => {
    console.log(
      `  [${idx}] ${p.familyName} | verts=${p.vertexCount} | tris=${p.triangleCount} | uint16=${p.useUint16} | gussetLocalY=${p.gussetLocalY}`,
    );
  });

  // Self-verify by parsing with Three.js GLTFLoader
  const loader = new GLTFLoader();
  const arrayBuffer = glbBuffer.buffer.slice(
    glbBuffer.byteOffset,
    glbBuffer.byteOffset + glbBuffer.byteLength,
  );
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });

  const loadedNodes = [];
  const sharedGeoms = new Set();
  gltf.scene.traverse((obj) => {
    if (/^S\d{2}$/.test(obj.name)) {
      loadedNodes.push({
        name: obj.name,
        y: obj.position.y,
        gussetYM: obj.userData?.gussetYM ?? null,
      });
    }
    if (obj.isMesh && obj.geometry) {
      sharedGeoms.add(obj.geometry.uuid);
    }
  });

  const gussetNodes = loadedNodes.filter((n) => n.gussetYM !== null);
  console.log(
    `GLTFLoader verified: ${loadedNodes.length} named sections, ${sharedGeoms.size} shared GPU geometries, ${gussetNodes.length} gusset elevations`,
  );
  console.log(
    'Gusset nodes:',
    gussetNodes.map((n) => `${n.name}@${n.gussetYM}m`).join(', '),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
