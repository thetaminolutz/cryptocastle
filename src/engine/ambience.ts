// Ambience beds that follow the world: wind, rain, rivers and lakes, birds by day,
// crickets by night, dripping caves, a crackling fire, the murmur of a crowd.
import { audio } from './audio';

export interface AmbState { wind: number; rain: number; water: number; birds: number; crickets: number; cave: number; fire: number; crowd: number; underwater: boolean; }

export class Ambience {
  private beds: Record<string, { g: GainNode; f?: BiquadFilterNode }> = {};
  private chirpT = 0; private cricketT = 0; private dripT = 0; private crackleT = 0;

  constructor() {
    audio.onReady(() => {
      const ctx = audio.ctx!;
      const bed = (name: string, brown: boolean, type: BiquadFilterType, freq: number, q = 0.7) => {
        const src = audio.noiseSource(brown)!; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(audio.amb!); src.start();
        this.beds[name] = { g, f };
      };
      bed('wind', true, 'bandpass', 500, 0.6);
      bed('rain', false, 'highpass', 2500);
      bed('water', false, 'bandpass', 900, 0.5);
      bed('crowd', true, 'bandpass', 700, 1.2);
      bed('under', true, 'lowpass', 300);
    });
  }

  update(dt: number, s: AmbState) {
    const ctx = audio.ctx; if (!ctx || ctx.state !== 'running' || !this.beds.wind) return;
    const t = ctx.currentTime;
    const set = (k: string, v: number) => this.beds[k].g.gain.setTargetAtTime(v, t, 0.6);
    const u = s.underwater ? 0.15 : 1;
    set('wind', (0.05 + s.wind * 0.35) * u * (1 - s.cave * 0.8));
    this.beds.wind.f!.frequency.setTargetAtTime(380 + Math.sin(t * 0.3) * 160 + s.wind * 300, t, 1.5);
    set('rain', s.rain * 0.3 * u * (1 - s.cave));
    set('water', s.water * 0.25 * u);
    set('crowd', s.crowd * 0.18 * u);
    set('under', s.underwater ? 0.5 : 0);
    // birdsong by day in the open
    this.chirpT -= dt;
    if (s.birds > 0.1 && !s.underwater && this.chirpT <= 0) {
      this.chirpT = 1.5 + Math.random() * 5 / s.birds;
      const base = 2200 + Math.random() * 2000, n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.chirp(base * (0.9 + Math.random() * 0.25), t + i * 0.11, 0.06 + Math.random() * 0.05);
    }
    // crickets at night
    this.cricketT -= dt;
    if (s.crickets > 0.1 && !s.underwater && this.cricketT <= 0) {
      this.cricketT = 0.6 + Math.random() * 1.2;
      for (let i = 0; i < 3; i++) this.chirp(4300 + Math.random() * 300, t + i * 0.05, 0.03, 0.04 * s.crickets, 'square');
    }
    // caves drip
    this.dripT -= dt;
    if (s.cave > 0.3 && this.dripT <= 0) { this.dripT = 0.8 + Math.random() * 3; this.chirp(1200 + Math.random() * 900, t, 0.12, 0.08, 'sine', 400); }
    // fires crackle
    this.crackleT -= dt;
    if (s.fire > 0.1 && this.crackleT <= 0) { this.crackleT = 0.05 + Math.random() * 0.3; this.pop(t, 0.1 * s.fire); }
  }

  private chirp(f: number, at: number, len: number, vol = 0.05, type: OscillatorType = 'sine', to?: number) {
    const ctx = audio.ctx!; const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(to ?? f * 1.25, at + len);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(audio.amb!); o.start(at); o.stop(at + len + 0.02);
  }
  private pop(at: number, vol: number) {
    const ctx = audio.ctx!; const src = audio.noiseSource(false)!; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 2500; f.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
    src.connect(f).connect(g).connect(audio.amb!); src.start(at); src.stop(at + 0.05);
  }
}
