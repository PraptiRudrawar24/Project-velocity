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

export function CameraController({ spec, motionRef }: CameraControllerProps) {
  const { camera } = useThree();
  const cameraMode = useGameStore((s) => s.cameraMode);
  const prevModeRef = useRef<CameraMode>(cameraMode);
  const initializedRef = useRef(false);

  const smoothPosRef = useRef(new THREE.Vector3(0, 3, 16));
  const smoothLookAtRef = useRef(new THREE.Vector3(0, 1, 0));
  const smoothDirRef = useRef(new THREE.Vector3(0, 0, -1));

  // Reusable math scratch objects
  const carPos = useMemo(() => new THREE.Vector3(), []);
  const carQuat = useMemo(() => new THREE.Quaternion(), []);
  const carForward = useMemo(() => new THREE.Vector3(), []);
  const carForwardXZ = useMemo(() => new THREE.Vector3(), []);
  const carVel = useMemo(() => new THREE.Vector3(), []);
  const carVelXZ = useMemo(() => new THREE.Vector3(), []);
  const desiredPos = useMemo(() => new THREE.Vector3(), []);
  const desiredLookAt = useMemo(() => new THREE.Vector3(), []);
  const localOffset = useMemo(() => new THREE.Vector3(), []);
  const shakeOffset = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (prevModeRef.current !== cameraMode) {
      prevModeRef.current = cameraMode;
      initializedRef.current = false; // Snap immediately on mode switch
    }
  }, [cameraMode]);

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
    carVel.set(
      snap.linearVelocity[0],
      snap.linearVelocity[1],
      snap.linearVelocity[2]
    );

    const shouldSnap = !initializedRef.current || snap.justReset;
    if (snap.justReset) {
      snap.justReset = false;
    }

    const perspCam = camera as THREE.PerspectiveCamera;
    const speedRatio = Math.min(1, snap.speedMs / spec.drivetrain.topSpeedMs);
    const collisionPulse = useTelemetryStore.getState().collisionPulse;

    if (cameraMode === 'COCKPIT') {
      const [ox, oy, oz] = spec.cameraAnchors.cockpitOffset;
      localOffset.set(ox, oy, oz).applyQuaternion(carQuat);
      desiredPos.copy(carPos).add(localOffset);
      desiredLookAt
        .copy(desiredPos)
        .addScaledVector(carForward, 24)
        .addScaledVector(WORLD_UP, -0.45);

      camera.position.copy(desiredPos);
      camera.lookAt(desiredLookAt);

      if (perspCam.isPerspectiveCamera) {
        perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, 72, dt * 10);
        perspCam.updateProjectionMatrix();
      }
      smoothPosRef.current.copy(desiredPos);
      smoothLookAtRef.current.copy(desiredLookAt);
      initializedRef.current = true;
      return;
    }

    if (cameraMode === 'HOOD') {
      const [ox, oy, oz] = spec.cameraAnchors.hoodOffset;
      localOffset.set(ox, oy, oz).applyQuaternion(carQuat);
      desiredPos.copy(carPos).add(localOffset);
      desiredLookAt
        .copy(desiredPos)
        .addScaledVector(carForward, 26)
        .addScaledVector(WORLD_UP, -0.6);

      camera.position.copy(desiredPos);
      camera.lookAt(desiredLookAt);

      if (perspCam.isPerspectiveCamera) {
        perspCam.fov = THREE.MathUtils.lerp(
          perspCam.fov,
          68 + speedRatio * 7,
          dt * 8
        );
        perspCam.updateProjectionMatrix();
      }
      smoothPosRef.current.copy(desiredPos);
      smoothLookAtRef.current.copy(desiredLookAt);
      initializedRef.current = true;
      return;
    }

    // CHASE Camera: smooth exponential follow + drift lag + speed pullback/FOV
    carForwardXZ.set(carForward.x, 0, carForward.z);
    if (carForwardXZ.lengthSq() < 0.001) {
      carForwardXZ.set(0, 0, -1);
    } else {
      carForwardXZ.normalize();
    }

    // Blend slightly toward velocity vector during high-speed forward drifts
    if (snap.forwardSpeedMs > 7 && !snap.isReversing) {
      carVelXZ.set(carVel.x, 0, carVel.z);
      if (carVelXZ.lengthSq() > 4) {
        carVelXZ.normalize();
        const driftBlend = snap.isDrifting ? 0.38 : 0.16;
        carForwardXZ.lerp(carVelXZ, driftBlend).normalize();
      }
    }

    if (shouldSnap) {
      smoothDirRef.current.copy(carForwardXZ);
    } else {
      const dirAlpha = 1 - Math.exp(-7.5 * dt);
      smoothDirRef.current.lerp(carForwardXZ, dirAlpha).normalize();
    }

    const chaseDistance = 5.75 + speedRatio * 1.15;
    const chaseHeight = 2.08 + speedRatio * 0.28;

    desiredPos
      .copy(carPos)
      .addScaledVector(smoothDirRef.current, -chaseDistance)
      .addScaledVector(WORLD_UP, chaseHeight);
    desiredPos.y = Math.max(desiredPos.y, 0.9);

    desiredLookAt
      .copy(carPos)
      .addScaledVector(smoothDirRef.current, 4.2)
      .addScaledVector(WORLD_UP, 0.72);

    if (shouldSnap) {
      smoothPosRef.current.copy(desiredPos);
      smoothLookAtRef.current.copy(desiredLookAt);
      initializedRef.current = true;
    } else {
      const posAlpha = 1 - Math.exp(-11.0 * dt);
      const lookAlpha = 1 - Math.exp(-15.0 * dt);
      smoothPosRef.current.lerp(desiredPos, posAlpha);
      smoothLookAtRef.current.lerp(desiredLookAt, lookAlpha);
    }

    // Subtle procedural impact shake on barrier collision
    if (collisionPulse > 0.02) {
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
      const targetFov = 58 + speedRatio * 15;
      perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, targetFov, dt * 6);
      perspCam.updateProjectionMatrix();
    }
  });

  return null;
}
