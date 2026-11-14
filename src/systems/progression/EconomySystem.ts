import type { RaceResultSummary } from '../../game/racing/RaceTypes';

export const INITIAL_PLAYER_CREDITS = 2000;

export interface PurchaseValidationResult {
  ok: boolean;
  reason?: 'already_owned' | 'insufficient_funds' | 'invalid_price';
}

export function validatePurchase(
  currentCredits: number,
  price: number,
  alreadyOwned: boolean
): PurchaseValidationResult {
  if (alreadyOwned) {
    return { ok: false, reason: 'already_owned' };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, reason: 'invalid_price' };
  }
  if (currentCredits < price) {
    return { ok: false, reason: 'insufficient_funds' };
  }
  return { ok: true };
}

export function calculateRaceReward(summary: RaceResultSummary): number {
  const pbBonus = summary.isNewPersonalBest ? 300 : 0;

  if (summary.mode === 'time_trial') {
    const base = 400 + summary.completedLaps * 250;
    return Math.round(base + pbBonus);
  }

  const posPayout =
    summary.finishingPosition === 1
      ? 1500
      : summary.finishingPosition === 2
        ? 1000
        : summary.finishingPosition === 3
          ? 700
          : 450;

  const diffMult =
    summary.difficulty === 'hard'
      ? 1.25
      : summary.difficulty === 'easy'
        ? 0.85
        : 1.0;

  const lapBonus = Math.max(0, summary.completedLaps - 1) * 150;
  const modeBonus = summary.mode === 'circuit_race' ? 200 : 0;

  return Math.round((posPayout + lapBonus + modeBonus) * diffMult + pbBonus);
}

export function formatCredits(amount: number): string {
  return `${Math.max(0, Math.round(amount)).toLocaleString('en-US')} CR`;
}

