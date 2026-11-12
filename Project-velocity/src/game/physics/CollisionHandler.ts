import type { ColliderSurfaceTag, ColliderUserData, CollisionEventInfo } from '../core/types';

export interface RawCollisionContext {
  otherUserData?: unknown;
  relativeSpeedMs: number;
  nowMs?: number;
}

const OBSTACLE_SURFACES = new Set<ColliderSurfaceTag>([
  'guardrail',
  'tire_barrier',
  'pillar',
]);

export function parseColliderUserData(raw: unknown): ColliderUserData | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<ColliderUserData>;
  if (typeof candidate.surface !== 'string') return null;
  return {
    surface: candidate.surface as ColliderSurfaceTag,
    label: typeof candidate.label === 'string' ? candidate.label : undefined,
  };
}

export class CollisionHandler {
  private nextEventId = 1;
  private lastImpactTimestamp = -Infinity;
  private readonly cooldownMs: number;
  private readonly minImpactSpeedMs: number;

  constructor(options?: { cooldownMs?: number; minImpactSpeedMs?: number }) {
    this.cooldownMs = options?.cooldownMs ?? 200;
    this.minImpactSpeedMs = options?.minImpactSpeedMs ?? 2.2;
  }

  public reset(): void {
    this.lastImpactTimestamp = -Infinity;
  }

  public processCollision(ctx: RawCollisionContext): CollisionEventInfo | null {
    const parsed = parseColliderUserData(ctx.otherUserData);
    if (!parsed) return null;

    if (!OBSTACLE_SURFACES.has(parsed.surface)) {
      return null;
    }

    const speed = Math.abs(ctx.relativeSpeedMs);
    if (speed < this.minImpactSpeedMs) {
      return null;
    }

    const now = ctx.nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - this.lastImpactTimestamp < this.cooldownMs) {
      return null;
    }
    this.lastImpactTimestamp = now;

    // Normalize impact severity roughly across 2.2 m/s (8 km/h) .. 32 m/s (115 km/h)
    const intensity = Math.max(0.08, Math.min(1, (speed - 1.5) / 28));

    const label =
      parsed.label ??
      (parsed.surface === 'guardrail'
        ? 'Track Guardrail'
        : parsed.surface === 'tire_barrier'
          ? 'Tire Barrier'
          : 'Track Structure');

    return {
      id: this.nextEventId++,
      surface: parsed.surface,
      label,
      impactSpeedMs: speed,
      intensity,
      timestamp: now,
    };
  }
}

