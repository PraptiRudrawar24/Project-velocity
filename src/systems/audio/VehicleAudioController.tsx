import { useEffect, useRef } from 'react';
import { useGameStore, useTelemetryStore } from '../../state/gameStore';
import {
  ProceduralVehicleAudioEngine,
  type VehicleAudioHook,
} from './VehicleAudioSystem';

export function VehicleAudioController() {
  const audioRef = useRef<VehicleAudioHook | null>(null);
  const lastCollisionIdRef = useRef<number>(0);

  useEffect(() => {
    const engine = new ProceduralVehicleAudioEngine();
    audioRef.current = engine;

    const initialGame = useGameStore.getState();
    engine.setPaused(initialGame.isPaused);
    engine.setMuted(initialGame.isMuted);
    lastCollisionIdRef.current = initialGame.lastCollision?.id ?? 0;

    const unlock = () => {
      engine.unlockFromGesture();
    };
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('pointerdown', unlock, { passive: true });

    const unsubGame = useGameStore.subscribe((state) => {
      engine.setPaused(state.isPaused);
      engine.setMuted(state.isMuted);
      if (
        state.lastCollision &&
        state.lastCollision.id !== lastCollisionIdRef.current
      ) {
        lastCollisionIdRef.current = state.lastCollision.id;
        engine.triggerImpact(state.lastCollision.intensity);
      }
    });

    const unsubTelemetry = useTelemetryStore.subscribe((t) => {
      engine.updateTelemetry({
        rpm: t.rpm,
        maxRpm: t.maxRpm,
        throttle: t.throttle,
        brake: t.brake,
        speedMs: t.speedMs,
        isBraking: t.isBraking,
        isDrifting: t.isDrifting,
        driftIntensity: t.driftIntensity,
        gear: t.gear,
      });
    });

    return () => {
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
      unsubGame();
      unsubTelemetry();
      engine.dispose();
      audioRef.current = null;
    };
  }, []);

  return null;
}

