import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CollisionHandler } from '../../src/game/physics/CollisionHandler';
import {
  TRACK_HALF_WIDTH,
  getCheckpointSpawnTransform,
  getCircuitDefinition,
  projectOntoCircuit,
} from '../../src/game/tracks/CircuitData';

describe('CollisionHandler', () => {
  it('ignores non-obstacle surfaces such as ground and road', () => {
    const handler = new CollisionHandler();
    const res = handler.processCollision({
      otherUserData: { surface: 'ground', label: 'Track Surface' },
      relativeSpeedMs: 30,
      nowMs: 1000,
    });
    expect(res).toBeNull();
  });

  it('records obstacle impacts above minimum threshold and debounces bounces', () => {
    const handler = new CollisionHandler({ cooldownMs: 200, minImpactSpeedMs: 2.2 });

    const slowTap = handler.processCollision({
      otherUserData: { surface: 'guardrail', label: 'Outer Guardrail' },
      relativeSpeedMs: 1.0,
      nowMs: 1000,
    });
    expect(slowTap).toBeNull();

    const hit1 = handler.processCollision({
      otherUserData: { surface: 'guardrail', label: 'Outer Guardrail' },
      relativeSpeedMs: 18,
      nowMs: 1200,
    });
    expect(hit1).not.toBeNull();
    expect(hit1?.surface).toBe('guardrail');
    expect(hit1?.intensity).toBeGreaterThan(0.4);

    // Within cooldown -> ignored
    const bounce = handler.processCollision({
      otherUserData: { surface: 'guardrail', label: 'Outer Guardrail' },
      relativeSpeedMs: 12,
      nowMs: 1280,
    });
    expect(bounce).toBeNull();

    // After cooldown -> recorded
    const hit2 = handler.processCollision({
      otherUserData: { surface: 'tire_barrier', label: 'Turn 1 Tire Barrier' },
      relativeSpeedMs: 24,
      nowMs: 1500,
    });
    expect(hit2).not.toBeNull();
    expect(hit2?.surface).toBe('tire_barrier');
  });
});

describe('CircuitData', () => {
  it('builds a closed racing circuit with valid length, barriers, and forward-facing start grid', () => {
    const circuit = getCircuitDefinition();
    expect(circuit.totalLength).toBeGreaterThan(900);
    expect(circuit.frames.length).toBe(480);
    expect(circuit.barrierColliders.length).toBeGreaterThan(100);
    expect(circuit.curbZones.length).toBeGreaterThan(2);
    expect(circuit.curbColliders.length).toBeGreaterThan(10);

    const spawn = circuit.startGridTransform;
    const q = new THREE.Quaternion(...spawn.quaternion);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    // Should point forward along -Z on the main straight
    expect(forward.z).toBeLessThan(-0.95);
    expect(Math.abs(forward.x)).toBeLessThan(0.2);

    const cp1 = getCheckpointSpawnTransform(1, circuit);
    expect(cp1.position[1]).toBeCloseTo(0.5, 2);
  });

  it('classifies center asphalt vs offtrack terrain accurately', () => {
    const circuit = getCircuitDefinition();
    const onRoad = projectOntoCircuit(0, -40, circuit);
    expect(onRoad.isOnAsphalt).toBe(true);
    expect(Math.abs(onRoad.lateralOffset)).toBeLessThan(1.0);

    const offRoad = projectOntoCircuit(TRACK_HALF_WIDTH + 4, -40, circuit);
    expect(offRoad.isOnAsphalt).toBe(false);
  });
});

