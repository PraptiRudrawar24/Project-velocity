import { useMemo, useRef } from 'react';
import { useBeforePhysicsStep } from '@react-three/rapier';
import type { VehicleMotionSnapshot } from '../core/types';
import {
  TRACK_SAMPLES,
  getCircuitDefinition,
  projectOntoCircuit,
} from '../tracks/CircuitData';
import { useGameStore, useTelemetryStore } from '../../state/gameStore';

interface RaceManagerProps {
  motionRef: React.RefObject<VehicleMotionSnapshot>;
}

const FIXED_STEP_MS = 1000 / 60;

export function RaceManager({ motionRef }: RaceManagerProps) {
  const circuit = useMemo(() => getCircuitDefinition(), []);
  const prevFrameIdxRef = useRef<number>(TRACK_SAMPLES - 4);
  const raceTimeRef = useRef<number>(0);
  const lapTimeRef = useRef<number>(0);
  const handledRestartNonceRef = useRef<number>(
    useGameStore.getState().restartNonce
  );

  // Lock race & lap timers to the exact fixed physics timestep
  useBeforePhysicsStep(() => {
    const game = useGameStore.getState();

    if (game.restartNonce !== handledRestartNonceRef.current) {
      handledRestartNonceRef.current = game.restartNonce;
      raceTimeRef.current = 0;
      lapTimeRef.current = 0;
      prevFrameIdxRef.current = TRACK_SAMPLES - 4;
      useTelemetryStore.getState().setTelemetry({
        raceTimeMs: 0,
        currentLapMs: 0,
      });
      return;
    }

    if (game.isPaused) return;

    raceTimeRef.current += FIXED_STEP_MS;
    lapTimeRef.current += FIXED_STEP_MS;

    const [x, , z] = motionRef.current.position;
    const proj = projectOntoCircuit(x, z, circuit);
    const idx = proj.frame.index;
    const prevIdx = prevFrameIdxRef.current;

    const cp1Idx = circuit.checkpoints[1].frame.index;
    const cp2Idx = circuit.checkpoints[2].frame.index;

    if (game.currentSector === 0 && idx >= cp1Idx && idx < cp2Idx) {
      game.setSector(1);
    } else if (game.currentSector === 1 && idx >= cp2Idx) {
      game.setSector(2);
    } else if (
      game.currentSector === 2 &&
      prevIdx > TRACK_SAMPLES - 40 &&
      idx < 40
    ) {
      game.completeLap(lapTimeRef.current);
      lapTimeRef.current = 0;
    }

    prevFrameIdxRef.current = idx;

    useTelemetryStore.getState().setTelemetry({
      raceTimeMs: raceTimeRef.current,
      currentLapMs: lapTimeRef.current,
    });
  });

  return null;
}
