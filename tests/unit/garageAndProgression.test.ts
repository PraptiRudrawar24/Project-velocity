import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_VEHICLE_ID,
  VEHICLE_CATALOG,
  getDefaultCustomizationForVehicle,
  getVehicleSpec,
} from '../../src/game/vehicles/CarConfigs';
import {
  PAINT_OPTIONS,
  getCosmeticKey,
} from '../../src/game/vehicles/CustomizationData';
import {
  MAX_UPGRADE_LEVEL,
  UPGRADE_CATALOG,
  applyUpgradesAndCustomization,
  computeVehicleRatings,
  createDefaultUpgradeLevels,
  getNextUpgradeCost,
} from '../../src/systems/progression/UpgradeSystem';
import {
  INITIAL_PLAYER_CREDITS,
  calculateRaceReward,
  validatePurchase,
} from '../../src/systems/progression/EconomySystem';
import {
  SAVE_STORAGE_KEY,
  createDefaultSaveData,
  loadGarageSave,
  saveGarageData,
  validateAndNormalizeSave,
} from '../../src/systems/save/SaveSystem';
import { useGameStore } from '../../src/state/gameStore';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('Milestone 04 — Garage, Customization, Upgrades, Economy & Save', () => {
  beforeEach(() => {
    useGameStore.getState().resetSaveProgress();
  });

  it('defines 4 distinct vehicles with differentiated physics and prices', () => {
    expect(VEHICLE_CATALOG).toHaveLength(4);
    const starter = getVehicleSpec(DEFAULT_VEHICLE_ID);
    const stratos = getVehicleSpec('stratos-rs');
    const titan = getVehicleSpec('titan-v8');
    const valkyrie = getVehicleSpec('valkyrie-lm');

    expect(starter.price ?? 0).toBe(0);
    expect(stratos.price).toBeGreaterThan(0);
    expect(titan.massKg).toBeGreaterThan(valkyrie.massKg);
    expect(valkyrie.drivetrain.topSpeedMs).toBeGreaterThan(
      starter.drivetrain.topSpeedMs
    );
    expect(valkyrie.tires.rearLateralGrip).toBeGreaterThan(
      titan.tires.rearLateralGrip
    );
  });

  it('applies performance upgrades and visual customization to VehicleSpec', () => {
    const base = getVehicleSpec('apex-gt-r');
    const upgrades = {
      ...createDefaultUpgradeLevels(),
      engine: 2,
      brakes: 2,
      tires: 2,
      suspension: 2,
      transmission: 2,
    };
    const custom = {
      ...getDefaultCustomizationForVehicle(base),
      paintId: 'pearl',
      wheelId: 'gold-mesh' as const,
      spoilerId: 'gt-wing' as const,
      bodyKitId: 'widebody-gt' as const,
      decalId: 'center-stripe' as const,
    };

    const tuned = applyUpgradesAndCustomization(base, upgrades, custom);

    expect(tuned.drivetrain.maxDriveForce).toBeGreaterThan(
      base.drivetrain.maxDriveForce
    );
    expect(tuned.drivetrain.topSpeedMs).toBeGreaterThan(base.drivetrain.topSpeedMs);
    expect(tuned.drivetrain.maxBrakeForce).toBeGreaterThan(
      base.drivetrain.maxBrakeForce
    );
    expect(tuned.tires.frontLateralGrip).toBeGreaterThan(
      base.tires.frontLateralGrip
    );
    expect(tuned.suspension.antiRollStiffness).toBeGreaterThan(
      base.suspension.antiRollStiffness
    );
    expect(tuned.handling.throttleResponseRate).toBeGreaterThan(
      base.handling.throttleResponseRate
    );
    expect(tuned.drivetrain.finalDrive).not.toBe(base.drivetrain.finalDrive);

    const pearlHex = PAINT_OPTIONS.find((p) => p.id === 'pearl')?.hex;
    expect(tuned.colors.body).toBe(pearlHex);
    expect(tuned.appearance?.wheelStyle).toBe('gold-mesh');
    expect(tuned.appearance?.spoilerStyle).toBe('gt-wing');
    expect(tuned.appearance?.bodyKitStyle).toBe('widebody-gt');
    expect(tuned.appearance?.decalStyle).toBe('center-stripe');

    const baseRatings = computeVehicleRatings(base);
    const tunedRatings = computeVehicleRatings(tuned);
    expect(tunedRatings.topSpeedKmh).toBeGreaterThan(baseRatings.topSpeedKmh);
    expect(tunedRatings.acceleration).toBeGreaterThan(baseRatings.acceleration);
    expect(tunedRatings.handling).toBeGreaterThan(baseRatings.handling);
    expect(tunedRatings.braking).toBeGreaterThan(baseRatings.braking);
  });

  it('enforces upgrade cost bounds and max stage limit', () => {
    for (const cat of UPGRADE_CATALOG) {
      expect(getNextUpgradeCost(cat.id, 0)).toBe(cat.costs[0]);
      expect(getNextUpgradeCost(cat.id, 1)).toBe(cat.costs[1]);
      expect(getNextUpgradeCost(cat.id, 2)).toBe(cat.costs[2]);
      expect(getNextUpgradeCost(cat.id, MAX_UPGRADE_LEVEL)).toBeNull();
    }
  });

  it('validates purchases and calculates positive race credit rewards', () => {
    expect(validatePurchase(2000, 3200, false)).toEqual({
      ok: false,
      reason: 'insufficient_funds',
    });
    expect(validatePurchase(5000, 3200, true)).toEqual({
      ok: false,
      reason: 'already_owned',
    });
    expect(validatePurchase(5000, 3200, false)).toEqual({ ok: true });

    const p1Hard = calculateRaceReward({
      mode: 'quick_race',
      difficulty: 'hard',
      finishingPosition: 1,
      totalRacers: 4,
      totalRaceTimeMs: 42000,
      bestLapMs: 42000,
      completedLaps: 3,
      totalLaps: 3,
      isNewPersonalBest: true,
      standings: [],
    });
    const p3Easy = calculateRaceReward({
      mode: 'quick_race',
      difficulty: 'easy',
      finishingPosition: 3,
      totalRacers: 4,
      totalRaceTimeMs: 45000,
      bestLapMs: 45000,
      completedLaps: 1,
      totalLaps: 1,
      isNewPersonalBest: false,
      standings: [],
    });
    const ttReward = calculateRaceReward({
      mode: 'time_trial',
      difficulty: 'medium',
      finishingPosition: 1,
      totalRacers: 1,
      totalRaceTimeMs: 40000,
      bestLapMs: 40000,
      completedLaps: 1,
      totalLaps: 1,
      isNewPersonalBest: false,
      standings: [],
    });

    expect(p1Hard).toBeGreaterThan(p3Easy);
    expect(ttReward).toBeGreaterThan(0);
  });

  it('validates, normalizes, saves and reloads garage persistence data cleanly', () => {
    const storage = createMemoryStorage();
    const corrupt = validateAndNormalizeSave({
      credits: -999,
      ownedVehicleIds: ['fake-car'],
      selectedVehicleId: 'fake-car',
      vehicleUpgrades: { 'apex-gt-r': { engine: 99, brakes: -5 } },
      vehicleCustomizations: {
        'apex-gt-r': { paintId: 'nonexistent', wheelId: 'turbofan' },
      },
    });

    expect(corrupt.credits).toBe(INITIAL_PLAYER_CREDITS);
    expect(corrupt.ownedVehicleIds).toContain(DEFAULT_VEHICLE_ID);
    expect(corrupt.selectedVehicleId).toBe(DEFAULT_VEHICLE_ID);
    expect(corrupt.vehicleUpgrades['apex-gt-r'].engine).toBe(MAX_UPGRADE_LEVEL);
    expect(corrupt.vehicleUpgrades['apex-gt-r'].brakes).toBe(0);
    expect(corrupt.vehicleCustomizations['apex-gt-r'].wheelId).toBe('turbofan');
    expect(corrupt.ownedCosmeticKeys).toContain(
      getCosmeticKey('wheel', 'turbofan')
    );

    const sample = createDefaultSaveData();
    sample.credits = 4500;
    sample.ownedVehicleIds.push('stratos-rs');
    sample.selectedVehicleId = 'stratos-rs';
    expect(saveGarageData(sample, storage)).toBe(true);
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeTruthy();

    const reloaded = loadGarageSave(storage);
    expect(reloaded.credits).toBe(4500);
    expect(reloaded.ownedVehicleIds).toContain('stratos-rs');
    expect(reloaded.selectedVehicleId).toBe('stratos-rs');
  });

  it('updates Zustand store credits, upgrades, cosmetics and vehicle unlocks without duplicates', () => {
    const store = useGameStore.getState();
    expect(store.credits).toBe(INITIAL_PLAYER_CREDITS);

    // Locked car unaffordable at start (Stratos costs 3200 > 2000)
    const failBuy = store.purchaseVehicle('stratos-rs');
    expect(failBuy.ok).toBe(false);
    expect(useGameStore.getState().credits).toBe(INITIAL_PLAYER_CREDITS);

    // Install Stage 1 Engine upgrade (500 CR)
    const upgRes = store.purchaseUpgrade('apex-gt-r', 'engine');
    expect(upgRes.ok).toBe(true);
    expect(useGameStore.getState().credits).toBe(INITIAL_PLAYER_CREDITS - 500);
    expect(useGameStore.getState().vehicleUpgrades['apex-gt-r'].engine).toBe(1);

    // Buy pearl paint (200 CR), then equip again should NOT deduct twice
    const paintRes = store.equipOrPurchaseCosmetic('apex-gt-r', 'paint', 'pearl', 200);
    expect(paintRes.ok).toBe(true);
    expect(useGameStore.getState().credits).toBe(INITIAL_PLAYER_CREDITS - 700);
    const reEquipPaint = store.equipOrPurchaseCosmetic('apex-gt-r', 'paint', 'pearl', 200);
    expect(reEquipPaint.ok).toBe(true);
    expect(useGameStore.getState().credits).toBe(INITIAL_PLAYER_CREDITS - 700);

    // Finish a race to earn credits
    store.startRace();
    store.setCountdownState('racing', null);
    const creditsBeforeFinish = useGameStore.getState().credits;
    store.finishRace({
      mode: 'quick_race',
      difficulty: 'hard',
      finishingPosition: 1,
      totalRacers: 4,
      totalRaceTimeMs: 41500,
      bestLapMs: 41500,
      completedLaps: 1,
      totalLaps: 1,
      isNewPersonalBest: true,
      standings: [],
    });
    const afterFinish = useGameStore.getState();
    expect(afterFinish.credits).toBeGreaterThan(creditsBeforeFinish);
    expect(afterFinish.raceResult?.creditsEarned).toBeGreaterThan(0);

    // Earn another P1 if needed and unlock Stratos RS Coupe
    while (useGameStore.getState().credits < 3200) {
      useGameStore.getState().startRace();
      useGameStore.getState().setCountdownState('racing', null);
      useGameStore.getState().finishRace({
        mode: 'quick_race',
        difficulty: 'hard',
        finishingPosition: 1,
        totalRacers: 4,
        totalRaceTimeMs: 41500,
        bestLapMs: 41500,
        completedLaps: 1,
        totalLaps: 1,
        isNewPersonalBest: false,
        standings: [],
      });
    }
    const buyStratos = useGameStore.getState().purchaseVehicle('stratos-rs');
    expect(buyStratos.ok).toBe(true);
    expect(useGameStore.getState().ownedVehicleIds).toContain('stratos-rs');
    expect(useGameStore.getState().selectedVehicleId).toBe('stratos-rs');

    // Duplicate purchase is blocked
    const dupBuy = useGameStore.getState().purchaseVehicle('stratos-rs');
    expect(dupBuy.ok).toBe(false);
  });
});
