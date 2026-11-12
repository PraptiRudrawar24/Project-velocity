import { describe, expect, it } from 'vitest';
import {
  VehiclePhysicsEngine,
  computeSpeedDependentMaxSteer,
  type RigidBodyKinematics,
  type WheelRaycastFn,
} from '../../src/game/physics/VehiclePhysics';
import { APEX_GT_SPEC } from '../../src/game/vehicles/CarConfigs';
import type { DrivingInputState } from '../../src/game/input/InputManager';

const NO_INPUT: DrivingInputState = {
  accelerate: false,
  brakeReverse: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
};

function makeFlatGroundRaycast(): WheelRaycastFn {
  return (origin) => {
    // Ground plane at y = 0; vertical ray pointing (0, -1, 0)
    const dist = origin.y;
    if (dist < 0) return null;
    return {
      distance: dist,
      normal: { x: 0, y: 1, z: 0 },
      surface: 'asphalt',
    };
  };
}

function makeBody(
  opts?: Partial<{
    y: number;
    vx: number;
    vy: number;
    vz: number;
  }>
): RigidBodyKinematics {
  const vx = opts?.vx ?? 0;
  const vy = opts?.vy ?? 0;
  const vz = opts?.vz ?? 0;
  return {
    position: { x: 0, y: opts?.y ?? 0.48, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocity: { x: vx, y: vy, z: vz },
    angularVelocity: { x: 0, y: 0, z: 0 },
    velocityAtPoint: () => ({ x: vx, y: vy, z: vz }),
  };
}

describe('VehiclePhysicsEngine', () => {
  it('supports vehicle suspension and settles near static equilibrium', () => {
    const engine = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const body = makeBody({ y: 0.48 });
    const result = engine.step(body, NO_INPUT, makeFlatGroundRaycast(), 1 / 60);

    expect(result.telemetry.groundedWheels).toBe(4);
    expect(result.telemetry.gear).toBe('N');

    const totalUpwardForce = result.forces.reduce((sum, f) => sum + f.force.y, 0);
    // Static weight is ~1420 * 9.81 = 13,930 N; should be positive and in realistic range
    expect(totalUpwardForce).toBeGreaterThan(9000);
    expect(totalUpwardForce).toBeLessThan(20000);
  });

  it('produces forward (-Z) drive force and climbs RPM when accelerating', () => {
    const engine = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const input: DrivingInputState = { ...NO_INPUT, accelerate: true };
    const body = makeBody({ y: 0.48, vz: -5 }); // moving forward along -Z

    const result = engine.step(body, input, makeFlatGroundRaycast(), 1 / 60);
    const totalZForce = result.forces.reduce((sum, f) => sum + f.force.z, 0);

    expect(totalZForce).toBeLessThan(-5000); // strong forward thrust along -Z
    expect(result.telemetry.gear).toBe('1');
    expect(result.telemetry.rpm).toBeGreaterThan(APEX_GT_SPEC.drivetrain.idleRpm);
    expect(result.telemetry.isReversing).toBe(false);
  });

  it('applies braking force before engaging reverse when moving forward', () => {
    const engine = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const input: DrivingInputState = { ...NO_INPUT, brakeReverse: true };
    const forwardMovingBody = makeBody({ y: 0.48, vz: -20 }); // 72 km/h forward

    const brakeStep = engine.step(
      forwardMovingBody,
      input,
      makeFlatGroundRaycast(),
      1 / 60
    );
    const totalZForce = brakeStep.forces.reduce((sum, f) => sum + f.force.z, 0);

    expect(brakeStep.telemetry.isBraking).toBe(true);
    expect(brakeStep.telemetry.isReversing).toBe(false);
    expect(totalZForce).toBeGreaterThan(5000); // opposing -Z motion (+Z brake force)
  });

  it('engages reverse gear (R) and applies +Z force when stopped or moving slowly', () => {
    const engine = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const input: DrivingInputState = { ...NO_INPUT, brakeReverse: true };
    const stoppedBody = makeBody({ y: 0.48, vz: 0 });

    const revStep = engine.step(
      stoppedBody,
      input,
      makeFlatGroundRaycast(),
      1 / 60
    );
    const totalZForce = revStep.forces.reduce((sum, f) => sum + f.force.z, 0);

    expect(revStep.telemetry.gear).toBe('R');
    expect(revStep.telemetry.isReversing).toBe(true);
    expect(totalZForce).toBeGreaterThan(1500); // pushing toward +Z (backward)
  });

  it('reduces max steering angle progressively at high speeds', () => {
    const lowSpeedSteer = computeSpeedDependentMaxSteer(3, APEX_GT_SPEC);
    const midSpeedSteer = computeSpeedDependentMaxSteer(30, APEX_GT_SPEC);
    const highSpeedSteer = computeSpeedDependentMaxSteer(65, APEX_GT_SPEC);

    expect(lowSpeedSteer).toBeGreaterThan(midSpeedSteer);
    expect(midSpeedSteer).toBeGreaterThan(highSpeedSteer);
    expect(highSpeedSteer).toBeCloseTo(
      APEX_GT_SPEC.steering.maxAngleHighSpeedRad,
      3
    );
  });

  it('reduces rear lateral resistance and triggers drift state with handbrake + steering', () => {
    const engineNormal = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const engineHb = new VehiclePhysicsEngine(APEX_GT_SPEC);

    // Car moving forward at 22 m/s with sideways slide vx = 3 m/s
    const slidingBody = makeBody({ y: 0.48, vx: 3.0, vz: -22 });
    const normalInput: DrivingInputState = { ...NO_INPUT, steerLeft: true };
    const hbInput: DrivingInputState = {
      ...NO_INPUT,
      steerLeft: true,
      handbrake: true,
    };

    // Step multiple times so steering & handbrake take hold
    let normalRes = engineNormal.step(
      slidingBody,
      normalInput,
      makeFlatGroundRaycast(),
      1 / 60
    );
    let hbRes = engineHb.step(
      slidingBody,
      hbInput,
      makeFlatGroundRaycast(),
      1 / 60
    );
    for (let i = 0; i < 6; i++) {
      normalRes = engineNormal.step(
        slidingBody,
        normalInput,
        makeFlatGroundRaycast(),
        1 / 60
      );
      hbRes = engineHb.step(
        slidingBody,
        hbInput,
        makeFlatGroundRaycast(),
        1 / 60
      );
    }

    expect(hbRes.telemetry.isDrifting).toBe(true);
    expect(hbRes.telemetry.isHandbraking).toBe(true);
    // Handbrake should also apply yaw initiation torque when steering at speed
    expect(Math.abs(hbRes.torque.y)).toBeGreaterThan(
      Math.abs(normalRes.torque.y)
    );
  });
});

