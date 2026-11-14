import type { DifficultyLevel } from '../racing/RaceTypes';
import type { VehicleSpec } from '../core/types';
import { APEX_GT_SPEC } from '../vehicles/CarConfigs';

export interface AIDifficultyProfile {
  id: DifficultyLevel;
  label: string;
  description: string;
  topSpeedMs: number;
  throttleCap: number;
  cornerSpeedFactor: number;
  overtakeAggression: number;
  brakeMarginFactor: number;
}

export const DIFFICULTY_PROFILES: Record<DifficultyLevel, AIDifficultyProfile> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    description: 'Relaxed pace, early braking, conservative overtaking',
    topSpeedMs: 36, // ~130 km/h
    throttleCap: 0.72,
    cornerSpeedFactor: 0.76,
    overtakeAggression: 0.35,
    brakeMarginFactor: 1.25,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    description: 'Balanced racing line, moderate cornering and passes',
    topSpeedMs: 49, // ~176 km/h
    throttleCap: 0.88,
    cornerSpeedFactor: 0.94,
    overtakeAggression: 0.72,
    brakeMarginFactor: 1.0,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    description: 'High-speed apex attack and assertive overtaking',
    topSpeedMs: 63, // ~227 km/h
    throttleCap: 1.0,
    cornerSpeedFactor: 1.12,
    overtakeAggression: 1.0,
    brakeMarginFactor: 0.85,
  },
};

export interface AIOpponentDescriptor {
  id: string;
  name: string;
  bodyColor: string;
  accentColor: string;
  caliperColor: string;
  preferredLaneOffset: number;
  paceVariance: number;
}

export const AI_DRIVER_ROSTER: readonly AIOpponentDescriptor[] = [
  {
    id: 'ai-1',
    name: 'K. Sato',
    bodyColor: '#2563eb',
    accentColor: '#0f172a',
    caliperColor: '#38bdf8',
    preferredLaneOffset: -1.8,
    paceVariance: 1.02,
  },
  {
    id: 'ai-2',
    name: 'M. Rossi',
    bodyColor: '#059669',
    accentColor: '#0f172a',
    caliperColor: '#facc15',
    preferredLaneOffset: 1.8,
    paceVariance: 0.99,
  },
  {
    id: 'ai-3',
    name: 'L. Vance',
    bodyColor: '#d97706',
    accentColor: '#111827',
    caliperColor: '#ef4444',
    preferredLaneOffset: -0.6,
    paceVariance: 0.97,
  },
  {
    id: 'ai-4',
    name: 'A. Lindqvist',
    bodyColor: '#94a3b8',
    accentColor: '#1e293b',
    caliperColor: '#38bdf8',
    preferredLaneOffset: 0.8,
    paceVariance: 1.01,
  },
  {
    id: 'ai-5',
    name: 'R. Delgado',
    bodyColor: '#7c3aed',
    accentColor: '#111827',
    caliperColor: '#f59e0b',
    preferredLaneOffset: 0.0,
    paceVariance: 0.95,
  },
];

export function buildAIVehicleSpec(opponent: AIOpponentDescriptor): VehicleSpec {
  return {
    ...APEX_GT_SPEC,
    id: opponent.id,
    name: opponent.name,
    colors: {
      ...APEX_GT_SPEC.colors,
      body: opponent.bodyColor,
      accent: opponent.accentColor,
      caliper: opponent.caliperColor,
    },
  };
}

