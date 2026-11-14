import { getVehicleSpec } from '../../game/vehicles/CarConfigs';
import { useGameStore } from '../../state/gameStore';

export function PauseOverlay() {
  const appScreen = useGameStore((s) => s.appScreen);
  const selectedVehicleId = useGameStore((s) => s.selectedVehicleId);
  const isPaused = useGameStore((s) => s.isPaused);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const lapCount = useGameStore((s) => s.lapCount);
  const totalLaps = useGameStore((s) => s.totalLaps);
  const playerPosition = useGameStore((s) => s.playerPosition);
  const totalRacers = useGameStore((s) => s.totalRacers);
  const raceMode = useGameStore((s) => s.raceConfig.mode);
  const collisionCount = useGameStore((s) => s.collisionCount);

  const setPaused = useGameStore((s) => s.setPaused);
  const requestReset = useGameStore((s) => s.requestReset);
  const restartSession = useGameStore((s) => s.restartSession);
  const returnToMenu = useGameStore((s) => s.returnToMenu);
  const cycleCameraMode = useGameStore((s) => s.cycleCameraMode);

  if (appScreen !== 'race' || !isPaused) return null;

  const spec = getVehicleSpec(selectedVehicleId);

  return (
    <div
      className="pv-pause-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Simulation Paused"
      data-testid="pause-overlay"
    >
      <div className="pv-pause-card">
        <div className="pv-pause-header">
          <div>
            <div className="pv-pause-eyebrow">SIMULATION PAUSED</div>
            <h2 className="pv-pause-title">PROJECT VELOCITY</h2>
          </div>
          <span className="pv-pause-chip">{spec.name}</span>
        </div>

        <div className="pv-pause-stats">
          <div className="pv-stat-box">
            <span className="pv-label">POSITION</span>
            <span className="pv-stat-val">
              {raceMode === 'time_trial' ? 'SOLO' : `${playerPosition}/${totalRacers}`}
            </span>
          </div>
          <div className="pv-stat-box">
            <span className="pv-label">LAP</span>
            <span className="pv-stat-val">
              {lapCount}/{totalLaps}
            </span>
          </div>
          <div className="pv-stat-box">
            <span className="pv-label">IMPACTS</span>
            <span className="pv-stat-val">{collisionCount}</span>
          </div>
        </div>

        <div className="pv-pause-actions">
          <button
            type="button"
            className="pv-btn pv-btn-primary"
            data-testid="btn-resume"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              setPaused(false);
            }}
          >
            Resume Driving <span className="pv-btn-key">ESC</span>
          </button>

          <button
            type="button"
            className="pv-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              requestReset();
            }}
          >
            Reset Vehicle <span className="pv-btn-key">R</span>
          </button>

          <button
            type="button"
            className="pv-btn"
            data-testid="btn-restart"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              restartSession();
            }}
          >
            Restart Session
          </button>

          <button
            type="button"
            className="pv-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              cycleCameraMode();
            }}
          >
            Switch Camera ({cameraMode}) <span className="pv-btn-key">C</span>
          </button>

          <button
            type="button"
            className="pv-btn"
            data-testid="btn-pause-menu"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              returnToMenu();
            }}
          >
            Main Menu
          </button>
        </div>

        <div className="pv-pause-bindings">
          <span><b>W / S</b> Throttle &amp; Brake/Reverse</span>
          <span><b>A / D</b> Steer</span>
          <span><b>SPACE</b> Handbrake Drift</span>
          <span><b>C</b> Camera · <b>R</b> Reset · <b>ESC</b> Pause</span>
        </div>
      </div>
    </div>
  );
}

