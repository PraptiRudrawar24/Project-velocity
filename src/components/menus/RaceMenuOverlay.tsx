import { DIFFICULTY_PROFILES } from '../../game/ai/AIConfigs';
import { formatRaceTime } from '../../game/racing/RaceLogic';
import type { DifficultyLevel, RaceMode } from '../../game/racing/RaceTypes';
import { getVehicleSpec } from '../../game/vehicles/CarConfigs';
import { formatCredits } from '../../systems/progression/EconomySystem';
import { useGameStore } from '../../state/gameStore';

const MODE_OPTIONS: Array<{
  id: RaceMode;
  title: string;
  subtitle: string;
}> = [
  {
    id: 'quick_race',
    title: 'Quick Race',
    subtitle: 'Customizable grid & difficulty',
  },
  {
    id: 'time_trial',
    title: 'Time Trial',
    subtitle: 'Solo hot-lap & personal best',
  },
  {
    id: 'circuit_race',
    title: 'Circuit Race',
    subtitle: 'Multi-lap championship standings',
  },
];

const DIFFICULTIES: readonly DifficultyLevel[] = ['easy', 'medium', 'hard'];
const OPPONENT_COUNTS = [3, 4, 5] as const;
const LAP_OPTIONS = [1, 2, 3, 5] as const;

export function RaceMenuOverlay() {
  const appScreen = useGameStore((s) => s.appScreen);
  const racePhase = useGameStore((s) => s.racePhase);
  const raceConfig = useGameStore((s) => s.raceConfig);
  const personalBestMs = useGameStore((s) => s.personalBestMs);
  const credits = useGameStore((s) => s.credits);
  const selectedVehicleId = useGameStore((s) => s.selectedVehicleId);

  const setRaceMode = useGameStore((s) => s.setRaceMode);
  const setDifficulty = useGameStore((s) => s.setDifficulty);
  const setRaceConfig = useGameStore((s) => s.setRaceConfig);
  const startRace = useGameStore((s) => s.startRace);
  const openGarage = useGameStore((s) => s.openGarage);

  if (appScreen !== 'race' || racePhase !== 'menu') return null;

  const isTimeTrial = raceConfig.mode === 'time_trial';
  const activeDiff = DIFFICULTY_PROFILES[raceConfig.difficulty];
  const selectedCar = getVehicleSpec(selectedVehicleId);

  return (
    <div
      className="pv-menu-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Race Setup"
      data-testid="race-menu"
    >
      <div className="pv-menu-card">
        <div className="pv-menu-header">
          <div>
            <div className="pv-pause-eyebrow">APEX CIRCUIT // GP PROVING GROUNDS</div>
            <h1 className="pv-menu-title">PROJECT VELOCITY</h1>
          </div>
          <div className="pv-menu-header-right">
            <div className="pv-pb-chip" data-testid="menu-credits">
              <span className="pv-label">CREDITS</span>
              <span className="pv-mono-val pv-credits-text">
                {formatCredits(credits)}
              </span>
            </div>
            {personalBestMs !== null && (
              <div className="pv-pb-chip">
                <span className="pv-label">PERSONAL BEST</span>
                <span className="pv-mono-val pv-best-lap">
                  {formatRaceTime(personalBestMs)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Active Vehicle & Garage Bar */}
        <div className="pv-menu-garage-bar">
          <div>
            <span className="pv-label">ACTIVE VEHICLE</span>
            <div className="pv-menu-car-name" data-testid="menu-selected-vehicle">
              {selectedCar.name}
            </div>
          </div>
          <button
            type="button"
            className="pv-btn pv-garage-open-btn"
            data-testid="btn-open-garage"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              openGarage('home');
            }}
          >
            OPEN GARAGE &amp; TUNING →
          </button>
        </div>

        {/* Mode Selection */}
        <div className="pv-menu-section">
          <span className="pv-label">RACE MODE</span>
          <div className="pv-mode-grid">
            {MODE_OPTIONS.map((opt) => {
              const selected = raceConfig.mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`pv-mode-card ${selected ? 'selected' : ''}`}
                  data-testid={`mode-${opt.id}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setRaceMode(opt.id);
                  }}
                >
                  <span className="pv-mode-title">{opt.title}</span>
                  <span className="pv-mode-sub">{opt.subtitle}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Difficulty & Grid Configuration */}
        <div className="pv-config-grid">
          {!isTimeTrial && (
            <div className="pv-menu-section">
              <span className="pv-label">AI DIFFICULTY</span>
              <div className="pv-seg-row">
                {DIFFICULTIES.map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    className={`pv-seg-btn ${
                      raceConfig.difficulty === diff ? 'selected' : ''
                    }`}
                    data-testid={`diff-${diff}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setDifficulty(diff);
                    }}
                  >
                    {DIFFICULTY_PROFILES[diff].label}
                  </button>
                ))}
              </div>
              <span className="pv-config-hint">{activeDiff.description}</span>
            </div>
          )}

          {!isTimeTrial && (
            <div className="pv-menu-section">
              <span className="pv-label">OPPONENTS</span>
              <div className="pv-seg-row">
                {OPPONENT_COUNTS.map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    className={`pv-seg-btn ${
                      raceConfig.opponentCount === cnt ? 'selected' : ''
                    }`}
                    data-testid={`opponents-${cnt}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setRaceConfig({ opponentCount: cnt });
                    }}
                  >
                    {cnt} AI
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pv-menu-section">
            <span className="pv-label">RACE LAPS</span>
            <div className="pv-seg-row">
              {LAP_OPTIONS.map((laps) => (
                <button
                  key={laps}
                  type="button"
                  className={`pv-seg-btn ${
                    raceConfig.totalLaps === laps ? 'selected' : ''
                  }`}
                  data-testid={`laps-${laps}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setRaceConfig({ totalLaps: laps });
                  }}
                >
                  {laps === 1 ? '1 LAP' : `${laps} LAPS`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="pv-btn pv-btn-primary pv-start-btn"
          data-testid="btn-start-race"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.currentTarget.blur();
            startRace();
          }}
        >
          <span>
            START {isTimeTrial ? 'TIME TRIAL' : 'RACE'} (
            {isTimeTrial ? 'SOLO' : `${1 + raceConfig.opponentCount} CARS`}
            )
          </span>
          <span className="pv-btn-key">GO</span>
        </button>

        <div className="pv-pause-bindings">
          <span><b>W / S</b> Throttle &amp; Brake/Reverse</span>
          <span><b>A / D</b> Steer</span>
          <span><b>SPACE</b> Handbrake Drift</span>
          <span><b>C</b> Camera · <b>R</b> Reset · <b>M</b> Audio · <b>ESC</b> Pause</span>
        </div>
      </div>
    </div>
  );
}
