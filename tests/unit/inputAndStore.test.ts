import { describe, expect, it } from 'vitest';
import { InputManager } from '../../src/game/input/InputManager';
import { useGameStore } from '../../src/state/gameStore';

describe('InputManager', () => {
  it('tracks continuous driving keys and resets cleanly on clearAllKeys', () => {
    const manager = new InputManager();
    manager.setKeyHeld('KeyW', true);
    manager.setKeyHeld('KeyA', true);
    manager.setKeyHeld('Space', true);

    let state = manager.getInputState();
    expect(state.accelerate).toBe(true);
    expect(state.steerLeft).toBe(true);
    expect(state.handbrake).toBe(true);
    expect(state.brakeReverse).toBe(false);

    manager.clearAllKeys();
    state = manager.getInputState();
    expect(state.accelerate).toBe(false);
    expect(state.steerLeft).toBe(false);
    expect(state.handbrake).toBe(false);
  });
});

describe('useGameStore', () => {
  it('cycles camera modes, toggles pause, and tracks resets & laps', () => {
    const store = useGameStore;
    store.getState().restartSession();

    expect(store.getState().cameraMode).toBe('CHASE');
    store.getState().cycleCameraMode();
    expect(store.getState().cameraMode).toBe('COCKPIT');
    store.getState().cycleCameraMode();
    expect(store.getState().cameraMode).toBe('HOOD');
    store.getState().cycleCameraMode();
    expect(store.getState().cameraMode).toBe('CHASE');

    store.getState().togglePause();
    expect(store.getState().isPaused).toBe(true);

    const prevReset = store.getState().resetNonce;
    store.getState().requestReset();
    expect(store.getState().resetNonce).toBe(prevReset + 1);
    expect(store.getState().isPaused).toBe(false);

    store.getState().completeLap(29450);
    expect(store.getState().lapCount).toBe(2);
    expect(store.getState().bestLapMs).toBe(29450);
    store.getState().completeLap(27800);
    expect(store.getState().bestLapMs).toBe(27800);

    const initialMuted = store.getState().isMuted;
    store.getState().toggleMute();
    expect(store.getState().isMuted).toBe(!initialMuted);
    store.getState().toggleMute();
    expect(store.getState().isMuted).toBe(initialMuted);
  });
});

