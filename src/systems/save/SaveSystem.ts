import type {
  BodyKitStyleId,
  DecalStyleId,
  SpoilerStyleId,
  VehicleCustomization,
  VehicleUpgradeLevels,
  WheelStyleId,
} from '../../game/core/types';
import {
  DEFAULT_VEHICLE_ID,
  VEHICLE_CATALOG,
  VEHICLE_REGISTRY,
  getDefaultCustomizationForVehicle,
} from '../../game/vehicles/CarConfigs';
import {
  BODY_KIT_OPTIONS,
  DECAL_OPTIONS,
  PAINT_OPTIONS,
  SPOILER_OPTIONS,
  WHEEL_OPTIONS,
  getCosmeticKey,
  getDefaultOwnedCosmeticKeys,
} from '../../game/vehicles/CustomizationData';
import { INITIAL_PLAYER_CREDITS } from '../progression/EconomySystem';
import {
  MAX_UPGRADE_LEVEL,
  createDefaultUpgradeLevels,
} from '../progression/UpgradeSystem';

export const SAVE_STORAGE_KEY = 'pv_garage_save_v1';

export interface GarageSaveData {
  version: 1;
  credits: number;
  ownedVehicleIds: string[];
  selectedVehicleId: string;
  ownedCosmeticKeys: string[];
  vehicleUpgrades: Record<string, VehicleUpgradeLevels>;
  vehicleCustomizations: Record<string, VehicleCustomization>;
}

const VALID_PAINT_IDS = new Set(PAINT_OPTIONS.map((p) => p.id));
const VALID_WHEEL_IDS = new Set<string>(WHEEL_OPTIONS.map((w) => w.id));
const VALID_SPOILER_IDS = new Set<string>(SPOILER_OPTIONS.map((s) => s.id));
const VALID_BODY_KIT_IDS = new Set<string>(BODY_KIT_OPTIONS.map((b) => b.id));
const VALID_DECAL_IDS = new Set<string>(DECAL_OPTIONS.map((d) => d.id));

export function createDefaultSaveData(): GarageSaveData {
  const vehicleUpgrades: Record<string, VehicleUpgradeLevels> = {};
  const vehicleCustomizations: Record<string, VehicleCustomization> = {};

  for (const spec of VEHICLE_CATALOG) {
    vehicleUpgrades[spec.id] = createDefaultUpgradeLevels();
    vehicleCustomizations[spec.id] = getDefaultCustomizationForVehicle(spec);
  }

  return {
    version: 1,
    credits: INITIAL_PLAYER_CREDITS,
    ownedVehicleIds: [DEFAULT_VEHICLE_ID],
    selectedVehicleId: DEFAULT_VEHICLE_ID,
    ownedCosmeticKeys: getDefaultOwnedCosmeticKeys(),
    vehicleUpgrades,
    vehicleCustomizations,
  };
}

function clampLevel(val: unknown): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(MAX_UPGRADE_LEVEL, Math.round(val)));
}

export function validateAndNormalizeSave(raw: unknown): GarageSaveData {
  const defaults = createDefaultSaveData();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;

  const credits =
    typeof obj.credits === 'number' &&
    Number.isFinite(obj.credits) &&
    obj.credits >= 0
      ? Math.round(obj.credits)
      : defaults.credits;

  // Validate owned vehicles (always keep starter vehicle owned)
  const ownedSet = new Set<string>([DEFAULT_VEHICLE_ID]);
  if (Array.isArray(obj.ownedVehicleIds)) {
    for (const id of obj.ownedVehicleIds) {
      if (typeof id === 'string' && VEHICLE_REGISTRY[id]) {
        ownedSet.add(id);
      }
    }
  }
  const ownedVehicleIds = Array.from(ownedSet);

  const selectedVehicleId =
    typeof obj.selectedVehicleId === 'string' &&
    ownedSet.has(obj.selectedVehicleId)
      ? obj.selectedVehicleId
      : DEFAULT_VEHICLE_ID;

  // Validate owned cosmetic keys
  const cosmeticSet = new Set<string>(defaults.ownedCosmeticKeys);
  if (Array.isArray(obj.ownedCosmeticKeys)) {
    for (const key of obj.ownedCosmeticKeys) {
      if (typeof key === 'string' && key.includes(':')) {
        cosmeticSet.add(key);
      }
    }
  }

  // Validate per-vehicle upgrades
  const vehicleUpgrades: Record<string, VehicleUpgradeLevels> = {
    ...defaults.vehicleUpgrades,
  };
  if (obj.vehicleUpgrades && typeof obj.vehicleUpgrades === 'object') {
    const rawUpgrades = obj.vehicleUpgrades as Record<string, unknown>;
    for (const spec of VEHICLE_CATALOG) {
      const entry = rawUpgrades[spec.id];
      if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        vehicleUpgrades[spec.id] = {
          engine: clampLevel(rec.engine),
          brakes: clampLevel(rec.brakes),
          tires: clampLevel(rec.tires),
          suspension: clampLevel(rec.suspension),
          transmission: clampLevel(rec.transmission),
        };
      }
    }
  }

  // Validate per-vehicle customizations
  const vehicleCustomizations: Record<string, VehicleCustomization> = {
    ...defaults.vehicleCustomizations,
  };
  if (
    obj.vehicleCustomizations &&
    typeof obj.vehicleCustomizations === 'object'
  ) {
    const rawCust = obj.vehicleCustomizations as Record<string, unknown>;
    for (const spec of VEHICLE_CATALOG) {
      const defCust = defaults.vehicleCustomizations[spec.id];
      const entry = rawCust[spec.id];
      if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        const paintId =
          typeof rec.paintId === 'string' && VALID_PAINT_IDS.has(rec.paintId)
            ? rec.paintId
            : defCust.paintId;
        const wheelId =
          typeof rec.wheelId === 'string' && VALID_WHEEL_IDS.has(rec.wheelId)
            ? (rec.wheelId as WheelStyleId)
            : defCust.wheelId;
        const spoilerId =
          typeof rec.spoilerId === 'string' &&
          VALID_SPOILER_IDS.has(rec.spoilerId)
            ? (rec.spoilerId as SpoilerStyleId)
            : defCust.spoilerId;
        const bodyKitId =
          typeof rec.bodyKitId === 'string' &&
          VALID_BODY_KIT_IDS.has(rec.bodyKitId)
            ? (rec.bodyKitId as BodyKitStyleId)
            : defCust.bodyKitId;
        const decalId =
          typeof rec.decalId === 'string' && VALID_DECAL_IDS.has(rec.decalId)
            ? (rec.decalId as DecalStyleId)
            : defCust.decalId;

        vehicleCustomizations[spec.id] = {
          paintId,
          wheelId,
          spoilerId,
          bodyKitId,
          decalId,
        };

        // Ensure equipped parts are marked owned
        cosmeticSet.add(getCosmeticKey('paint', paintId));
        cosmeticSet.add(getCosmeticKey('wheel', wheelId));
        cosmeticSet.add(getCosmeticKey('spoiler', spoilerId));
        cosmeticSet.add(getCosmeticKey('bodyKit', bodyKitId));
        cosmeticSet.add(getCosmeticKey('decal', decalId));
      }
    }
  }

  return {
    version: 1,
    credits,
    ownedVehicleIds,
    selectedVehicleId,
    ownedCosmeticKeys: Array.from(cosmeticSet),
    vehicleUpgrades,
    vehicleCustomizations,
  };
}

export function loadGarageSave(storage?: Pick<Storage, 'getItem'>): GarageSaveData {
  try {
    const store =
      storage ??
      (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return createDefaultSaveData();
    const raw = store.getItem(SAVE_STORAGE_KEY);
    if (!raw) return createDefaultSaveData();
    const parsed: unknown = JSON.parse(raw);
    return validateAndNormalizeSave(parsed);
  } catch {
    return createDefaultSaveData();
  }
}

export function saveGarageData(
  data: GarageSaveData,
  storage?: Pick<Storage, 'setItem'>
): boolean {
  try {
    const store =
      storage ??
      (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return false;
    const normalized = validateAndNormalizeSave(data);
    store.setItem(SAVE_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function clearGarageSave(storage?: Pick<Storage, 'removeItem'>): void {
  try {
    const store =
      storage ??
      (typeof window !== 'undefined' ? window.localStorage : undefined);
    store?.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore restricted storage errors
  }
}

