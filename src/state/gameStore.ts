import { create } from 'zustand';
import type {
  AppScreen,
  BodyKitStyleId,
  CameraMode,
  CollisionEventInfo,
  DecalStyleId,
  SpoilerStyleId,
  UpgradeCategory,
  VehicleCustomization,
  VehicleTelemetry,
  VehicleUpgradeLevels,
  WheelStyleId,
} from '../game/core/types';
import {
  getDefaultCustomizationForVehicle,
  getVehicleSpec,
} from '../game/vehicles/CarConfigs';
import {
  getCosmeticKey,
  type CosmeticCategory,
} from '../game/vehicles/CustomizationData';
import type {
  DifficultyLevel,
  RaceConfig,
  RaceMode,
  RacePhase,
  RaceResultSummary,
} from '../game/racing/RaceTypes';
import {
  calculateRaceReward,
  validatePurchase,
} from '../systems/progression/EconomySystem';
import {
  MAX_UPGRADE_LEVEL,
  createDefaultUpgradeLevels,
  getNextUpgradeCost,
} from '../systems/progression/UpgradeSystem';
import {
  clearGarageSave,
  createDefaultSaveData,
  loadGarageSave,
  saveGarageData,
  type GarageSaveData,
} from '../systems/save/SaveSystem';

export const CAMERA_MODES: readonly CameraMode[] = ['CHASE', 'COCKPIT', 'HOOD'];

export type GarageTab = 'home' | 'vehicles' | 'customize' | 'upgrades';

const PERSONAL_BEST_KEY = 'pv_personal_best_lap_ms';

function readStoredPersonalBest(): number | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(PERSONAL_BEST_KEY);
    if (!raw) return null;
    const val = Number(raw);
    return Number.isFinite(val) && val > 0 ? val : null;
  } catch {
    return null;
  }
}

function writeStoredPersonalBest(ms: number): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(PERSONAL_BEST_KEY, String(Math.round(ms)));
  } catch {
    // Ignore storage errors in restricted environments
  }
}

function normalizeRaceConfig(cfg: RaceConfig): RaceConfig {
  const totalLaps = Math.max(1, Math.min(10, Math.round(cfg.totalLaps)));
  const opponentCount =
    cfg.mode === 'time_trial'
      ? 0
      : Math.max(3, Math.min(5, Math.round(cfg.opponentCount)));
  return {
    mode: cfg.mode,
    difficulty: cfg.difficulty,
    opponentCount,
    totalLaps,
  };
}

function persistFromState(state: {
  credits: number;
  ownedVehicleIds: string[];
  selectedVehicleId: string;
  ownedCosmeticKeys: string[];
  vehicleUpgrades: Record<string, VehicleUpgradeLevels>;
  vehicleCustomizations: Record<string, VehicleCustomization>;
}): void {
  const payload: GarageSaveData = {
    version: 1,
    credits: state.credits,
    ownedVehicleIds: state.ownedVehicleIds,
    selectedVehicleId: state.selectedVehicleId,
    ownedCosmeticKeys: state.ownedCosmeticKeys,
    vehicleUpgrades: state.vehicleUpgrades,
    vehicleCustomizations: state.vehicleCustomizations,
  };
  saveGarageData(payload);
}

export interface PurchaseResult {
  ok: boolean;
  reason?: string;
}

export interface GameState {
  appScreen: AppScreen;
  garageTab: GarageTab;
  garagePreviewVehicleId: string;
  garageAutoRotate: boolean;

  credits: number;
  ownedVehicleIds: string[];
  selectedVehicleId: string;
  ownedCosmeticKeys: string[];
  vehicleUpgrades: Record<string, VehicleUpgradeLevels>;
  vehicleCustomizations: Record<string, VehicleCustomization>;

  raceConfig: RaceConfig;
  racePhase: RacePhase;
  countdownText: '3' | '2' | '1' | 'GO!' | null;
  isPaused: boolean;
  cameraMode: CameraMode;
  playerPosition: number;
  totalRacers: number;
  lapCount: number;
  totalLaps: number;
  currentSector: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  personalBestMs: number | null;
  isWrongWay: boolean;
  raceResult: RaceResultSummary | null;
  collisionCount: number;
  lastCollision: CollisionEventInfo | null;
  resetNonce: number;
  restartNonce: number;
  resetToastNonce: number;
  showControls: boolean;
  isMuted: boolean;
  fatalError: string | null;

  openGarage: (tab?: GarageTab) => void;
  closeGarage: () => void;
  setGarageTab: (tab: GarageTab) => void;
  setGaragePreviewVehicle: (vehicleId: string) => void;
  toggleGarageAutoRotate: () => void;
  selectVehicle: (vehicleId: string) => boolean;
  purchaseVehicle: (vehicleId: string) => PurchaseResult;
  equipOrPurchaseCosmetic: (
    vehicleId: string,
    category: CosmeticCategory,
    itemId: string,
    price: number
  ) => PurchaseResult;
  purchaseUpgrade: (
    vehicleId: string,
    category: UpgradeCategory
  ) => PurchaseResult;
  resetSaveProgress: () => void;

  setRaceConfig: (partial: Partial<RaceConfig>) => void;
  setRaceMode: (mode: RaceMode) => void;
  setDifficulty: (difficulty: DifficultyLevel) => void;
  startRace: (override?: Partial<RaceConfig>) => void;
  returnToMenu: () => void;
  setCountdownState: (
    phase: RacePhase,
    text: '3' | '2' | '1' | 'GO!' | null
  ) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  cycleCameraMode: () => void;
  setCameraMode: (mode: CameraMode) => void;
  requestReset: () => void;
  restartSession: () => void;
  toggleControls: () => void;
  toggleMute: () => void;
  recordCollision: (info: CollisionEventInfo) => void;
  setSector: (sector: number) => void;
  setPlayerStanding: (position: number, totalRacers: number) => void;
  setWrongWay: (wrongWay: boolean) => void;
  completeLap: (lapDurationMs: number) => void;
  finishRace: (summary: RaceResultSummary) => void;
  setFatalError: (error: string | null) => void;
}

const DEFAULT_CONFIG: RaceConfig = {
  mode: 'quick_race',
  difficulty: 'medium',
  opponentCount: 3,
  totalLaps: 3,
};

const initialSave = loadGarageSave();

export const useGameStore = create<GameState>((set, get) => ({
  appScreen: 'race',
  garageTab: 'home',
  garagePreviewVehicleId: initialSave.selectedVehicleId,
  garageAutoRotate: true,

  credits: initialSave.credits,
  ownedVehicleIds: initialSave.ownedVehicleIds,
  selectedVehicleId: initialSave.selectedVehicleId,
  ownedCosmeticKeys: initialSave.ownedCosmeticKeys,
  vehicleUpgrades: initialSave.vehicleUpgrades,
  vehicleCustomizations: initialSave.vehicleCustomizations,

  raceConfig: DEFAULT_CONFIG,
  racePhase: 'menu',
  countdownText: null,
  isPaused: false,
  cameraMode: 'CHASE',
  playerPosition: 4,
  totalRacers: 4,
  lapCount: 1,
  totalLaps: DEFAULT_CONFIG.totalLaps,
  currentSector: 0,
  bestLapMs: null,
  lastLapMs: null,
  personalBestMs: readStoredPersonalBest(),
  isWrongWay: false,
  raceResult: null,
  collisionCount: 0,
  lastCollision: null,
  resetNonce: 0,
  restartNonce: 0,
  resetToastNonce: 0,
  showControls: true,
  isMuted: false,
  fatalError: null,

  openGarage: (tab = 'home') =>
    set((state) => ({
      appScreen: 'garage',
      garageTab: tab,
      garagePreviewVehicleId: state.selectedVehicleId,
      isPaused: false,
    })),

  closeGarage: () =>
    set((state) => ({
      appScreen: 'race',
      racePhase: 'menu',
      garagePreviewVehicleId: state.selectedVehicleId,
      restartNonce: state.restartNonce + 1,
      resetNonce: state.resetNonce + 1,
    })),

  setGarageTab: (garageTab) => set({ garageTab }),

  setGaragePreviewVehicle: (garagePreviewVehicleId) =>
    set({ garagePreviewVehicleId }),

  toggleGarageAutoRotate: () =>
    set((state) => ({ garageAutoRotate: !state.garageAutoRotate })),

  selectVehicle: (vehicleId) => {
    const state = get();
    if (!state.ownedVehicleIds.includes(vehicleId)) {
      return false;
    }
    const nextState = {
      ...state,
      selectedVehicleId: vehicleId,
      garagePreviewVehicleId: vehicleId,
    };
    set({
      selectedVehicleId: vehicleId,
      garagePreviewVehicleId: vehicleId,
    });
    persistFromState(nextState);
    return true;
  },

  purchaseVehicle: (vehicleId) => {
    const state = get();
    const spec = getVehicleSpec(vehicleId);
    if (spec.id !== vehicleId) {
      return { ok: false, reason: 'Unknown vehicle.' };
    }
    const price = spec.price ?? 0;
    const owned = state.ownedVehicleIds.includes(vehicleId);
    const check = validatePurchase(state.credits, price, owned);
    if (!check.ok) {
      return {
        ok: false,
        reason:
          check.reason === 'already_owned'
            ? 'Vehicle already owned.'
            : 'Insufficient credits.',
      };
    }

    const nextOwned = [...state.ownedVehicleIds, vehicleId];
    const nextCredits = state.credits - price;
    const nextUpgrades = {
      ...state.vehicleUpgrades,
      [vehicleId]:
        state.vehicleUpgrades[vehicleId] ?? createDefaultUpgradeLevels(),
    };
    const nextCustomizations = {
      ...state.vehicleCustomizations,
      [vehicleId]:
        state.vehicleCustomizations[vehicleId] ??
        getDefaultCustomizationForVehicle(spec),
    };

    const nextState = {
      ...state,
      credits: nextCredits,
      ownedVehicleIds: nextOwned,
      selectedVehicleId: vehicleId,
      garagePreviewVehicleId: vehicleId,
      vehicleUpgrades: nextUpgrades,
      vehicleCustomizations: nextCustomizations,
    };

    set({
      credits: nextCredits,
      ownedVehicleIds: nextOwned,
      selectedVehicleId: vehicleId,
      garagePreviewVehicleId: vehicleId,
      vehicleUpgrades: nextUpgrades,
      vehicleCustomizations: nextCustomizations,
    });
    persistFromState(nextState);
    return { ok: true };
  },

  equipOrPurchaseCosmetic: (vehicleId, category, itemId, price) => {
    const state = get();
    if (!state.ownedVehicleIds.includes(vehicleId)) {
      return { ok: false, reason: 'Purchase this vehicle first.' };
    }

    const key = getCosmeticKey(category, itemId);
    const alreadyOwned =
      price === 0 || state.ownedCosmeticKeys.includes(key);

    let nextCredits = state.credits;
    let nextOwnedKeys = state.ownedCosmeticKeys;

    if (!alreadyOwned) {
      const check = validatePurchase(state.credits, price, false);
      if (!check.ok) {
        return { ok: false, reason: 'Insufficient credits.' };
      }
      nextCredits = state.credits - price;
      nextOwnedKeys = [...state.ownedCosmeticKeys, key];
    }

    const spec = getVehicleSpec(vehicleId);
    const curCust =
      state.vehicleCustomizations[vehicleId] ??
      getDefaultCustomizationForVehicle(spec);

    const updatedCust: VehicleCustomization = { ...curCust };
    if (category === 'paint') updatedCust.paintId = itemId;
    else if (category === 'wheel')
      updatedCust.wheelId = itemId as WheelStyleId;
    else if (category === 'spoiler')
      updatedCust.spoilerId = itemId as SpoilerStyleId;
    else if (category === 'bodyKit')
      updatedCust.bodyKitId = itemId as BodyKitStyleId;
    else if (category === 'decal')
      updatedCust.decalId = itemId as DecalStyleId;

    const nextCustomizations = {
      ...state.vehicleCustomizations,
      [vehicleId]: updatedCust,
    };

    const nextState = {
      ...state,
      credits: nextCredits,
      ownedCosmeticKeys: nextOwnedKeys,
      vehicleCustomizations: nextCustomizations,
    };

    set({
      credits: nextCredits,
      ownedCosmeticKeys: nextOwnedKeys,
      vehicleCustomizations: nextCustomizations,
    });
    persistFromState(nextState);
    return { ok: true };
  },

  purchaseUpgrade: (vehicleId, category) => {
    const state = get();
    if (!state.ownedVehicleIds.includes(vehicleId)) {
      return { ok: false, reason: 'Purchase this vehicle first.' };
    }
    const curUpgrades =
      state.vehicleUpgrades[vehicleId] ?? createDefaultUpgradeLevels();
    const curLevel = curUpgrades[category] ?? 0;
    if (curLevel >= MAX_UPGRADE_LEVEL) {
      return { ok: false, reason: 'Already at maximum level.' };
    }

    const cost = getNextUpgradeCost(category, curLevel);
    if (cost === null) {
      return { ok: false, reason: 'Upgrade unavailable.' };
    }

    const check = validatePurchase(state.credits, cost, false);
    if (!check.ok) {
      return { ok: false, reason: 'Insufficient credits.' };
    }

    const nextCredits = state.credits - cost;
    const nextUpgrades = {
      ...state.vehicleUpgrades,
      [vehicleId]: {
        ...curUpgrades,
        [category]: curLevel + 1,
      },
    };

    const nextState = {
      ...state,
      credits: nextCredits,
      vehicleUpgrades: nextUpgrades,
    };

    set({
      credits: nextCredits,
      vehicleUpgrades: nextUpgrades,
    });
    persistFromState(nextState);
    return { ok: true };
  },

  resetSaveProgress: () => {
    clearGarageSave();
    const fresh = createDefaultSaveData();
    set({
      credits: fresh.credits,
      ownedVehicleIds: fresh.ownedVehicleIds,
      selectedVehicleId: fresh.selectedVehicleId,
      garagePreviewVehicleId: fresh.selectedVehicleId,
      ownedCosmeticKeys: fresh.ownedCosmeticKeys,
      vehicleUpgrades: fresh.vehicleUpgrades,
      vehicleCustomizations: fresh.vehicleCustomizations,
    });
  },

  setRaceConfig: (partial) =>
    set((state) => {
      const merged = normalizeRaceConfig({ ...state.raceConfig, ...partial });
      const totalRacers = 1 + merged.opponentCount;
      return {
        raceConfig: merged,
        totalLaps: merged.totalLaps,
        totalRacers,
        playerPosition: totalRacers,
      };
    }),

  setRaceMode: (mode) => {
    const cur = get().raceConfig;
    const defaultLaps =
      mode === 'circuit_race' ? 3 : mode === 'time_trial' ? 3 : 2;
    const defaultOpp =
      mode === 'time_trial' ? 0 : Math.max(3, cur.opponentCount || 3);
    get().setRaceConfig({
      mode,
      opponentCount: defaultOpp,
      totalLaps: cur.mode === mode ? cur.totalLaps : defaultLaps,
    });
  },

  setDifficulty: (difficulty) => get().setRaceConfig({ difficulty }),

  startRace: (override) =>
    set((state) => {
      const merged = normalizeRaceConfig({
        ...state.raceConfig,
        ...(override ?? {}),
      });
      const totalRacers = 1 + merged.opponentCount;
      return {
        appScreen: 'race',
        raceConfig: merged,
        racePhase: 'countdown',
        countdownText: '3',
        isPaused: false,
        playerPosition: totalRacers,
        totalRacers,
        lapCount: 1,
        totalLaps: merged.totalLaps,
        currentSector: 0,
        bestLapMs: null,
        lastLapMs: null,
        isWrongWay: false,
        raceResult: null,
        collisionCount: 0,
        lastCollision: null,
        restartNonce: state.restartNonce + 1,
        resetNonce: state.resetNonce + 1,
      };
    }),

  returnToMenu: () =>
    set((state) => {
      const totalRacers = 1 + state.raceConfig.opponentCount;
      return {
        appScreen: 'race',
        racePhase: 'menu',
        countdownText: null,
        isPaused: false,
        playerPosition: totalRacers,
        totalRacers,
        lapCount: 1,
        currentSector: 0,
        bestLapMs: null,
        lastLapMs: null,
        isWrongWay: false,
        raceResult: null,
        collisionCount: 0,
        lastCollision: null,
        restartNonce: state.restartNonce + 1,
        resetNonce: state.resetNonce + 1,
      };
    }),

  setCountdownState: (racePhase, countdownText) =>
    set({ racePhase, countdownText }),

  togglePause: () =>
    set((state) => {
      if (
        state.appScreen !== 'race' ||
        state.racePhase === 'menu' ||
        state.racePhase === 'finished'
      ) {
        return state;
      }
      return { isPaused: !state.isPaused };
    }),

  setPaused: (paused) =>
    set((state) => {
      if (
        state.appScreen !== 'race' ||
        state.racePhase === 'menu' ||
        state.racePhase === 'finished'
      ) {
        return state;
      }
      return { isPaused: paused };
    }),

  cycleCameraMode: () =>
    set((state) => {
      const idx = CAMERA_MODES.indexOf(state.cameraMode);
      const next = CAMERA_MODES[(idx + 1) % CAMERA_MODES.length];
      return { cameraMode: next };
    }),

  setCameraMode: (mode) => set({ cameraMode: mode }),

  requestReset: () =>
    set((state) => {
      if (
        state.appScreen !== 'race' ||
        state.racePhase === 'menu' ||
        state.racePhase === 'finished'
      ) {
        return state;
      }
      return {
        resetNonce: state.resetNonce + 1,
        resetToastNonce: state.resetToastNonce + 1,
        isPaused: false,
        isWrongWay: false,
      };
    }),

  restartSession: () => {
    const cfg = get().raceConfig;
    get().startRace(cfg);
  },

  toggleControls: () => set((state) => ({ showControls: !state.showControls })),

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  recordCollision: (info) =>
    set((state) => ({
      collisionCount: state.collisionCount + 1,
      lastCollision: info,
    })),

  setSector: (sector) =>
    set((state) =>
      state.currentSector === sector ? state : { currentSector: sector }
    ),

  setPlayerStanding: (playerPosition, totalRacers) =>
    set((state) =>
      state.playerPosition === playerPosition &&
      state.totalRacers === totalRacers
        ? state
        : { playerPosition, totalRacers }
    ),

  setWrongWay: (isWrongWay) =>
    set((state) => (state.isWrongWay === isWrongWay ? state : { isWrongWay })),

  completeLap: (lapDurationMs) =>
    set((state) => {
      const nextBest =
        state.bestLapMs === null
          ? lapDurationMs
          : Math.min(state.bestLapMs, lapDurationMs);

      let nextPersonalBest = state.personalBestMs;
      if (nextPersonalBest === null || lapDurationMs < nextPersonalBest) {
        nextPersonalBest = lapDurationMs;
        writeStoredPersonalBest(lapDurationMs);
      }

      return {
        lapCount: Math.min(state.totalLaps, state.lapCount + 1),
        currentSector: 0,
        lastLapMs: lapDurationMs,
        bestLapMs: nextBest,
        personalBestMs: nextPersonalBest,
      };
    }),

  finishRace: (summary) =>
    set((state) => {
      let nextPersonalBest = state.personalBestMs;
      if (
        summary.bestLapMs !== null &&
        (nextPersonalBest === null || summary.bestLapMs < nextPersonalBest)
      ) {
        nextPersonalBest = summary.bestLapMs;
        writeStoredPersonalBest(summary.bestLapMs);
      }

      const creditsEarned = calculateRaceReward(summary);
      const nextCredits = state.credits + creditsEarned;
      const enrichedSummary: RaceResultSummary = {
        ...summary,
        creditsEarned,
      };

      persistFromState({
        credits: nextCredits,
        ownedVehicleIds: state.ownedVehicleIds,
        selectedVehicleId: state.selectedVehicleId,
        ownedCosmeticKeys: state.ownedCosmeticKeys,
        vehicleUpgrades: state.vehicleUpgrades,
        vehicleCustomizations: state.vehicleCustomizations,
      });

      return {
        credits: nextCredits,
        racePhase: 'finished',
        countdownText: null,
        isPaused: false,
        isWrongWay: false,
        raceResult: enrichedSummary,
        personalBestMs: nextPersonalBest,
      };
    }),

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
  driftIntensity: 0,
  slipAngleDeg: 0,
  lateralG: 0,
  longitudinalG: 0,
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
