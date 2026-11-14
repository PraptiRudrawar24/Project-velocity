import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { VehicleMotionSnapshot } from '../core/types';
import { useGameStore } from '../../state/gameStore';

interface TireSmokeSystemProps {
  motionRef: React.RefObject<VehicleMotionSnapshot>;
}

interface SmokeParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  roll: number;
  rollSpeed: number;
  age: number;
  maxAge: number;
  baseScale: number;
}

const POOL_SIZE = 96;

function createSmokePuffTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  // Overlapping soft radial cloud lobes for organic tire smoke silhouette
  const lobes = [
    { x: 64, y: 64, r: 54, a: 0.42 },
    { x: 50, y: 58, r: 38, a: 0.30 },
    { x: 78, y: 56, r: 36, a: 0.28 },
    { x: 60, y: 74, r: 40, a: 0.30 },
  ];

  for (const lobe of lobes) {
    const grad = ctx.createRadialGradient(
      lobe.x,
      lobe.y,
      2,
      lobe.x,
      lobe.y,
      lobe.r
    );
    grad.addColorStop(0, `rgba(232, 236, 242, ${lobe.a})`);
    grad.addColorStop(0.45, `rgba(214, 220, 230, ${lobe.a * 0.55})`);
    grad.addColorStop(1, 'rgba(200, 206, 216, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lobe.x, lobe.y, lobe.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function TireSmokeSystem({ motionRef }: TireSmokeSystemProps) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const emitAccumulatorRef = useRef(0);
  const nextIndexRef = useRef(0);
  const randSeedRef = useRef(48271);

  const particles = useMemo<SmokeParticle[]>(() => {
    const arr: SmokeParticle[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      arr.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        roll: 0,
        rollSpeed: 0,
        age: 0,
        maxAge: 0.9,
        baseScale: 0.5,
      });
    }
    return arr;
  }, []);

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const texture = useMemo(() => createSmokePuffTexture(), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      }),
    [texture]
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const rollQuat = useMemo(() => new THREE.Quaternion(), []);
  const zAxis = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    };
  }, [geometry, material, texture]);

  const nextRand = () => {
    randSeedRef.current = (randSeedRef.current * 16807) % 2147483647;
    return (randSeedRef.current - 1) / 2147483646;
  };

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (useGameStore.getState().isPaused) return;

    const dt = Math.min(rawDelta, 0.05);
    const snap = motionRef.current;

    if (snap.isDrifting && snap.driftIntensity > 0.08) {
      const emitRate = 38 + snap.driftIntensity * 58;
      emitAccumulatorRef.current += dt * emitRate;

      while (emitAccumulatorRef.current >= 1) {
        emitAccumulatorRef.current -= 1;
        for (let wheelIdx = 0; wheelIdx < 2; wheelIdx++) {
          if (!snap.rearWheelsGrounded[wheelIdx]) continue;
          const pt = snap.rearWheelContactPoints[wheelIdx];
          const p = particles[nextIndexRef.current];
          nextIndexRef.current = (nextIndexRef.current + 1) % POOL_SIZE;

          p.active = true;
          p.x = pt[0] + (nextRand() - 0.5) * 0.22;
          p.y = pt[1] + 0.16;
          p.z = pt[2] + (nextRand() - 0.5) * 0.22;
          p.vx = snap.linearVelocity[0] * 0.16 + (nextRand() - 0.5) * 1.2;
          p.vy = 0.55 + nextRand() * 0.65 + snap.driftIntensity * 0.45;
          p.vz = snap.linearVelocity[2] * 0.16 + (nextRand() - 0.5) * 1.2;
          p.roll = nextRand() * Math.PI * 2;
          p.rollSpeed = (nextRand() - 0.5) * 1.8;
          p.age = 0;
          p.maxAge = 0.65 + nextRand() * 0.45 + snap.driftIntensity * 0.3;
          p.baseScale = 0.65 + snap.driftIntensity * 0.55;
        }
      }
    } else {
      emitAccumulatorRef.current = 0;
    }

    for (let i = 0; i < POOL_SIZE; i++) {
      const p = particles[i];
      if (!p.active) {
        dummy.position.set(0, -100, 0);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        dummy.position.set(0, -100, 0);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const life = p.age / p.maxAge;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= Math.max(0, 1 - dt * 2.6);
      p.vz *= Math.max(0, 1 - dt * 2.6);
      p.roll += p.rollSpeed * dt;

      const scaleCurve =
        life < 0.72
          ? p.baseScale * (1 + life * 2.2)
          : p.baseScale * (1 + 0.72 * 2.2) * (1 - (life - 0.72) / 0.28);

      dummy.position.set(p.x, p.y, p.z);
      dummy.quaternion.copy(camera.quaternion);
      rollQuat.setFromAxisAngle(zAxis, p.roll);
      dummy.quaternion.multiply(rollQuat);
      dummy.scale.setScalar(Math.max(0.001, scaleCurve));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, POOL_SIZE]}
      frustumCulled={false}
    />
  );
}
