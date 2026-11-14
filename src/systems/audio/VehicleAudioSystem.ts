import type { GearValue } from '../../game/core/types';

export interface VehicleAudioFrame {
  rpm: number;
  maxRpm: number;
  throttle: number;
  brake: number;
  speedMs: number;
  isBraking: boolean;
  isDrifting: boolean;
  driftIntensity: number;
  gear: GearValue;
}

export interface VehicleAudioHook {
  unlockFromGesture: () => void;
  updateTelemetry: (frame: VehicleAudioFrame) => void;
  triggerImpact: (intensity: number) => void;
  setPaused: (paused: boolean) => void;
  setMuted: (muted: boolean) => void;
  isReady: () => boolean;
  dispose: () => void;
}

export class ProceduralVehicleAudioEngine implements VehicleAudioHook {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private engineOscPrimary: OscillatorNode | null = null;
  private engineOscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private tireGain: GainNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;

  private brakeGain: GainNode | null = null;
  private brakeFilter: BiquadFilterNode | null = null;

  private isPaused = false;
  private isMuted = false;
  private disposed = false;

  public isReady(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  public unlockFromGesture(): void {
    if (this.disposed || typeof window === 'undefined') return;
    if (!this.ctx) {
      this.initializeGraph();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // Ignore browser autoplay rejection; next gesture will retry
      });
    }
  }

  private initializeGraph(): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.isMuted || this.isPaused ? 0 : 0.24;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Engine harmonic synth (dual oscillators -> lowpass filter -> gain)
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 340;
      engineFilter.Q.value = 1.8;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 55;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 110;

      osc1.connect(engineFilter);
      osc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);

      osc1.start();
      osc2.start();

      this.engineOscPrimary = osc1;
      this.engineOscSub = osc2;
      this.engineFilter = engineFilter;
      this.engineGain = engineGain;

      // Shared looping noise buffer for tire skid & brake friction
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      // Tire skid/drift channel
      const tireSrc = ctx.createBufferSource();
      tireSrc.buffer = noiseBuffer;
      tireSrc.loop = true;

      const tireFilter = ctx.createBiquadFilter();
      tireFilter.type = 'bandpass';
      tireFilter.frequency.value = 1150;
      tireFilter.Q.value = 5.5;

      const tireGain = ctx.createGain();
      tireGain.gain.value = 0;

      tireSrc.connect(tireFilter);
      tireFilter.connect(tireGain);
      tireGain.connect(master);
      tireSrc.start();

      this.tireFilter = tireFilter;
      this.tireGain = tireGain;

      // Hydraulic brake friction hiss channel
      const brakeSrc = ctx.createBufferSource();
      brakeSrc.buffer = noiseBuffer;
      brakeSrc.loop = true;

      const brakeFilter = ctx.createBiquadFilter();
      brakeFilter.type = 'bandpass';
      brakeFilter.frequency.value = 460;
      brakeFilter.Q.value = 2.0;

      const brakeGain = ctx.createGain();
      brakeGain.gain.value = 0;

      brakeSrc.connect(brakeFilter);
      brakeFilter.connect(brakeGain);
      brakeGain.connect(master);
      brakeSrc.start();

      this.brakeFilter = brakeFilter;
      this.brakeGain = brakeGain;
    } catch {
      // Fail gracefully without throwing if Web Audio is unavailable
      this.ctx = null;
    }
  }

  public updateTelemetry(frame: VehicleAudioFrame): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.isPaused || this.isMuted) return;

    const now = this.ctx.currentTime;
    const rpmRatio = Math.max(0, Math.min(1, frame.rpm / frame.maxRpm));

    // Engine pitch & intake resonance
    if (this.engineOscPrimary && this.engineOscSub && this.engineFilter && this.engineGain) {
      const baseHz = 46 + rpmRatio * 155;
      this.engineOscPrimary.frequency.setTargetAtTime(baseHz, now, 0.04);
      this.engineOscSub.frequency.setTargetAtTime(baseHz * 2.01, now, 0.04);
      this.engineFilter.frequency.setTargetAtTime(
        260 + rpmRatio * 1400 + frame.throttle * 650,
        now,
        0.05
      );
      this.engineGain.gain.setTargetAtTime(
        0.18 + frame.throttle * 0.22 + rpmRatio * 0.14,
        now,
        0.05
      );
    }

    // Tire skid sound proportional to drift intensity & speed
    if (this.tireGain && this.tireFilter) {
      const speedNorm = Math.min(1, frame.speedMs / 25);
      const targetTireVol = frame.isDrifting
        ? Math.min(0.45, frame.driftIntensity * speedNorm * 0.48)
        : 0;
      this.tireFilter.frequency.setTargetAtTime(
        950 + frame.driftIntensity * 520,
        now,
        0.04
      );
      this.tireGain.gain.setTargetAtTime(targetTireVol, now, 0.05);
    }

    // Brake friction sound when braking at speed
    if (this.brakeGain && this.brakeFilter) {
      const speedNorm = Math.min(1, frame.speedMs / 30);
      const targetBrakeVol =
        frame.isBraking && frame.speedMs > 1.5
          ? frame.brake * speedNorm * 0.22
          : 0;
      this.brakeFilter.frequency.setTargetAtTime(
        380 + speedNorm * 320,
        now,
        0.05
      );
      this.brakeGain.gain.setTargetAtTime(targetBrakeVol, now, 0.05);
    }
  }

  public triggerImpact(intensity: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.isPaused || this.isMuted || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.18);

    const amp = Math.max(0.12, Math.min(0.65, intensity * 0.6));
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    this.syncMasterGain();
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.syncMasterGain();
  }

  private syncMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.isPaused || this.isMuted ? 0 : 0.24;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
  }

  public dispose(): void {
    this.disposed = true;
    try {
      this.engineOscPrimary?.stop();
      this.engineOscSub?.stop();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
  }
}

