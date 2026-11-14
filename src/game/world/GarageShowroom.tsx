import { useMemo } from 'react';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { useGameStore } from '../../state/gameStore';
import { getDefaultCustomizationForVehicle, getVehicleSpec } from '../vehicles/CarConfigs';
import { SportsCarModel } from '../vehicles/SportsCarModel';
import {
  applyUpgradesAndCustomization,
  createDefaultUpgradeLevels,
} from '../../systems/progression/UpgradeSystem';

const PILLAR_ANGLES = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i * Math.PI) / 4);

/**
 * 3D Garage & Showroom stage rendered inside the single WebGL Canvas when `appScreen === 'garage'`.
 * Displays the currently previewed car on an illuminated turntable with smooth OrbitControls.
 */
export function GarageShowroom() {
  const previewVehicleId = useGameStore((s) => s.garagePreviewVehicleId);
  const autoRotate = useGameStore((s) => s.garageAutoRotate);
  const vehicleUpgrades = useGameStore((s) => s.vehicleUpgrades);
  const vehicleCustomizations = useGameStore((s) => s.vehicleCustomizations);

  const previewSpec = useMemo(() => {
    const baseSpec = getVehicleSpec(previewVehicleId);
    const upgrades = vehicleUpgrades[baseSpec.id] ?? createDefaultUpgradeLevels();
    const customization =
      vehicleCustomizations[baseSpec.id] ?? getDefaultCustomizationForVehicle(baseSpec);
    return applyUpgradesAndCustomization(baseSpec, upgrades, customization);
  }, [previewVehicleId, vehicleUpgrades, vehicleCustomizations]);

  return (
    <>
      <color attach="background" args={['#090d14']} />
      <fog attach="fog" args={['#090d14', 18, 46]} />

      {/* Local procedural studio reflections (no remote HDRI network dependency) */}
      <Environment resolution={256} frames={1}>
        <group rotation={[-Math.PI / 3, 0, 0]}>
          <Lightformer
            form="rect"
            intensity={2.8}
            color="#f8fafc"
            scale={[14, 4, 1]}
            position={[0, 5, 6]}
          />
          <Lightformer
            form="rect"
            intensity={2.0}
            color="#38bdf8"
            scale={[10, 2.2, 1]}
            position={[-7, 2.5, 0]}
            rotation={[0, Math.PI / 2, 0]}
          />
          <Lightformer
            form="rect"
            intensity={1.8}
            color="#f59e0b"
            scale={[10, 2.2, 1]}
            position={[7, 2.5, 0]}
            rotation={[0, -Math.PI / 2, 0]}
          />
          <Lightformer
            form="ring"
            intensity={1.6}
            color="#e2e8f0"
            scale={[8, 8, 1]}
            position={[0, 8, -4]}
            rotation={[Math.PI / 2, 0, 0]}
          />
        </group>
      </Environment>

      {/* Showroom three-point & overhead lighting */}
      <ambientLight intensity={0.35} color="#cbd5e1" />
      <hemisphereLight args={['#94a3b8', '#0f172a', 0.45]} />
      <spotLight
        position={[5.5, 8.2, 6.2]}
        angle={0.55}
        penumbra={0.65}
        intensity={120}
        color="#f8fafc"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0003}
      />
      <spotLight
        position={[-6.5, 5.5, -5.5]}
        angle={0.6}
        penumbra={0.8}
        intensity={75}
        color="#38bdf8"
      />
      <spotLight
        position={[0, 6.5, -7.5]}
        angle={0.65}
        penumbra={0.75}
        intensity={55}
        color="#f97316"
      />

      {/* Smooth damped turntable camera */}
      <OrbitControls
        makeDefault
        target={[0, 0.72, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.075}
        minDistance={3.2}
        maxDistance={8.5}
        minPolarAngle={0.28}
        maxPolarAngle={Math.PI / 2 - 0.06}
        autoRotate={autoRotate}
        autoRotateSpeed={0.9}
      />

      {/* Active vehicle resting at CG height y = 0.50 so wheels kiss turntable top y = 0 */}
      <group position={[0, 0.5, 0]}>
        <SportsCarModel key={previewSpec.id} spec={previewSpec} />
      </group>

      <ContactShadows
        position={[0, 0.004, 0]}
        opacity={0.72}
        scale={11}
        blur={1.9}
        far={2.6}
        resolution={512}
        color="#020617"
      />

      {/* Illuminated turntable dais (top surface aligns cleanly at y = 0) */}
      <group>
        <mesh position={[0, -0.06, 0]} receiveShadow>
          <cylinderGeometry args={[3.45, 3.65, 0.12, 64]} />
          <meshStandardMaterial color="#111827" metalness={0.65} roughness={0.32} />
        </mesh>
        {/* Inner polished deck */}
        <mesh position={[0, -0.002, 0]} receiveShadow>
          <cylinderGeometry args={[3.18, 3.18, 0.004, 64]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.25} />
        </mesh>
        {/* Glowing neon bevel ring */}
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.22, 3.31, 64]} />
          <meshBasicMaterial color="#38bdf8" toneMapped={false} />
        </mesh>
        {/* Outer plinth step */}
        <mesh position={[0, -0.14, 0]} receiveShadow>
          <cylinderGeometry args={[4.15, 4.35, 0.06, 64]} />
          <meshStandardMaterial color="#0b1120" metalness={0.55} roughness={0.45} />
        </mesh>
      </group>

      {/* Garage floor */}
      <mesh position={[0, -0.17, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[30, 64]} />
        <meshStandardMaterial color="#0b101b" metalness={0.35} roughness={0.58} />
      </mesh>

      {/* Architectural showroom columns & overhead light rig */}
      <group>
        {PILLAR_ANGLES.map((angle, idx) => {
          const radius = 11.2;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          return (
            <group key={idx} position={[x, 0, z]} rotation={[0, -angle, 0]}>
              <mesh position={[0, 3.2, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.45, 6.8, 0.65]} />
                <meshStandardMaterial color="#111827" metalness={0.6} roughness={0.42} />
              </mesh>
              {/* Vertical accent strip on inner column face */}
              <mesh position={[-0.24, 2.8, 0]}>
                <boxGeometry args={[0.04, 4.2, 0.08]} />
                <meshBasicMaterial
                  color={idx % 2 === 0 ? '#38bdf8' : '#f97316'}
                  toneMapped={false}
                />
              </mesh>
            </group>
          );
        })}

        {/* Overhead octagonal studio light truss */}
        <mesh position={[0, 6.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[4.8, 0.08, 12, 48]} />
          <meshStandardMaterial color="#1f2937" metalness={0.75} roughness={0.3} />
        </mesh>
        <mesh position={[0, 6.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[4.8, 0.035, 8, 48]} />
          <meshBasicMaterial color="#e0f2fe" toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

