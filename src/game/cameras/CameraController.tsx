import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type {
  CameraMode,
  VehicleMotionSnapshot,
  VehicleSpec,
} from '../core/types';
import { useGameStore, useTelemetryStore } from '../../state/gameStore';

interface CameraControllerProps {
  spec: VehicleSpec;
  motionRef: React.RefObject<VehicleMotionSnapshot>;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const MODE_TRANSITION_DURATION = 0.34;

function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

export function CameraController({ spec, motionRef }: CameraControllerProps) {
  const { camera } = useThree();
  const cameraMode = useGameStore((s) => s.cameraMode);
  const prevModeRef = useRef<CameraMode>(cameraMode);
  const initializedRef = useRef(false);

  const smoothPosRef = useRef(new THREE.Vector3(0, 3, 16));
  const smoothLookAtRef = useRef(new THREE.Vector3(0, 1, 0));
  const smoothDirRef = useRef(new THREE.Vector3(0, 0, -1));
  const smoothDriftSwayRef = useRef(0);

  const modeTransitionRef = useRef({
    active: false,
    elapsed: 0,
    fromPos: new THREE.Vector3(),
    fromLookAt: new THREE.Vector3(),
    fromFov: 58,
  });

  // Reusable math scratch objects (zero per-frame allocations)
  const carPos = useMemo(() => new THREE.Vector3(), []);
  const carQuat = useMemo(() => new THREE.Quaternion(), []);
  const carForward = useMemo(() => new THREE.Vector3(), []);
  const carRight = useMemo(() => new THREE.Vector3(), []);
  const carForwardXZ = useMemo(() => new THREE.Vector3(), []);
  const carVel = useMemo(() => new THREE.Vector3(), []);
  const carVelXZ = useMemo(() => new THREE.Vector3(), []);
  const desiredPos = useMemo(() => new THREE.Vector3(), []);
  const desiredLookAt = useMemo(() => new THREE.Vector3(), []);
  const localOffset = useMemo(() => new THREE.Vector3(), []);
  const shakeOffset = useMemo(() => new THREE.Vector3(), []);
  const blendedPos = useMemo(() => new THREE.Vector3(), []);
  const blendedLookAt = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (prevModeRef.current !== cameraMode) {
      prevModeRef.current = cameraMode;
      const perspCam = camera as THREE.PerspectiveCamera;
      modeTransitionRef.current.active = initializedRef.current;
      modeTransitionRef.current.elapsed = 0;
      modeTransitionRef.current.fromPos.copy(camera.position);
      modeTransitionRef.current.fromLookAt.copy(smoothLookAtRef.current);
      modeTransitionRef.current.fromFov = perspCam.isPerspectiveCamera
        ? perspCam.fov
        : 58;
    }
  }, [cameraMode, camera]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const snap = motionRef.current;

    carPos.set(snap.position[0], snap.position[1], snap.position[2]);
    carQuat.set(
      snap.quaternion[0],
      snap.quaternion[1],
      snap.quaternion[2],
      snap.quaternion[3]
    );
    carForward.set(0, 0, -1).applyQuaternion(carQuat).normalize();
    carRight.set(1, 0, 0).applyQuaternion(carQuat).normalize();
    carVel.set(
      snap.linearVelocity[0],
      snap.linearVelocity[1],
      snap.linearVelocity[2]
    );

    const shouldSnap = !initializedRef.current || snap.justReset;
    if (snap.justReset) {
      snap.justReset = false;
      modeTransitionRef.current.active = false;
      smoothDriftSwayRef.current = 0;
    }

    const perspCam = camera as THREE.PerspectiveCamera;
    const speedRatio = Math.min(1, snap.speedMs / spec.drivetrain.topSpeedMs);
    const collisionPulse = useTelemetryStore.getState().collisionPulse;

    let targetFov = 58;

    if (cameraMode === 'COCKPIT') {
      const [ox, oy, oz] = spec.cameraAnchors.cockpitOffset;
      localOffset.set(ox, oy, oz).applyQuaternion(carQuat);
      desiredPos.copy(carPos).add(localOffset);
      desiredLookAt
        .copy(desiredPos)
        .addScaledVector(carForward, 24)
        .addScaledVector(WORLD_UP, -0.45);
      targetFov = 72 + speedRatio * 4;
      smoothPosRef.current.copy(desiredPos);
      smoothLookAtRef.current.copy(desiredLookAt);
    } else if (cameraMode === 'HOOD') {
      const [ox, oy, oz] = spec.cameraAnchors.hoodOffset;
      localOffset.set(ox, oy, oz).applyQuaternion(carQuat);
      desiredPos.copy(carPos).add(localOffset);
      desiredLookAt
        .copy(desiredPos)
        .addScaledVector(carForward, 26)
        .addScaledVector(WORLD_UP, -0.6);
      targetFov = 68 + speedRatio * 7;
      smoothPosRef.current.copy(desiredPos);
      smoothLookAtRef.current.copy(desiredLookAt);
    } else {
      // CHASE Camera: speed-sensitive pullback + drift sway & heading lag
      carForwardXZ.set(carForward.x, 0, carForward.z);
      if (carForwardXZ.lengthSq() < 0.001) {
        carForwardXZ.set(0, 0, -1);
      } else {
        carForwardXZ.normalize();
      }

      let driftLateralSway = 0;
      if (snap.forwardSpeedMs > 6 && !snap.isReversing) {
        carVelXZ.set(carVel.x, 0, carVel.z);
        if (carVelXZ.lengthSq() > 4) {
          carVelXZ.normalize();
          const driftBlend = snap.isDrifting
            ? 0.28 + snap.driftIntensity * 0.24
            : 0.16;
          carForwardXZ.lerp(carVelXZ, driftBlend).normalize();
          // Subtle lateral framing offset during drift
          const sideSlip = carVel.dot(carRight);
          driftLateralSway = THREE.MathUtils.clamp(
            sideSlip * 0.065 * snap.driftIntensity,
            -0.65,
            0.65
          );
        }
      }

      if (shouldSnap) {
        smoothDirRef.current.copy(carForwardXZ);
        smoothDriftSwayRef.current = driftLateralSway;
      } else {
        const dirAlpha = 1 - Math.exp(-7.5 * dt);
        smoothDirRef.current.lerp(carForwardXZ, dirAlpha).normalize();
        smoothDriftSwayRef.current = THREE.MathUtils.lerp(
          smoothDriftSwayRef.current,
          driftLateralSway,
          1 - Math.exp(-6.0 * dt)
        );
      }

      const chaseDistance = 5.75 + speedRatio * 1.25;
      const chaseHeight = 2.08 + speedRatio * 0.30;

      desiredPos
        .copy(carPos)
        .addScaledVector(smoothDirRef.current, -chaseDistance)
        .addScaledVector(carRight, smoothDriftSwayRef.current)
        .addScaledVector(WORLD_UP, chaseHeight);
      desiredPos.y = Math.max(desiredPos.y, 0.9);

      desiredLookAt
        .copy(carPos)
        .addScaledVector(smoothDirRef.current, 4.2)
        .addScaledVector(WORLD_UP, 0.72);

      if (shouldSnap) {
        smoothPosRef.current.copy(desiredPos);
        smoothLookAtRef.current.copy(desiredLookAt);
      } else {
        const posAlpha = 1 - Math.exp(-11.0 * dt);
        const lookAlpha = 1 - Math.exp(-15.0 * dt);
        smoothPosRef.current.lerp(desiredPos, posAlpha);
        smoothLookAtRef.current.lerp(desiredLookAt, lookAlpha);
      }

      targetFov = 58 + speedRatio * 15 + snap.driftIntensity * 2.5;
    }

    initializedRef.current = true;

    // Smoothly interpolate across camera perspective switches (C key)
    const trans = modeTransitionRef.current;
    if (trans.active) {
      trans.elapsed += dt;
      const rawT = trans.elapsed / MODE_TRANSITION_DURATION;
      const ease = easeOutCubic(rawT);

      blendedPos.copy(trans.fromPos).lerp(smoothPosRef.current, ease);
      blendedLookAt.copy(trans.fromLookAt).lerp(smoothLookAtRef.current, ease);
      camera.position.copy(blendedPos);
      camera.lookAt(blendedLookAt);

      if (perspCam.isPerspectiveCamera) {
        perspCam.fov = THREE.MathUtils.lerp(trans.fromFov, targetFov, ease);
        perspCam.updateProjectionMatrix();
      }

      if (rawT >= 1) {
        trans.active = false;
      }
      return;
    }

    // Subtle procedural impact shake on barrier collision (chase/hood only)
    if (collisionPulse > 0.02 && cameraMode !== 'COCKPIT') {
      const t = state.clock.elapsedTime * 55;
      const amp = collisionPulse * 0.18;
      shakeOffset.set(
        Math.sin(t * 1.1) * amp,
        Math.cos(t * 1.7) * amp * 0.7,
        Math.sin(t * 0.9) * amp
      );
      camera.position.copy(smoothPosRef.current).add(shakeOffset);
    } else {
      camera.position.copy(smoothPosRef.current);
    }

    camera.lookAt(smoothLookAtRef.current);

    if (perspCam.isPerspectiveCamera) {
      perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, targetFov, dt * 7);
      perspCam.updateProjectionMatrix();
    }
  });

  return null;
}
