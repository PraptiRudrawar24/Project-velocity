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
  angularSpeedRadPerSec: number;
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

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
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
  const eased = Math.pow(speedRatio, spec.steering.speedSensitivityExponent);
  return lerp(
    spec.steering.maxAngleLowSpeedRad,
    spec.steering.maxAngleHighSpeedRad,
    eased
  );
}

export class VehiclePhysicsEngine {
  private spec: VehicleSpec;
  private currentSteerAngle = 0;
  private currentThrottle = 0;
  private currentBrake = 0;
  private driftFactor = 0; // 0..1 smooth drift grip-reduction blend
  private prevForwardSpeedMs = 0;
  private prevLateralSpeedMs = 0;
  private filteredLongAccel = 0;
  private filteredLatAccel = 0;
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
  private readonly hitNormal = new THREE.Vector3();
  private readonly suspNormal = new THREE.Vector3();
  private readonly tmpForce = new THREE.Vector3();
  private readonly restoreAxis = new THREE.Vector3();

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
    this.currentThrottle = 0;
    this.currentBrake = 0;
    this.driftFactor = 0;
    this.prevForwardSpeedMs = 0;
    this.prevLateralSpeedMs = 0;
    this.filteredLongAccel = 0;
    this.filteredLatAccel = 0;
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
      w.angularSpeedRadPerSec = 0;
      w.surface = 'asphalt';
      w.normalForce = 0;
    }
  }

  public setSpec(spec: VehicleSpec): void {
    this.spec = spec;
  }

  public getDriftFactor(): number {
    return this.driftFactor;
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
      angularSpeedRadPerSec: 0,
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

    // Track filtered longitudinal & lateral accelerations for realistic weight transfer
    const rawLongAccel = clamp(
      (forwardSpeedMs - this.prevForwardSpeedMs) / safeDt,
      -25,
      25
    );
    const rawLatAccel = clamp(
      (lateralSpeedMs - this.prevLateralSpeedMs) / safeDt,
      -28,
      28
    );
    const accelAlpha = clamp(safeDt * 10, 0, 1);
    this.filteredLongAccel = lerp(
      this.filteredLongAccel,
      rawLongAccel,
      accelAlpha
    );
    this.filteredLatAccel = lerp(
      this.filteredLatAccel,
      rawLatAccel,
      accelAlpha
    );
    this.prevForwardSpeedMs = forwardSpeedMs;
    this.prevLateralSpeedMs = lateralSpeedMs;

    // 1. Speed-dependent steering with counter-steer responsiveness
    const steerInput =
      input.steerAxis !== undefined
        ? clamp(input.steerAxis, -1, 1)
        : (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
    const slipAngleRad =
      speedMs > 2.2
        ? Math.atan2(lateralSpeedMs, Math.max(Math.abs(forwardSpeedMs), 1.8))
        : 0;
    const isCounterSteering =
      this.driftFactor > 0.2 &&
      steerInput !== 0 &&
      Math.sign(steerInput) !== Math.sign(slipAngleRad);

    const maxSteer = computeSpeedDependentMaxSteer(forwardSpeedMs, spec);
    const targetSteer = steerInput * maxSteer;
    const baseRate =
      steerInput !== 0
        ? spec.steering.steerRateRadPerSec *
          (isCounterSteering ? spec.drifting.counterSteerAssist : 1.0)
        : spec.steering.returnRateRadPerSec;
    this.currentSteerAngle = moveToward(
      this.currentSteerAngle,
      targetSteer,
      baseRate * safeDt
    );

    // 2. Progressive Throttle / Brake / Reverse state logic
    const accelLevel =
      input.throttleAxis !== undefined
        ? clamp(input.throttleAxis, 0, 1)
        : input.accelerate
          ? 1
          : 0;
    const brakeLevel =
      input.brakeAxis !== undefined
        ? clamp(input.brakeAxis, 0, 1)
        : input.brakeReverse
          ? 1
          : 0;

    let targetThrottle = 0;
    let targetBrake = 0;
    let isBraking = false;
    let isReversing = false;

    if (accelLevel > 0.01 && brakeLevel > 0.01) {
      targetBrake = brakeLevel;
      isBraking = true;
    } else if (brakeLevel > 0.01) {
      if (forwardSpeedMs > 0.8) {
        targetBrake = brakeLevel;
        isBraking = true;
      } else {
        isReversing = true;
        targetThrottle = brakeLevel;
      }
    } else if (accelLevel > 0.01) {
      if (forwardSpeedMs < -0.8) {
        targetBrake = accelLevel;
        isBraking = true;
      } else {
        targetThrottle = accelLevel;
      }
    }

    this.currentThrottle = moveToward(
      this.currentThrottle,
      targetThrottle,
      (targetThrottle > this.currentThrottle
        ? spec.handling.throttleResponseRate
        : spec.handling.throttleReleaseRate) * safeDt
    );
    this.currentBrake = moveToward(
      this.currentBrake,
      targetBrake,
      (targetBrake > this.currentBrake
        ? spec.handling.brakeResponseRate
        : spec.handling.throttleReleaseRate) * safeDt
    );

    // 3. Smooth Drift Initiation & Recovery Envelope
    const wantsDrift =
      speedMs > 3.8 &&
      (input.handbrake || Math.abs(slipAngleRad) > 0.26);
    const targetDriftFactor = input.handbrake
      ? speedMs > 3.5
        ? 1.0
        : 0.0
      : wantsDrift
        ? clamp((Math.abs(slipAngleRad) - 0.22) / 0.35, 0, 0.75)
        : 0.0;

    const driftRate =
      targetDriftFactor > this.driftFactor
        ? spec.drifting.driftEnterRate
        : spec.drifting.driftRecoverRate;
    this.driftFactor = moveToward(
      this.driftFactor,
      targetDriftFactor,
      driftRate * safeDt
    );

    // 4. Wheel suspension raycasts (FL, FR, RL, RR) with surface-normal response
    const wheelOffsets: Array<{
      x: number;
      z: number;
      isFront: boolean;
      isLeft: boolean;
    }> = [
      {
        x: -spec.wheels.halfTrackX,
        z: spec.wheels.frontZ,
        isFront: true,
        isLeft: true,
      },
      {
        x: spec.wheels.halfTrackX,
        z: spec.wheels.frontZ,
        isFront: true,
        isLeft: false,
      },
      {
        x: -spec.wheels.halfTrackX,
        z: spec.wheels.rearZ,
        isFront: false,
        isLeft: true,
      },
      {
        x: spec.wheels.halfTrackX,
        z: spec.wheels.rearZ,
        isFront: false,
        isLeft: false,
      },
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

    // Longitudinal & lateral weight transfer deltas per wheel
    const wheelbase = Math.max(
      0.5,
      Math.abs(spec.wheels.frontZ - spec.wheels.rearZ)
    );
    const trackWidth = Math.max(0.5, spec.wheels.halfTrackX * 2);
    const staticWheelLoad = (spec.massKg * 9.81) / 4;
    const longTransferPerWheel =
      0.5 *
      spec.massKg *
      this.filteredLongAccel *
      (spec.handling.cgHeightMeters / wheelbase) *
      spec.handling.longitudinalWeightTransfer;
    const latTransferPerWheel =
      0.5 *
      spec.massKg *
      this.filteredLatAccel *
      (spec.handling.cgHeightMeters / trackWidth) *
      spec.handling.lateralWeightTransfer;

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

        // Combine spring normal load with dynamic weight transfer + aero downforce
        const longSign = cfg.isFront ? -1 : 1; // accel shifts load rear (+), brake shifts front (-)
        const latSign = cfg.isLeft ? -1 : 1; // left turn (accelLat < 0) unloads left, loads right
        const transferredLoad =
          springForce +
          damperForce +
          totalDownforce * 0.25 +
          longSign * longTransferPerWheel -
          latSign * latTransferPerWheel;

        const normalForce = clamp(
          transferredLoad,
          staticWheelLoad * 0.2,
          spec.suspension.maxForce
        );
        wState.normalForce = normalForce;

        wState.contactPoint = {
          x: this.wheelHardpoint.x + this.worldDown.x * hit.distance,
          y: this.wheelHardpoint.y + this.worldDown.y * hit.distance,
          z: this.wheelHardpoint.z + this.worldDown.z * hit.distance,
        };

        // Project suspension force along blended chassis-up & hit surface normal
        this.hitNormal.set(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
        this.suspNormal
          .copy(this.worldUp)
          .lerp(this.hitNormal, 0.72)
          .normalize();

        const rawSuspMag = clamp(
          springForce + damperForce,
          0,
          spec.suspension.maxForce
        );
        if (rawSuspMag > 0) {
          forces.push({
            force: {
              x: this.suspNormal.x * rawSuspMag,
              y: this.suspNormal.y * rawSuspMag,
              z: this.suspNormal.z * rawSuspMag,
            },
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

    // 5. Anti-roll bar forces (front 0-1, rear 2-3)
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

    // 6. Longitudinal & Lateral Tire Forces (Load Sensitivity + Friction Circle)
    const effMassPerWheel =
      groundedWheels > 0 ? spec.massKg / groundedWheels : spec.massKg;

    const speedFraction = clamp(
      Math.abs(forwardSpeedMs) / spec.drivetrain.topSpeedMs,
      0,
      1.05
    );
    const forwardDriveCurve = clamp(1.08 - 0.56 * speedFraction, 0.25, 1.08);

    for (let i = 0; i < 4; i++) {
      const wState = this.wheelStates[i];
      const cfg = wheelOffsets[i];
      if (!wState.grounded) {
        const airborneSpin = -forwardSpeedMs / spec.wheels.radius;
        wState.angularSpeedRadPerSec = airborneSpin;
        wState.spinDeltaRad = airborneSpin * safeDt;
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

      // Exact angular velocity (negative rotation around +X rolls top toward -Z)
      const visualSpinSpeed =
        !cfg.isFront && input.handbrake ? 0 : vLong;
      wState.angularSpeedRadPerSec = -visualSpinSpeed / spec.wheels.radius;
      wState.spinDeltaRad = wState.angularSpeedRadPerSec * safeDt;

      // Surface traction modifier
      const surfaceGrip =
        wState.surface === 'offtrack'
          ? 0.72
          : wState.surface === 'curb'
            ? 0.94
            : 1.0;

      // Tire load sensitivity: grip coefficient tapers smoothly under heavy load
      const loadRatio = wState.normalForce / staticWheelLoad;
      const loadSensitivityFactor = clamp(
        1.0 - spec.tires.loadSensitivity * (loadRatio - 1.0),
        0.74,
        1.14
      );

      // Longitudinal Drive / Brake / Engine Braking force
      let fLong = 0;
      const driveSplit = cfg.isFront ? 0.14 : 0.36; // 28% front / 72% rear sport AWD bias

      if (isBraking && this.currentBrake > 0.01) {
        const brakeBias = cfg.isFront ? 0.32 : 0.18;
        const maxNoReverseLong =
          (Math.abs(vLong) * effMassPerWheel) / safeDt;
        const rawBrake =
          spec.drivetrain.maxBrakeForce * brakeBias * this.currentBrake;
        if (Math.abs(vLong) > 0.05) {
          fLong = -Math.sign(vLong) * Math.min(rawBrake, maxNoReverseLong);
        }
      } else if (isReversing && this.currentThrottle > 0.01) {
        if (forwardSpeedMs > -spec.drivetrain.reverseTopSpeedMs) {
          fLong =
            -spec.drivetrain.reverseDriveForce *
            this.currentThrottle *
            driveSplit *
            surfaceGrip;
        }
      } else if (this.currentThrottle > 0.01 && !isReversing) {
        const handbrakeDriveCut = !cfg.isFront && input.handbrake ? 0 : 1;
        if (forwardSpeedMs < spec.drivetrain.topSpeedMs) {
          fLong =
            spec.drivetrain.maxDriveForce *
            this.currentThrottle *
            forwardDriveCurve *
            driveSplit *
            surfaceGrip *
            handbrakeDriveCut;
        }
      } else if (forwardSpeedMs > 1.2 && !isBraking) {
        // Subtle engine braking on lift-off
        const gearFactor = 0.65 + (5 - this.currentGearIndex) * 0.12;
        fLong -= spec.handling.engineBrakingForce * 0.25 * gearFactor;
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

      // Rolling resistance (stronger off-track, gentle stop damping near zero)
      const rollingMult = wState.surface === 'offtrack' ? 3.2 : 1.0;
      const rollingForce =
        Math.abs(vLong) > 0.25
          ? -Math.sign(vLong) *
            spec.tires.rollingResistance *
            0.25 *
            rollingMult
          : targetThrottle === 0 && !isBraking
            ? clamp(
                -vLong * effMassPerWheel * 4.2,
                -(Math.abs(vLong) * effMassPerWheel) / safeDt,
                (Math.abs(vLong) * effMassPerWheel) / safeDt
              )
            : 0;
      fLong += rollingForce;

      // Lateral tire force with smooth drift grip interpolation
      const rearGripFactor = lerp(
        1.0,
        spec.tires.handbrakeRearGripFactor,
        this.driftFactor
      );
      const baseLatGrip = cfg.isFront
        ? spec.tires.frontLateralGrip
        : spec.tires.rearLateralGrip * rearGripFactor;

      const peakLatForce =
        baseLatGrip * surfaceGrip * loadSensitivityFactor * wState.normalForce;
      const slipPeakVel = 1.9 + 0.038 * Math.abs(vLong);
      const desiredLatForce = -peakLatForce * Math.tanh(vLat / slipPeakVel);

      // Guarantee lateral force cannot reverse sideways velocity in a single step
      const maxNoReverseLat =
        (Math.abs(vLat) * effMassPerWheel) / safeDt;
      let fLat = clamp(desiredLatForce, -maxNoReverseLat, maxNoReverseLat);

      // Friction circle coupling under simultaneous hard braking/drive and cornering
      const totalGripLimit = Math.max(peakLatForce, Math.abs(fLong) * 0.95);
      const combinedMag = Math.hypot(fLong, fLat);
      if (combinedMag > totalGripLimit && combinedMag > 1e-4) {
        const latBudget = Math.sqrt(
          Math.max(0, totalGripLimit * totalGripLimit - fLong * fLong * 0.65)
        );
        fLat = clamp(fLat, -latBudget, latBudget);
      }

      this.tmpForce
        .copy(this.wheelForward)
        .multiplyScalar(fLong)
        .addScaledVector(this.wheelRight, fLat);

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

    // 7. Aerodynamic drag + downforce + drift yaw & spinout-prevention stabilizer
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

    // Controlled handbrake yaw initiation (attenuated near max yaw rate)
    const absYawRate = Math.abs(this.bodyAngVel.y);
    if (
      input.handbrake &&
      groundedWheels >= 2 &&
      Math.abs(forwardSpeedMs) > 4.5 &&
      steerInput !== 0
    ) {
      const speedFactor = clamp(Math.abs(forwardSpeedMs) / 28, 0.2, 1.0);
      const yawHeadroom = clamp(
        1.0 - absYawRate / spec.drifting.maxYawRateRadPerSec,
        0,
        1
      );
      torqueY +=
        steerInput *
        spec.drifting.yawAssistTorque *
        speedFactor *
        yawHeadroom;
    }

    // Spinout prevention: progressive yaw rate & slip angle governor
    if (groundedWheels >= 2) {
      if (absYawRate > spec.drifting.maxYawRateRadPerSec) {
        const excessYaw = absYawRate - spec.drifting.maxYawRateRadPerSec;
        torqueY -=
          Math.sign(this.bodyAngVel.y) *
          excessYaw *
          spec.drifting.spinOutDamping;
      }

      if (
        Math.abs(slipAngleRad) > spec.drifting.maxDriftSlipAngleRad &&
        forwardSpeedMs > 4.0
      ) {
        const excessSlip =
          Math.abs(slipAngleRad) - spec.drifting.maxDriftSlipAngleRad;
        // Pull heading back toward velocity direction to avoid uncontrollable 360 spin
        torqueY -=
          Math.sign(slipAngleRad) *
          excessSlip *
          spec.drifting.spinOutDamping *
          0.95;
      }

      // Smooth yaw recovery damping when not holding handbrake
      if (!input.handbrake) {
        torqueY -= this.bodyAngVel.y * (isCounterSteering ? 1200 : 720);
      }
    }

    // Anti-flip upright assist if chassis rolls/pitches too steeply
    const upTilt = this.worldUp.y;
    if (upTilt < 0.85) {
      this.restoreAxis.crossVectors(this.worldUp, UP_LOCAL);
      const strength = (0.85 - upTilt) * 18000;
      torqueX += this.restoreAxis.x * strength;
      torqueZ += this.restoreAxis.z * strength;
    }

    // 8. Gearbox & RPM simulation
    const gear = this.updateDrivetrain(
      forwardSpeedMs,
      this.currentThrottle,
      isBraking,
      isReversing,
      safeDt
    );

    const isDrifting =
      groundedWheels >= 2 &&
      speedMs > 4.5 &&
      ((input.handbrake && Math.abs(steerInput) > 0) ||
        Math.abs(slipAngleRad) > 0.22 ||
        this.driftFactor > 0.35);

    const driftIntensity = isDrifting
      ? clamp(
          Math.max(
            this.driftFactor * 0.85,
            (Math.abs(slipAngleRad) - 0.14) / 0.5
          ) * clamp((speedMs - 3.5) / 14, 0.15, 1),
          0,
          1
        )
      : 0;

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
        throttle: this.currentThrottle,
        brake: this.currentBrake,
        steerAngleRad: this.currentSteerAngle,
        isHandbraking: input.handbrake,
        isDrifting,
        driftIntensity,
        slipAngleDeg: Math.round((slipAngleRad * 180) / Math.PI),
        lateralG: Number((this.filteredLatAccel / 9.81).toFixed(2)),
        longitudinalG: Number((this.filteredLongAccel / 9.81).toFixed(2)),
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

    if (Math.abs(forwardSpeedMs) < 0.35 && throttle < 0.05 && !isBraking) {
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

    const loadBlip = throttle > 0.05 ? throttle * 450 : 0;
    const targetRpm = clamp(
      rawRpm + loadBlip,
      dtSpec.idleRpm,
      dtSpec.maxRpm
    );
    this.currentRpm = lerp(this.currentRpm, targetRpm, clamp(dt * 12, 0, 1));

    return String(this.currentGearIndex + 1) as GearValue;
  }
}
