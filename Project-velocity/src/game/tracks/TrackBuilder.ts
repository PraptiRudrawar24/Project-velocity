import * as THREE from 'three';
import {
  BARRIER_OFFSET,
  CURB_WIDTH,
  TRACK_HALF_WIDTH,
  TRACK_SAMPLES,
  type CircuitDefinition,
  type CurbSegmentDescriptor,
} from './CircuitData';

export interface TrackProceduralAssets {
  roadGeometry: THREE.BufferGeometry;
  shoulderGeometry: THREE.BufferGeometry;
  curbsGeometry: THREE.BufferGeometry;
  guardrailBeamGeometry: THREE.BufferGeometry;
  asphaltTexture: THREE.CanvasTexture;
  asphaltRoughnessTexture: THREE.CanvasTexture;
  shoulderTexture: THREE.CanvasTexture;
  curbTexture: THREE.CanvasTexture;
  grassTexture: THREE.CanvasTexture;
  startLineTexture: THREE.CanvasTexture;
  gantryBannerTexture: THREE.CanvasTexture;
  dispose: () => void;
}

function createAsphaltTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Base dark asphalt
  ctx.fillStyle = '#252830';
  ctx.fillRect(0, 0, w, h);

  // Subtle darker rubbered racing line toward center
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(20, 22, 26, 0.0)');
  grad.addColorStop(0.25, 'rgba(14, 16, 20, 0.25)');
  grad.addColorStop(0.5, 'rgba(10, 12, 16, 0.38)');
  grad.addColorStop(0.75, 'rgba(14, 16, 20, 0.25)');
  grad.addColorStop(1, 'rgba(20, 22, 26, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Deterministic asphalt aggregate grain
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 16000; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const v = 26 + Math.floor(rand() * 34);
    ctx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 5})`;
    ctx.fillRect(x, y, 1.8, 1.8);
  }

  // Crisp white track edge lines
  ctx.fillStyle = '#e8ecf2';
  ctx.fillRect(10, 0, 10, h);
  ctx.fillRect(w - 20, 0, 10, h);

  // Subtle dashed center reference line (faded motorsport style)
  ctx.fillStyle = 'rgba(220, 226, 236, 0.28)';
  const dashH = 64;
  for (let y = 16; y < h; y += 128) {
    ctx.fillRect(w / 2 - 2, y, 4, dashH);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createAsphaltRoughnessTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgb(205, 205, 205)';
  ctx.fillRect(0, 0, size, size);

  let seed = 9001;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 6000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const g = 160 + Math.floor(rand() * 80);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function createShoulderTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#3c4048';
  ctx.fillRect(0, 0, size, size);

  let seed = 4242;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 5000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 50 + Math.floor(rand() * 30);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createCurbTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#d92626';
  ctx.fillRect(0, 0, w, h / 2);
  ctx.fillStyle = '#f2f4f7';
  ctx.fillRect(0, h / 2, w, h / 2);

  // Subtle tire scuff weathering
  ctx.fillStyle = 'rgba(25, 25, 28, 0.16)';
  ctx.fillRect(0, 0, 22, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createGrassTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2d4528';
  ctx.fillRect(0, 0, size, size);

  // Subtle mowed stripes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  for (let x = 0; x < size; x += 64) {
    ctx.fillRect(x, 0, 32, size);
  }

  let seed = 7777;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 14000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const g = 58 + Math.floor(rand() * 34);
    ctx.fillStyle = `rgb(${Math.floor(g * 0.65)}, ${g}, ${Math.floor(g * 0.55)})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createStartLineTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const cols = 16;
  const rows = 4;
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#f4f6fa' : '#14171f';
      ctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createGantryBannerTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0d131d';
  ctx.fillRect(0, 0, w, h);

  // Accent stripes
  ctx.fillStyle = '#e11d48';
  ctx.fillRect(0, 0, w, 14);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(0, h - 14, w, 14);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 66px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PROJECT VELOCITY', w / 2, h / 2 - 10);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('APEX CIRCUIT  //  GP PROVING GROUNDS', w / 2, h / 2 + 44);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createBrakingBoardTexture(
  label: '150' | '100' | '50'
): THREE.CanvasTexture {
  const w = 256;
  const h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, w - 14, h - 14);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 88px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildClosedRibbonGeometry(
  circuit: CircuitDefinition,
  leftOffset: number,
  rightOffset: number,
  yHeight: number,
  uvRepeatLength: number
): THREE.BufferGeometry {
  const frames = circuit.frames;
  const count = TRACK_SAMPLES;
  const positions = new Float32Array((count + 1) * 2 * 3);
  const normals = new Float32Array((count + 1) * 2 * 3);
  const uvs = new Float32Array((count + 1) * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i <= count; i++) {
    const f = frames[i % count];
    const dist = i === count ? circuit.totalLength : f.distanceMeters;
    const vCoord = dist / uvRepeatLength;

    const pLeftX = f.position.x + f.right.x * leftOffset;
    const pLeftZ = f.position.z + f.right.z * leftOffset;
    const pRightX = f.position.x + f.right.x * rightOffset;
    const pRightZ = f.position.z + f.right.z * rightOffset;

    const baseV = i * 2;
    positions[baseV * 3] = pLeftX;
    positions[baseV * 3 + 1] = yHeight;
    positions[baseV * 3 + 2] = pLeftZ;

    positions[(baseV + 1) * 3] = pRightX;
    positions[(baseV + 1) * 3 + 1] = yHeight;
    positions[(baseV + 1) * 3 + 2] = pRightZ;

    normals[baseV * 3 + 1] = 1;
    normals[(baseV + 1) * 3 + 1] = 1;

    uvs[baseV * 2] = 0;
    uvs[baseV * 2 + 1] = vCoord;
    uvs[(baseV + 1) * 2] = 1;
    uvs[(baseV + 1) * 2 + 1] = vCoord;

    if (i < count) {
      const a = baseV;
      const b = baseV + 1;
      const c = baseV + 2;
      const d = baseV + 3;
      // Front-facing upward (+Y): (b - a) x (c - a) = right x tangent = +Y
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeBoundingSphere();
  return geom;
}

function buildCurbsGeometry(
  circuit: CircuitDefinition,
  zones: CurbSegmentDescriptor[]
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const zone of zones) {
    const segLen = zone.endIndex - zone.startIndex;
    if (segLen < 1) continue;

    const sign = zone.side === 'inner' ? 1 : -1;
    const innerEdge = sign * (TRACK_HALF_WIDTH - 0.1);
    const outerEdge = sign * (TRACK_HALF_WIDTH + CURB_WIDTH);
    const leftEdge = Math.min(innerEdge, outerEdge);
    const rightEdge = Math.max(innerEdge, outerEdge);

    for (let i = zone.startIndex; i <= zone.endIndex; i++) {
      const f = circuit.frames[i % TRACK_SAMPLES];
      const vCoord = f.distanceMeters / 3.0;

      const lx = f.position.x + f.right.x * leftEdge;
      const lz = f.position.z + f.right.z * leftEdge;
      const rx = f.position.x + f.right.x * rightEdge;
      const rz = f.position.z + f.right.z * rightEdge;

      const leftY = zone.side === 'inner' ? 0.012 : 0.038;
      const rightY = zone.side === 'inner' ? 0.038 : 0.012;

      positions.push(lx, leftY, lz, rx, rightY, rz);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, vCoord, 1, vCoord);

      if (i < zone.endIndex) {
        const a = vertexOffset;
        const b = vertexOffset + 1;
        const c = vertexOffset + 2;
        const d = vertexOffset + 3;
        indices.push(a, b, c, b, d, c);
      }
      vertexOffset += 2;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

function buildGuardrailBeamsGeometry(
  circuit: CircuitDefinition
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  const frames = circuit.frames;
  const count = TRACK_SAMPLES;
  const sides: readonly number[] = [BARRIER_OFFSET, -BARRIER_OFFSET];

  // Cross-section profile (height, inward protrusion) for steel W-beam
  const bottomY = 0.36;
  const topY = 0.84;
  const halfThick = 0.14;

  for (const offset of sides) {
    for (let i = 0; i <= count; i++) {
      const f = frames[i % count];
      const cx = f.position.x + f.right.x * offset;
      const cz = f.position.z + f.right.z * offset;
      const inX = f.right.x * -halfThick;
      const inZ = f.right.z * -halfThick;
      const outX = f.right.x * halfThick;
      const outZ = f.right.z * halfThick;
      const vCoord =
        (i === count ? circuit.totalLength : f.distanceMeters) / 4.0;

      // 4 vertices around cross section: inner-bot, inner-top, outer-top, outer-bot
      positions.push(
        cx + inX, bottomY, cz + inZ,
        cx + inX, topY, cz + inZ,
        cx + outX, topY, cz + outZ,
        cx + outX, bottomY, cz + outZ
      );
      uvs.push(0, vCoord, 1, vCoord, 0, vCoord, 1, vCoord);

      if (i < count) {
        const cur = vertexOffset;
        const nxt = vertexOffset + 4;
        // All 4 faces share consistent outward winding
        for (let fIdx = 0; fIdx < 4; fIdx++) {
          const a = cur + fIdx;
          const b = cur + ((fIdx + 1) % 4);
          const c = nxt + fIdx;
          const d = nxt + ((fIdx + 1) % 4);
          indices.push(a, b, c, b, d, c);
        }
      }
      vertexOffset += 4;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

export function createTrackProceduralAssets(
  circuit: CircuitDefinition
): TrackProceduralAssets {
  const asphaltTexture = createAsphaltTexture();
  const asphaltRoughnessTexture = createAsphaltRoughnessTexture();
  const shoulderTexture = createShoulderTexture();
  const curbTexture = createCurbTexture();
  const grassTexture = createGrassTexture();
  const startLineTexture = createStartLineTexture();
  const gantryBannerTexture = createGantryBannerTexture();

  const roadGeometry = buildClosedRibbonGeometry(
    circuit,
    -TRACK_HALF_WIDTH,
    TRACK_HALF_WIDTH,
    0.008,
    12
  );
  const shoulderGeometry = buildClosedRibbonGeometry(
    circuit,
    -BARRIER_OFFSET - 0.6,
    BARRIER_OFFSET + 0.6,
    0.002,
    8
  );
  const curbsGeometry = buildCurbsGeometry(circuit, circuit.curbZones);
  const guardrailBeamGeometry = buildGuardrailBeamsGeometry(circuit);

  return {
    roadGeometry,
    shoulderGeometry,
    curbsGeometry,
    guardrailBeamGeometry,
    asphaltTexture,
    asphaltRoughnessTexture,
    shoulderTexture,
    curbTexture,
    grassTexture,
    startLineTexture,
    gantryBannerTexture,
    dispose: () => {
      roadGeometry.dispose();
      shoulderGeometry.dispose();
      curbsGeometry.dispose();
      guardrailBeamGeometry.dispose();
      asphaltTexture.dispose();
      asphaltRoughnessTexture.dispose();
      shoulderTexture.dispose();
      curbTexture.dispose();
      grassTexture.dispose();
      startLineTexture.dispose();
      gantryBannerTexture.dispose();
    },
  };
}
