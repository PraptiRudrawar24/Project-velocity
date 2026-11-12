import { useEffect } from 'react';
import { GameCanvas } from './game/core/GameCanvas';
import { sharedInputManager } from './game/input/InputManager';
import { RacingHUD } from './components/hud/RacingHUD';
import { PauseOverlay } from './components/menus/PauseOverlay';
import { useGameStore, useTelemetryStore } from './state/gameStore';

declare global {
  interface Window {
    __VELOCITY_INSPECT__?: () => {
      game: ReturnType<typeof useGameStore.getState>;
      telemetry: ReturnType<typeof useTelemetryStore.getState>;
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
    });
    sharedInputManager.attach();

    window.__VELOCITY_INSPECT__ = () => ({
      game: useGameStore.getState(),
      telemetry: useTelemetryStore.getState(),
    });

    return () => {
      sharedInputManager.detach();
      delete window.__VELOCITY_INSPECT__;
    };
  }, []);

  return (
    <main className="pv-app-shell">
      <GameCanvas />
      <RacingHUD />
      <PauseOverlay />
    </main>
  );
}

export default App;

