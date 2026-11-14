import {
  TRACK_SAMPLES,
  type CircuitDefinition,
} from '../tracks/CircuitData';
import type {
  RaceStandingEntry,
  RacerProgressState,
} from './RaceTypes';

export function formatRaceTime(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((safe % 1000) / 10);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const cc = String(centiseconds).padStart(2, '0');
  return `${mm}:${ss}.${cc}`;
}

export function createRacerProgress(opts: {
  id: string;
  name: string;
  isPlayer: boolean;
  color: string;
  initialFrameIdx?: number;
}): RacerProgressState {
  const initFrame = opts.initialFrameIdx ?? TRACK_SAMPLES - 4;
  return {
    id: opts.id,
    name: opts.name,
    isPlayer: opts.isPlayer,
    color: opts.color,
    lap: 1,
    completedLaps: 0,
    nextCheckpointIdx: 1,
    lastValidCheckpointIdx: 0,
    hasCrossedStartOnLap1: false,
    prevFrameIdx: initFrame,
    totalProgress: -((TRACK_SAMPLES - initFrame) / TRACK_SAMPLES),
    finished: false,
    finishTimeMs: null,
    bestLapMs: null,
    currentLapStartMs: 0,
  };
}

export interface AdvanceProgressResult {
  lapCompleted: boolean;
  completedLapDurationMs: number | null;
  raceFinished: boolean;
  checkpointPassed: number | null;
}

export function advanceRacerProgress(
  racer: RacerProgressState,
  frameIdx: number,
  raceTimeMs: number,
  totalLaps: number,
  circuit: CircuitDefinition
): AdvanceProgressResult {
  const result: AdvanceProgressResult = {
    lapCompleted: false,
    completedLapDurationMs: null,
    raceFinished: false,
    checkpointPassed: null,
  };

  if (racer.finished) {
    racer.prevFrameIdx = frameIdx;
    return result;
  }

  const cpCount = circuit.checkpoints.length;

  // Detect initial start-line crossing on Lap 1
  if (
    !racer.hasCrossedStartOnLap1 &&
    racer.prevFrameIdx > TRACK_SAMPLES - 80 &&
    frameIdx < 80
  ) {
    racer.hasCrossedStartOnLap1 = true;
  }

  // Validate checkpoints strictly in sequential order (1 -> 2 -> ... -> N-1 -> 0)
  if (racer.hasCrossedStartOnLap1) {
    const expectedCp = circuit.checkpoints[racer.nextCheckpointIdx];
    const cpFrame = expectedCp.frame.index;

    if (racer.nextCheckpointIdx > 0) {
      const deltaFwd = (frameIdx - cpFrame + TRACK_SAMPLES) % TRACK_SAMPLES;
      if (deltaFwd >= 0 && deltaFwd < 45) {
        result.checkpointPassed = racer.nextCheckpointIdx;
        racer.lastValidCheckpointIdx = racer.nextCheckpointIdx;
        racer.nextCheckpointIdx = (racer.nextCheckpointIdx + 1) % cpCount;
      }
    } else {
      // Expected checkpoint 0 = Start/Finish line after passing all intermediate checkpoints
      const crossedFinishLine =
        racer.prevFrameIdx > TRACK_SAMPLES - 80 && frameIdx < 80;
      if (crossedFinishLine) {
        const lapDur = Math.max(0, raceTimeMs - racer.currentLapStartMs);
        racer.completedLaps += 1;
        racer.bestLapMs =
          racer.bestLapMs === null ? lapDur : Math.min(racer.bestLapMs, lapDur);
        racer.currentLapStartMs = raceTimeMs;
        racer.lastValidCheckpointIdx = 0;
        racer.nextCheckpointIdx = 1;
        result.lapCompleted = true;
        result.completedLapDurationMs = lapDur;

        if (racer.completedLaps >= totalLaps) {
          racer.finished = true;
          racer.finishTimeMs = raceTimeMs;
          racer.totalProgress = totalLaps + 1;
          result.raceFinished = true;
          racer.prevFrameIdx = frameIdx;
          return result;
        } else {
          racer.lap = racer.completedLaps + 1;
        }
      }
    }
  }

  // Compute monotonic normalized race progress for live standings
  if (!racer.hasCrossedStartOnLap1) {
    const preStartDist =
      frameIdx > TRACK_SAMPLES / 2
        ? -((TRACK_SAMPLES - frameIdx) / TRACK_SAMPLES)
        : frameIdx / TRACK_SAMPLES;
    racer.totalProgress = preStartDist;
  } else {
    let lapFraction = frameIdx / TRACK_SAMPLES;
    // Prevent start-line wrap spike right after crossing or reversing slightly
    if (racer.nextCheckpointIdx === 1 && frameIdx > TRACK_SAMPLES - 90) {
      lapFraction = 0.0;
    } else if (racer.nextCheckpointIdx === 0 && frameIdx < 90) {
      lapFraction = 0.999;
    }
    racer.totalProgress = racer.completedLaps + lapFraction;
  }

  racer.prevFrameIdx = frameIdx;
  return result;
}

export function computeStandings(
  racers: readonly RacerProgressState[]
): RaceStandingEntry[] {
  const sorted = [...racers].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishTimeMs ?? Infinity) - (b.finishTimeMs ?? Infinity);
    }
    if (a.finished !== b.finished) {
      return a.finished ? -1 : 1;
    }
    return b.totalProgress - a.totalProgress;
  });

  return sorted.map((r, idx) => ({
    id: r.id,
    name: r.name,
    isPlayer: r.isPlayer,
    color: r.color,
    position: idx + 1,
    completedLaps: r.completedLaps,
    totalProgress: r.totalProgress,
    finished: r.finished,
    finishTimeMs: r.finishTimeMs,
    bestLapMs: r.bestLapMs,
  }));
}

export function detectWrongWay(
  carForwardX: number,
  carForwardZ: number,
  trackTangentX: number,
  trackTangentZ: number,
  forwardSpeedMs: number
): boolean {
  if (forwardSpeedMs < 2.4) return false;
  const dot = carForwardX * trackTangentX + carForwardZ * trackTangentZ;
  return dot < -0.35;
}

