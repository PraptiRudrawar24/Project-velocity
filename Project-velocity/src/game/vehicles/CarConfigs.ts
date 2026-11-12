import type { VehicleSpec } from '../core/types';

export const APEX_GT_SPEC: VehicleSpec = {
  id: 'apex-gt-r',
  name: 'Veloce GT-R Concept',
  category: 'GT Prototype',
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
    damperCompression: 2900,
    damperRebound: 3800,
    antiRollStiffness: 7500,
    maxForce: 14000,
  },
  drivetrain: {
    maxDriveForce: 12200,
    reverseDriveForce: 6200,
    maxBrakeForce: 18500,
    handbrakeRearBrakeForce: 9500,
    topSpeedMs: 75, // 270 km/h
    reverseTopSpeedMs: 16, // ~58 km/h
    idleRpm: 950,
    maxRpm: 8000,
    redlineRpm: 7200,
    gearRatios: [3.42, 2.28, 1.64, 1.24, 0.98, 0.80],
    finalDrive: 3.73,
  },
  tires: {
    frontLateralGrip: 1.52,
    rearLateralGrip: 1.46,
    handbrakeRearGripFactor: 0.26,
    rollingResistance: 110,
    aeroDragCoeff: 0.72,
    downforceCoeff: 0.55,
  },
  steering: {
    maxAngleLowSpeedRad: 0.56, // ~32 deg
    maxAngleHighSpeedRad: 0.17, // ~9.7 deg
    highSpeedThresholdMs: 58, // ~209 km/h
    steerRateRadPerSec: 3.4,
    returnRateRadPerSec: 4.8,
  },
  cameraAnchors: {
    cockpitOffset: [-0.35, 0.42, -0.02],
    hoodOffset: [0, 0.35, -1.16],
  },
  colors: {
    body: '#c81e2b', // Deep Metallic Racing Crimson
    accent: '#141923', // Gloss Carbon Fiber
    caliper: '#f59e0b', // Performance Gold Brembo-style calipers
    rim: '#d4d8e0', // Satin Forged Alloy
  },
};

export const VEHICLE_REGISTRY: Record<string, VehicleSpec> = {
  [APEX_GT_SPEC.id]: APEX_GT_SPEC,
};

export function getVehicleSpec(id: string): VehicleSpec {
  return VEHICLE_REGISTRY[id] ?? APEX_GT_SPEC;
}
