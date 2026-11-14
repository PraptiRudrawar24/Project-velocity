import type { DrivingInputState } from '../input/InputManager';
import {
  TRACK_HALF_WIDTH,
  TRACK_SAMPLES,
  projectOntoCircuit,
  type CircuitDefinition,
} from '../tracks/CircuitData';
import type { AIDifficultyProfile } from './AIConfigs';

export interface RacerSpatialState {
  id: string;
  position: [number, number, number];
  forward: [number, number, number];
  speedMs: number;
}

export interface AIDriverStepOutput {
  input: DrivingInputState;
  targetSpeedMs: number;
  targetLaneOffset: number;
  isOvertaking: boolean;
  isRecovering: boolean;
  needsCheckpointRespawn: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class AIDriver {
  private readonly id: string;
  private readonly preferredLaneOffset: number;
  private readonly paceVariance: number;
  private difficulty: AIDifficultyProfile;

  private currentLaneOffset: number;
  private stuckTimeSec = 0;
  private reverseTimerSec = 0;
  private reverseSteerSign = 1;

  constructor(opts: {
    id: string;
    preferredLaneOffset: number;
    paceVariance: number;
    difficulty: AIDifficultyProfile;
  }) {
    this.id = opts.id;
    this.preferredLaneOffset = opts.preferredLaneOffset;
    this.paceVariance = opts.paceVariance;
    this.difficulty = opts.difficulty;
    this.currentLaneOffset = opts.preferredLaneOffset;
  }

  public setDifficulty(difficulty: AIDifficultyProfile): void {
    this.difficulty = difficulty;
  }

  public reset(): void {
    this.currentLaneOffset = this.preferredLaneOffset;
    this.stuckTimeSec = 0;
    this.reverseTimerSec = 0;
  }

  public computeStep(
    self: RacerSpatialState,
    others: readonly RacerSpatialState[],
    circuit: CircuitDefinition,
    dt: number,
    canDrive: boolean
  ): AIDriverStepOutput {
    if (!canDrive) {
      return {
        input: {
          accelerate: false,
          brakeReverse: false,
          steerLeft: false,
          steerRight: false,
          handbrake: false,
          steerAxis: 0,
          throttleAxis: 0,
          brakeAxis: 0,
        },
        targetSpeedMs: 0,
        targetLaneOffset: this.currentLaneOffset,
        isOvertaking: false,
        isRecovering: false,
        needsCheckpointRespawn: false,
      };
    }

    const [px, , pz] = self.position;
    const [fx, , fz] = self.forward;
    const fLen = Math.hypot(fx, fz) || 1;
    const fwdX = fx / fLen;
    const fwdZ = fz / fLen;
    // Right vector in XZ plane: forward x (0, 1, 0) = (-fwdZ, 0, fwdX)
    const rightX = -fwdZ;
    const rightZ = fwdX;

    const proj = projectOntoCircuit(px, pz, circuit);
    const isOffTrack = Math.abs(proj.lateralOffset) > TRACK_HALF_WIDTH + 0.5;

    // 1. Stuck & reverse recovery detection
    if (this.reverseTimerSec > 0) {
      this.reverseTimerSec = Math.max(0, this.reverseTimerSec - dt);
      return {
        input: {
          accelerate: false,
          brakeReverse: true,
          steerLeft: this.reverseSteerSign > 0,
          steerRight: this.reverseSteerSign < 0,
          handbrake: false,
          steerAxis: this.reverseSteerSign * 0.75,
          throttleAxis: 0,
          brakeAxis: 0.75,
        },
        targetSpeedMs: 0,
        targetLaneOffset: 0,
        isOvertaking: false,
        isRecovering: true,
        needsCheckpointRespawn: false,
      };
    }

    if (self.speedMs < 1.35) {
      this.stuckTimeSec += dt;
      if (this.stuckTimeSec > 4.2) {
        this.stuckTimeSec = 0;
        return {
          input: {
            accelerate: false,
            brakeReverse: false,
            steerLeft: false,
            steerRight: false,
            handbrake: false,
            steerAxis: 0,
            throttleAxis: 0,
            brakeAxis: 0,
          },
          targetSpeedMs: 0,
          targetLaneOffset: 0,
          isOvertaking: false,
          isRecovering: true,
          needsCheckpointRespawn: true,
        };
      }
      if (this.stuckTimeSec > 1.8) {
        this.reverseTimerSec = 1.0;
        // Steer opposite to off-center direction while reversing
        this.reverseSteerSign = proj.lateralOffset >= 0 ? -1 : 1;
      }
    } else {
      this.stuckTimeSec = Math.max(0, this.stuckTimeSec - dt * 2.0);
    }

    // 2. Collision awareness & overtaking lane selection
    let desiredLaneOffset = isOffTrack ? 0 : this.preferredLaneOffset;
    let isOvertaking = false;
    let proximityBrake = 0;
    let proximityThrottleCap = 1.0;

    for (let i = 0; i < others.length; i++) {
      const other = others[i];
      if (other.id === this.id) continue;

      const dx = other.position[0] - px;
      const dz = other.position[2] - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq > 26 * 26) continue;

      const localFwd = dx * fwdX + dz * fwdZ; // > 0 means ahead of AI
      const localRight = dx * rightX + dz * rightZ; // > 0 means to AI's right

      // Ahead obstacle/opponent check
      if (localFwd > 1.5 && localFwd < 22 && Math.abs(localRight) < 3.4) {
        // Attempt overtake toward whichever side of track has wider clearance
        if (Math.abs(localRight) < 2.5 && !isOffTrack) {
          isOvertaking = true;
          const spaceLeft = proj.lateralOffset + (TRACK_HALF_WIDTH - 1.6);
          const spaceRight = TRACK_HALF_WIDTH - 1.6 - proj.lateralOffset;
          const overtakeSide =
            localRight >= 0
              ? spaceLeft > 2.6
                ? -1
                : 1
              : spaceRight > 2.6
                ? 1
                : -1;
          desiredLaneOffset = clamp(
            proj.lateralOffset +
              overtakeSide * (3.1 * this.difficulty.overtakeAggression),
            -(TRACK_HALF_WIDTH - 1.8),
            TRACK_HALF_WIDTH - 1.8
          );
        }

        // Collision avoidance braking if too close ahead
        if (localFwd < 8.5 && Math.abs(localRight) < 2.1) {
          const closingSpeed = self.speedMs - other.speedMs;
          if (localFwd < 5.5 || closingSpeed > 3.5) {
            proximityBrake = Math.max(
              proximityBrake,
              clamp((8.5 - localFwd) / 6.0, 0.2, 0.85)
            );
            proximityThrottleCap = Math.min(proximityThrottleCap, 0.15);
          } else {
            proximityThrottleCap = Math.min(proximityThrottleCap, 0.55);
          }
        }
      } else if (Math.abs(localFwd) <= 4.5 && Math.abs(localRight) < 2.8) {
        // Side-by-side spatial awareness: keep clean lateral racing room
        const pushDir = localRight >= 0 ? -1 : 1;
        desiredLaneOffset = clamp(
          desiredLaneOffset + pushDir * 1.6,
          -(TRACK_HALF_WIDTH - 1.5),
          TRACK_HALF_WIDTH - 1.5
        );
      }
    }

    const laneRate = isOffTrack ? 4.0 : 2.6;
    this.currentLaneOffset = lerp(
      this.currentLaneOffset,
      desiredLaneOffset,
      clamp(dt * laneRate, 0, 1)
    );

    // 3. Corner speed profiling from upcoming curvature
    const lookStart = 3;
    const lookEnd = Math.round(
      clamp(14 + self.speedMs * 0.25 * this.difficulty.brakeMarginFactor, 14, 30)
    );
    let maxUpcomingCurvature = 0;
    for (let step = lookStart; step <= lookEnd; step += 2) {
      const f = circuit.frames[(proj.frame.index + step) % TRACK_SAMPLES];
      const absCurv = Math.abs(f.curvature);
      if (absCurv > maxUpcomingCurvature) {
        maxUpcomingCurvature = absCurv;
      }
    }

    // Approximate radius from 2-frame tangent delta (~4.8m chord)
    const approxRadius = 4.8 / Math.max(maxUpcomingCurvature, 0.012);
    const baseCornerSpeed = Math.sqrt(15.2 * approxRadius);
    const maxAllowedSpeed =
      this.difficulty.topSpeedMs *
      this.paceVariance *
      (isOffTrack ? 0.58 : 1.0);
    const targetSpeedMs = Math.min(
      maxAllowedSpeed,
      baseCornerSpeed * this.difficulty.cornerSpeedFactor * this.paceVariance
    );

    // 4. Pure-pursuit waypoint steering
    const lookaheadFrames = Math.round(clamp(4 + self.speedMs * 0.22, 4, 15));
    const wpFrame =
      circuit.frames[(proj.frame.index + lookaheadFrames) % TRACK_SAMPLES];
    const wpX = wpFrame.position.x + wpFrame.right.x * this.currentLaneOffset;
    const wpZ = wpFrame.position.z + wpFrame.right.z * this.currentLaneOffset;

    const toWpX = wpX - px;
    const toWpZ = wpZ - pz;
    const localWpRight = toWpX * rightX + toWpZ * rightZ;
    const localWpFwd = toWpX * fwdX + toWpZ * fwdZ;

    // Positive angleError when waypoint is to AI's LEFT (-localRight)
    const headingError = Math.atan2(-localWpRight, Math.max(1.0, localWpFwd));
    let steerAxis = clamp(headingError / 0.42, -1, 1);
    if (localWpFwd < 0.2 && Math.abs(steerAxis) < 0.35) {
      steerAxis = localWpRight >= 0 ? -1 : 1;
    }

    // 5. Throttle & braking modulation around target speed
    let throttleAxis = 0;
    let brakeAxis = proximityBrake;

    const speedError = targetSpeedMs - self.speedMs;
    if (proximityBrake > 0.1) {
      throttleAxis = 0;
    } else if (speedError < -2.6) {
      brakeAxis = Math.max(
        brakeAxis,
        clamp((-speedError - 2.2) / 11.0, 0.15, 0.95)
      );
    } else if (speedError > 0.5) {
      throttleAxis = clamp(
        (speedError / 7.5) * this.difficulty.throttleCap * proximityThrottleCap,
        0.15,
        this.difficulty.throttleCap * proximityThrottleCap
      );
    } else {
      // Maintain cruise speed smoothly
      throttleAxis = 0.28 * this.difficulty.throttleCap * proximityThrottleCap;
    }

    return {
      input: {
        accelerate: throttleAxis > 0.05,
        brakeReverse: brakeAxis > 0.05,
        steerLeft: steerAxis > 0.08,
        steerRight: steerAxis < -0.08,
        handbrake: false,
        steerAxis,
        throttleAxis,
        brakeAxis,
      },
      targetSpeedMs,
      targetLaneOffset: this.currentLaneOffset,
      isOvertaking,
      isRecovering: isOffTrack,
      needsCheckpointRespawn: false,
    };
  }
}
