import { create } from 'zustand';
import type {
  CameraMode,
  CollisionEventInfo,
  VehicleTelemetry,
} from '../game/core/types';

export const CAMERA_MODES: readonly CameraMode[] = ['CHASE', 'COCKPIT', 'HOOD'];

export interface GameState {
  isPaused: boolean;
  cameraMode: CameraMode;
  lapCount: number;
  currentSector: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  collisionCount: number;
  lastCollision: CollisionEventInfo | null;
  resetNonce: number;
  restartNonce: number;
  resetToastNonce: number;
  showControls: boolean;
  fatalError: string | null;

  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  cycleCameraMode: () => void;
  setCameraMode: (mode: CameraMode) => void;
  requestReset: () => void;
  restartSession: () => void;
  toggleControls: () => void;
  recordCollision: (info: CollisionEventInfo) => void;
  setSector: (sector: number) => void;
  completeLap: (lapDurationMs: number) => void;
  setFatalError: (error: string | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  isPaused: false,
  cameraMode: 'CHASE',
  lapCount: 1,
  currentSector: 0,
  bestLapMs: null,
  lastLapMs: null,
  collisionCount: 0,
  lastCollision: null,
  resetNonce: 0,
  restartNonce: 0,
  resetToastNonce: 0,
  showControls: true,
  fatalError: null,

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  setPaused: (paused) => set({ isPaused: paused }),

  cycleCameraMode: () =>
    set((state) => {
      const idx = CAMERA_MODES.indexOf(state.cameraMode);
      const next = CAMERA_MODES[(idx + 1) % CAMERA_MODES.length];
      return { cameraMode: next };
    }),

  setCameraMode: (mode) => set({ cameraMode: mode }),

  requestReset: () =>
    set((state) => ({
      resetNonce: state.resetNonce + 1,
      resetToastNonce: state.resetToastNonce + 1,
      isPaused: false,
    })),

  restartSession: () =>
    set((state) => ({
      isPaused: false,
      lapCount: 1,
      currentSector: 0,
      lastLapMs: null,
      collisionCount: 0,
      lastCollision: null,
      restartNonce: state.restartNonce + 1,
      resetNonce: state.resetNonce + 1,
    })),

  toggleControls: () => set((state) => ({ showControls: !state.showControls })),

  recordCollision: (info) =>
    set((state) => ({
      collisionCount: state.collisionCount + 1,
      lastCollision: info,
    })),

  setSector: (sector) => set({ currentSector: sector }),

  completeLap: (lapDurationMs) =>
    set((state) => ({
      lapCount: state.lapCount + 1,
      currentSector: 0,
      lastLapMs: lapDurationMs,
      bestLapMs:
        state.bestLapMs === null
          ? lapDurationMs
          : Math.min(state.bestLapMs, lapDurationMs),
    })),

  setFatalError: (fatalError) => set({ fatalError }),
}));

export interface TelemetryState extends VehicleTelemetry {
  raceTimeMs: number;
  currentLapMs: number;
  collisionPulse: number;
  worldPosition: [number, number, number];
  headingDeg: number;
  setTelemetry: (next: Partial<TelemetryState>) => void;
  resetTimers: () => void;
}

export const INITIAL_TELEMETRY: VehicleTelemetry = {
  speedKmh: 0,
  speedMs: 0,
  forwardSpeedMs: 0,
  rpm: 900,
  maxRpm: 8000,
  gear: 'N',
  throttle: 0,
  brake: 0,
  steerAngleRad: 0,
  isHandbraking: false,
  isDrifting: false,
  isBraking: false,
  isReversing: false,
  surface: 'asphalt',
  groundedWheels: 4,
  wheelCompressions: [0.5, 0.5, 0.5, 0.5],
};

export const useTelemetryStore = create<TelemetryState>((set) => ({
  ...INITIAL_TELEMETRY,
  raceTimeMs: 0,
  currentLapMs: 0,
  collisionPulse: 0,
  worldPosition: [0, 0.5, 9],
  headingDeg: 0,

  setTelemetry: (next) => set(next),
  resetTimers: () =>
    set({
      ...INITIAL_TELEMETRY,
      raceTimeMs: 0,
      currentLapMs: 0,
      collisionPulse: 0,
      worldPosition: [0, 0.5, 9],
      headingDeg: 0,
    }),
}));
