import { formatRaceTime } from '../../game/racing/RaceLogic';
import { formatCredits } from '../../systems/progression/EconomySystem';
import { useGameStore } from '../../state/gameStore';

function formatOrdinal(n: number): string {
  if (n === 1) return '1ST';
  if (n === 2) return '2ND';
  if (n === 3) return '3RD';
  return `${n}TH`;
}

export function ResultsOverlay() {
  const appScreen = useGameStore((s) => s.appScreen);
  const racePhase = useGameStore((s) => s.racePhase);
  const raceResult = useGameStore((s) => s.raceResult);
  const credits = useGameStore((s) => s.credits);
  const restartSession = useGameStore((s) => s.restartSession);
  const returnToMenu = useGameStore((s) => s.returnToMenu);
  const openGarage = useGameStore((s) => s.openGarage);

  if (appScreen !== 'race' || racePhase !== 'finished' || !raceResult) return null;

  const isTimeTrial = raceResult.mode === 'time_trial';
  const creditsEarned = raceResult.creditsEarned ?? 0;

  return (
    <div
      className="pv-pause-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Race Results"
      data-testid="results-overlay"
    >
      <div className="pv-pause-card pv-results-card">
        <div className="pv-pause-header">
          <div>
            <div className="pv-pause-eyebrow">
              {isTimeTrial ? 'TIME TRIAL COMPLETE' : 'CHECKERED FLAG'}
            </div>
            <h2 className="pv-pause-title" data-testid="results-heading">
              {isTimeTrial
                ? 'SESSION RESULTS'
                : `${formatOrdinal(raceResult.finishingPosition)} PLACE FINISH`}
            </h2>
          </div>
          {raceResult.isNewPersonalBest && (
            <span className="pv-pb-badge">NEW PERSONAL BEST</span>
          )}
        </div>

        <div className="pv-results-metrics">
          <div className="pv-stat-box">
            <span className="pv-label">POSITION</span>
            <span className="pv-stat-val" data-testid="results-position">
              {isTimeTrial
                ? 'SOLO'
                : `${raceResult.finishingPosition} / ${raceResult.totalRacers}`}
            </span>
          </div>
          <div className="pv-stat-box">
            <span className="pv-label">TOTAL TIME</span>
            <span className="pv-stat-val" data-testid="results-total-time">
              {formatRaceTime(raceResult.totalRaceTimeMs)}
            </span>
          </div>
          <div className="pv-stat-box">
            <span className="pv-label">BEST LAP</span>
            <span className="pv-stat-val pv-best-lap" data-testid="results-best-lap">
              {raceResult.bestLapMs !== null
                ? formatRaceTime(raceResult.bestLapMs)
                : '--:--.--'}
            </span>
          </div>
          <div className="pv-stat-box">
            <span className="pv-label">LAPS</span>
            <span className="pv-stat-val" data-testid="results-laps">
              {raceResult.completedLaps} / {raceResult.totalLaps}
            </span>
          </div>
          <div className="pv-stat-box pv-stat-box-credits">
            <span className="pv-label">CREDITS EARNED</span>
            <span
              className="pv-stat-val pv-credits-text"
              data-testid="results-credits-earned"
            >
              +{formatCredits(creditsEarned)}
            </span>
            <span className="pv-credits-bal" data-testid="results-credits-balance">
              Bal: {formatCredits(credits)}
            </span>
          </div>
        </div>

        {/* Standings Table */}
        <div className="pv-standings-list" data-testid="results-standings">
          {raceResult.standings.map((entry) => (
            <div
              key={entry.id}
              className={`pv-standing-row ${entry.isPlayer ? 'is-player' : ''}`}
            >
              <span className="pv-standing-pos">P{entry.position}</span>
              <span
                className="pv-standing-swatch"
                style={{ backgroundColor: entry.color }}
              />
              <span className="pv-standing-name">{entry.name}</span>
              <span className="pv-standing-time">
                {entry.finished && entry.finishTimeMs !== null
                  ? formatRaceTime(entry.finishTimeMs)
                  : `LAP ${Math.min(raceResult.totalLaps, entry.completedLaps + 1)}`}
              </span>
            </div>
          ))}
        </div>

        <div className="pv-results-actions pv-results-actions-3">
          <button
            type="button"
            className="pv-btn pv-btn-primary"
            data-testid="btn-results-restart"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              restartSession();
            }}
          >
            Restart Race
          </button>
          <button
            type="button"
            className="pv-btn"
            data-testid="btn-results-garage"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              openGarage('home');
            }}
          >
            Garage
          </button>
          <button
            type="button"
            className="pv-btn"
            data-testid="btn-results-menu"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              returnToMenu();
            }}
          >
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

