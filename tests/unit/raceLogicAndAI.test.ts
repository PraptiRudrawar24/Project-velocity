import { describe, expect, it } from 'vitest';
import {
  TRACK_HALF_WIDTH,
  TRACK_SAMPLES,
  getCircuitDefinition,
} from '../../src/game/tracks/CircuitData';
import {
  advanceRacerProgress,
  computeStandings,
  createRacerProgress,
  detectWrongWay,
  formatRaceTime,
} from '../../src/game/racing/RaceLogic';
import { DIFFICULTY_PROFILES } from '../../src/game/ai/AIConfigs';
import { AIDriver, type RacerSpatialState } from '../../src/game/ai/AIDriver';
import { useGameStore } from '../../src/state/gameStore';

describe('RaceLogic (Checkpoints, Laps, Wrong-Way & Standings)', () => {
  it('enforces sequential checkpoint order and prevents skipping checkpoints', () => {
    const circuit = getCircuitDefinition();
    const racer = createRacerProgress({
      id: 'player',
      name: 'Player',
      isPlayer: true,
      color: '#c81e2b',
      initialFrameIdx: TRACK_SAMPLES - 4,
    });

    // Cross start line on Lap 1
    advanceRacerProgress(racer, 4, 500, 2, circuit);
    expect(racer.hasCrossedStartOnLap1).toBe(true);
    expect(racer.nextCheckpointIdx).toBe(1);

    // Attempt to skip CP1 and jump directly to CP2 & CP3 -> must NOT advance!
    const skip1 = advanceRacerProgress(
      racer,
      circuit.checkpoints[2].frame.index + 2,
      5000,
      2,
      circuit
    );
    expect(skip1.checkpointPassed).toBeNull();
    expect(racer.nextCheckpointIdx).toBe(1);

    // Cross finish line without CP1..CP5 -> must NOT count a lap
    const fakeFinish = advanceRacerProgress(racer, 5, 10000, 2, circuit);
    expect(fakeFinish.lapCompleted).toBe(false);
    expect(racer.completedLaps).toBe(0);

    // Pass all checkpoints 1..5 in exact order
    for (let cp = 1; cp < circuit.checkpoints.length; cp++) {
      const res = advanceRacerProgress(
        racer,
        circuit.checkpoints[cp].frame.index + 3,
        12000 + cp * 3000,
        2,
        circuit
      );
      expect(res.checkpointPassed).toBe(cp);
    }
    expect(racer.nextCheckpointIdx).toBe(0);

    // Now cross finish line -> completes Lap 1
    advanceRacerProgress(racer, TRACK_SAMPLES - 5, 29000, 2, circuit);
    const lap1 = advanceRacerProgress(racer, 3, 30000, 2, circuit);
    expect(lap1.lapCompleted).toBe(true);
    expect(lap1.completedLapDurationMs).toBe(30000);
    expect(racer.completedLaps).toBe(1);
    expect(racer.lap).toBe(2);
    expect(racer.bestLapMs).toBe(30000);
    expect(lap1.raceFinished).toBe(false);

    // Complete Lap 2 -> finishes race
    for (let cp = 1; cp < circuit.checkpoints.length; cp++) {
      advanceRacerProgress(
        racer,
        circuit.checkpoints[cp].frame.index + 3,
        32000 + cp * 3000,
        2,
        circuit
      );
    }
    advanceRacerProgress(racer, TRACK_SAMPLES - 5, 57000, 2, circuit);
    const lap2 = advanceRacerProgress(racer, 3, 58000, 2, circuit);
    expect(lap2.lapCompleted).toBe(true);
    expect(lap2.raceFinished).toBe(true);
    expect(racer.finished).toBe(true);
    expect(racer.bestLapMs).toBe(28000);
  });

  it('detects wrong-way driving accurately while ignoring slow reverse', () => {
    // Driving forward aligned with -Z tangent
    expect(detectWrongWay(0, -1, 0, -1, 20)).toBe(false);
    // Driving fast against track direction (+Z vs -Z)
    expect(detectWrongWay(0, 1, 0, -1, 15)).toBe(true);
    // Slow parking/reverse adjustment below threshold
    expect(detectWrongWay(0, 1, 0, -1, 1.5)).toBe(false);
  });

  it('ranks finished racers by finish time ahead of active racers by progress', () => {
    const r1 = createRacerProgress({
      id: 'a',
      name: 'A',
      isPlayer: false,
      color: '#00f',
    });
    const r2 = createRacerProgress({
      id: 'b',
      name: 'B',
      isPlayer: true,
      color: '#f00',
    });
    const r3 = createRacerProgress({
      id: 'c',
      name: 'C',
      isPlayer: false,
      color: '#0f0',
    });

    r1.finished = true;
    r1.finishTimeMs = 62000;
    r1.totalProgress = 3;

    r2.finished = true;
    r2.finishTimeMs = 59000;
    r2.totalProgress = 3;

    r3.finished = false;
    r3.totalProgress = 1.75;

    const standings = computeStandings([r1, r2, r3]);
    expect(standings.map((s) => s.id)).toEqual(['b', 'a', 'c']);
    expect(standings[0].position).toBe(1);
    expect(formatRaceTime(59050)).toBe('00:59.05');
  });
});

describe('AIDriver & Difficulty System', () => {
  it('steers toward upcoming track waypoints and slows down for corners', () => {
    const circuit = getCircuitDefinition();
    const ai = new AIDriver({
      id: 'ai-1',
      preferredLaneOffset: 0,
      paceVariance: 1,
      difficulty: DIFFICULTY_PROFILES.medium,
    });

    // Straightaway at frame 2 -> target speed matches medium top speed
    const fStraight = circuit.frames[2];
    const straightOut = ai.computeStep(
      {
        id: 'ai-1',
        position: [fStraight.position.x, 0.5, fStraight.position.z],
        forward: [fStraight.tangent.x, 0, fStraight.tangent.z],
        speedMs: 25,
      },
      [],
      circuit,
      1 / 60,
      true
    );
    expect(straightOut.input.accelerate).toBe(true);
    expect(straightOut.targetSpeedMs).toBeGreaterThan(42);

    // Approaching Turn 1 curve at very high speed (60 m/s) -> must brake!
    const fPreTurn = circuit.frames[42];
    const cornerOut = ai.computeStep(
      {
        id: 'ai-1',
        position: [fPreTurn.position.x, 0.5, fPreTurn.position.z],
        forward: [fPreTurn.tangent.x, 0, fPreTurn.tangent.z],
        speedMs: 60,
      },
      [],
      circuit,
      1 / 60,
      true
    );
    expect(cornerOut.targetSpeedMs).toBeLessThan(48);
    expect(cornerOut.input.brakeReverse).toBe(true);
  });

  it('produces clear speed and aggression differences across Easy, Medium, and Hard', () => {
    const circuit = getCircuitDefinition();
    const f = circuit.frames[10];
    const self: RacerSpatialState = {
      id: 'ai-test',
      position: [f.position.x, 0.5, f.position.z],
      forward: [f.tangent.x, 0, f.tangent.z],
      speedMs: 20,
    };

    const easyOut = new AIDriver({
      id: 'ai-test',
      preferredLaneOffset: 0,
      paceVariance: 1,
      difficulty: DIFFICULTY_PROFILES.easy,
    }).computeStep(self, [], circuit, 1 / 60, true);

    const medOut = new AIDriver({
      id: 'ai-test',
      preferredLaneOffset: 0,
      paceVariance: 1,
      difficulty: DIFFICULTY_PROFILES.medium,
    }).computeStep(self, [], circuit, 1 / 60, true);

    const hardOut = new AIDriver({
      id: 'ai-test',
      preferredLaneOffset: 0,
      paceVariance: 1,
      difficulty: DIFFICULTY_PROFILES.hard,
    }).computeStep(self, [], circuit, 1 / 60, true);

    expect(hardOut.targetSpeedMs).toBeGreaterThan(medOut.targetSpeedMs);
    expect(medOut.targetSpeedMs).toBeGreaterThan(easyOut.targetSpeedMs);
  });

  it('initiates overtaking around slower cars ahead and avoids collisions', () => {
    const circuit = getCircuitDefinition();
    const ai = new AIDriver({
      id: 'ai-1',
      preferredLaneOffset: 0,
      paceVariance: 1,
      difficulty: DIFFICULTY_PROFILES.hard,
    });

    const fSelf = circuit.frames[15];
    const fBlocking = circuit.frames[18]; // ~7m ahead on same lane

    let lastOut = ai.computeStep(
      {
        id: 'ai-1',
        position: [fSelf.position.x, 0.5, fSelf.position.z],
        forward: [fSelf.tangent.x, 0, fSelf.tangent.z],
        speedMs: 35,
      },
      [
        {
          id: 'player',
          position: [fBlocking.position.x, 0.5, fBlocking.position.z],
          forward: [fBlocking.tangent.x, 0, fBlocking.tangent.z],
          speedMs: 18,
        },
      ],
      circuit,
      1 / 60,
      true
    );

    for (let i = 0; i < 10; i++) {
      lastOut = ai.computeStep(
        {
          id: 'ai-1',
          position: [fSelf.position.x, 0.5, fSelf.position.z],
          forward: [fSelf.tangent.x, 0, fSelf.tangent.z],
          speedMs: 35,
        },
        [
          {
            id: 'player',
            position: [fBlocking.position.x, 0.5, fBlocking.position.z],
            forward: [fBlocking.tangent.x, 0, fBlocking.tangent.z],
            speedMs: 18,
          },
        ],
        circuit,
        1 / 60,
        true
      );
    }

    expect(lastOut.isOvertaking).toBe(true);
    expect(Math.abs(lastOut.targetLaneOffset)).toBeGreaterThan(0.8);
    expect(lastOut.input.brakeReverse).toBe(true);
  });

  it('recovers from off-track excursions and stuck barrier situations', () => {
    const circuit = getCircuitDefinition();
    const ai = new AIDriver({
      id: 'ai-1',
      preferredLaneOffset: -2.0,
      paceVariance: 1,
      difficulty: DIFFICULTY_PROFILES.medium,
    });

    const f = circuit.frames[12];
    const offTrackPos: [number, number, number] = [
      f.position.x + f.right.x * (TRACK_HALF_WIDTH + 3.0),
      0.5,
      f.position.z + f.right.z * (TRACK_HALF_WIDTH + 3.0),
    ];

    const offOut = ai.computeStep(
      {
        id: 'ai-1',
        position: offTrackPos,
        forward: [f.tangent.x, 0, f.tangent.z],
        speedMs: 15,
      },
      [],
      circuit,
      1 / 60,
      true
    );
    expect(offOut.isRecovering).toBe(true);
    expect(offOut.targetSpeedMs).toBeLessThanOrEqual(30);

    // Stuck at ~0 speed for > 2s -> triggers reverse recovery
    let stuckOut = offOut;
    for (let i = 0; i < 120; i++) {
      stuckOut = ai.computeStep(
        {
          id: 'ai-1',
          position: offTrackPos,
          forward: [f.tangent.x, 0, f.tangent.z],
          speedMs: 0.2,
        },
        [],
        circuit,
        1 / 60,
        true
      );
    }
    expect(stuckOut.isRecovering).toBe(true);
    expect(stuckOut.input.brakeReverse).toBe(true);
  });
});

describe('Race Modes & Store State Transitions', () => {
  it('configures Time Trial with 0 opponents and Quick/Circuit Race with 3..5 opponents', () => {
    const store = useGameStore;

    store.getState().setRaceMode('time_trial');
    expect(store.getState().raceConfig.opponentCount).toBe(0);
    expect(store.getState().totalRacers).toBe(1);

    store.getState().setRaceMode('quick_race');
    expect(store.getState().raceConfig.opponentCount).toBeGreaterThanOrEqual(3);

    store.getState().setRaceConfig({ opponentCount: 5, difficulty: 'hard', totalLaps: 4 });
    expect(store.getState().raceConfig.opponentCount).toBe(5);
    expect(store.getState().raceConfig.difficulty).toBe('hard');
    expect(store.getState().totalRacers).toBe(6);

    store.getState().startRace();
    expect(store.getState().racePhase).toBe('countdown');
    expect(store.getState().countdownText).toBe('3');

    store.getState().returnToMenu();
    expect(store.getState().racePhase).toBe('menu');
  });
});
