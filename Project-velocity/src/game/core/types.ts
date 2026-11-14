export type CameraMode = 'CHASE' | 'COCKPIT' | 'HOOD';

export type GearValue = 'R' | 'N' | '1' | '2' | '3' | '4' | '5' | '6';

export type SurfaceType = 'asphalt' | 'curb' | 'offtrack';

export type ColliderSurfaceTag =
  | 'road'
  | 'curb'
  | 'guardrail'
  | 'tire_barrier'
  | 'pillar'
  | 'ground';

export interface ColliderUserData {
  surface: ColliderSurfaceTag;
  label?: string;
}

export interface CollisionEventInfo {
  id: number;
  surface: ColliderSurfaceTag;
  label: string;
  impactSpeedMs: number;
  intensity: number; // 0..1 normalized
  timestamp: number;
}

export interface VehicleTelemetry {
  speedKmh: number;
  speedMs: number;
  forwardSpeedMs: number;
  rpm: number;
  maxRpm: number;
  gear: GearValue;
  throttle: number;
  brake: number;
  steerAngleRad: number;
  isHandbraking: boolean;
  isDrifting: boolean;
  isBraking: boolean;
  isReversing: boolean;
  surface: SurfaceType;
  groundedWheels: number;
  wheelCompressions: [number, number, number, number];
}

export interface VehicleMotionSnapshot {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  linearVelocity: [number, number, number];
  forward: [number, number, number];
  speedMs: number;
  forwardSpeedMs: number;
  steerAngleRad: number;
  isDrifting: boolean;
  isReversing: boolean;
  justReset: boolean;
}

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface VehicleSpec {
  id: string;
  name: string;
  category: string;
  /** Optional external GLB/GLTF model path under public/models/cars/ */
  assetModelPath?: string;
  massKg: number;
  dimensions: {
    length: number;
    width: number;
    height: number;
    chassisHalfExtents: [number, number, number];
    chassisColliderOffset: [number, number, number];
  };
  wheels: {
    radius: number;
    width: number;
    frontZ: number;
    rearZ: number;
    halfTrackX: number;
    hardpointY: number;
    restLength: number;
  };
  suspension: {
    springStiffness: number;
    damperCompression: number;
    damperRebound: number;
    antiRollStiffness: number;
    maxForce: number;
  };
  drivetrain: {
    maxDriveForce: number;
    reverseDriveForce: number;
    maxBrakeForce: number;
    handbrakeRearBrakeForce: number;
    topSpeedMs: number;
    reverseTopSpeedMs: number;
    idleRpm: number;
    maxRpm: number;
    redlineRpm: number;
    gearRatios: [number, number, number, number, number, number];
    finalDrive: number;
  };
  tires: {
    frontLateralGrip: number;
    rearLateralGrip: number;
    handbrakeRearGripFactor: number;
    rollingResistance: number;
    aeroDragCoeff: number;
    downforceCoeff: number;
  };
  steering: {
    maxAngleLowSpeedRad: number;
    maxAngleHighSpeedRad: number;
    highSpeedThresholdMs: number;
    steerRateRadPerSec: number;
    returnRateRadPerSec: number;
  };
  cameraAnchors: {
    cockpitOffset: [number, number, number];
    hoodOffset: [number, number, number];
  };
  colors: {
    body: string;
    accent: string;
    caliper: string;
    rim: string;
  };
}

/** Future expansion contracts for Milestone 02+ (AI, Garage, Modes, Weather) */
export type RaceModeId = 'free_drive' | 'time_trial' | 'circuit_race' | 'open_world';

export interface WeatherConfig {
  id: 'clear_golden_hour' | 'overcast' | 'night';
  gripMultiplier: number;
}

