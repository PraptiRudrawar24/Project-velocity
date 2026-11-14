import * as THREE from 'three';

export interface TrackFrame {
  index: number;
  t: number;
  distanceMeters: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  curvature: number;
}

export interface CurbSegmentDescriptor {
  startIndex: number;
  endIndex: number;
  side: 'inner' | 'outer';
}

export interface BarrierColliderSegment {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  length: number;
  side: 'inner' | 'outer';
}

export interface CurbColliderSegment {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  length: number;
  width: number;
}

export interface TireBarrierCluster {
  position: [number, number, number];
  rotationY: number;
  count: number;
  label: string;
}

export interface BrakingBoardPlacement {
  position: [number, number, number];
  rotationY: number;
  distanceLabel: '150' | '100' | '50';
}

export const TRACK_WIDTH = 14;
export const TRACK_HALF_WIDTH = TRACK_WIDTH / 2; // 7m
export const SHOULDER_WIDTH = 4.5;
export const BARRIER_OFFSET = TRACK_HALF_WIDTH + SHOULDER_WIDTH; // 11.5m from centerline
export const CURB_WIDTH = 1.25;
export const TRACK_SAMPLES = 480;

// Closed clockwise GP circuit starting at Start/Finish (0, 0, 0) heading -Z
const CIRCUIT_CONTROL_POINTS: THREE.Vector3[] = [
  new THREE.Vector3(0, 0, 0), // Start / Finish line
  new THREE.Vector3(0, 0, -65), // Main straight mid
  new THREE.Vector3(0, 0, -130), // End of main straight
  new THREE.Vector3(42, 0, -196), // Turn 1 entry (fast right)
  new THREE.Vector3(132, 0, -210), // Turn 1 exit
  new THREE.Vector3(196, 0, -148), // Turn 2 chicane left
  new THREE.Vector3(178, 0, -68), // Turn 3 chicane right
  new THREE.Vector3(240, 0, 12), // Back straight entry
  new THREE.Vector3(254, 0, 122), // Back straight braking zone
  new THREE.Vector3(192, 0, 202), // Turn 4 carousel apex
  new THREE.Vector3(92, 0, 206), // Carousel exit
  new THREE.Vector3(24, 0, 172), // Final corner
  new THREE.Vector3(0, 0, 108), // Main straight feed
  new THREE.Vector3(0, 0, 52), // Start grid straightaway
];

export interface GridSlotTransform {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface CircuitDefinition {
  curve: THREE.CatmullRomCurve3;
  totalLength: number;
  frames: TrackFrame[];
  curbZones: CurbSegmentDescriptor[];
  curbColliders: CurbColliderSegment[];
  barrierColliders: BarrierColliderSegment[];
  tireBarriers: TireBarrierCluster[];
  brakingBoards: BrakingBoardPlacement[];
  checkpoints: Array<{ index: number; frame: TrackFrame }>;
  gridSlots: GridSlotTransform[];
  startGridTransform: GridSlotTransform;
}

let cachedCircuit: CircuitDefinition | null = null;

function quaternionFromForward(forward: THREE.Vector3): [number, number, number, number] {
  const up = new THREE.Vector3(0, 1, 0);
  const f = forward.clone().setY(0).normalize();
  const r = new THREE.Vector3().crossVectors(f, up).normalize();
  const zBack = f.clone().negate();
  const mat = new THREE.Matrix4().makeBasis(r, up, zBack);
  const q = new THREE.Quaternion().setFromRotationMatrix(mat);
  return [q.x, q.y, q.z, q.w];
}

function buildCircuitDefinition(): CircuitDefinition {
  const curve = new THREE.CatmullRomCurve3(
    CIRCUIT_CONTROL_POINTS,
    true,
    'catmullrom',
    0.45
  );
  const totalLength = curve.getLength();
  const up = new THREE.Vector3(0, 1, 0);

  const frames: TrackFrame[] = [];
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const t = i / TRACK_SAMPLES;
    const position = curve.getPointAt(t);
    position.y = 0;
    const tangent = curve.getTangentAt(t);
    tangent.y = 0;
    tangent.normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    frames.push({
      index: i,
      t,
      distanceMeters: t * totalLength,
      position,
      tangent,
      right,
      curvature: 0,
    });
  }

  // Compute signed horizontal curvature for apex curbs & corner cues
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const prev = frames[(i - 1 + TRACK_SAMPLES) % TRACK_SAMPLES];
    const curr = frames[i];
    const next = frames[(i + 1) % TRACK_SAMPLES];
    const dTangent = next.tangent.clone().sub(prev.tangent);
    const signedCurv = dTangent.dot(curr.right);
    curr.curvature = signedCurv;
  }

  // Generate FIA-style apex & exit curbs automatically where curvature is strong
  const curbZones: CurbSegmentDescriptor[] = [];
  const CURV_THRESHOLD = 0.017;
  let activeSide: 'inner' | 'outer' | null = null;
  let zoneStart = 0;

  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const c = frames[i].curvature;
    const side: 'inner' | 'outer' | null =
      c > CURV_THRESHOLD ? 'inner' : c < -CURV_THRESHOLD ? 'outer' : null;

    if (side !== activeSide) {
      if (activeSide !== null && i - zoneStart >= 4) {
        curbZones.push({
          startIndex: Math.max(0, zoneStart - 2),
          endIndex: Math.min(TRACK_SAMPLES - 1, i + 2),
          side: activeSide,
        });
      }
      activeSide = side;
      zoneStart = i;
    }
  }
  if (activeSide !== null && TRACK_SAMPLES - zoneStart >= 4) {
    curbZones.push({
      startIndex: zoneStart,
      endIndex: TRACK_SAMPLES - 1,
      side: activeSide,
    });
  }

  // Build segmented guardrail collider descriptors every 4 frames (~10m)
  const barrierColliders: BarrierColliderSegment[] = [];
  const step = 4;

  const addBarrierSide = (side: 'inner' | 'outer', sign: 1 | -1) => {
    for (let i = 0; i < TRACK_SAMPLES; i += step) {
      const fA = frames[i];
      const fB = frames[(i + step) % TRACK_SAMPLES];
      const pA = fA.position
        .clone()
        .addScaledVector(fA.right, sign * BARRIER_OFFSET);
      const pB = fB.position
        .clone()
        .addScaledVector(fB.right, sign * BARRIER_OFFSET);

      const mid = pA.clone().add(pB).multiplyScalar(0.5);
      const dir = pB.clone().sub(pA);
      const segLen = dir.length();
      if (segLen < 0.1) continue;

      barrierColliders.push({
        position: [mid.x, 0.75, mid.z],
        quaternion: quaternionFromForward(dir),
        length: segLen + 0.45,
        side,
      });
    }
  };

  addBarrierSide('inner', 1);
  addBarrierSide('outer', -1);

  // Low-profile physical curb colliders along apex zones for suspension response
  const curbColliders: CurbColliderSegment[] = [];
  for (const zone of curbZones) {
    const sign = zone.side === 'inner' ? 1 : -1;
    const centerOffset = sign * (TRACK_HALF_WIDTH + CURB_WIDTH * 0.45);
    for (let i = zone.startIndex; i < zone.endIndex; i += 2) {
      const fA = frames[i % TRACK_SAMPLES];
      const fB = frames[Math.min(zone.endIndex, i + 2) % TRACK_SAMPLES];
      const pA = fA.position.clone().addScaledVector(fA.right, centerOffset);
      const pB = fB.position.clone().addScaledVector(fB.right, centerOffset);
      const mid = pA.clone().add(pB).multiplyScalar(0.5);
      const dir = pB.clone().sub(pA);
      const segLen = dir.length();
      if (segLen < 0.1) continue;
      curbColliders.push({
        position: [mid.x, 0.015, mid.z],
        quaternion: quaternionFromForward(dir),
        length: segLen + 0.15,
        width: CURB_WIDTH,
      });
    }
  }

  // Corner runoff tire barriers at key high-speed corners (Turn 1 outside, Carousel outside)
  const tireBarriers: TireBarrierCluster[] = [];
  const tireClusterIndices = [
    { idx: 62, sideSign: -1, count: 6, label: 'Turn 1 Tire Barrier' },
    { idx: 120, sideSign: 1, count: 5, label: 'Chicane Tire Barrier' },
    { idx: 295, sideSign: -1, count: 7, label: 'Carousel Tire Barrier' },
  ];

  for (const cluster of tireClusterIndices) {
    const f = frames[cluster.idx % TRACK_SAMPLES];
    const center = f.position
      .clone()
      .addScaledVector(f.right, cluster.sideSign * (BARRIER_OFFSET - 1.35));
    const yaw = Math.atan2(-f.tangent.x, -f.tangent.z);
    tireBarriers.push({
      position: [center.x, 0, center.z],
      rotationY: yaw,
      count: cluster.count,
      label: cluster.label,
    });
  }

  // Braking distance marker boards before Turn 1 and Carousel
  const brakingBoards: BrakingBoardPlacement[] = [];
  const addBrakingSequence = (baseFrameIdx: number, sideSign: 1 | -1) => {
    const labels: Array<'150' | '100' | '50'> = ['150', '100', '50'];
    const offsets = [-32, -20, -9]; // indices upstream before turn
    labels.forEach((label, k) => {
      const f =
        frames[(baseFrameIdx + offsets[k] + TRACK_SAMPLES) % TRACK_SAMPLES];
      const pos = f.position
        .clone()
        .addScaledVector(f.right, sideSign * (TRACK_HALF_WIDTH + 2.2));
      const yaw = Math.atan2(-f.tangent.x, -f.tangent.z);
      brakingBoards.push({
        position: [pos.x, 0, pos.z],
        rotationY: yaw,
        distanceLabel: label,
      });
    });
  };
  addBrakingSequence(56, -1); // Before Turn 1 (outer left side)
  addBrakingSequence(278, -1); // Before Turn 4 Carousel

  // 6 Ordered Checkpoints around the loop (Start/Finish at 0 + 5 intermediate sectors)
  const checkpointCount = 6;
  const checkpoints = Array.from({ length: checkpointCount }, (_, index) => ({
    index,
    frame: frames[Math.floor((index * TRACK_SAMPLES) / checkpointCount)],
  }));

  // 6 Staggered 2x3 Starting Grid slots behind Start/Finish line
  const gridSlots: GridSlotTransform[] = Array.from({ length: 6 }, (_, slotIdx) => {
    const frameIdx = (TRACK_SAMPLES - 3 - slotIdx * 3 + TRACK_SAMPLES) % TRACK_SAMPLES;
    const f = frames[frameIdx];
    const laneOffset = slotIdx % 2 === 0 ? -2.5 : 2.5;
    const pos = f.position.clone().addScaledVector(f.right, laneOffset);
    return {
      position: [pos.x, 0.50, pos.z],
      quaternion: quaternionFromForward(f.tangent),
    };
  });

  // Spawn ~10m behind start/finish line facing forward along track tangent (-Z)
  const spawnFrame = frames[TRACK_SAMPLES - 4];

  return {
    curve,
    totalLength,
    frames,
    curbZones,
    curbColliders,
    barrierColliders,
    tireBarriers,
    brakingBoards,
    checkpoints,
    gridSlots,
    startGridTransform: {
      position: [spawnFrame.position.x, 0.50, spawnFrame.position.z],
      quaternion: quaternionFromForward(spawnFrame.tangent),
    },
  };
}

export function getCircuitDefinition(): CircuitDefinition {
  if (!cachedCircuit) {
    cachedCircuit = buildCircuitDefinition();
  }
  return cachedCircuit;
}

export interface TrackProjection {
  frame: TrackFrame;
  distanceSq: number;
  lateralOffset: number;
  isOnAsphalt: boolean;
  isOnCurb: boolean;
}

export function projectOntoCircuit(
  x: number,
  z: number,
  circuit: CircuitDefinition = getCircuitDefinition()
): TrackProjection {
  let bestIdx = 0;
  let bestDistSq = Infinity;

  // Coarse step first (every 6th frame) then refine +/-6 around best
  const frames = circuit.frames;
  for (let i = 0; i < frames.length; i += 6) {
    const dx = x - frames[i].position.x;
    const dz = z - frames[i].position.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = i;
    }
  }

  let refinedIdx = bestIdx;
  for (let offset = -6; offset <= 6; offset++) {
    const idx = (bestIdx + offset + frames.length) % frames.length;
    const dx = x - frames[idx].position.x;
    const dz = z - frames[idx].position.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      refinedIdx = idx;
    }
  }

  const frame = frames[refinedIdx];
  const dx = x - frame.position.x;
  const dz = z - frame.position.z;
  const lateralOffset = dx * frame.right.x + dz * frame.right.z;
  const absLat = Math.abs(lateralOffset);

  const isOnAsphalt = absLat <= TRACK_HALF_WIDTH + 0.15;
  let isOnCurb = false;

  if (
    absLat > TRACK_HALF_WIDTH - 0.15 &&
    absLat <= TRACK_HALF_WIDTH + CURB_WIDTH + 0.15
  ) {
    const side = lateralOffset >= 0 ? 'inner' : 'outer';
    for (const cz of circuit.curbZones) {
      if (
        cz.side === side &&
        refinedIdx >= cz.startIndex &&
        refinedIdx <= cz.endIndex
      ) {
        isOnCurb = true;
        break;
      }
    }
  }

  return {
    frame,
    distanceSq: bestDistSq,
    lateralOffset,
    isOnAsphalt,
    isOnCurb,
  };
}

export function getCheckpointSpawnTransform(
  sectorIndex: number,
  circuit: CircuitDefinition = getCircuitDefinition()
): GridSlotTransform {
  if (sectorIndex <= 0) {
    return circuit.startGridTransform;
  }
  const cp =
    circuit.checkpoints[sectorIndex % circuit.checkpoints.length] ??
    circuit.checkpoints[0];
  const f = cp.frame;
  return {
    position: [f.position.x, 0.50, f.position.z],
    quaternion: quaternionFromForward(f.tangent),
  };
}

export function getGridSlotTransform(
  slotIndex: number,
  circuit: CircuitDefinition = getCircuitDefinition()
): GridSlotTransform {
  return (
    circuit.gridSlots[slotIndex] ??
    circuit.gridSlots[circuit.gridSlots.length - 1] ??
    circuit.startGridTransform
  );
}
