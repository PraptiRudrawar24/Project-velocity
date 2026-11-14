import { useEffect, useRef } from 'react';
import { useTelemetryStore } from '../../state/gameStore';

const ARC_RADIUS = 84;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;
// 240-degree sweep arc (from 150deg to 390deg)
const SWEEP_FRACTION = 240 / 360;
const ARC_LENGTH = ARC_CIRCUMFERENCE * SWEEP_FRACTION;
const START_ANGLE_DEG = -120;
const TOTAL_SWEEP_DEG = 240;

export function SpeedometerGauge() {
  const speedRef = useRef<HTMLSpanElement>(null);
  const gearRef = useRef<HTMLSpanElement>(null);
  const rpmArcRef = useRef<SVGCircleElement>(null);
  const rpmNeedleRef = useRef<HTMLDivElement>(null);
  const rpmValueRef = useRef<HTMLSpanElement>(null);
  const driftBadgeRef = useRef<HTMLSpanElement>(null);
  const brakeBadgeRef = useRef<HTMLSpanElement>(null);
  const surfaceBadgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const applyTelemetry = (
      state: ReturnType<typeof useTelemetryStore.getState>
    ) => {
      if (speedRef.current) {
        speedRef.current.textContent = String(state.speedKmh);
      }
      if (gearRef.current) {
        gearRef.current.textContent = state.gear;
        gearRef.current.dataset.gear = state.gear;
      }

      const rpmNorm = Math.max(0, Math.min(1, state.rpm / state.maxRpm));

      if (rpmArcRef.current) {
        const dashOffset = ARC_LENGTH * (1 - rpmNorm);
        rpmArcRef.current.style.strokeDashoffset = String(dashOffset);
        if (state.rpm >= 6800) {
          rpmArcRef.current.style.stroke = '#ef4444';
        } else if (state.rpm >= 5400) {
          rpmArcRef.current.style.stroke = '#f59e0b';
        } else {
          rpmArcRef.current.style.stroke = '#38bdf8';
        }
      }

      if (rpmNeedleRef.current) {
        const angle = START_ANGLE_DEG + rpmNorm * TOTAL_SWEEP_DEG;
        rpmNeedleRef.current.style.transform = `translate(-50%, -100%) rotate(${angle.toFixed(1)}deg)`;
      }

      if (rpmValueRef.current) {
        rpmValueRef.current.textContent = String(
          Math.round(state.rpm / 100) * 100
        );
      }

      if (driftBadgeRef.current) {
        driftBadgeRef.current.dataset.active = state.isDrifting
          ? 'true'
          : 'false';
      }
      if (brakeBadgeRef.current) {
        brakeBadgeRef.current.dataset.active =
          state.isBraking || state.isHandbraking ? 'true' : 'false';
      }
      if (surfaceBadgeRef.current) {
        const off = state.surface === 'offtrack';
        surfaceBadgeRef.current.dataset.active = off ? 'true' : 'false';
      }
    };

    applyTelemetry(useTelemetryStore.getState());
    return useTelemetryStore.subscribe(applyTelemetry);
  }, []);

  const tickMarks = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="pv-tach-pod" aria-label="Vehicle Telemetry">
      <div className="pv-tach-gauge">
        <svg
          className="pv-tach-svg"
          viewBox="0 0 210 210"
          width="210"
          height="210"
        >
          {/* Background Track Arc */}
          <circle
            cx="105"
            cy="105"
            r={ARC_RADIUS}
            fill="none"
            stroke="rgba(148, 163, 184, 0.16)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${ARC_CIRCUMFERENCE}`}
            transform="rotate(150 105 105)"
          />
          {/* Redline Zone Highlight (6800..8000 RPM) */}
          <circle
            cx="105"
            cy="105"
            r={ARC_RADIUS}
            fill="none"
            stroke="rgba(239, 68, 68, 0.32)"
            strokeWidth="12"
            strokeLinecap="butt"
            strokeDasharray={`${ARC_LENGTH * 0.16} ${ARC_CIRCUMFERENCE}`}
            transform={`rotate(${150 + TOTAL_SWEEP_DEG * 0.84} 105 105)`}
          />
          {/* Dynamic RPM Sweep Arc */}
          <circle
            ref={rpmArcRef}
            cx="105"
            cy="105"
            r={ARC_RADIUS}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${ARC_CIRCUMFERENCE}`}
            strokeDashoffset={ARC_LENGTH}
            transform="rotate(150 105 105)"
          />

          {/* Numeric RPM Scale Ticks */}
          {tickMarks.map((tick) => {
            const frac = tick / 8;
            const deg = 150 + frac * TOTAL_SWEEP_DEG;
            const rad = (deg * Math.PI) / 180;
            const rOuter = 72;
            const rLabel = 58;
            const x1 = 105 + Math.cos(rad) * rOuter;
            const y1 = 105 + Math.sin(rad) * rOuter;
            const x2 = 105 + Math.cos(rad) * (rOuter - 6);
            const y2 = 105 + Math.sin(rad) * (rOuter - 6);
            const lx = 105 + Math.cos(rad) * rLabel;
            const ly = 105 + Math.sin(rad) * rLabel;
            const isRedline = tick >= 7;

            return (
              <g key={tick}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isRedline ? '#ef4444' : 'rgba(226,232,240,0.45)'}
                  strokeWidth={tick % 2 === 0 ? '2' : '1.2'}
                />
                <text
                  x={lx}
                  y={ly + 3.5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill={isRedline ? '#f87171' : 'rgba(203,213,225,0.72)'}
                >
                  {tick}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Precision Analog RPM Needle */}
        <div ref={rpmNeedleRef} className="pv-tach-needle" />
        <div className="pv-tach-center-cap" />

        {/* Digital Center Readout */}
        <div className="pv-tach-center">
          <div className="pv-speed-row">
            <span
              ref={speedRef}
              className="pv-speed-value"
              data-testid="hud-speed"
            >
              0
            </span>
            <span className="pv-speed-unit">KM/H</span>
          </div>
          <div className="pv-gear-rpm-row">
            <span
              ref={gearRef}
              className="pv-gear-badge"
              data-gear="N"
              data-testid="hud-gear"
            >
              N
            </span>
            <div className="pv-rpm-mini">
              <span ref={rpmValueRef} data-testid="hud-rpm">
                950
              </span>
              <span className="pv-rpm-label">RPM</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Driving State Micro-Pills */}
      <div className="pv-state-pills">
        <span
          ref={driftBadgeRef}
          className="pv-pill pv-pill-drift"
          data-active="false"
        >
          DRIFT
        </span>
        <span
          ref={brakeBadgeRef}
          className="pv-pill pv-pill-brake"
          data-active="false"
        >
          BRAKE
        </span>
        <span
          ref={surfaceBadgeRef}
          className="pv-pill pv-pill-surface"
          data-active="false"
        >
          OFF-TRACK
        </span>
      </div>
    </div>
  );
}

