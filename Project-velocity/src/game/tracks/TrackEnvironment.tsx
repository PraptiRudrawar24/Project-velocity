import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import {
  BARRIER_OFFSET,
  TRACK_HALF_WIDTH,
  TRACK_SAMPLES,
  getCircuitDefinition,
  projectOntoCircuit,
} from './CircuitData';
import {
  createBrakingBoardTexture,
  createTrackProceduralAssets,
} from './TrackBuilder';
import type { ColliderUserData } from '../core/types';

const GROUND_USER_DATA: ColliderUserData = {
  surface: 'ground',
  label: 'Track Surface',
};

const INNER_RAIL_USER_DATA: ColliderUserData = {
  surface: 'guardrail',
  label: 'Inner Guardrail',
};

const OUTER_RAIL_USER_DATA: ColliderUserData = {
  surface: 'guardrail',
  label: 'Outer Guardrail',
};

const GANTRY_USER_DATA: ColliderUserData = {
  surface: 'pillar',
  label: 'Start/Finish Gantry',
};

export function TrackEnvironment() {
  const circuit = useMemo(() => getCircuitDefinition(), []);
  const assets = useMemo(() => createTrackProceduralAssets(circuit), [circuit]);

  const brakingTextures = useMemo(() => {
    return {
      '150': createBrakingBoardTexture('150'),
      '100': createBrakingBoardTexture('100'),
      '50': createBrakingBoardTexture('50'),
    };
  }, []);

  useEffect(() => {
    return () => {
      assets.dispose();
      brakingTextures['150'].dispose();
      brakingTextures['100'].dispose();
      brakingTextures['50'].dispose();
    };
  }, [assets, brakingTextures]);

  // Precompute instanced transforms for guardrail posts, light poles, and trackside trees
  const { postMatrices, poleMatrices, treeData } = useMemo(() => {
    const posts: THREE.Matrix4[] = [];
    const poles: THREE.Matrix4[] = [];
    const trees: Array<{ pos: [number, number, number]; scale: number }> = [];

    const dummy = new THREE.Object3D();

    // Guardrail posts every 3 frames
    for (let i = 0; i < TRACK_SAMPLES; i += 3) {
      const f = circuit.frames[i];
      for (const sign of [1, -1] as const) {
        const px = f.position.x + f.right.x * (sign * (BARRIER_OFFSET + 0.16));
        const pz = f.position.z + f.right.z * (sign * (BARRIER_OFFSET + 0.16));
        dummy.position.set(px, 0.44, pz);
        dummy.rotation.set(0, Math.atan2(-f.tangent.x, -f.tangent.z), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        posts.push(dummy.matrix.clone());
      }
    }

    // Trackside lighting poles every 24 frames (~50m)
    for (let i = 8; i < TRACK_SAMPLES; i += 24) {
      const f = circuit.frames[i];
      const px = f.position.x + f.right.x * -(BARRIER_OFFSET + 1.4);
      const pz = f.position.z + f.right.z * -(BARRIER_OFFSET + 1.4);
      dummy.position.set(px, 0, pz);
      dummy.rotation.set(0, Math.atan2(f.right.x, f.right.z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.push(dummy.matrix.clone());
    }

    // Deterministic trackside tree placement safely outside track & buildings
    let seed = 2026;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let attempt = 0; attempt < 420 && trees.length < 150; attempt++) {
      const x = -140 + rand() * 520;
      const z = -310 + rand() * 620;
      // Avoid main straight grandstand/pit complex area
      if (Math.abs(x) < 42 && z > -130 && z < 80) continue;

      const proj = projectOntoCircuit(x, z, circuit);
      if (Math.abs(proj.lateralOffset) < BARRIER_OFFSET + 9) continue;

      trees.push({
        pos: [x, 0, z],
        scale: 0.78 + rand() * 0.72,
      });
    }

    return { postMatrices: posts, poleMatrices: poles, treeData: trees };
  }, [circuit]);

  const postsRef = useRef<THREE.InstancedMesh>(null);
  const poleMastRef = useRef<THREE.InstancedMesh>(null);
  const poleHeadRef = useRef<THREE.InstancedMesh>(null);
  const treeTrunkRef = useRef<THREE.InstancedMesh>(null);
  const treeCanopyLowerRef = useRef<THREE.InstancedMesh>(null);
  const treeCanopyUpperRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (postsRef.current) {
      postMatrices.forEach((m, idx) => postsRef.current!.setMatrixAt(idx, m));
      postsRef.current.instanceMatrix.needsUpdate = true;
    }
    if (poleMastRef.current && poleHeadRef.current) {
      const mastOffset = new THREE.Matrix4().makeTranslation(0, 4.2, 0);
      const headOffset = new THREE.Matrix4().makeTranslation(0, 8.3, 1.3);
      poleMatrices.forEach((m, idx) => {
        poleMastRef.current!.setMatrixAt(
          idx,
          m.clone().multiply(mastOffset)
        );
        poleHeadRef.current!.setMatrixAt(
          idx,
          m.clone().multiply(headOffset)
        );
      });
      poleMastRef.current.instanceMatrix.needsUpdate = true;
      poleHeadRef.current.instanceMatrix.needsUpdate = true;
    }
    if (
      treeTrunkRef.current &&
      treeCanopyLowerRef.current &&
      treeCanopyUpperRef.current
    ) {
      const dummy = new THREE.Object3D();
      treeData.forEach((t, idx) => {
        dummy.position.set(t.pos[0], 1.5 * t.scale, t.pos[2]);
        dummy.rotation.set(0, idx * 0.6, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        treeTrunkRef.current!.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(t.pos[0], 4.4 * t.scale, t.pos[2]);
        dummy.updateMatrix();
        treeCanopyLowerRef.current!.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(t.pos[0], 6.7 * t.scale, t.pos[2]);
        dummy.updateMatrix();
        treeCanopyUpperRef.current!.setMatrixAt(idx, dummy.matrix);
      });
      treeTrunkRef.current.instanceMatrix.needsUpdate = true;
      treeCanopyLowerRef.current.instanceMatrix.needsUpdate = true;
      treeCanopyUpperRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [postMatrices, poleMatrices, treeData]);

  // Starting grid slot coordinates behind z = 0
  const gridSlots = useMemo(
    () => [
      { x: -2.4, z: 6.5 },
      { x: 2.4, z: 11.5 },
      { x: -2.4, z: 16.5 },
      { x: 2.4, z: 21.5 },
    ],
    []
  );

  return (
    <group name="TrackEnvironment">
      {/* PHYSICS COLLIDERS (Rapier Fixed Bodies) */}
      <RigidBody
        type="fixed"
        colliders={false}
        friction={0.04}
        restitution={0}
        userData={GROUND_USER_DATA}
      >
        <CuboidCollider
          args={[650, 1, 650]}
          position={[80, -1, 0]}
          friction={0.04}
          restitution={0}
        />
      </RigidBody>

      {/* Guardrail Segmented Colliders */}
      <RigidBody
        type="fixed"
        colliders={false}
        friction={0.08}
        restitution={0.22}
        userData={INNER_RAIL_USER_DATA}
      >
        {circuit.barrierColliders
          .filter((seg) => seg.side === 'inner')
          .map((seg, idx) => (
            <CuboidCollider
              key={`inner-rail-col-${idx}`}
              args={[0.38, 0.85, seg.length / 2]}
              position={seg.position}
              quaternion={seg.quaternion}
              friction={0.08}
              restitution={0.22}
            />
          ))}
      </RigidBody>
      <RigidBody
        type="fixed"
        colliders={false}
        friction={0.08}
        restitution={0.22}
        userData={OUTER_RAIL_USER_DATA}
      >
        {circuit.barrierColliders
          .filter((seg) => seg.side === 'outer')
          .map((seg, idx) => (
            <CuboidCollider
              key={`outer-rail-col-${idx}`}
              args={[0.38, 0.85, seg.length / 2]}
              position={seg.position}
              quaternion={seg.quaternion}
              friction={0.08}
              restitution={0.22}
            />
          ))}
      </RigidBody>

      {/* Tire Barrier Colliders & Visuals */}
      {circuit.tireBarriers.map((cluster, idx) => (
        <group
          key={`tire-cluster-${idx}`}
          position={cluster.position}
          rotation={[0, cluster.rotationY, 0]}
        >
          <RigidBody
            type="fixed"
            colliders={false}
            friction={0.18}
            restitution={0.35}
            userData={{
              surface: 'tire_barrier',
              label: cluster.label,
            }}
          >
            <CuboidCollider
              args={[0.9, 0.75, cluster.count * 0.52]}
              position={[0, 0.75, 0]}
              friction={0.18}
              restitution={0.35}
            />
          </RigidBody>
          {Array.from({ length: cluster.count }).map((_, tIdx) => {
            const zOff = (tIdx - (cluster.count - 1) / 2) * 1.02;
            const isRed = tIdx % 2 === 0;
            return (
              <group key={tIdx} position={[0, 0, zOff]}>
                {[0.24, 0.68, 1.12].map((yPos, stackIdx) => (
                  <mesh
                    key={stackIdx}
                    position={[0, yPos, 0]}
                    castShadow
                    receiveShadow
                  >
                    <cylinderGeometry args={[0.46, 0.46, 0.42, 16]} />
                    <meshStandardMaterial
                      color={isRed ? '#dc2626' : '#f1f5f9'}
                      roughness={0.78}
                      metalness={0.05}
                    />
                  </mesh>
                ))}
              </group>
            );
          })}
        </group>
      ))}

      {/* VISUAL TRACK SURFACES */}
      {/* Natural Turf Ground */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[80, -0.02, 0]}
        receiveShadow
      >
        <planeGeometry args={[1200, 1200]} />
        <meshStandardMaterial
          map={assets.grassTexture}
          roughness={0.95}
          metalness={0.0}
        />
      </mesh>

      {/* Paved Shoulder / Runoff Apron */}
      <mesh geometry={assets.shoulderGeometry} receiveShadow>
        <meshStandardMaterial
          map={assets.shoulderTexture}
          roughness={0.92}
          metalness={0.05}
        />
      </mesh>

      {/* Main Racing Asphalt Ribbon */}
      <mesh geometry={assets.roadGeometry} receiveShadow>
        <meshStandardMaterial
          map={assets.asphaltTexture}
          roughnessMap={assets.asphaltRoughnessTexture}
          roughness={0.78}
          metalness={0.06}
        />
      </mesh>

      {/* FIA Corner Apex Curbs */}
      <mesh geometry={assets.curbsGeometry} receiveShadow>
        <meshStandardMaterial
          map={assets.curbTexture}
          roughness={0.7}
          metalness={0.05}
        />
      </mesh>

      {/* Steel W-Beam Guardrails */}
      <mesh
        geometry={assets.guardrailBeamGeometry}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#b8c0cc"
          roughness={0.38}
          metalness={0.78}
        />
      </mesh>

      {/* Instanced Guardrail Support Posts */}
      <instancedMesh
        ref={postsRef}
        args={[undefined, undefined, postMatrices.length]}
        castShadow
      >
        <boxGeometry args={[0.12, 0.88, 0.14]} />
        <meshStandardMaterial color="#64748b" roughness={0.5} metalness={0.7} />
      </instancedMesh>

      {/* Checkered Start/Finish Line */}
      <mesh
        position={[0, 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[TRACK_HALF_WIDTH * 2 - 0.6, 3.2]} />
        <meshStandardMaterial
          map={assets.startLineTexture}
          roughness={0.75}
        />
      </mesh>

      {/* Starting Grid Paint Boxes */}
      {gridSlots.map((slot, i) => (
        <group key={`grid-${i}`} position={[slot.x, 0.011, slot.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.2, 0.16]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.6} />
          </mesh>
          <mesh position={[-1.05, 0, 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.14, 1.3]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.6} />
          </mesh>
          <mesh position={[1.05, 0, 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.14, 1.3]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Start/Finish Overhead Gantry */}
      <group position={[0, 0, 0]}>
        <RigidBody
          type="fixed"
          colliders={false}
          userData={GANTRY_USER_DATA}
        >
          <CuboidCollider args={[0.5, 3.5, 0.5]} position={[-10.4, 3.5, 0]} />
          <CuboidCollider args={[0.5, 3.5, 0.5]} position={[10.4, 3.5, 0]} />
        </RigidBody>

        {/* Left & Right Steel Truss Pillars */}
        {[-10.4, 10.4].map((xPos, idx) => (
          <mesh key={idx} position={[xPos, 3.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.65, 7.0, 0.65]} />
            <meshStandardMaterial
              color="#1e293b"
              roughness={0.45}
              metalness={0.75}
            />
          </mesh>
        ))}

        {/* Overhead Truss Beam & Banner */}
        <mesh position={[0, 6.45, 0]} castShadow>
          <boxGeometry args={[21.5, 1.75, 0.7]} />
          <meshStandardMaterial
            color="#0f172a"
            roughness={0.4}
            metalness={0.7}
          />
        </mesh>

        {/* Banner Front & Back Faces */}
        <mesh position={[0, 6.45, 0.37]}>
          <planeGeometry args={[18.5, 1.5]} />
          <meshStandardMaterial
            map={assets.gantryBannerTexture}
            roughness={0.35}
            emissive="#1e293b"
            emissiveIntensity={0.35}
          />
        </mesh>
        <mesh position={[0, 6.45, -0.37]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[18.5, 1.5]} />
          <meshStandardMaterial
            map={assets.gantryBannerTexture}
            roughness={0.35}
            emissive="#1e293b"
            emissiveIntensity={0.35}
          />
        </mesh>

        {/* Start Light Pods */}
        {[-3.2, -1.6, 0, 1.6, 3.2].map((lx, idx) => (
          <group key={idx} position={[lx, 5.35, 0.32]}>
            <mesh>
              <boxGeometry args={[0.6, 0.35, 0.25]} />
              <meshStandardMaterial color="#090d16" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0, 0.13]}>
              <circleGeometry args={[0.1, 16]} />
              <meshStandardMaterial
                color="#22c55e"
                emissive="#22c55e"
                emissiveIntensity={1.6}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* Braking Distance Boards (150m / 100m / 50m) */}
      {circuit.brakingBoards.map((board, idx) => (
        <group
          key={`board-${idx}`}
          position={board.position}
          rotation={[0, board.rotationY, 0]}
        >
          <mesh position={[0, 0.7, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 1.4, 8]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} />
          </mesh>
          <mesh position={[0, 1.4, 0]} castShadow>
            <boxGeometry args={[1.6, 1.0, 0.08]} />
            <meshStandardMaterial color="#1e293b" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.4, 0.045]}>
            <planeGeometry args={[1.52, 0.94]} />
            <meshStandardMaterial
              map={brakingTextures[board.distanceLabel]}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}

      {/* Main Straight Grandstand (Outer Left) */}
      <group position={[-25, 0, -28]} rotation={[0, Math.PI / 2, 0]}>
        {/* Lower Structural Concourse Podium */}
        <mesh position={[0, 0.85, 0.5]} castShadow receiveShadow>
          <boxGeometry args={[68, 1.7, 11]} />
          <meshStandardMaterial color="#334155" roughness={0.82} />
        </mesh>
        {/* Rear Structural Wall */}
        <mesh position={[0, 4.6, -4.7]} castShadow receiveShadow>
          <boxGeometry args={[68, 7.6, 1.4]} />
          <meshStandardMaterial color="#1e293b" roughness={0.78} />
        </mesh>
        {/* Stepped Seating Tiers Facing Track (+Z) */}
        {[0, 1, 2, 3, 4].map((tier) => (
          <mesh
            key={tier}
            position={[0, 2.0 + tier * 0.92, 4.0 - tier * 1.75]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[65, 0.72, 1.8]} />
            <meshStandardMaterial
              color={tier % 2 === 0 ? '#dc2626' : '#475569'}
              roughness={0.72}
            />
          </mesh>
        ))}
        {/* Canopy Steel Support Columns */}
        {[-26, -9, 9, 26].map((colX, idx) => (
          <mesh key={idx} position={[colX, 5.2, -3.5]} castShadow>
            <boxGeometry args={[0.55, 7.5, 0.55]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.75} roughness={0.35} />
          </mesh>
        ))}
        {/* Cantilever Roof */}
        <mesh
          position={[0, 9.2, 0.8]}
          rotation={[0.1, 0, 0]}
          castShadow
        >
          <boxGeometry args={[70, 0.42, 14.5]} />
          <meshStandardMaterial
            color="#e2e8f0"
            roughness={0.38}
            metalness={0.55}
          />
        </mesh>
      </group>

      {/* Pit Complex & Race Control Building (Inner Right) */}
      <group position={[23, 0, -22]}>
        <mesh position={[0, 3.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[10, 7.2, 54]} />
          <meshStandardMaterial color="#334155" roughness={0.62} />
        </mesh>
        {/* Crimson Motorsport Accent Trim */}
        <mesh position={[-5.04, 3.7, 0]}>
          <boxGeometry args={[0.08, 0.35, 53.5]} />
          <meshStandardMaterial color="#dc2626" roughness={0.45} />
        </mesh>
        {/* Pit Garage Bay Doors */}
        {[-18, -9, 0, 9, 18].map((bz, idx) => (
          <mesh key={idx} position={[-5.04, 1.45, bz]}>
            <boxGeometry args={[0.08, 2.8, 6.2]} />
            <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.4} />
          </mesh>
        ))}
        {/* Paddock Hospitality Glass Strip */}
        <mesh position={[-5.05, 5.3, 0]}>
          <boxGeometry args={[0.1, 1.9, 48]} />
          <meshStandardMaterial
            color="#38bdf8"
            roughness={0.12}
            metalness={0.85}
          />
        </mesh>
        {/* Race Control Timing Tower */}
        <mesh position={[0, 10.5, 16]} castShadow receiveShadow>
          <boxGeometry args={[8.5, 6.8, 8.5]} />
          <meshStandardMaterial color="#1e293b" roughness={0.5} />
        </mesh>
        <mesh position={[-4.3, 12.0, 16]}>
          <boxGeometry args={[0.1, 2.4, 7.8]} />
          <meshStandardMaterial
            color="#7dd3fc"
            roughness={0.1}
            metalness={0.9}
          />
        </mesh>
      </group>

      {/* Instanced Trackside Light Poles */}
      <instancedMesh
        ref={poleMastRef}
        args={[undefined, undefined, poleMatrices.length]}
        castShadow
      >
        <cylinderGeometry args={[0.1, 0.14, 8.4, 8]} />
        <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.75} />
      </instancedMesh>
      <instancedMesh
        ref={poleHeadRef}
        args={[undefined, undefined, poleMatrices.length]}
      >
        <boxGeometry args={[0.5, 0.16, 2.8]} />
        <meshStandardMaterial
          color="#cbd5e1"
          emissive="#fef3c7"
          emissiveIntensity={0.4}
          roughness={0.3}
          metalness={0.6}
        />
      </instancedMesh>

      {/* Instanced Stylized Trackside Trees */}
      <instancedMesh
        ref={treeTrunkRef}
        args={[undefined, undefined, treeData.length]}
        castShadow
      >
        <cylinderGeometry args={[0.24, 0.36, 3.0, 7]} />
        <meshStandardMaterial color="#4a3728" roughness={0.92} />
      </instancedMesh>
      <instancedMesh
        ref={treeCanopyLowerRef}
        args={[undefined, undefined, treeData.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[2.4, 4.4, 7]} />
        <meshStandardMaterial color="#234226" roughness={0.88} />
      </instancedMesh>
      <instancedMesh
        ref={treeCanopyUpperRef}
        args={[undefined, undefined, treeData.length]}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[1.75, 3.6, 7]} />
        <meshStandardMaterial color="#2c5430" roughness={0.85} />
      </instancedMesh>
    </group>
  );
}
