import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, Sky } from '@react-three/drei';
import type { VehicleMotionSnapshot } from '../core/types';

interface WorldEnvironmentProps {
  motionRef: React.RefObject<VehicleMotionSnapshot>;
}

const SUN_DIRECTION = new THREE.Vector3(110, 48, -80);

export function WorldEnvironment({ motionRef }: WorldEnvironmentProps) {
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  const sunOffset = useMemo(
    () => SUN_DIRECTION.clone().normalize().multiplyScalar(85),
    []
  );

  useFrame(() => {
    const light = dirLightRef.current;
    if (!light) return;
    const [vx, , vz] = motionRef.current.position;
    // Snap shadow target to 0.5m increments to eliminate shadow-edge shimmer
    const sx = Math.round(vx * 2) * 0.5;
    const sz = Math.round(vz * 2) * 0.5;

    lightTarget.position.set(sx, 0, sz);
    lightTarget.updateMatrixWorld();

    light.position.set(sx + sunOffset.x, sunOffset.y, sz + sunOffset.z);
  });

  return (
    <>
      <color attach="background" args={['#b8cbe0']} />
      <fog attach="fog" args={['#b8cbe0', 140, 520]} />

      <Sky
        distance={4500}
        sunPosition={[110, 48, -80]}
        turbidity={4.2}
        rayleigh={1.35}
        mieCoefficient={0.004}
        mieDirectionalG={0.82}
      />

      {/* Local Procedural IBL Reflections (zero external HDRI network calls) */}
      <Environment resolution={256} frames={1}>
        <Lightformer
          form="rect"
          intensity={2.4}
          color="#fff4e0"
          scale={[40, 12, 1]}
          position={[30, 18, -25]}
          rotation={[0.45, -0.7, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.6}
          color="#bae6fd"
          scale={[60, 20, 1]}
          position={[0, 30, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <Lightformer
          form="ring"
          intensity={1.1}
          color="#e2e8f0"
          scale={25}
          position={[-30, 10, 25]}
          rotation={[0, Math.PI / 3, 0]}
        />
        <Lightformer
          form="rect"
          intensity={0.55}
          color="#334155"
          scale={[80, 80, 1]}
          position={[0, -8, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </Environment>

      {/* Ambient & Sky/Ground Bounce Fill */}
      <hemisphereLight args={['#cfe4ff', '#3a4635', 0.65]} />
      <ambientLight intensity={0.22} />

      {/* Car-following Crisp Shadow Sunlight */}
      <primitive object={lightTarget} />
      <directionalLight
        ref={dirLightRef}
        target={lightTarget}
        position={[sunOffset.x, sunOffset.y, sunOffset.z]}
        intensity={2.45}
        color="#fff5e4"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
        shadow-camera-near={10}
        shadow-camera-far={200}
        shadow-camera-left={-44}
        shadow-camera-right={44}
        shadow-camera-top={44}
        shadow-camera-bottom={-44}
      />
    </>
  );
}

