import { useEffect, useMemo, useRef } from 'react';
import { useBeforePhysicsStep } from '@react-three/rapier';
import type { VehicleMotionSnapshot } from '../core/types';
import {
  TRACK_SAMPLES,
  getCircuitDefinition,
  projectOntoCircuit,
} from '../tracks/CircuitData';
import { AI_DRIVER_ROSTER } from '../ai/AIConfigs';
import type { RacerSpatialState } from '../ai/AIDriver';
import { useGameStore, useTelemetryStore } from '../../state/gameStore';
import {
  advanceRacerProgress,
  computeStandings,
  createRacerProgress,
  detectWrongWay,
} from './RaceLogic';
import type { RacerProgressState } from './RaceTypes';

interface RaceManagerProps {
  motionRef: React.RefObject<VehicleMotionSnapshot>;
  sharedRacersRef: React.RefObject<Map<string, RacerSpatialState>>;
  racerProgressRef: React.RefObject<Map<string, RacerProgressState>>;
}

const FIXED_STEP_MS = 1000 / 60;
const COUNTDOWN_STEP_MS = 750;
const GO_BANNER_DURATION_MS = 700;

export function RaceManager({
  motionRef,
  sharedRacersRef,
  racerProgressRef,
}: RaceManagerProps) {
  const circuit = useMemo(() => getCircuitDefinition(), []);
  const raceTimeRef = useRef<number>(0);
  const countdownMsRef = useRef<number>(0);
  const goClearTimerRef = useRef<number>(0);
  const wrongWayTimerRef = useRef<number>(0);
  const stepCounterRef = useRef<number>(0);

  const handledRestartNonceRef = useRef<number>(-1);

  const initializeRacers = () => {
    const game = useGameStore.getState();
    const oppCount = game.raceConfig.opponentCount;
    const progressMap = racerProgressRef.current;
    progressMap.clear();

    for (let i = 0; i < oppCount; i++) {
      const desc = AI_DRIVER_ROSTER[i];
      if (!desc) continue;
      const startFrame = (TRACK_SAMPLES - 3 - i * 3 + TRACK_SAMPLES) % TRACK_SAMPLES;
      progressMap.set(
        desc.id,
        createRacerProgress({
          id: desc.id,
          name: desc.name,
          isPlayer: false,
          color: desc.bodyColor,
          initialFrameIdx: startFrame,
        })
      );
    }

    const playerSlotIdx = oppCount;
    const playerStartFrame =
      (TRACK_SAMPLES - 3 - playerSlotIdx * 3 + TRACK_SAMPLES) % TRACK_SAMPLES;
    progressMap.set(
      'player',
      createRacerProgress({
        id: 'player',
        name: 'You (Apex GT-R)',
        isPlayer: true,
        color: '#c81e2b',
        initialFrameIdx: playerStartFrame,
      })
    );

    raceTimeRef.current = 0;
    countdownMsRef.current = 0;
    goClearTimerRef.current = 0;
    wrongWayTimerRef.current = 0;
    stepCounterRef.current = 0;

    useTelemetryStore.getState().setTelemetry({
      raceTimeMs: 0,
      currentLapMs: 0,
    });
  };

  useEffect(() => {
    initializeRacers();
    handledRestartNonceRef.current = useGameStore.getState().restartNonce;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBeforePhysicsStep(() => {
    const game = useGameStore.getState();

    if (game.restartNonce !== handledRestartNonceRef.current) {
      handledRestartNonceRef.current = game.restartNonce;
      initializeRacers();
      return;
    }

    if (game.isPaused || game.racePhase === 'menu' || game.racePhase === 'finished') {
      return;
    }

    // Handle 3 - 2 - 1 - GO! Countdown
    if (game.racePhase === 'countdown') {
      countdownMsRef.current += FIXED_STEP_MS;
      const elapsed = countdownMsRef.current;

      if (elapsed < COUNTDOWN_STEP_MS) {
        if (game.countdownText !== '3') {
          game.setCountdownState('countdown', '3');
        }
      } else if (elapsed < COUNTDOWN_STEP_MS * 2) {
        if (game.countdownText !== '2') {
          game.setCountdownState('countdown', '2');
        }
      } else if (elapsed < COUNTDOWN_STEP_MS * 3) {
        if (game.countdownText !== '1') {
          game.setCountdownState('countdown', '1');
        }
      } else {
        goClearTimerRef.current = GO_BANNER_DURATION_MS;
        game.setCountdownState('racing', 'GO!');
      }
      return;
    }

    // Clear "GO!" banner smoothly after 700ms of live racing
    if (game.countdownText === 'GO!') {
      goClearTimerRef.current -= FIXED_STEP_MS;
      if (goClearTimerRef.current <= 0) {
        game.setCountdownState('racing', null);
      }
    }

    raceTimeRef.current += FIXED_STEP_MS;
    stepCounterRef.current += 1;

    const totalLaps = game.raceConfig.totalLaps;
    const progressMap = racerProgressRef.current;
    const racersSpatial = sharedRacersRef.current;

    // Advance every racer's sequential checkpoints & lap completion
    progressMap.forEach((racer, id) => {
      const spatial = racersSpatial.get(id);
      if (!spatial) return;

      const proj = projectOntoCircuit(
        spatial.position[0],
        spatial.position[2],
        circuit
      );
      const adv = advanceRacerProgress(
        racer,
        proj.frame.index,
        raceTimeRef.current,
        totalLaps,
        circuit
      );

      if (racer.isPlayer) {
        if (adv.checkpointPassed !== null) {
          game.setSector(adv.checkpointPassed);
        }

        if (adv.lapCompleted && adv.completedLapDurationMs !== null) {
          game.completeLap(adv.completedLapDurationMs);
        }

        // Wrong-way detection with 0.45s debounce
        const isWrong = detectWrongWay(
          motionRef.current.forward[0],
          motionRef.current.forward[2],
          proj.frame.tangent.x,
          proj.frame.tangent.z,
          motionRef.current.forwardSpeedMs
        );
        if (isWrong) {
          wrongWayTimerRef.current += FIXED_STEP_MS;
          if (wrongWayTimerRef.current > 450 && !game.isWrongWay) {
            game.setWrongWay(true);
          }
        } else {
          wrongWayTimerRef.current = 0;
          if (game.isWrongWay) {
            game.setWrongWay(false);
          }
        }

        if (adv.raceFinished) {
          const allRacers = Array.from(progressMap.values());
          const standings = computeStandings(allRacers);
          const playerStanding = standings.find((s) => s.isPlayer);
          const finishingPos = playerStanding?.position ?? 1;

          const prevPb = game.personalBestMs;
          const isNewPersonalBest =
            racer.bestLapMs !== null &&
            (prevPb === null || racer.bestLapMs < prevPb);

          game.finishRace({
            mode: game.raceConfig.mode,
            difficulty: game.raceConfig.difficulty,
            finishingPosition: finishingPos,
            totalRacers: standings.length,
            totalRaceTimeMs: raceTimeRef.current,
            bestLapMs: racer.bestLapMs,
            completedLaps: racer.completedLaps,
            totalLaps,
            isNewPersonalBest,
            standings,
          });
        }
      }
    });

    // Update live race position periodically (~6 Hz) without unnecessary React churn
    if (stepCounterRef.current % 10 === 0) {
      const allRacers = Array.from(progressMap.values());
      const standings = computeStandings(allRacers);
      const playerEntry = standings.find((s) => s.isPlayer);
      if (playerEntry) {
        game.setPlayerStanding(playerEntry.position, standings.length);
      }
    }

    const playerProgress = progressMap.get('player');
    const currentLapMs = playerProgress
      ? Math.max(0, raceTimeRef.current - playerProgress.currentLapStartMs)
      : raceTimeRef.current;

    useTelemetryStore.getState().setTelemetry({
      raceTimeMs: raceTimeRef.current,
      currentLapMs,
    });
  });

  return null;
}
