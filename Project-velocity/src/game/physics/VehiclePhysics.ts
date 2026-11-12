import * as THREE from 'three';
import type {
  GearValue,
  SurfaceType,
  Vec3Tuple,
  VehicleSpec,
  VehicleTelemetry,
} from '../core/types';
import type { DrivingInputState } from '../input/InputManager';

export interface WheelRaycastHit {
  distance: number;
  normal: Vec3Tuple;
  surface: SurfaceType;
}

export type WheelRaycastFn = (
  origin: Vec3Tuple,
  direction: Vec3Tuple,
  maxDistance: number
) => WheelRaycastHit | null;

export interface RigidBodyKinematics {
  position: Vec3Tuple;
  quaternion: { x: number; y: number; z: number; w: number };
  linearVelocity: Vec3Tuple;
  angularVelocity: Vec3Tuple;
  velocityAtPoint: (worldPoint: Vec3Tuple) => Vec3Tuple;
}

export interface WheelPhysicsState {
  grounded: boolean;
  compression: number; // meters [0..restLength]
  prevCompression: number;
  normalizedCompression: number; // [0..1]
  localY: number;
  steerAngleRad: number;
  spinDeltaRad: number;
  surface: SurfaceType;
  contactPoint: Vec3Tuple;
  normalForce: number;
}

export interface AppliedForcePoint {
  force: Vec3Tuple;
  point: Vec3Tuple;
}

export interface VehiclePhysicsStepResult {
  forces: AppliedForcePoint[];
  torque: Vec3Tuple;
  wheelStates: [
    WheelPhysicsState,
    WheelPhysicsState,
    WheelPhysicsState,
    WheelPhysicsState,
  ];
  telemetry: VehicleTelemetry;
}

const UP_LOCAL = new THREE.Vector3(0, 1, 0);
const DOWN_LOCAL = new THREE.Vector3(0, -1, 0);
const FORWARD_LOCAL = new THREE.Vector3(0, 0, -1);
const RIGHT_LOCAL = new THREE.Vector3(1, 0, 0);

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function computeSpeedDependentMaxSteer(
  forwardSpeedMs: number,
  spec: VehicleSpec
): number {
  const speedRatio = clamp(
    Math.abs(forwardSpeedMs) / spec.steering.highSpeedThresholdMs,
    0,
    1
  );
  const eased = Math.pow(speedRatio, 0.72);
  return lerp(
    spec.steering.maxAngleLowSpeedRad,
    spec.steering.maxAngleHighSpeedRad,
    eased
  );
}

export class VehiclePhysicsEngine {
  private spec: VehicleSpec;
  private currentSteerAngle = 0;
  private currentGearIndex = 0; // 0..5 -> gears 1..6
  private currentRpm = 950;
  private wheelStates: [
    WheelPhysicsState,
    WheelPhysicsState,
    WheelPhysicsState,
    WheelPhysicsState,
  ];

  // Reusable math scratch objects (zero per-tick heap allocations in hot loop)
  private readonly bodyPos = new THREE.Vector3();
  private readonly bodyQuat = new THREE.Quaternion();
  private readonly bodyVel = new THREE.Vector3();
  private readonly bodyAngVel = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3();
  private readonly worldDown = new THREE.Vector3();
  private readonly worldForward = new THREE.Vector3();
  private readonly worldRight = new THREE.Vector3();
  private readonly wheelHardpoint = new THREE.Vector3();
  private readonly wheelForward = new THREE.Vector3();
  private readonly wheelRight = new THREE.Vector3();
  private readonly wheelVel = new THREE.Vector3();
  private readonly tmpForce = new THREE.Vector3();

  constructor(spec: VehicleSpec) {
    this.spec = spec;
    this.currentRpm = spec.drivetrain.idleRpm;
    this.wheelStates = [
      this.createDefaultWheelState(),
      this.createDefaultWheelState(),
      this.createDefaultWheelState(),
      this.createDefaultWheelState(),
    ];
  }

  public reset(): void {
    this.currentSteerAngle = 0;
    this.currentGearIndex = 0;
    this.currentRpm = this.spec.drivetrain.idleRpm;
    for (const w of this.wheelStates) {
      w.grounded = false;
      w.compression = this.spec.wheels.restLength * 0.35;
      w.prevCompression = w.compression;
      w.normalizedCompression = 0.35;
      w.localY =
        this.spec.wheels.hardpointY -
        (this.spec.wheels.restLength - w.compression);
      w.steerAngleRad = 0;
      w.spinDeltaRad = 0;
      w.surface = 'asphalt';
      w.normalForce = 0;
    }
  }

  public setSpec(spec: VehicleSpec): void {
    this.spec = spec;
  }

  private createDefaultWheelState(): WheelPhysicsState {
    return {
      grounded: false,
      compression: 0.12,
      prevCompression: 0.12,
      normalizedCompression: 0.35,
      localY: -0.14,
      steerAngleRad: 0,
      spinDeltaRad: 0,
      surface: 'asphalt',
      contactPoint: { x: 0, y: 0, z: 0 },
      normalForce: 0,
    };
  }

  public step(
    body: RigidBodyKinematics,
    input: DrivingInputState,
    raycast: WheelRaycastFn,
    dt: number
  ): VehiclePhysicsStepResult {
    const safeDt = clamp(dt, 1 / 240, 1 / 20);
    const spec = this.spec;

    this.bodyPos.set(body.position.x, body.position.y, body.position.z);
    this.bodyQuat.set(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    );
    this.bodyVel.set(
      body.linearVelocity.x,
      body.linearVelocity.y,
      body.linearVelocity.z
    );
    this.bodyAngVel.set(
      body.angularVelocity.x,
      body.angularVelocity.y,
      body.angularVelocity.z
    );

    this.worldUp.copy(UP_LOCAL).applyQuaternion(this.bodyQuat).normalize();
    this.worldDown.copy(DOWN_LOCAL).applyQuaternion(this.bodyQuat).normalize();
    this.worldForward
      .copy(FORWARD_LOCAL)
      .applyQuaternion(this.bodyQuat)
      .normalize();
    this.worldRight
      .copy(RIGHT_LOCAL)
      .applyQuaternion(this.bodyQuat)
      .normalize();

    const forwardSpeedMs = this.bodyVel.dot(this.worldForward);
    const lateralSpeedMs = this.bodyVel.dot(this.worldRight);
    const speedMs = this.bodyVel.length();
    const speedKmh = speedMs * 3.6;

    // 1. Speed-dependent steering
    const steerInput =
      (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
    const maxSteer = computeSpeedDependentMaxSteer(forwardSpeedMs, spec);
    const targetSteer = steerInput * maxSteer;
    const rate =
      steerInput !== 0
        ? spec.steering.steerRateRadPerSec
        : spec.steering.returnRateRadPerSec;
    const maxSteerStep = rate * safeDt;
    const steerDiff = targetSteer - this.currentSteerAngle;
    this.currentSteerAngle += clamp(steerDiff, -maxSteerStep, maxSteerStep);

    // 2. Throttle / Brake / Reverse state logic
    let throttle = 0;
    let brake = 0;
    let isBraking = false;
    let isReversing = false;

    if (input.accelerate && input.brakeReverse) {
      // Simultaneous throttle + brake prioritizes braking
      brake = 1;
      isBraking = true;
    } else if (input.brakeReverse) {
      if (forwardSpeedMs > 0.8) {
        brake = 1;
        isBraking = true;
      } else {
        isReversing = true;
        throttle = 1;
      }
    } else if (input.accelerate) {
      if (forwardSpeedMs < -0.8) {
        brake = 1;
        isBraking = true;
      } else {
        throttle = 1;
      }
    }

    // 3. Wheel suspension raycasts (FL, FR, RL, RR)
    const wheelOffsets: Array<{ x: number; z: number; isFront: boolean }> = [
      { x: -spec.wheels.halfTrackX, z: spec.wheels.frontZ, isFront: true },
      { x: spec.wheels.halfTrackX, z: spec.wheels.frontZ, isFront: true },
      { x: -spec.wheels.halfTrackX, z: spec.wheels.rearZ, isFront: false },
      { x: spec.wheels.halfTrackX, z: spec.wheels.rearZ, isFront: false },
    ];

    const rayMaxLength = spec.wheels.restLength + spec.wheels.radius;
    const forces: AppliedForcePoint[] = [];
    let groundedWheels = 0;
    let dominantSurface: SurfaceType = 'asphalt';
    let offtrackCount = 0;
    let curbCount = 0;

    // Aero downforce distributed across grounded wheels
    const totalDownforce =
      spec.tires.downforceCoeff * forwardSpeedMs * Math.abs(forwardSpeedMs);

    for (let i = 0; i < 4; i++) {
      const cfg = wheelOffsets[i];
      const wState = this.wheelStates[i];
      wState.prevCompression = wState.compression;
      wState.steerAngleRad = cfg.isFront ? this.currentSteerAngle : 0;

      this.wheelHardpoint
        .set(cfg.x, spec.wheels.hardpointY, cfg.z)
        .applyQuaternion(this.bodyQuat)
        .add(this.bodyPos);

      const hit = raycast(
        {
          x: this.wheelHardpoint.x,
          y: this.wheelHardpoint.y,
          z: this.wheelHardpoint.z,
        },
        {
          x: this.worldDown.x,
          y: this.worldDown.y,
          z: this.worldDown.z,
        },
        rayMaxLength
      );

      if (hit && hit.distance <= rayMaxLength) {
        wState.grounded = true;
        groundedWheels++;
        wState.surface = hit.surface;
        if (hit.surface === 'offtrack') offtrackCount++;
        if (hit.surface === 'curb') curbCount++;

        const suspensionLen = clamp(
          hit.distance - spec.wheels.radius,
          0,
          spec.wheels.restLength
        );
        const compression = clamp(
          spec.wheels.restLength - suspensionLen,
          0,
          spec.wheels.restLength
        );
        wState.compression = compression;
        wState.normalizedCompression = clamp(
          compression / spec.wheels.restLength,
          0,
          1
        );
        wState.localY = spec.wheels.hardpointY - suspensionLen;

        const compressionVel = (compression - wState.prevCompression) / safeDt;
        const damperCoeff =
          compressionVel >= 0
            ? spec.suspension.damperCompression
            : spec.suspension.damperRebound;

        const springForce = spec.suspension.springStiffness * compression;
        const damperForce = damperCoeff * compressionVel;
        const normalForce = clamp(
          springForce + damperForce + totalDownforce * 0.25,
          0,
          spec.suspension.maxForce
        );
        wState.normalForce = normalForce;

        wState.contactPoint = {
          x: this.wheelHardpoint.x + this.worldDown.x * hit.distance,
          y: this.wheelHardpoint.y + this.worldDown.y * hit.distance,
          z: this.wheelHardpoint.z + this.worldDown.z * hit.distance,
        };

        // Apply suspension normal force along chassis up / surface blend
        const suspVec = {
          x: this.worldUp.x * (springForce + damperForce),
          y: this.worldUp.y * (springForce + damperForce),
          z: this.worldUp.z * (springForce + damperForce),
        };
        if (springForce + damperForce > 0) {
          forces.push({
            force: suspVec,
            point: {
              x: this.wheelHardpoint.x,
              y: this.wheelHardpoint.y,
              z: this.wheelHardpoint.z,
            },
          });
        }
      } else {
        wState.grounded = false;
        wState.compression = 0;
        wState.normalizedCompression = 0;
        wState.localY = spec.wheels.hardpointY - spec.wheels.restLength;
        wState.surface = 'asphalt';
        wState.normalForce = 0;
      }
    }

    if (offtrackCount >= 2) dominantSurface = 'offtrack';
    else if (curbCount >= 1) dominantSurface = 'curb';

    // 4. Anti-roll bar forces (front 0-1, rear 2-3)
    const applyAntiRoll = (leftIdx: number, rightIdx: number) => {
      const left = this.wheelStates[leftIdx];
      const right = this.wheelStates[rightIdx];
      if (!left.grounded && !right.grounded) return;
      const diff = left.compression - right.compression;
      const antiRollForce = diff * spec.suspension.antiRollStiffness;
      if (left.grounded) {
        forces.push({
          force: {
            x: this.worldUp.x * -antiRollForce,
            y: this.worldUp.y * -antiRollForce,
            z: this.worldUp.z * -antiRollForce,
          },
          point: left.contactPoint,
        });
      }
      if (right.grounded) {
        forces.push({
          force: {
            x: this.worldUp.x * antiRollForce,
            y: this.worldUp.y * antiRollForce,
            z: this.worldUp.z * antiRollForce,
          },
          point: right.contactPoint,
        });
      }
    };
    applyAntiRoll(0, 1);
    applyAntiRoll(2, 3);

    // 5. Longitudinal & Lateral Tire Forces
    const effMassPerWheel =
      groundedWheels > 0 ? spec.massKg / groundedWheels : spec.massKg;

    // Torque curve tapers smoothly as speed approaches topSpeedMs
    const speedFraction = clamp(
      Math.abs(forwardSpeedMs) / spec.drivetrain.topSpeedMs,
      0,
      1.05
    );
    const forwardDriveCurve = clamp(1.05 - 0.55 * speedFraction, 0.25, 1.05);

    for (let i = 0; i < 4; i++) {
      const wState = this.wheelStates[i];
      const cfg = wheelOffsets[i];
      if (!wState.grounded) {
        wState.spinDeltaRad = (-forwardSpeedMs / spec.wheels.radius) * safeDt;
        continue;
      }

      // Wheel basis vectors
      this.wheelForward
        .copy(this.worldForward)
        .applyAxisAngle(this.worldUp, wState.steerAngleRad)
        .normalize();
      this.wheelRight
        .copy(this.worldRight)
        .applyAxisAngle(this.worldUp, wState.steerAngleRad)
        .normalize();

      const velAtWheel = body.velocityAtPoint(wState.contactPoint);
      this.wheelVel.set(velAtWheel.x, velAtWheel.y, velAtWheel.z);

      const vLong = this.wheelVel.dot(this.wheelForward);
      const vLat = this.wheelVel.dot(this.wheelRight);

      // Visual wheel spin (note: negative rotation around +X rolls top toward -Z)
      const visualSpinSpeed =
        !cfg.isFront && input.handbrake
          ? 0 // Rear wheels lock during handbrake
          : vLong;
      wState.spinDeltaRad = (-visualSpinSpeed / spec.wheels.radius) * safeDt;

      // Surface traction modifier
      const surfaceGrip =
        wState.surface === 'offtrack'
          ? 0.72
          : wState.surface === 'curb'
            ? 0.94
            : 1.0;

      // Longitudinal Drive / Brake force
      let fLong = 0;
      const driveSplit = cfg.isFront ? 0.14 : 0.36; // 28% front / 72% rear sport AWD-bias

      if (isBraking) {
        const brakeBias = cfg.isFront ? 0.32 : 0.18;
        const maxNoReverseLong =
          (Math.abs(vLong) * effMassPerWheel) / safeDt;
        const rawBrake = spec.drivetrain.maxBrakeForce * brakeBias;
        if (Math.abs(vLong) > 0.05) {
          fLong =
            -Math.sign(vLong) * Math.min(rawBrake, maxNoReverseLong);
        }
      } else if (isReversing && throttle > 0) {
        if (forwardSpeedMs > -spec.drivetrain.reverseTopSpeedMs) {
          fLong =
            -spec.drivetrain.reverseDriveForce * driveSplit * surfaceGrip;
        }
      } else if (throttle > 0 && !isReversing) {
        // Cut rear drive if handbrake is pulled so rear can step out
        const handbrakeDriveCut = !cfg.isFront && input.handbrake ? 0 : 1;
        if (forwardSpeedMs < spec.drivetrain.topSpeedMs) {
          fLong =
            spec.drivetrain.maxDriveForce *
            forwardDriveCurve *
            driveSplit *
            surfaceGrip *
            handbrakeDriveCut;
        }
      }

      // Handbrake rear wheel locking drag
      if (!cfg.isFront && input.handbrake) {
        const maxNoReverseLong =
          (Math.abs(vLong) * effMassPerWheel) / safeDt;
        const hbBrake = spec.drivetrain.handbrakeRearBrakeForce * 0.5;
        if (Math.abs(vLong) > 0.1) {
          fLong += -Math.sign(vLong) * Math.min(hbBrake, maxNoReverseLong);
        }
      }

      // Rolling resistance (stronger off-track on grass/gravel, gentle stop damping near zero)
      const rollingMult = wState.surface === 'offtrack' ? 3.2 : 1.0;
      const rollingForce =
        Math.abs(vLong) > 0.25
          ? -Math.sign(vLong) * spec.tires.rollingResistance * 0.25 * rollingMult
          : throttle === 0 && !isBraking
            ? clamp(-vLong * effMassPerWheel * 4.0, -(Math.abs(vLong) * effMassPerWheel) / safeDt, (Math.abs(vLong) * effMassPerWheel) / safeDt)
            : 0;
      fLong += rollingForce;

      // Lateral tire force (Pacejka-inspired saturation + zero-jitter impulse cap)
      const baseLatGrip = cfg.isFront
        ? spec.tires.frontLateralGrip
        : spec.tires.rearLateralGrip *
          (input.handbrake ? spec.tires.handbrakeRearGripFactor : 1.0);

      const peakLatForce = baseLatGrip * surfaceGrip * wState.normalForce;
      const slipPeakVel = 1.9 + 0.038 * Math.abs(vLong);
      const desiredLatForce =
        -peakLatForce * Math.tanh(vLat / slipPeakVel);

      // Guarantee lateral force cannot reverse sideways velocity within a single physics tick
      const maxNoReverseLat =
        (Math.abs(vLat) * effMassPerWheel) / safeDt;
      const fLat = clamp(desiredLatForce, -maxNoReverseLat, maxNoReverseLat);

      this.tmpForce
        .copy(this.wheelForward)
        .multiplyScalar(fLong)
        .addScaledVector(this.wheelRight, fLat);

      // Apply horizontal tire force slightly nearer CG height to prevent unnatural traction-rolling
      forces.push({
        force: {
          x: this.tmpForce.x,
          y: this.tmpForce.y,
          z: this.tmpForce.z,
        },
        point: {
          x: wState.contactPoint.x,
          y: lerp(wState.contactPoint.y, this.bodyPos.y, 0.55),
          z: wState.contactPoint.z,
        },
      });
    }

    // 6. Aerodynamic drag + high-speed downforce + drift yaw & anti-flip stabilization
    let torqueX = 0;
    let torqueY = 0;
    let torqueZ = 0;

    if (speedMs > 0.2) {
      const dragMag = spec.tires.aeroDragCoeff * speedMs * speedMs;
      const scale = -dragMag / speedMs;
      forces.push({
        force: {
          x: this.bodyVel.x * scale,
          y: this.bodyVel.y * scale,
          z: this.bodyVel.z * scale,
        },
        point: { x: this.bodyPos.x, y: this.bodyPos.y, z: this.bodyPos.z },
      });
    }

    if (totalDownforce > 5 && groundedWheels > 0) {
      forces.push({
        force: {
          x: -this.worldUp.x * totalDownforce,
          y: -this.worldUp.y * totalDownforce,
          z: -this.worldUp.z * totalDownforce,
        },
        point: { x: this.bodyPos.x, y: this.bodyPos.y, z: this.bodyPos.z },
      });
    }

    // Controlled handbrake yaw initiation when steering at speed
    if (
      input.handbrake &&
      groundedWheels >= 2 &&
      Math.abs(forwardSpeedMs) > 4.5 &&
      steerInput !== 0
    ) {
      const speedFactor = clamp(Math.abs(forwardSpeedMs) / 28, 0.2, 1.0);
      torqueY += steerInput * 3600 * speedFactor;
    }

    // Subtle yaw damping when counter-steering / straightening out
    if (!input.handbrake && groundedWheels >= 3) {
      torqueY -= this.bodyAngVel.y * 650;
    }

    // Anti-flip upright assist if chassis rolls/pitches too steeply
    const upTilt = this.worldUp.y; // 1.0 when completely flat
    if (upTilt < 0.85) {
      const restoreAxis = new THREE.Vector3().crossVectors(
        this.worldUp,
        UP_LOCAL
      );
      const strength = (0.85 - upTilt) * 18000;
      torqueX += restoreAxis.x * strength;
      torqueZ += restoreAxis.z * strength;
    }

    // 7. Gearbox & RPM simulation
    const gear = this.updateDrivetrain(
      forwardSpeedMs,
      throttle,
      isBraking,
      isReversing,
      safeDt
    );

    const slipRatio =
      Math.abs(forwardSpeedMs) > 3.5
        ? Math.atan2(Math.abs(lateralSpeedMs), Math.abs(forwardSpeedMs))
        : 0;
    const isDrifting =
      groundedWheels >= 2 &&
      speedMs > 4.5 &&
      ((input.handbrake && Math.abs(steerInput) > 0) || slipRatio > 0.24);

    return {
      forces,
      torque: { x: torqueX, y: torqueY, z: torqueZ },
      wheelStates: this.wheelStates,
      telemetry: {
        speedKmh: Math.round(speedKmh),
        speedMs,
        forwardSpeedMs,
        rpm: Math.round(this.currentRpm),
        maxRpm: spec.drivetrain.maxRpm,
        gear,
        throttle,
        brake,
        steerAngleRad: this.currentSteerAngle,
        isHandbraking: input.handbrake,
        isDrifting,
        isBraking,
        isReversing,
        surface: dominantSurface,
        groundedWheels,
        wheelCompressions: [
          this.wheelStates[0].normalizedCompression,
          this.wheelStates[1].normalizedCompression,
          this.wheelStates[2].normalizedCompression,
          this.wheelStates[3].normalizedCompression,
        ],
      },
    };
  }

  private updateDrivetrain(
    forwardSpeedMs: number,
    throttle: number,
    isBraking: boolean,
    isReversing: boolean,
    dt: number
  ): GearValue {
    const dtSpec = this.spec.drivetrain;

    if (isReversing || forwardSpeedMs < -0.5) {
      const revNorm = clamp(
        Math.abs(forwardSpeedMs) / dtSpec.reverseTopSpeedMs,
        0,
        1
      );
      const targetRpm = lerp(
        dtSpec.idleRpm + throttle * 1600,
        dtSpec.redlineRpm,
        revNorm
      );
      this.currentRpm = lerp(this.currentRpm, targetRpm, clamp(dt * 10, 0, 1));
      return 'R';
    }

    if (Math.abs(forwardSpeedMs) < 0.35 && throttle === 0 && !isBraking) {
      this.currentGearIndex = 0;
      this.currentRpm = lerp(
        this.currentRpm,
        dtSpec.idleRpm,
        clamp(dt * 8, 0, 1)
      );
      return 'N';
    }

    const wheelCircumference = 2 * Math.PI * this.spec.wheels.radius;
    const wheelRpm = (Math.abs(forwardSpeedMs) / wheelCircumference) * 60;

    const calcRpmForGear = (gearIdx: number) =>
      dtSpec.idleRpm +
      wheelRpm * dtSpec.gearRatios[gearIdx] * dtSpec.finalDrive;

    let rawRpm = calcRpmForGear(this.currentGearIndex);

    // Upshift with hysteresis
    if (
      rawRpm > dtSpec.redlineRpm &&
      this.currentGearIndex < dtSpec.gearRatios.length - 1
    ) {
      this.currentGearIndex++;
      rawRpm = calcRpmForGear(this.currentGearIndex);
    } else if (rawRpm < 3300 && this.currentGearIndex > 0) {
      const lowerGearRpm = calcRpmForGear(this.currentGearIndex - 1);
      if (lowerGearRpm < dtSpec.redlineRpm - 600) {
        this.currentGearIndex--;
        rawRpm = lowerGearRpm;
      }
    }

    const loadBlip = throttle > 0 ? 450 : 0;
    const targetRpm = clamp(
      rawRpm + loadBlip,
      dtSpec.idleRpm,
      dtSpec.maxRpm
    );
    this.currentRpm = lerp(this.currentRpm, targetRpm, clamp(dt * 12, 0, 1));

    return String(this.currentGearIndex + 1) as GearValue;
  }
}
