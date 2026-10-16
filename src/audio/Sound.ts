import type { WeaponDef, WeaponId } from "../game/Weapon";

/**
 * Synthesised sound effects (Web Audio, no files).
 *
 * Shots are layered: a filtered noise "crack", a pitched-down "thump", and a
 * send into a short generated room reverb so the indoor range sounds enclosed.
 * One shared noise buffer is reused for every sound, so rapid automatic fire
 * allocates nothing. All output goes through a master gain and a compressor.
 */

type Ctx = AudioContext;

interface ShotVoice {
  crackFreq: number;
  crackQ: number;
  crackGain: number;
  crackDecay: number;
  thumpFrom: number;
  thumpTo: number;
  thumpGain: number;
  thumpDecay: number;
  tailGain: number;
  tailDecay: number;
}

const VOICES: Record<WeaponId, ShotVoice> = {
  nine: { crackFreq: 1500, crackQ: 0.9, crackGain: 0.5, crackDecay: 0.07, thumpFrom: 150, thumpTo: 55, thumpGain: 0.5, thumpDecay: 0.1, tailGain: 0.25, tailDecay: 0.22 },
  compact: { crackFreq: 1900, crackQ: 1.0, crackGain: 0.42, crackDecay: 0.055, thumpFrom: 180, thumpTo: 70, thumpGain: 0.38, thumpDecay: 0.08, tailGain: 0.2, tailDecay: 0.18 },
  magnum: { crackFreq: 950, crackQ: 0.7, crackGain: 0.65, crackDecay: 0.12, thumpFrom: 95, thumpTo: 38, thumpGain: 0.8, thumpDecay: 0.2, tailGain: 0.4, tailDecay: 0.4 },
  ak47: { crackFreq: 1250, crackQ: 0.8, crackGain: 0.6, crackDecay: 0.09, thumpFrom: 110, thumpTo: 42, thumpGain: 0.7, thumpDecay: 0.14, tailGain: 0.34, tailDecay: 0.32 },
  m416: { crackFreq: 2100, crackQ: 1.1, crackGain: 0.55, crackDecay: 0.07, thumpFrom: 135, thumpTo: 50, thumpGain: 0.55, thumpDecay: 0.11, tailGain: 0.3, tailDecay: 0.26 },
};

export class Sound {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbSend: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.8;
  private scheduled: AudioScheduledSourceNode[] = [];

  /** Must be called from a user gesture (required by iOS / Chrome autoplay rules). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.build(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
  }

  /** Suspends audio while the page is hidden. */
  setSuspended(suspended: boolean): void {
    if (!this.ctx) return;
    if (suspended) void this.ctx.suspend().catch(() => undefined);
    else void this.ctx.resume().catch(() => undefined);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  private build(ctx: Ctx): void {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // 1.5 s of white noise shared by every sound.
    const len = Math.floor(ctx.sampleRate * 1.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Small concrete room impulse response.
    const irLen = Math.floor(ctx.sampleRate * 0.9);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        const t = i / irLen;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 400 ? i / 400 : 1);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.3;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
  }

  private out(): { ctx: Ctx; master: GainNode } | null {
    if (!this.ctx || !this.master || this.ctx.state !== "running") return null;
    return { ctx: this.ctx, master: this.master };
  }

  /** Filtered noise burst. */
  private burst(
    ctx: Ctx,
    dest: AudioNode,
    t: number,
    type: BiquadFilterType,
    freq: number,
    q: number,
    gain: number,
    decay: number,
    track = false,
  ): void {
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.9, decay + 0.05);
    if (track) this.scheduled.push(src);
  }

  private tone(
    ctx: Ctx,
    dest: AudioNode,
    t: number,
    type: OscillatorType,
    from: number,
    to: number,
    gain: number,
    decay: number,
    track = false,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + decay + 0.05);
    if (track) this.scheduled.push(osc);
  }

  fire(id: WeaponId): void {
    const o = this.out();
    if (!o) return;
    const { ctx, master } = o;
    const v = VOICES[id];
    const t = ctx.currentTime;
    const jitter = 0.94 + Math.random() * 0.12;
    this.burst(ctx, master, t, "bandpass", v.crackFreq * jitter, v.crackQ, v.crackGain, v.crackDecay);
    this.burst(ctx, master, t, "highpass", 4000, 0.7, v.crackGain * 0.35, 0.03);
    this.tone(ctx, master, t, "triangle", v.thumpFrom * jitter, v.thumpTo, v.thumpGain, v.thumpDecay);
    if (this.reverbSend) {
      this.burst(ctx, this.reverbSend, t, "lowpass", 1800, 0.5, v.tailGain, v.tailDecay);
      this.tone(ctx, this.reverbSend, t, "sine", v.thumpFrom * 0.8, v.thumpTo, v.thumpGain * 0.4, v.thumpDecay);
    }
    // Mechanical action noise.
    this.burst(ctx, master, t + 0.03, "bandpass", 3200, 3, 0.05, 0.03);
  }

  dry(): void {
    const o = this.out();
    if (!o) return;
    this.burst(o.ctx, o.master, o.ctx.currentTime, "bandpass", 2600, 4, 0.12, 0.04);
  }

  hit(): void {
    const o = this.out();
    if (!o) return;
    const t = o.ctx.currentTime;
    this.burst(o.ctx, o.master, t, "bandpass", 900, 1.2, 0.12, 0.06);
    this.tone(o.ctx, o.master, t, "triangle", 880, 330, 0.07, 0.08);
  }

  kill(): void {
    const o = this.out();
    if (!o) return;
    const t = o.ctx.currentTime;
    this.tone(o.ctx, o.master, t, "sine", 660, 660, 0.08, 0.09);
    this.tone(o.ctx, o.master, t + 0.07, "sine", 990, 990, 0.08, 0.12);
  }

  steel(): void {
    const o = this.out();
    if (!o) return;
    const t = o.ctx.currentTime;
    const f = 1150 + Math.random() * 200;
    this.tone(o.ctx, o.master, t, "sine", f, f * 0.99, 0.16, 0.7);
    this.tone(o.ctx, o.master, t, "sine", f * 2.76, f * 2.7, 0.06, 0.45);
    this.burst(o.ctx, o.master, t, "highpass", 3000, 0.7, 0.15, 0.03);
  }

  casing(strength: number): void {
    const o = this.out();
    if (!o) return;
    const t = o.ctx.currentTime;
    const f = 3800 + Math.random() * 2400;
    this.tone(o.ctx, o.master, t, "sine", f, f * 0.98, 0.025 * strength + 0.01, 0.09);
    this.tone(o.ctx, o.master, t + 0.012, "sine", f * 1.41, f * 1.4, 0.015 * strength + 0.006, 0.06);
  }

  /** Magazine out, magazine in and slide/bolt, timed over the reload. */
  reload(def: WeaponDef): void {
    const o = this.out();
    if (!o) return;
    this.cancelReload();
    const { ctx, master } = o;
    const t = ctx.currentTime;
    const T = def.reloadTime;
    const rifle = def.cls === "rifle";
    // Magazine release + drop.
    this.burst(ctx, master, t + T * 0.08, "bandpass", 2400, 5, 0.1, 0.04, true);
    this.burst(ctx, master, t + T * 0.12, "bandpass", 700, 2, 0.08, 0.08, true);
    // New magazine seated.
    this.burst(ctx, master, t + T * 0.62, "bandpass", 1300, 3, 0.16, 0.05, true);
    this.tone(ctx, master, t + T * 0.62, "triangle", 260, 140, 0.08, 0.05, true);
    // Charging handle / slide release.
    this.burst(ctx, master, t + T * (rifle ? 0.8 : 0.86), "bandpass", 1800, 3, 0.12, 0.05, true);
    this.burst(ctx, master, t + T * 0.93, "bandpass", 1400, 3, 0.18, 0.06, true);
  }

  /** Stops the remaining reload sounds (weapon switched mid-reload). */
  cancelReload(): void {
    for (const node of this.scheduled) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
    this.scheduled = [];
  }

  modeSwitch(): void {
    const o = this.out();
    if (!o) return;
    this.burst(o.ctx, o.master, o.ctx.currentTime, "bandpass", 3000, 6, 0.1, 0.03);
  }

  weaponSwitch(): void {
    const o = this.out();
    if (!o) return;
    const t = o.ctx.currentTime;
    this.burst(o.ctx, o.master, t, "bandpass", 900, 1.5, 0.06, 0.12);
    this.burst(o.ctx, o.master, t + 0.12, "bandpass", 2000, 4, 0.08, 0.04);
  }

  penalty(): void {
    const o = this.out();
    if (!o) return;
    const t = o.ctx.currentTime;
    this.tone(o.ctx, o.master, t, "square", 180, 170, 0.07, 0.18);
    this.tone(o.ctx, o.master, t + 0.2, "square", 140, 130, 0.07, 0.25);
  }

  bonus(): void {
    const o = this.out();
    if (!o) return;
    const t = o.ctx.currentTime;
    [784, 988, 1319].forEach((f, i) => this.tone(o.ctx, o.master, t + i * 0.06, "sine", f, f, 0.08, 0.14));
  }

  countdown(final: boolean): void {
    const o = this.out();
    if (!o) return;
    const f = final ? 1320 : 880;
    this.tone(o.ctx, o.master, o.ctx.currentTime, "sine", f, f, 0.1, final ? 0.35 : 0.14);
  }

  wave(): void {
    const o = this.out();
    if (!o) return;
    const t = o.ctx.currentTime;
    this.tone(o.ctx, o.master, t, "sine", 523, 523, 0.07, 0.15);
    this.tone(o.ctx, o.master, t + 0.12, "sine", 784, 784, 0.07, 0.25);
  }

  end(win: boolean): void {
    const o = this.out();
    if (!o) return;
    const t = o.ctx.currentTime;
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262];
    notes.forEach((f, i) => this.tone(o.ctx, o.master, t + i * 0.14, "triangle", f, f, 0.1, 0.3));
  }

  lowTime(): void {
    const o = this.out();
    if (!o) return;
    this.tone(o.ctx, o.master, o.ctx.currentTime, "sine", 1000, 1000, 0.04, 0.06);
  }
}
