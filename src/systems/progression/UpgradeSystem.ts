import type {
  UpgradeCategory,
  VehicleCustomization,
  VehicleSpec,
  VehicleUpgradeLevels,
} from '../../game/core/types';
import {
  PAINT_OPTIONS,
  WHEEL_OPTIONS,
} from '../../game/vehicles/CustomizationData';

export const MAX_UPGRADE_LEVEL = 3;

export interface UpgradeCategoryDefinition {
  id: UpgradeCategory;
  name: string;
  effectSummary: string;
  costs: [number, number, number]; // Cost for Level 1, Level 2, Level 3
}

export const UPGRADE_CATALOG: readonly UpgradeCategoryDefinition[] = [
  {
    id: 'engine',
    name: 'Engine & Induction',
    effectSummary: '+7% Drive Force & +4.5% Top Speed per level',
    costs: [500, 950, 1600],
  },
  {
    id: 'brakes',
    name: 'Carbon-Ceramic Brakes',
    effectSummary: '+10% Brake Force & +12% Pedal Response per level',
    costs: [400, 750, 1250],
  },
  {
    id: 'tires',
    name: 'Track Compound Tires',
    effectSummary: '+5.5% Lateral Grip & lower rolling drag per level',
    costs: [450, 850, 1400],
  },
  {
    id: 'suspension',
    name: 'Coilover Suspension & Aero',
    effectSummary: '+12% Roll Stiffness, +8% Damping & Downforce per level',
    costs: [450, 850, 1400],
  },
  {
    id: 'transmission',
    name: 'Close-Ratio Gearbox',
    effectSummary: '+14% Throttle Response & tighter final drive per level',
    costs: [400, 800, 1350],
  },
];

export function createDefaultUpgradeLevels(): VehicleUpgradeLevels {
  return {
    engine: 0,
    brakes: 0,
    tires: 0,
    suspension: 0,
    transmission: 0,
  };
}

export function getNextUpgradeCost(
  category: UpgradeCategory,
  currentLevel: number
): number | null {
  if (currentLevel >= MAX_UPGRADE_LEVEL) return null;
  const def = UPGRADE_CATALOG.find((u) => u.id === category);
  if (!def) return null;
  return def.costs[Math.max(0, currentLevel)] ?? null;
}

export function applyUpgradesAndCustomization(
  baseSpec: VehicleSpec,
  upgrades: VehicleUpgradeLevels,
  customization?: VehicleCustomization
): VehicleSpec {
  const eng = Math.max(0, Math.min(MAX_UPGRADE_LEVEL, upgrades.engine));
  const brk = Math.max(0, Math.min(MAX_UPGRADE_LEVEL, upgrades.brakes));
  const tir = Math.max(0, Math.min(MAX_UPGRADE_LEVEL, upgrades.tires));
  const sus = Math.max(0, Math.min(MAX_UPGRADE_LEVEL, upgrades.suspension));
  const trn = Math.max(0, Math.min(MAX_UPGRADE_LEVEL, upgrades.transmission));

  const paintOpt = customization
    ? PAINT_OPTIONS.find((p) => p.id === customization.paintId)
    : undefined;
  const wheelOpt = customization
    ? WHEEL_OPTIONS.find((w) => w.id === customization.wheelId)
    : undefined;

  return {
    ...baseSpec,
    suspension: {
      ...baseSpec.suspension,
      damperCompression:
        baseSpec.suspension.damperCompression * (1 + 0.08 * sus),
      damperRebound: baseSpec.suspension.damperRebound * (1 + 0.08 * sus),
      antiRollStiffness:
        baseSpec.suspension.antiRollStiffness * (1 + 0.12 * sus),
    },
    drivetrain: {
      ...baseSpec.drivetrain,
      maxDriveForce: baseSpec.drivetrain.maxDriveForce * (1 + 0.07 * eng),
      reverseDriveForce:
        baseSpec.drivetrain.reverseDriveForce * (1 + 0.05 * eng),
      topSpeedMs: baseSpec.drivetrain.topSpeedMs * (1 + 0.045 * eng),
      maxBrakeForce: baseSpec.drivetrain.maxBrakeForce * (1 + 0.10 * brk),
      handbrakeRearBrakeForce:
        baseSpec.drivetrain.handbrakeRearBrakeForce * (1 + 0.08 * brk),
      finalDrive: baseSpec.drivetrain.finalDrive * (1 + 0.035 * trn),
      redlineRpm: baseSpec.drivetrain.redlineRpm + 150 * trn,
      maxRpm: baseSpec.drivetrain.maxRpm + 150 * trn,
    },
    tires: {
      ...baseSpec.tires,
      frontLateralGrip: baseSpec.tires.frontLateralGrip * (1 + 0.055 * tir),
      rearLateralGrip: baseSpec.tires.rearLateralGrip * (1 + 0.055 * tir),
      rollingResistance: baseSpec.tires.rollingResistance * (1 - 0.06 * tir),
      downforceCoeff: baseSpec.tires.downforceCoeff * (1 + 0.10 * sus),
    },
    handling: {
      ...baseSpec.handling,
      throttleResponseRate:
        baseSpec.handling.throttleResponseRate * (1 + 0.14 * trn),
      brakeResponseRate:
        baseSpec.handling.brakeResponseRate * (1 + 0.12 * brk),
    },
    steering: {
      ...baseSpec.steering,
      steerRateRadPerSec:
        baseSpec.steering.steerRateRadPerSec * (1 + 0.06 * sus),
      returnRateRadPerSec:
        baseSpec.steering.returnRateRadPerSec * (1 + 0.06 * sus),
    },
    colors: {
      ...baseSpec.colors,
      body: paintOpt?.hex ?? baseSpec.colors.body,
      rim: wheelOpt?.rimHex ?? baseSpec.colors.rim,
      decal: paintOpt?.decalContrast ?? baseSpec.colors.decal ?? '#f8fafc',
    },
    appearance: customization
      ? {
          wheelStyle: customization.wheelId,
          spoilerStyle: customization.spoilerId,
          bodyKitStyle: customization.bodyKitId,
          decalStyle: customization.decalId,
        }
      : baseSpec.appearance,
  };
}

export interface VehicleDisplayRatings {
  topSpeed: number; // 0..100
  acceleration: number; // 0..100
  handling: number; // 0..100
  braking: number; // 0..100
  topSpeedKmh: number;
}

function clamp100(v: number): number {
  return Math.round(Math.max(10, Math.min(100, v)));
}

export function computeVehicleRatings(spec: VehicleSpec): VehicleDisplayRatings {
  const topSpeedKmh = Math.round(spec.drivetrain.topSpeedMs * 3.6);
  const accelRatio =
    (spec.drivetrain.maxDriveForce / spec.massKg) *
    (spec.drivetrain.finalDrive / 3.73);

  const gripAvg =
    (spec.tires.frontLateralGrip + spec.tires.rearLateralGrip) * 0.5 +
    spec.tires.downforceCoeff * 0.12;
  const brakeRatio = spec.drivetrain.maxBrakeForce / spec.massKg;

  return {
    topSpeed: clamp100(((spec.drivetrain.topSpeedMs - 55) / 42) * 100),
    acceleration: clamp100(((accelRatio - 6.0) / 7.5) * 100),
    handling: clamp100(((gripAvg - 1.2) / 0.9) * 100),
    braking: clamp100(((brakeRatio - 10.0) / 11.5) * 100),
    topSpeedKmh,
  };
}

