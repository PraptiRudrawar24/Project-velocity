import { useEffect } from 'react';
import { GameCanvas } from './game/core/GameCanvas';
import { sharedInputManager } from './game/input/InputManager';
import { RacingHUD } from './components/hud/RacingHUD';
import { PauseOverlay } from './components/menus/PauseOverlay';
import { RaceMenuOverlay } from './components/menus/RaceMenuOverlay';
import { ResultsOverlay } from './components/menus/ResultsOverlay';
import { GarageScreen } from './components/garage/GarageScreen';
import { VehicleAudioController } from './systems/audio/VehicleAudioController';
import type { RacerSpatialState } from './game/ai/AIDriver';
import type { RacerProgressState } from './game/racing/RaceTypes';
import { useGameStore, useTelemetryStore } from './state/gameStore';

declare global {
  interface Window {
    __VELOCITY_INSPECT__?: () => {
      game: ReturnType<typeof useGameStore.getState>;
      telemetry: ReturnType<typeof useTelemetryStore.getState>;
      racers: RacerSpatialState[];
      progress: RacerProgressState[];
      trackNavigation: {
        frameIndex: number;
        lateralOffset: number;
        lookaheadHeadingDeg: number;
      };
    };
  }
}

export function App() {
  useEffect(() => {
    sharedInputManager.setCallbacks({
      onCycleCamera: () => useGameStore.getState().cycleCameraMode(),
      onResetVehicle: () => useGameStore.getState().requestReset(),
      onTogglePause: () => useGameStore.getState().togglePause(),
      onToggleControls: () => useGameStore.getState().toggleControls(),
      onToggleMute: () => useGameStore.getState().toggleMute(),
    });
    sharedInputManager.attach();

    return () => {
      sharedInputManager.detach();
    };
  }, []);

  return (
    <main className="pv-app-shell">
      <GameCanvas />
      <VehicleAudioController />
      <RacingHUD />
      <GarageScreen />
      <RaceMenuOverlay />
      <PauseOverlay />
      <ResultsOverlay />
    </main>
  );
}

export default App;
