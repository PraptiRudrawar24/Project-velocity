export type RaceMode = 'quick_race' | 'time_trial' | 'circuit_race';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type RacePhase =
  | 'menu'
  | 'countdown'
  | 'racing'
  | 'finished';

export interface RaceConfig {
  mode: RaceMode;
  difficulty: DifficultyLevel;
  opponentCount: number; // 0 in time_trial, 3..5 in races
  totalLaps: number;
}

export interface RacerProgressState {
  id: string;
  name: string;
  isPlayer: boolean;
  color: string;
  lap: number; // 1-based active lap
  completedLaps: number;
  nextCheckpointIdx: number; // 1..N-1, then 0 to complete lap
  lastValidCheckpointIdx: number;
  hasCrossedStartOnLap1: boolean;
  prevFrameIdx: number;
  totalProgress: number;
  finished: boolean;
  finishTimeMs: number | null;
  bestLapMs: number | null;
  currentLapStartMs: number;
}

export interface RaceStandingEntry {
  id: string;
  name: string;
  isPlayer: boolean;
  color: string;
  position: number;
  completedLaps: number;
  totalProgress: number;
  finished: boolean;
  finishTimeMs: number | null;
  bestLapMs: number | null;
}

export interface RaceResultSummary {
  mode: RaceMode;
  difficulty: DifficultyLevel;
  finishingPosition: number;
  totalRacers: number;
  totalRaceTimeMs: number;
  bestLapMs: number | null;
  completedLaps: number;
  totalLaps: number;
  isNewPersonalBest: boolean;
  creditsEarned?: number;
  standings: RaceStandingEntry[];
}

