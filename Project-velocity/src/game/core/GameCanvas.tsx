import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import type { VehicleMotionSnapshot } from './types';
import { getVehicleSpec } from '../vehicles/CarConfigs';
import { getCircuitDefinition } from '../tracks/CircuitData';
import { TrackEnvironment } from '../tracks/TrackEnvironment';
import { VehicleController } from '../vehicles/VehicleController';
import { CameraController } from '../cameras/CameraController';
import { WorldEnvironment } from '../world/WorldEnvironment';
import { RaceManager } from '../racing/RaceManager';
import { useGameStore } from '../../state/gameStore';
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
  const isPaused = useGameStore((s) => s.isPaused);
  const fatalError = useGameStore((s) => s.fatalError);
  const setFatalError = useGameStore((s) => s.setFatalError);
  const [webglStatus] = useState(() => checkWebGLSupport());

  const spec = useMemo(() => getVehicleSpec('apex-gt-r'), []);
  const circuit = useMemo(() => getCircuitDefinition(), []);

  const motionRef = useRef<VehicleMotionSnapshot>({
    position: [...circuit.startGridTransform.position],
    quaternion: [...circuit.startGridTransform.quaternion],
    linearVelocity: [0, 0, 0],
    forward: [0, 0, -1],
    speedMs: 0,
    forwardSpeedMs: 0,
    steerAngleRad: 0,
    isDrifting: false,
    isReversing: false,
    justReset: true,
  });

  useEffect(() => {
    if (!webglStatus.ok && webglStatus.reason) {
      setFatalError(webglStatus.reason);
    }
  }, [webglStatus, setFatalError]);

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
              <VehicleController spec={spec} motionRef={motionRef} />
              <CameraController spec={spec} motionRef={motionRef} />
              <RaceManager motionRef={motionRef} />
            </Physics>
          </Suspense>
        </Canvas>
      </div>
    </GameErrorBoundary>
  );
}

