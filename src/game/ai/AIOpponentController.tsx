import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { Ray } from '@dimforge/rapier3d-compat';
import {
  VehiclePhysicsEngine,
  type WheelRaycastFn,
} from '../physics/VehiclePhysics';
import {
  getCheckpointSpawnTransform,
  getCircuitDefinition,
  getGridSlotTransform,
  projectOntoCircuit,
} from '../tracks/CircuitData';
import { SportsCarModel } from '../vehicles/SportsCarModel';
import type { VehicleVisualRefs } from '../vehicles/VehicleAssetRegistry';
import { useGameStore } from '../../state/gameStore';
import type { DifficultyLevel } from '../racing/RaceTypes';
import {
  DIFFICULTY_PROFILES,
  buildAIVehicleSpec,
  type AIOpponentDescriptor,
} from './AIConfigs';
import { AIDriver, type RacerSpatialState } from './AIDriver';

interface AIOpponentControllerProps {
  descriptor: AIOpponentDescriptor;
  gridSlotIndex: number;
  difficulty: DifficultyLevel;
  sharedRacersRef: React.RefObject<Map<string, RacerSpatialState>>;
  getCheckpointIdx: (racerId: string) => number;
}

const FIXED_DT = 1 / 60;

export function AIOpponentController({
  descriptor,
  gridSlotIndex,
  difficulty,
  sharedRacersRef,
  getCheckpointIdx,
}: AIOpponentControllerProps) {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const { world, rapier } = useRapier();

  const circuit = useMemo(() => getCircuitDefinition(), []);
  const spec = useMemo(() => buildAIVehicleSpec(descriptor), [descriptor]);
  const initialSlot = useMemo(
    () => getGridSlotTransform(gridSlotIndex, circuit),
    [gridSlotIndex, circuit]
  );

  const physicsEngine = useMemo(() => new VehiclePhysicsEngine(spec), [spec]);
  const aiDriver = useMemo(
    () =>
      new AIDriver({
        id: descriptor.id,
        preferredLaneOffset: descriptor.preferredLaneOffset,
        paceVariance: descriptor.paceVariance,
        difficulty: DIFFICULTY_PROFILES[difficulty],
      }),
    [descriptor, difficulty]
  );

  useEffect(() => {
    aiDriver.setDifficulty(DIFFICULTY_PROFILES[difficulty]);
  }, [aiDriver, difficulty]);

  // Register & clean up spatial entry
  useEffect(() => {
    const map = sharedRacersRef.current;
    map.set(descriptor.id, {
      id: descriptor.id,
      position: [...initialSlot.position],
      forward: [0, 0, -1],
      speedMs: 0,
    });
    return () => {
      map.delete(descriptor.id);
    };
  }, [descriptor.id, initialSlot, sharedRacersRef]);

  const rayRef = useRef<Ray | null>(null);
  if (!rayRef.current) {
    rayRef.current = new rapier.Ray(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 }
    );
  }

  const handledRestartNonce = useRef<number>(
    useGameStore.getState().restartNonce
  );

  const latestWheelVisualsRef = useRef([
    { localY: -0.16, steerAngleRad: 0, angularSpeedRadPerSec: 0 },
    { localY: -0.16, steerAngleRad: 0, angularSpeedRadPerSec: 0 },
    { localY: -0.16, steerAngleRad: 0, angularSpeedRadPerSec: 0 },
    { localY: -0.16, steerAngleRad: 0, angularSpeedRadPerSec: 0 },
  ]);
  const latestLightStateRef = useRef({
    isBraking: false,
    isReversing: false,
    steerAngleRad: 0,
  });

  const chassisGroupRef = useRef<THREE.Group>(null);
  const wheelMount0 = useRef<THREE.Group>(null);
  const wheelMount1 = useRef<THREE.Group>(null);
  const wheelMount2 = useRef<THREE.Group>(null);
  const wheelMount3 = useRef<THREE.Group>(null);
  const wheelSpin0 = useRef<THREE.Group>(null);
  const wheelSpin1 = useRef<THREE.Group>(null);
  const wheelSpin2 = useRef<THREE.Group>(null);
  const wheelSpin3 = useRef<THREE.Group>(null);
  const steeringWheelRef = useRef<THREE.Group>(null);
  const brakeLightMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const reverseLightMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const visualRefs: VehicleVisualRefs = useMemo(
    () => ({
      chassisGroupRef,
      wheelMountRefs: [wheelMount0, wheelMount1, wheelMount2, wheelMount3],
      wheelSpinRefs: [wheelSpin0, wheelSpin1, wheelSpin2, wheelSpin3],
      steeringWheelRef,
      brakeLightMatRef,
      reverseLightMatRef,
    }),
    []
  );

  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const tmpForward = useMemo(() => new THREE.Vector3(), []);
  const othersScratch = useMemo<RacerSpatialState[]>(() => [], []);

  const resetToGrid = () => {
    const body = rigidBodyRef.current;
    if (!body) return;
    const slot = getGridSlotTransform(gridSlotIndex, circuit);
    body.setTranslation(
      { x: slot.position[0], y: slot.position[1], z: slot.position[2] },
      true
    );
    body.setRotation(
      {
        x: slot.quaternion[0],
        y: slot.quaternion[1],
        z: slot.quaternion[2],
        w: slot.quaternion[3],
      },
      true
    );
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.resetForces(true);
    body.resetTorques(true);
    physicsEngine.reset();
    aiDriver.reset();
    sharedRacersRef.current.set(descriptor.id, {
      id: descriptor.id,
      position: [...slot.position],
      forward: [0, 0, -1],
      speedMs: 0,
    });
  };

  useBeforePhysicsStep(() => {
    const body = rigidBodyRef.current;
    if (!body) return;

    const gameState = useGameStore.getState();

    if (gameState.restartNonce !== handledRestartNonce.current) {
      handledRestartNonce.current = gameState.restartNonce;
      resetToGrid();
      return;
    }

    if (gameState.isPaused) return;

    body.resetForces(true);
    body.resetTorques(true);

    const translation = body.translation();
    const rotation = body.rotation();
    const linvel = body.linvel();
    const angvel = body.angvel();

    tmpQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
    tmpForward.set(0, 0, -1).applyQuaternion(tmpQuat).normalize();
    const speedMs = Math.hypot(linvel.x, linvel.y, linvel.z);

    const selfSpatial: RacerSpatialState = {
      id: descriptor.id,
      position: [translation.x, translation.y, translation.z],
      forward: [tmpForward.x, tmpForward.y, tmpForward.z],
      speedMs,
    };
    sharedRacersRef.current.set(descriptor.id, selfSpatial);

    othersScratch.length = 0;
    sharedRacersRef.current.forEach((val) => {
      if (val.id !== descriptor.id) {
        othersScratch.push(val);
      }
    });

    const canDrive = gameState.racePhase === 'racing';
    const aiOut = aiDriver.computeStep(
      selfSpatial,
      othersScratch,
      circuit,
      FIXED_DT,
      canDrive
    );

    if (aiOut.needsCheckpointRespawn && canDrive) {
      const cpIdx = getCheckpointIdx(descriptor.id);
      const respawn = getCheckpointSpawnTransform(cpIdx, circuit);
      body.setTranslation(
        {
          x: respawn.position[0],
          y: respawn.position[1],
          z: respawn.position[2],
        },
        true
      );
      body.setRotation(
        {
          x: respawn.quaternion[0],
          y: respawn.quaternion[1],
          z: respawn.quaternion[2],
          w: respawn.quaternion[3],
        },
        true
      );
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      physicsEngine.reset();
      aiDriver.reset();
      return;
    }

    const ray = rayRef.current!;
    const raycastFn: WheelRaycastFn = (origin, direction, maxDistance) => {
      ray.origin = origin;
      ray.dir = direction;
      const hit = world.castRayAndGetNormal(
        ray,
        maxDistance,
        true,
        undefined,
        undefined,
        undefined,
        body
      );
      if (!hit) return null;

      const hitX = origin.x + direction.x * hit.timeOfImpact;
      const hitZ = origin.z + direction.z * hit.timeOfImpact;
      const proj = projectOntoCircuit(hitX, hitZ, circuit);
      const surface = proj.isOnCurb
        ? 'curb'
        : proj.isOnAsphalt
          ? 'asphalt'
          : 'offtrack';

      return {
        distance: hit.timeOfImpact,
        normal: hit.normal,
        surface,
      };
    };

    const stepResult = physicsEngine.step(
      {
        position: translation,
        quaternion: rotation,
        linearVelocity: linvel,
        angularVelocity: angvel,
        velocityAtPoint: (pt) => body.velocityAtPoint(pt),
      },
      aiOut.input,
      raycastFn,
      FIXED_DT
    );

    for (let i = 0; i < stepResult.forces.length; i++) {
      const f = stepResult.forces[i];
      body.addForceAtPoint(f.force, f.point, true);
    }

    if (
      stepResult.torque.x !== 0 ||
      stepResult.torque.y !== 0 ||
      stepResult.torque.z !== 0
    ) {
      body.addTorque(stepResult.torque, true);
    }

    for (let i = 0; i < 4; i++) {
      latestWheelVisualsRef.current[i].localY =
        stepResult.wheelStates[i].localY;
      latestWheelVisualsRef.current[i].steerAngleRad =
        stepResult.wheelStates[i].steerAngleRad;
      latestWheelVisualsRef.current[i].angularSpeedRadPerSec =
        stepResult.wheelStates[i].angularSpeedRadPerSec;
    }

    latestLightStateRef.current.isBraking = stepResult.telemetry.isBraking;
    latestLightStateRef.current.isReversing = stepResult.telemetry.isReversing;
    latestLightStateRef.current.steerAngleRad =
      stepResult.telemetry.steerAngleRad;
  });

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const isPaused = useGameStore.getState().isPaused;

    for (let i = 0; i < 4; i++) {
      const mount = visualRefs.wheelMountRefs[i].current;
      const spin = visualRefs.wheelSpinRefs[i].current;
      const wTarget = latestWheelVisualsRef.current[i];

      if (mount) {
        mount.position.y = THREE.MathUtils.lerp(
          mount.position.y,
          wTarget.localY,
          Math.min(1, delta * 24)
        );
        mount.rotation.y = wTarget.steerAngleRad;
      }
      if (spin && !isPaused) {
        spin.rotation.x += wTarget.angularSpeedRadPerSec * delta;
      }
    }

    if (brakeLightMatRef.current) {
      brakeLightMatRef.current.emissiveIntensity = latestLightStateRef.current
        .isBraking
        ? 4.2
        : 0.85;
    }
    if (reverseLightMatRef.current) {
      reverseLightMatRef.current.emissiveIntensity = latestLightStateRef.current
        .isReversing
        ? 3.0
        : 0.0;
    }
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      type="dynamic"
      colliders={false}
      position={initialSlot.position}
      quaternion={initialSlot.quaternion}
      linearDamping={0.04}
      angularDamping={0.35}
      canSleep={false}
      ccd={true}
    >
      <CuboidCollider
        args={spec.dimensions.chassisHalfExtents}
        position={spec.dimensions.chassisColliderOffset}
        mass={spec.massKg}
        friction={0.06}
        restitution={0.18}
      />
      <SportsCarModel spec={spec} visualRefs={visualRefs} />
    </RigidBody>
  );
}

