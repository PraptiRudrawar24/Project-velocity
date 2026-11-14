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

function makeFlatGroundRaycast(groundHeightFn?: (x: number, z: number) => number): WheelRaycastFn {
  return (origin) => {
    const groundY = groundHeightFn ? groundHeightFn(origin.x, origin.z) : 0;
    const dist = origin.y - groundY;
    if (dist < 0) return null;
    return {
      distance: dist,
      normal: { x: 0, y: 1, z: 0 },
      surface: groundY > 0.01 ? 'curb' : 'asphalt',
    };
  };
}

function makeBody(
  opts?: Partial<{
    y: number;
    vx: number;
    vy: number;
    vz: number;
    angY: number;
  }>
): RigidBodyKinematics {
  const vx = opts?.vx ?? 0;
  const vy = opts?.vy ?? 0;
  const vz = opts?.vz ?? 0;
  return {
    position: { x: 0, y: opts?.y ?? 0.48, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocity: { x: vx, y: vy, z: vz },
    angularVelocity: { x: 0, y: opts?.angY ?? 0, z: 0 },
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
    expect(totalUpwardForce).toBeGreaterThan(9000);
    expect(totalUpwardForce).toBeLessThan(20000);
  });

  it('ramps throttle smoothly, produces forward (-Z) thrust, and applies engine braking on lift-off', () => {
    const engine = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const accelInput: DrivingInputState = { ...NO_INPUT, accelerate: true };
    const body = makeBody({ y: 0.48, vz: -12 });

    const tick1 = engine.step(body, accelInput, makeFlatGroundRaycast(), 1 / 60);
    let tickLater = tick1;
    for (let i = 0; i < 12; i++) {
      tickLater = engine.step(body, accelInput, makeFlatGroundRaycast(), 1 / 60);
    }

    expect(tickLater.telemetry.throttle).toBeGreaterThan(tick1.telemetry.throttle);
    expect(tickLater.telemetry.throttle).toBeCloseTo(1, 1);

    const totalZForce = tickLater.forces.reduce((sum, f) => sum + f.force.z, 0);
    expect(totalZForce).toBeLessThan(-5000);
    expect(tickLater.telemetry.gear).not.toBe('N');
    expect(tickLater.telemetry.rpm).toBeGreaterThan(APEX_GT_SPEC.drivetrain.idleRpm);

    // Lift off throttle: engine braking + aero drag decels smoothly (+Z force opposing -Z motion)
    let coastStep = tickLater;
    for (let i = 0; i < 15; i++) {
      coastStep = engine.step(body, NO_INPUT, makeFlatGroundRaycast(), 1 / 60);
    }
    const coastZ = coastStep.forces.reduce((sum, f) => sum + f.force.z, 0);
    expect(coastStep.telemetry.throttle).toBe(0);
    expect(coastZ).toBeGreaterThan(200);
  });

  it('applies progressive braking before engaging reverse when moving forward', () => {
    const engine = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const input: DrivingInputState = { ...NO_INPUT, brakeReverse: true };
    const forwardMovingBody = makeBody({ y: 0.48, vz: -20 });

    let brakeStep = engine.step(
      forwardMovingBody,
      input,
      makeFlatGroundRaycast(),
      1 / 60
    );
    for (let i = 0; i < 10; i++) {
      brakeStep = engine.step(
        forwardMovingBody,
        input,
        makeFlatGroundRaycast(),
        1 / 60
      );
    }
    const totalZForce = brakeStep.forces.reduce((sum, f) => sum + f.force.z, 0);

    expect(brakeStep.telemetry.isBraking).toBe(true);
    expect(brakeStep.telemetry.isReversing).toBe(false);
    expect(totalZForce).toBeGreaterThan(5000);
  });

  it('engages reverse gear (R) and applies +Z force when stopped or moving slowly', () => {
    const engine = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const input: DrivingInputState = { ...NO_INPUT, brakeReverse: true };
    const stoppedBody = makeBody({ y: 0.48, vz: 0 });

    let revStep = engine.step(
      stoppedBody,
      input,
      makeFlatGroundRaycast(),
      1 / 60
    );
    for (let i = 0; i < 10; i++) {
      revStep = engine.step(
        stoppedBody,
        input,
        makeFlatGroundRaycast(),
        1 / 60
      );
    }
    const totalZForce = revStep.forces.reduce((sum, f) => sum + f.force.z, 0);

    expect(revStep.telemetry.gear).toBe('R');
    expect(revStep.telemetry.isReversing).toBe(true);
    expect(totalZForce).toBeGreaterThan(1500);
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

  it('transfers longitudinal load to front tires under braking and rear tires under acceleration', () => {
    const engineAccel = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const engineBrake = new VehiclePhysicsEngine(APEX_GT_SPEC);

    // Simulate accelerating from 10 m/s -> 15 m/s over consecutive steps
    for (let i = 0; i < 10; i++) {
      const v = 10 + i * 0.5;
      engineAccel.step(
        makeBody({ y: 0.48, vz: -v }),
        { ...NO_INPUT, accelerate: true },
        makeFlatGroundRaycast(),
        1 / 60
      );
    }
    const accelRes = engineAccel.step(
      makeBody({ y: 0.48, vz: -15.5 }),
      { ...NO_INPUT, accelerate: true },
      makeFlatGroundRaycast(),
      1 / 60
    );
    expect(accelRes.telemetry.longitudinalG).toBeGreaterThan(0.5);

    // Simulate braking from 25 m/s -> 20 m/s
    for (let i = 0; i < 10; i++) {
      const v = 25 - i * 0.5;
      engineBrake.step(
        makeBody({ y: 0.48, vz: -v }),
        { ...NO_INPUT, brakeReverse: true },
        makeFlatGroundRaycast(),
        1 / 60
      );
    }
    const brakeRes = engineBrake.step(
      makeBody({ y: 0.48, vz: -19.5 }),
      { ...NO_INPUT, brakeReverse: true },
      makeFlatGroundRaycast(),
      1 / 60
    );
    expect(brakeRes.telemetry.longitudinalG).toBeLessThan(-0.5);
  });

  it('initiates drift smoothly with handbrake, caps uncontrolled spinout yaw, and recovers smoothly', () => {
    const engine = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const slidingBody = makeBody({ y: 0.48, vx: 3.2, vz: -22 });
    const hbInput: DrivingInputState = {
      ...NO_INPUT,
      steerLeft: true,
      handbrake: true,
    };

    let hbRes = engine.step(
      slidingBody,
      hbInput,
      makeFlatGroundRaycast(),
      1 / 60
    );
    for (let i = 0; i < 15; i++) {
      hbRes = engine.step(
        slidingBody,
        hbInput,
        makeFlatGroundRaycast(),
        1 / 60
      );
    }

    expect(hbRes.telemetry.isDrifting).toBe(true);
    expect(hbRes.telemetry.driftIntensity).toBeGreaterThan(0.35);
    expect(engine.getDriftFactor()).toBeGreaterThan(0.8);

    // Excess yaw rate should trigger strong corrective counter-yaw damping (spinout prevention)
    const overspinBody = makeBody({
      y: 0.48,
      vx: 3.2,
      vz: -22,
      angY: APEX_GT_SPEC.drifting.maxYawRateRadPerSec + 1.2,
    });
    const overspinRes = engine.step(
      overspinBody,
      hbInput,
      makeFlatGroundRaycast(),
      1 / 60
    );
    expect(overspinRes.torque.y).toBeLessThan(-2000);

    // Releasing handbrake & returning to straight driving recovers driftFactor smoothly
    const straightBody = makeBody({ y: 0.48, vx: 0, vz: -22 });
    for (let i = 0; i < 30; i++) {
      engine.step(straightBody, NO_INPUT, makeFlatGroundRaycast(), 1 / 60);
    }
    expect(engine.getDriftFactor()).toBeLessThan(0.05);
  });

  it('compresses individual wheels on uneven curb surfaces while maintaining stability', () => {
    const engine = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const body = makeBody({ y: 0.48, vz: -15 });

    // Left side wheels (x < 0) ride onto a 0.04m raised curb
    const curbRay = makeFlatGroundRaycast((x) => (x < 0 ? 0.04 : 0));
    const res = engine.step(body, NO_INPUT, curbRay, 1 / 60);

    expect(res.telemetry.surface).toBe('curb');
    // Front-left & rear-left compressions should exceed right-side compressions
    expect(res.telemetry.wheelCompressions[0]).toBeGreaterThan(
      res.telemetry.wheelCompressions[1]
    );
    expect(res.telemetry.wheelCompressions[2]).toBeGreaterThan(
      res.telemetry.wheelCompressions[3]
    );
  });

  it('balances drive thrust with aero drag near configured top speed', () => {
    const engine = new VehiclePhysicsEngine(APEX_GT_SPEC);
    const accelInput: DrivingInputState = { ...NO_INPUT, accelerate: true };
    const nearTopSpeedBody = makeBody({
      y: 0.48,
      vz: -APEX_GT_SPEC.drivetrain.topSpeedMs - 2,
    });

    let res = engine.step(
      nearTopSpeedBody,
      accelInput,
      makeFlatGroundRaycast(),
      1 / 60
    );
    for (let i = 0; i < 15; i++) {
      res = engine.step(
        nearTopSpeedBody,
        accelInput,
        makeFlatGroundRaycast(),
        1 / 60
      );
    }

    // Above topSpeedMs, drag opposes forward (-Z) travel so net Z force is positive (decelerating)
    const netZ = res.forces.reduce((sum, f) => sum + f.force.z, 0);
    expect(netZ).toBeGreaterThan(0);
  });
});
