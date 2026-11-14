import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { Ray } from '@dimforge/rapier3d-compat';
import type { VehicleMotionSnapshot, VehicleSpec } from '../core/types';
import { sharedInputManager } from '../input/InputManager';
import {
  CollisionHandler,
  parseColliderUserData,
} from '../physics/CollisionHandler';
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
import type { RacerSpatialState } from '../ai/AIDriver';
import type { DrivingInputState } from '../input/InputManager';
import {
  INITIAL_TELEMETRY,
  useGameStore,
  useTelemetryStore,
} from '../../state/gameStore';
import { SportsCarModel } from './SportsCarModel';
import type { VehicleVisualRefs } from './VehicleAssetRegistry';

interface VehicleControllerProps {
  spec: VehicleSpec;
  motionRef: React.RefObject<VehicleMotionSnapshot>;
  gridSlotIndex: number;
  sharedRacersRef: React.RefObject<Map<string, RacerSpatialState>>;
}

const FIXED_DT = 1 / 60;

const IDLE_LOCKED_INPUT: DrivingInputState = {
  accelerate: false,
  brakeReverse: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
  steerAxis: 0,
  throttleAxis: 0,
  brakeAxis: 0,
};

export function VehicleController({
  spec,
  motionRef,
  gridSlotIndex,
  sharedRacersRef,
}: VehicleControllerProps) {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const { world, rapier } = useRapier();

  const circuit = useMemo(() => getCircuitDefinition(), []);
  const initialSlot = useMemo(
    () => getGridSlotTransform(gridSlotIndex, circuit),
    [gridSlotIndex, circuit]
  );
  const physicsEngine = useMemo(() => new VehiclePhysicsEngine(spec), [spec]);
  const collisionHandler = useMemo(() => new CollisionHandler(), []);

  // Reusable Ray instance for wheel suspension raycasts
  const rayRef = useRef<Ray | null>(null);
  if (!rayRef.current) {
    rayRef.current = new rapier.Ray(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 }
    );
  }

  // Track pending resets cleanly inside physics step
  const handledResetNonce = useRef<number>(
    useGameStore.getState().resetNonce
  );
  const handledRestartNonce = useRef<number>(
    useGameStore.getState().restartNonce
  );
  const handledGridSlotRef = useRef<number>(gridSlotIndex);

  // Latest physics step outputs consumed by visual useFrame
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
  const collisionPulseDecayRef = useRef(0);

  // Visual Three.js refs (zero React re-renders during driving)
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

  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const tmpForward = useMemo(() => new THREE.Vector3(), []);
  const tmpVel = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    physicsEngine.setSpec(spec);
  }, [physicsEngine, spec]);

  const performReset = (toGridStart: boolean) => {
    const body = rigidBodyRef.current;
    if (!body) return;

    const sector = useGameStore.getState().currentSector;
    const spawn = toGridStart
      ? getGridSlotTransform(gridSlotIndex, circuit)
      : sector <= 0
        ? getGridSlotTransform(gridSlotIndex, circuit)
        : getCheckpointSpawnTransform(sector, circuit);

    body.setTranslation(
      { x: spawn.position[0], y: spawn.position[1], z: spawn.position[2] },
      true
    );
    body.setRotation(
      {
        x: spawn.quaternion[0],
        y: spawn.quaternion[1],
        z: spawn.quaternion[2],
        w: spawn.quaternion[3],
      },
      true
    );
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.resetForces(true);
    body.resetTorques(true);

    physicsEngine.reset();
    collisionHandler.reset();
    collisionPulseDecayRef.current = 0;

    tmpQuat.set(
      spawn.quaternion[0],
      spawn.quaternion[1],
      spawn.quaternion[2],
      spawn.quaternion[3]
    );
    tmpForward.set(0, 0, -1).applyQuaternion(tmpQuat).normalize();

    motionRef.current.position = [...spawn.position];
    motionRef.current.quaternion = [...spawn.quaternion];
    motionRef.current.linearVelocity = [0, 0, 0];
    motionRef.current.forward = [tmpForward.x, tmpForward.y, tmpForward.z];
    motionRef.current.speedMs = 0;
    motionRef.current.forwardSpeedMs = 0;
    motionRef.current.steerAngleRad = 0;
    motionRef.current.isDrifting = false;
    motionRef.current.driftIntensity = 0;
    motionRef.current.isReversing = false;
    motionRef.current.justReset = true;
    motionRef.current.rearWheelsGrounded = [true, true];

    sharedRacersRef.current.set('player', {
      id: 'player',
      position: [...spawn.position],
      forward: [tmpForward.x, tmpForward.y, tmpForward.z],
      speedMs: 0,
    });

    const headingDeg =
      ((Math.atan2(-tmpForward.x, -tmpForward.z) * 180) / Math.PI + 360) % 360;

    if (toGridStart) {
      useTelemetryStore.getState().resetTimers();
    }
    useTelemetryStore.getState().setTelemetry({
      ...INITIAL_TELEMETRY,
      collisionPulse: 0,
      worldPosition: [...spawn.position],
      headingDeg,
    });
  };

  useBeforePhysicsStep(() => {
    const body = rigidBodyRef.current;
    if (!body) return;

    const gameState = useGameStore.getState();

    // Check reset / restart / grid slot updates
    if (
      gameState.restartNonce !== handledRestartNonce.current ||
      gridSlotIndex !== handledGridSlotRef.current
    ) {
      handledRestartNonce.current = gameState.restartNonce;
      handledResetNonce.current = gameState.resetNonce;
      handledGridSlotRef.current = gridSlotIndex;
      performReset(true);
      return;
    }

    if (gameState.resetNonce !== handledResetNonce.current) {
      handledResetNonce.current = gameState.resetNonce;
      performReset(false);
      return;
    }

    if (gameState.isPaused) return;

    body.resetForces(true);
    body.resetTorques(true);

    const translation = body.translation();
    const rotation = body.rotation();
    const linvel = body.linvel();
    const angvel = body.angvel();

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

    const rawInput = sharedInputManager.getInputState();
    const canDrive = gameState.racePhase === 'racing';
    const effectiveInput = canDrive ? rawInput : IDLE_LOCKED_INPUT;

    const stepResult = physicsEngine.step(
      {
        position: translation,
        quaternion: rotation,
        linearVelocity: linvel,
        angularVelocity: angvel,
        velocityAtPoint: (pt) => body.velocityAtPoint(pt),
      },
      effectiveInput,
      raycastFn,
      FIXED_DT
    );

    // Allow harmless launch-revving in Neutral during countdown lights
    if (gameState.racePhase === 'countdown' && rawInput.accelerate) {
      stepResult.telemetry.rpm = Math.min(
        spec.drivetrain.redlineRpm,
        Math.max(stepResult.telemetry.rpm, 5200)
      );
      stepResult.telemetry.throttle = 0.85;
    }

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

    // Store wheel & light targets for smooth visual update in useFrame
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

    // Update motion snapshot for camera, tire smoke & race tracking
    tmpQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
    tmpForward.set(0, 0, -1).applyQuaternion(tmpQuat).normalize();
    motionRef.current.position = [translation.x, translation.y, translation.z];
    motionRef.current.quaternion = [
      rotation.x,
      rotation.y,
      rotation.z,
      rotation.w,
    ];
    motionRef.current.linearVelocity = [linvel.x, linvel.y, linvel.z];
    motionRef.current.forward = [tmpForward.x, tmpForward.y, tmpForward.z];
    motionRef.current.speedMs = stepResult.telemetry.speedMs;
    motionRef.current.forwardSpeedMs = stepResult.telemetry.forwardSpeedMs;
    motionRef.current.steerAngleRad = stepResult.telemetry.steerAngleRad;
    motionRef.current.isDrifting = stepResult.telemetry.isDrifting;
    motionRef.current.driftIntensity = stepResult.telemetry.driftIntensity;
    motionRef.current.isReversing = stepResult.telemetry.isReversing;

    const rl = stepResult.wheelStates[2];
    const rr = stepResult.wheelStates[3];
    motionRef.current.rearWheelContactPoints[0][0] = rl.contactPoint.x;
    motionRef.current.rearWheelContactPoints[0][1] = rl.contactPoint.y;
    motionRef.current.rearWheelContactPoints[0][2] = rl.contactPoint.z;
    motionRef.current.rearWheelContactPoints[1][0] = rr.contactPoint.x;
    motionRef.current.rearWheelContactPoints[1][1] = rr.contactPoint.y;
    motionRef.current.rearWheelContactPoints[1][2] = rr.contactPoint.z;
    motionRef.current.rearWheelsGrounded[0] = rl.grounded;
    motionRef.current.rearWheelsGrounded[1] = rr.grounded;

    sharedRacersRef.current.set('player', {
      id: 'player',
      position: [translation.x, translation.y, translation.z],
      forward: [tmpForward.x, tmpForward.y, tmpForward.z],
      speedMs: stepResult.telemetry.speedMs,
    });

    const headingDeg =
      ((Math.atan2(-tmpForward.x, -tmpForward.z) * 180) / Math.PI + 360) % 360;

    useTelemetryStore.getState().setTelemetry({
      ...stepResult.telemetry,
      worldPosition: [translation.x, translation.y, translation.z],
      headingDeg,
    });
  });

  // Visual updates separated cleanly from physics step
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const isPaused = useGameStore.getState().isPaused;

    // Sync interpolated visual chassis transform to motionRef for stutter-free camera follow
    if (chassisGroupRef.current) {
      chassisGroupRef.current.getWorldPosition(tmpPos);
      chassisGroupRef.current.getWorldQuaternion(tmpQuat);
      tmpForward.set(0, 0, -1).applyQuaternion(tmpQuat).normalize();
      motionRef.current.position = [tmpPos.x, tmpPos.y, tmpPos.z];
      motionRef.current.quaternion = [
        tmpQuat.x,
        tmpQuat.y,
        tmpQuat.z,
        tmpQuat.w,
      ];
      motionRef.current.forward = [tmpForward.x, tmpForward.y, tmpForward.z];
    }

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

    if (steeringWheelRef.current) {
      steeringWheelRef.current.rotation.z =
        latestLightStateRef.current.steerAngleRad * 1.65;
    }

    if (brakeLightMatRef.current) {
      brakeLightMatRef.current.emissiveIntensity = latestLightStateRef.current
        .isBraking
        ? 4.4
        : 0.85;
    }

    if (reverseLightMatRef.current) {
      reverseLightMatRef.current.emissiveIntensity = latestLightStateRef.current
        .isReversing
        ? 3.2
        : 0.0;
    }

    // Decay HUD collision pulse smoothly
    if (collisionPulseDecayRef.current > 0) {
      collisionPulseDecayRef.current = Math.max(
        0,
        collisionPulseDecayRef.current - delta * 2.8
      );
      useTelemetryStore.getState().setTelemetry({
        collisionPulse: collisionPulseDecayRef.current,
      });
    }
  });

  const handleCollisionEnter = (payload: CollisionEnterPayload) => {
    const body = rigidBodyRef.current;
    if (!body) return;
    const linvel = body.linvel();
    tmpVel.set(linvel.x, linvel.y, linvel.z);

    const otherUserData =
      parseColliderUserData(payload.other.colliderObject?.userData) ??
      parseColliderUserData(payload.other.rigidBodyObject?.userData);

    const impactSpeed = Math.max(
      tmpVel.length(),
      Math.abs(motionRef.current.speedMs)
    );

    const info = collisionHandler.processCollision({
      otherUserData,
      relativeSpeedMs: impactSpeed,
    });

    if (info) {
      useGameStore.getState().recordCollision(info);
      collisionPulseDecayRef.current = info.intensity;
      useTelemetryStore.getState().setTelemetry({
        collisionPulse: info.intensity,
      });
    }
  };

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
      onCollisionEnter={handleCollisionEnter}
    >
      <CuboidCollider
        args={spec.dimensions.chassisHalfExtents}
        position={spec.dimensions.chassisColliderOffset}
        mass={spec.massKg}
        friction={0.05}
        restitution={0.12}
      />
      <SportsCarModel spec={spec} visualRefs={visualRefs} />
    </RigidBody>
  );
}
