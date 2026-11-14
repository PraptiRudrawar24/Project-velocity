import type { VehicleCustomization, VehicleSpec } from '../core/types';

export const APEX_GT_SPEC: VehicleSpec = {
  id: 'apex-gt-r',
  name: 'Veloce GT-R Concept',
  category: 'GT Prototype',
  tagline: 'Balanced mid-engine all-rounder with predictable drift control.',
  price: 0,
  // Set assetModelPath to '/models/cars/apex-gt.glb' once external GLTF assets are added.
  assetModelPath: undefined,
  massKg: 1420,
  dimensions: {
    length: 4.46,
    width: 1.94,
    height: 1.18,
    chassisHalfExtents: [0.92, 0.32, 2.16],
    chassisColliderOffset: [0, 0.06, 0],
  },
  wheels: {
    radius: 0.34,
    width: 0.28,
    frontZ: -1.36,
    rearZ: 1.32,
    halfTrackX: 0.84,
    hardpointY: 0.08,
    restLength: 0.34,
  },
  suspension: {
    springStiffness: 29500,
    damperCompression: 3100,
    damperRebound: 4100,
    antiRollStiffness: 8200,
    maxForce: 14500,
  },
  drivetrain: {
    maxDriveForce: 12600,
    reverseDriveForce: 6400,
    maxBrakeForce: 19200,
    handbrakeRearBrakeForce: 9200,
    topSpeedMs: 75, // 270 km/h
    reverseTopSpeedMs: 16,
    idleRpm: 950,
    maxRpm: 8000,
    redlineRpm: 7200,
    gearRatios: [3.42, 2.28, 1.64, 1.24, 0.98, 0.80],
    finalDrive: 3.73,
  },
  tires: {
    frontLateralGrip: 1.54,
    rearLateralGrip: 1.48,
    handbrakeRearGripFactor: 0.30,
    rollingResistance: 115,
    aeroDragCoeff: 0.72,
    downforceCoeff: 0.58,
    loadSensitivity: 0.14,
  },
  handling: {
    throttleResponseRate: 6.5,
    throttleReleaseRate: 8.5,
    brakeResponseRate: 9.0,
    engineBrakingForce: 540,
    cgHeightMeters: 0.48,
    longitudinalWeightTransfer: 0.75,
    lateralWeightTransfer: 0.85,
  },
  drifting: {
    driftEnterRate: 5.5,
    driftRecoverRate: 3.4,
    yawAssistTorque: 2900,
    counterSteerAssist: 1.25,
    maxYawRateRadPerSec: 1.85,
    maxDriftSlipAngleRad: 0.72,
    spinOutDamping: 4200,
  },
  steering: {
    maxAngleLowSpeedRad: 0.56,
    maxAngleHighSpeedRad: 0.16,
    highSpeedThresholdMs: 58,
    speedSensitivityExponent: 0.72,
    steerRateRadPerSec: 3.6,
    returnRateRadPerSec: 5.2,
  },
  cameraAnchors: {
    cockpitOffset: [-0.35, 0.42, -0.02],
    hoodOffset: [0, 0.35, -1.16],
  },
  colors: {
    body: '#c81e2b',
    accent: '#141923',
    caliper: '#f59e0b',
    rim: '#d4d8e0',
    decal: '#f8fafc',
  },
  appearance: {
    wheelStyle: 'five-spoke',
    spoilerStyle: 'gt-wing',
    bodyKitStyle: 'factory',
    decalStyle: 'none',
  },
};

export const STRATOS_RS_SPEC: VehicleSpec = {
  ...APEX_GT_SPEC,
  id: 'stratos-rs',
  name: 'Stratos RS Coupe',
  category: 'Track Lightweight',
  tagline: 'Featherweight chassis with razor-sharp apex grip and nimble turn-in.',
  price: 3200,
  massKg: 1260,
  suspension: {
    ...APEX_GT_SPEC.suspension,
    springStiffness: 27800,
    damperCompression: 3000,
    damperRebound: 3900,
    antiRollStiffness: 9200,
  },
  drivetrain: {
    ...APEX_GT_SPEC.drivetrain,
    maxDriveForce: 11800,
    maxBrakeForce: 20400,
    topSpeedMs: 71, // ~256 km/h
    redlineRpm: 7500,
    maxRpm: 8200,
    finalDrive: 3.92,
  },
  tires: {
    ...APEX_GT_SPEC.tires,
    frontLateralGrip: 1.68,
    rearLateralGrip: 1.62,
    handbrakeRearGripFactor: 0.34,
    downforceCoeff: 0.66,
  },
  steering: {
    ...APEX_GT_SPEC.steering,
    maxAngleLowSpeedRad: 0.60,
    maxAngleHighSpeedRad: 0.19,
    steerRateRadPerSec: 4.1,
    returnRateRadPerSec: 5.6,
  },
  colors: {
    body: '#1d4ed8',
    accent: '#0f172a',
    caliper: '#38bdf8',
    rim: '#e2e8f0',
    decal: '#f8fafc',
  },
  appearance: {
    wheelStyle: 'twin-spoke',
    spoilerStyle: 'stock',
    bodyKitStyle: 'street-aero',
    decalStyle: 'center-stripe',
  },
};

export const TITAN_V8_SPEC: VehicleSpec = {
  ...APEX_GT_SPEC,
  id: 'titan-v8',
  name: 'Titan V8 Muscle GT',
  category: 'Supercharged V8',
  tagline: 'Brutal straight-line torque and rowdy rear-biased power slides.',
  price: 5000,
  massKg: 1580,
  suspension: {
    ...APEX_GT_SPEC.suspension,
    springStiffness: 32000,
    damperCompression: 3300,
    damperRebound: 4300,
    antiRollStiffness: 7400,
    maxForce: 16000,
  },
  drivetrain: {
    ...APEX_GT_SPEC.drivetrain,
    maxDriveForce: 14900,
    reverseDriveForce: 7200,
    maxBrakeForce: 18600,
    topSpeedMs: 81, // ~292 km/h
    redlineRpm: 6900,
    finalDrive: 3.45,
  },
  tires: {
    ...APEX_GT_SPEC.tires,
    frontLateralGrip: 1.48,
    rearLateralGrip: 1.38,
    handbrakeRearGripFactor: 0.24,
    downforceCoeff: 0.50,
  },
  drifting: {
    ...APEX_GT_SPEC.drifting,
    yawAssistTorque: 3300,
    maxDriftSlipAngleRad: 0.78,
  },
  colors: {
    body: '#ea580c',
    accent: '#111827',
    caliper: '#ef4444',
    rim: '#94a3b8',
    decal: '#0f172a',
  },
  appearance: {
    wheelStyle: 'five-spoke',
    spoilerStyle: 'stock',
    bodyKitStyle: 'factory',
    decalStyle: 'center-stripe',
  },
};

export const VALKYRIE_LM_SPEC: VehicleSpec = {
  ...APEX_GT_SPEC,
  id: 'valkyrie-lm',
  name: 'Valkyrie LM Prototype',
  category: 'Endurance Hyper-GT',
  tagline: 'Extreme aero downforce, carbon-ceramic brakes, and blistering top speed.',
  price: 8500,
  massKg: 1310,
  suspension: {
    ...APEX_GT_SPEC.suspension,
    springStiffness: 31500,
    damperCompression: 3400,
    damperRebound: 4400,
    antiRollStiffness: 9800,
    maxForce: 16500,
  },
  drivetrain: {
    ...APEX_GT_SPEC.drivetrain,
    maxDriveForce: 14800,
    maxBrakeForce: 22800,
    handbrakeRearBrakeForce: 10800,
    topSpeedMs: 85, // 306 km/h
    redlineRpm: 7600,
    maxRpm: 8400,
    finalDrive: 3.85,
  },
  tires: {
    ...APEX_GT_SPEC.tires,
    frontLateralGrip: 1.72,
    rearLateralGrip: 1.68,
    handbrakeRearGripFactor: 0.30,
    downforceCoeff: 0.88,
  },
  steering: {
    ...APEX_GT_SPEC.steering,
    maxAngleLowSpeedRad: 0.57,
    maxAngleHighSpeedRad: 0.18,
    steerRateRadPerSec: 4.0,
    returnRateRadPerSec: 5.8,
  },
  colors: {
    body: '#059669',
    accent: '#090d16',
    caliper: '#facc15',
    rim: '#fbbf24',
    decal: '#e2e8f0',
  },
  appearance: {
    wheelStyle: 'gold-mesh',
    spoilerStyle: 'high-downforce',
    bodyKitStyle: 'widebody-gt',
    decalStyle: 'side-livery',
  },
};

export const VEHICLE_CATALOG: readonly VehicleSpec[] = [
  APEX_GT_SPEC,
  STRATOS_RS_SPEC,
  TITAN_V8_SPEC,
  VALKYRIE_LM_SPEC,
];

export const VEHICLE_REGISTRY: Record<string, VehicleSpec> = {
  [APEX_GT_SPEC.id]: APEX_GT_SPEC,
  [STRATOS_RS_SPEC.id]: STRATOS_RS_SPEC,
  [TITAN_V8_SPEC.id]: TITAN_V8_SPEC,
  [VALKYRIE_LM_SPEC.id]: VALKYRIE_LM_SPEC,
};

export const DEFAULT_VEHICLE_ID = APEX_GT_SPEC.id;

export function getVehicleSpec(id: string): VehicleSpec {
  return VEHICLE_REGISTRY[id] ?? APEX_GT_SPEC;
}

export function getDefaultCustomizationForVehicle(
  spec: VehicleSpec
): VehicleCustomization {
  const paintMatch =
    spec.id === 'stratos-rs'
      ? 'cobalt'
      : spec.id === 'titan-v8'
        ? 'amber'
        : spec.id === 'valkyrie-lm'
          ? 'emerald'
          : 'crimson';

  return {
    paintId: paintMatch,
    wheelId: spec.appearance?.wheelStyle ?? 'five-spoke',
    spoilerId: spec.appearance?.spoilerStyle ?? 'gt-wing',
    bodyKitId: spec.appearance?.bodyKitStyle ?? 'factory',
    decalId: spec.appearance?.decalStyle ?? 'none',
  };
}
