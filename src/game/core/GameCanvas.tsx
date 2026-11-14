import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import type { VehicleMotionSnapshot } from './types';
import {
  getDefaultCustomizationForVehicle,
  getVehicleSpec,
} from '../vehicles/CarConfigs';
import {
  applyUpgradesAndCustomization,
  createDefaultUpgradeLevels,
} from '../../systems/progression/UpgradeSystem';
import { GarageShowroom } from '../world/GarageShowroom';
import {
  TRACK_SAMPLES,
  getCircuitDefinition,
  getGridSlotTransform,
  projectOntoCircuit,
} from '../tracks/CircuitData';
import { TrackEnvironment } from '../tracks/TrackEnvironment';
import { VehicleController } from '../vehicles/VehicleController';
import { TireSmokeSystem } from '../vehicles/TireSmokeSystem';
import { CameraController } from '../cameras/CameraController';
import { WorldEnvironment } from '../world/WorldEnvironment';
import { RaceManager } from '../racing/RaceManager';
import { AI_DRIVER_ROSTER } from '../ai/AIConfigs';
import type { RacerSpatialState } from '../ai/AIDriver';
import { AIOpponentController } from '../ai/AIOpponentController';
import type { RacerProgressState } from '../racing/RaceTypes';
import { useGameStore, useTelemetryStore } from '../../state/gameStore';
import { ErrorFallback, GameErrorBoundary } from '../../components/menus/ErrorFallback';

function checkWebGLSupport(): { ok: boolean; reason?: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl) {
      return {
        ok: false,
        reason:
          'WebGL context could not be initialized. Hardware acceleration or WebGL support is required.',
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason:
        err instanceof Error ? err.message : 'Failed to inspect WebGL support.',
    };
  }
}

export function GameCanvas() {
  const appScreen = useGameStore((s) => s.appScreen);
  const selectedVehicleId = useGameStore((s) => s.selectedVehicleId);
  const vehicleUpgrades = useGameStore((s) => s.vehicleUpgrades);
  const vehicleCustomizations = useGameStore((s) => s.vehicleCustomizations);
  const isPaused = useGameStore((s) => s.isPaused);
  const raceConfig = useGameStore((s) => s.raceConfig);
  const fatalError = useGameStore((s) => s.fatalError);
  const setFatalError = useGameStore((s) => s.setFatalError);
  const [webglStatus] = useState(() => checkWebGLSupport());

  const spec = useMemo(() => {
    const baseSpec = getVehicleSpec(selectedVehicleId);
    const upgrades =
      vehicleUpgrades[baseSpec.id] ?? createDefaultUpgradeLevels();
    const customization =
      vehicleCustomizations[baseSpec.id] ??
      getDefaultCustomizationForVehicle(baseSpec);
    return applyUpgradesAndCustomization(baseSpec, upgrades, customization);
  }, [selectedVehicleId, vehicleUpgrades, vehicleCustomizations]);
  const circuit = useMemo(() => getCircuitDefinition(), []);
  const playerSlotIdx = raceConfig.opponentCount;
  const initialPlayerSlot = useMemo(
    () => getGridSlotTransform(playerSlotIdx, circuit),
    [playerSlotIdx, circuit]
  );

  const motionRef = useRef<VehicleMotionSnapshot>({
    position: [...initialPlayerSlot.position],
    quaternion: [...initialPlayerSlot.quaternion],
    linearVelocity: [0, 0, 0],
    forward: [0, 0, -1],
    speedMs: 0,
    forwardSpeedMs: 0,
    steerAngleRad: 0,
    isDrifting: false,
    driftIntensity: 0,
    isReversing: false,
    justReset: true,
    rearWheelContactPoints: [
      [-0.84, 0, initialPlayerSlot.position[2] + 1.3],
      [0.84, 0, initialPlayerSlot.position[2] + 1.3],
    ],
    rearWheelsGrounded: [true, true],
  });

  const sharedRacersRef = useRef<Map<string, RacerSpatialState>>(new Map());
  const racerProgressRef = useRef<Map<string, RacerProgressState>>(new Map());

  const getCheckpointIdx = useCallback((racerId: string): number => {
    return racerProgressRef.current.get(racerId)?.lastValidCheckpointIdx ?? 0;
  }, []);

  const activeOpponents = useMemo(
    () => AI_DRIVER_ROSTER.slice(0, raceConfig.opponentCount),
    [raceConfig.opponentCount]
  );

  useEffect(() => {
    if (!webglStatus.ok && webglStatus.reason) {
      setFatalError(webglStatus.reason);
    }
  }, [webglStatus, setFatalError]);

  useEffect(() => {
    window.__VELOCITY_INSPECT__ = () => {
      const telemetry = useTelemetryStore.getState();
      const [px, , pz] = telemetry.worldPosition;
      const proj = projectOntoCircuit(px, pz, circuit);
      const lookFrame =
        circuit.frames[(proj.frame.index + 8) % TRACK_SAMPLES];
      const dx = lookFrame.position.x - px;
      const dz = lookFrame.position.z - pz;
      const lookaheadHeadingDeg =
        ((Math.atan2(-dx, -dz) * 180) / Math.PI + 360) % 360;

      return {
        game: useGameStore.getState(),
        telemetry,
        racers: Array.from(sharedRacersRef.current.values()),
        progress: Array.from(racerProgressRef.current.values()),
        trackNavigation: {
          frameIndex: proj.frame.index,
          lateralOffset: proj.lateralOffset,
          lookaheadHeadingDeg,
        },
      };
    };
    return () => {
      delete window.__VELOCITY_INSPECT__;
    };
  }, [circuit]);

  if (!webglStatus.ok || fatalError) {
    return (
      <ErrorFallback
        title="Graphics / Simulation Unavailable"
        message={
          fatalError ??
          webglStatus.reason ??
          'Unable to initialize 3D WebGL viewport.'
        }
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <GameErrorBoundary>
      <div className="pv-canvas-container">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 2.8, 15], fov: 58, near: 0.1, far: 900 }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
          }}
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            const handleContextLost = (e: Event) => {
              e.preventDefault();
              setFatalError(
                'WebGL graphics context was lost. Please reload to resume.'
              );
            };
            canvas.addEventListener('webglcontextlost', handleContextLost);
          }}
        >
          {appScreen === 'garage' ? (
            <Suspense fallback={null}>
              <GarageShowroom />
            </Suspense>
          ) : (
            <>
              <WorldEnvironment motionRef={motionRef} />
              <Suspense fallback={null}>
                <Physics
                  timeStep={1 / 60}
                  paused={isPaused}
                  interpolate={true}
                  maxCcdSubsteps={2}
                  gravity={[0, -9.81, 0]}
                >
                  <TrackEnvironment />
                  <VehicleController
                    key={spec.id}
                    spec={spec}
                    motionRef={motionRef}
                    gridSlotIndex={playerSlotIdx}
                    sharedRacersRef={sharedRacersRef}
                  />
                  {activeOpponents.map((desc, idx) => (
                    <AIOpponentController
                      key={desc.id}
                      descriptor={desc}
                      gridSlotIndex={idx}
                      difficulty={raceConfig.difficulty}
                      sharedRacersRef={sharedRacersRef}
                      getCheckpointIdx={getCheckpointIdx}
                    />
                  ))}
                  <TireSmokeSystem motionRef={motionRef} />
                  <CameraController spec={spec} motionRef={motionRef} />
                  <RaceManager
                    motionRef={motionRef}
                    sharedRacersRef={sharedRacersRef}
                    racerProgressRef={racerProgressRef}
                  />
                </Physics>
              </Suspense>
            </>
          )}
        </Canvas>
      </div>
    </GameErrorBoundary>
  );
}
