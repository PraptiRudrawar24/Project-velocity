import { useEffect, useRef, useState } from 'react';
import { sharedInputManager } from '../../game/input/InputManager';
import { useGameStore, useTelemetryStore } from '../../state/gameStore';
import { SpeedometerGauge } from './SpeedometerGauge';

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

export function RacingHUD() {
  const cameraMode = useGameStore((s) => s.cameraMode);
  const lapCount = useGameStore((s) => s.lapCount);
  const bestLapMs = useGameStore((s) => s.bestLapMs);
  const isPaused = useGameStore((s) => s.isPaused);
  const showControls = useGameStore((s) => s.showControls);
  const resetToastNonce = useGameStore((s) => s.resetToastNonce);
  const lastCollision = useGameStore((s) => s.lastCollision);

  const togglePause = useGameStore((s) => s.togglePause);
  const cycleCameraMode = useGameStore((s) => s.cycleCameraMode);
  const requestReset = useGameStore((s) => s.requestReset);
  const toggleControls = useGameStore((s) => s.toggleControls);

  const raceTimerRef = useRef<HTMLSpanElement>(null);
  const lapTimerRef = useRef<HTMLSpanElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  const keyWRef = useRef<HTMLSpanElement>(null);
  const keyARef = useRef<HTMLSpanElement>(null);
  const keySRef = useRef<HTMLSpanElement>(null);
  const keyDRef = useRef<HTMLSpanElement>(null);
  const keySpaceRef = useRef<HTMLSpanElement>(null);

  const [showResetToast, setShowResetToast] = useState(false);
  const [showImpactToast, setShowImpactToast] = useState(false);

  // Subscribe directly to telemetry timers & collision pulse (zero React re-renders)
  useEffect(() => {
    const syncTimers = (
      state: ReturnType<typeof useTelemetryStore.getState>
    ) => {
      if (raceTimerRef.current) {
        raceTimerRef.current.textContent = formatRaceTime(state.raceTimeMs);
      }
      if (lapTimerRef.current) {
        lapTimerRef.current.textContent = formatRaceTime(state.currentLapMs);
      }
      if (vignetteRef.current) {
        vignetteRef.current.style.opacity = String(
          Math.min(0.65, state.collisionPulse * 0.7)
        );
      }
    };

    syncTimers(useTelemetryStore.getState());
    return useTelemetryStore.subscribe(syncTimers);
  }, []);

  // Live active key indicator subscription
  useEffect(() => {
    return sharedInputManager.subscribe((input) => {
      if (keyWRef.current)
        keyWRef.current.dataset.active = String(input.accelerate);
      if (keySRef.current)
        keySRef.current.dataset.active = String(input.brakeReverse);
      if (keyARef.current)
        keyARef.current.dataset.active = String(input.steerLeft);
      if (keyDRef.current)
        keyDRef.current.dataset.active = String(input.steerRight);
      if (keySpaceRef.current)
        keySpaceRef.current.dataset.active = String(input.handbrake);
    });
  }, []);

  // Brief Reset Toast notification
  useEffect(() => {
    if (resetToastNonce === 0) return;
    setShowResetToast(true);
    const id = window.setTimeout(() => setShowResetToast(false), 1400);
    return () => window.clearTimeout(id);
  }, [resetToastNonce]);

  // Brief Collision Toast notification
  useEffect(() => {
    if (!lastCollision) return;
    setShowImpactToast(true);
    const id = window.setTimeout(() => setShowImpactToast(false), 1600);
    return () => window.clearTimeout(id);
  }, [lastCollision]);

  const preventFocusSteal = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
  };

  return (
    <div className="pv-hud-root">
      {/* Subtle Impact Pulse Vignette */}
      <div ref={vignetteRef} className="pv-collision-vignette" />

      {/* Top Bar */}
      <header className="pv-hud-top">
        {/* Top-Left Race Timer & Lap Pod */}
        <div className="pv-glass-panel pv-timer-pod">
          <div className="pv-brand-row">
            <span className="pv-brand-dot" />
            <span className="pv-brand-title">PROJECT VELOCITY</span>
            <span className="pv-circuit-tag">APEX GP</span>
          </div>

          <div className="pv-timer-grid">
            <div className="pv-timer-cell">
              <span className="pv-label">RACE TIME</span>
              <span
                ref={raceTimerRef}
                className="pv-mono-val"
                data-testid="hud-race-timer"
              >
                00:00.00
              </span>
            </div>
            <div className="pv-timer-cell">
              <span className="pv-label">LAP {lapCount}</span>
              <span ref={lapTimerRef} className="pv-mono-val">
                00:00.00
              </span>
            </div>
            <div className="pv-timer-cell">
              <span className="pv-label">BEST LAP</span>
              <span className="pv-mono-val pv-best-lap">
                {bestLapMs !== null ? formatRaceTime(bestLapMs) : '--:--.--'}
              </span>
            </div>
          </div>
        </div>

        {/* Center-Top Subtle Toast Notifications */}
        <div className="pv-toast-slot">
          {showResetToast && (
            <div className="pv-toast" role="status">
              VEHICLE RESET TO TRACK
            </div>
          )}
          {!showResetToast && showImpactToast && lastCollision && (
            <div className="pv-toast pv-toast-impact" role="status">
              IMPACT: {lastCollision.label.toUpperCase()}
            </div>
          )}
        </div>

        {/* Top-Right Camera & Action Controls */}
        <div className="pv-hud-actions">
          <button
            type="button"
            className="pv-glass-btn"
            data-testid="btn-camera"
            onMouseDown={preventFocusSteal}
            onClick={(e) => {
              e.currentTarget.blur();
              cycleCameraMode();
            }}
            title="Switch Camera Perspective (C)"
          >
            <span className="pv-btn-meta">CAM</span>
            <span className="pv-btn-strong" data-testid="hud-camera-mode">
              {cameraMode}
            </span>
            <kbd className="pv-kbd">C</kbd>
          </button>

          <button
            type="button"
            className="pv-glass-btn"
            data-testid="btn-reset"
            onMouseDown={preventFocusSteal}
            onClick={(e) => {
              e.currentTarget.blur();
              requestReset();
            }}
            title="Reset Vehicle (R)"
          >
            <span className="pv-btn-strong">RESET</span>
            <kbd className="pv-kbd">R</kbd>
          </button>

          <button
            type="button"
            className="pv-glass-btn pv-glass-btn-accent"
            data-testid="btn-pause"
            onMouseDown={preventFocusSteal}
            onClick={(e) => {
              e.currentTarget.blur();
              togglePause();
            }}
            title="Pause / Menu (ESC)"
          >
            <span className="pv-btn-strong">
              {isPaused ? 'RESUME' : 'PAUSE'}
            </span>
            <kbd className="pv-kbd">ESC</kbd>
          </button>
        </div>
      </header>

      {/* Bottom Bar */}
      <footer className="pv-hud-bottom">
        {/* Bottom-Left Controls Legend */}
        <div className="pv-controls-wrapper">
          {showControls ? (
            <div className="pv-glass-panel pv-controls-panel">
              <div className="pv-controls-header">
                <span className="pv-label">CONTROLS</span>
                <button
                  type="button"
                  className="pv-mini-toggle"
                  onMouseDown={preventFocusSteal}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    toggleControls();
                  }}
                >
                  HIDE [H]
                </button>
              </div>
              <div className="pv-controls-list">
                <div className="pv-ctrl-item">
                  <span ref={keyWRef} className="pv-keycap" data-active="false">
                    W
                  </span>
                  <span>Accelerate</span>
                </div>
                <div className="pv-ctrl-item">
                  <span ref={keySRef} className="pv-keycap" data-active="false">
                    S
                  </span>
                  <span>Brake / Reverse</span>
                </div>
                <div className="pv-ctrl-item">
                  <span className="pv-keycap-pair">
                    <span
                      ref={keyARef}
                      className="pv-keycap"
                      data-active="false"
                    >
                      A
                    </span>
                    <span
                      ref={keyDRef}
                      className="pv-keycap"
                      data-active="false"
                    >
                      D
                    </span>
                  </span>
                  <span>Steer</span>
                </div>
                <div className="pv-ctrl-item">
                  <span
                    ref={keySpaceRef}
                    className="pv-keycap pv-keycap-wide"
                    data-active="false"
                  >
                    SPACE
                  </span>
                  <span>Handbrake / Drift</span>
                </div>
                <div className="pv-ctrl-item">
                  <span className="pv-keycap">C</span>
                  <span>Camera</span>
                </div>
                <div className="pv-ctrl-item">
                  <span className="pv-keycap">R</span>
                  <span>Reset</span>
                </div>
                <div className="pv-ctrl-item">
                  <span className="pv-keycap">ESC</span>
                  <span>Pause</span>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="pv-glass-btn"
              onMouseDown={preventFocusSteal}
              onClick={(e) => {
                e.currentTarget.blur();
                toggleControls();
              }}
            >
              <span className="pv-btn-strong">CONTROLS</span>
              <kbd className="pv-kbd">H</kbd>
            </button>
          )}
        </div>

        {/* Bottom-Right Precision Speed & RPM Pod */}
        <SpeedometerGauge />
      </footer>
    </div>
  );
}
