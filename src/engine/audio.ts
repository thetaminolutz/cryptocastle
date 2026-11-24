// All sound is synthesised with WebAudio — no files. iOS only lets audio start
// inside a user gesture, so unlock() is called from the first tap.
// Mixer: master ← music (with reverb), effects, ambience; each follows its slider.
import { settings } from './settings';

export type Surface = 'grass' | 'dirt' | 'stone' | 'wood' | 'snow' | 'sand' | 'water' | 'metal';

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  music: GainNode | null = null;
  sfx: GainNode | null = null;
  amb: GainNode | null = null;
  /** send for long tails (music, horns, the Herald) */
  reverb: ConvolverNode | null = null;
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private listeners: (() => void)[] = [];

  /** called once the context exists (music and ambience attach here) */
  onReady(fn: () => void) { if (this.ctx) fn(); else this.listeners.push(fn); }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.connect(ctx.destination);
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(this.master);
      this.music = ctx.createGain(); this.sfx = ctx.createGain(); this.amb = ctx.createGain();
      for (const b of [this.music, this.sfx, this.amb]) b.connect(comp);
      this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(3.2, 2.4);
      const wet = ctx.createGain(); wet.gain.value = 0.55; this.reverb.connect(wet).connect(comp);
      const apply = () => {
        const s = settings.values;
        this.master!.gain.value = s.masterVolume; this.music!.gain.value = s.musicVolume * 0.7; this.sfx!.gain.value = s.sfxVolume; this.amb!.gain.value = s.ambienceVolume * 0.8;
      };
      apply();
      settings.onChange((_s, k) => { if (k.endsWith('Volume')) apply(); });
      // noise sources, built once
      const n = ctx.sampleRate * 2;
      this.white = ctx.createBuffer(1, n, ctx.sampleRate); const w = this.white.getChannelData(0); for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
      this.brown = ctx.createBuffer(1, n, ctx.sampleRate); const br = this.brown.getChannelData(0); let v = 0; for (let i = 0; i < n; i++) { v = (v + (Math.random() * 2 - 1) * 0.02) / 1.02; br[i] = v * 3.5; }
      // one silent buffer – required by older iOS to fully unlock
      const b = ctx.createBuffer(1, 1, 22050); const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0);
      for (const l of this.listeners) l();
      this.listeners = [];
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume(); }

  private impulse(len: number, decay: number) {
    const ctx = this.ctx!, n = Math.floor(ctx.sampleRate * len), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }

  /** a looping noise source (for ambience beds) */
  noiseSource(brown = false): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    const s = this.ctx.createBufferSource(); s.buffer = brown ? this.brown : this.white; s.loop = true;
    s.loopStart = Math.random(); return s;
  }

  // ---------------------------------------------------------------- primitives
  private noise(len: number, freq: number, type: BiquadFilterType, gain: number, q = 1, sweep?: number, at = 0, bus: AudioNode | null = this.sfx, brown = false) {
    const ctx = this.ctx;
    if (!ctx || !bus || !this.white) return;
    const src = ctx.createBufferSource(); src.buffer = brown ? this.brown : this.white;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); const t = ctx.currentTime + at;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, len * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(bus); src.start(t, Math.random() * 1.5, len + 0.05);
  }
  private tone(freq: number, len: number, type: OscillatorType, gain: number, slide?: number, at = 0, bus: AudioNode | null = this.sfx, attack = 0.005) {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(bus); o.start(t); o.stop(t + len + 0.02);
  }

  // ---------------------------------------------------------------- combat
  whoosh() { this.noise(0.18, 900, 'bandpass', 0.25, 1.2, 2400); }
  impact(heavy = false) { this.noise(heavy ? 0.25 : 0.14, heavy ? 300 : 600, 'lowpass', heavy ? 0.9 : 0.6); this.tone(heavy ? 90 : 140, 0.12, 'sine', 0.5, 50); }
  /** steel on flesh / bone / armour */
  hit(kind: 'flesh' | 'bone' | 'metal' | 'stone' = 'flesh') {
    if (kind === 'metal') { this.tone(1200 + Math.random() * 300, 0.25, 'triangle', 0.25, 900); this.noise(0.12, 3000, 'highpass', 0.3); }
    else if (kind === 'bone') { this.noise(0.08, 1400, 'bandpass', 0.6, 3); this.tone(300, 0.06, 'square', 0.15, 200); }
    else if (kind === 'stone') { this.noise(0.15, 500, 'lowpass', 0.7); this.tone(160, 0.1, 'triangle', 0.3, 90); }
    else { this.noise(0.12, 450, 'lowpass', 0.7); this.tone(120, 0.1, 'sine', 0.45, 60); }
  }
  block() { this.tone(820, 0.18, 'triangle', 0.35, 600); this.noise(0.1, 2500, 'highpass', 0.25); }
  parry() { this.tone(1400, 0.35, 'triangle', 0.4, 1800); this.tone(2100, 0.25, 'sine', 0.2); }
  /** sharp warning sound when the player is hit */
  hurt() { this.tone(980, 0.16, 'square', 0.22, 420); this.noise(0.12, 400, 'lowpass', 0.5); }
  bow() { this.tone(180, 0.22, 'triangle', 0.35, 120); this.noise(0.08, 2600, 'bandpass', 0.25, 2); }
  crossbow() { this.noise(0.06, 1800, 'bandpass', 0.6, 2); this.tone(90, 0.12, 'square', 0.25, 60); }
  spell(kind: 'fire' | 'ice' | 'shadow' | 'holy' = 'fire') {
    if (kind === 'fire') { this.noise(0.5, 400, 'bandpass', 0.5, 0.8, 1800); this.tone(220, 0.4, 'sawtooth', 0.08, 440); }
    else if (kind === 'ice') { for (let i = 0; i < 4; i++) this.tone(1800 + i * 420, 0.25, 'sine', 0.1, undefined, i * 0.04); this.noise(0.3, 5000, 'highpass', 0.15); }
    else if (kind === 'holy') { for (const f of [523, 659, 784]) this.tone(f, 0.6, 'sine', 0.12); }
    else { this.tone(110, 0.6, 'sawtooth', 0.12, 55); this.noise(0.5, 300, 'lowpass', 0.4, 1, 120); }
  }
  explosion() { this.noise(0.9, 900, 'lowpass', 1, 1, 80, 0, this.sfx, true); this.tone(60, 0.5, 'sine', 0.6, 30); }
  slam() { this.noise(0.6, 200, 'lowpass', 1, 1, 60, 0, this.sfx, true); this.tone(48, 0.6, 'sine', 0.8, 28); }
  /** a monster announces itself: size 0..1, kind by shape */
  growl(size: number, kind: 'beast' | 'bug' | 'undead' | 'bird' | 'man' | 'spirit') {
    const s = Math.max(0.2, Math.min(1, size));
    if (kind === 'bug') { for (let i = 0; i < 6; i++) this.noise(0.05, 3500 + Math.random() * 2000, 'bandpass', 0.25, 6, undefined, i * 0.05); return; }
    if (kind === 'bird') { this.tone(1800 - s * 600, 0.35, 'sawtooth', 0.12, 2600); this.noise(0.3, 3000, 'bandpass', 0.2, 2); return; }
    if (kind === 'undead') { this.noise(0.8, 600, 'bandpass', 0.35, 4, 300); this.tone(90, 0.8, 'sawtooth', 0.06, 70); return; }
    if (kind === 'spirit') { this.tone(400, 1.0, 'sine', 0.12, 260); this.tone(404, 1.0, 'sine', 0.12, 262); return; }
    if (kind === 'man') { this.noise(0.35, 700 - s * 200, 'bandpass', 0.35, 3, 500); return; }
    this.noise(0.6 + s * 0.6, 260 - s * 140, 'lowpass', 0.7, 1, 120 - s * 60, 0, this.sfx, true); this.tone(80 - s * 30, 0.7, 'sawtooth', 0.1 + s * 0.1, 50 - s * 15);
  }
  death() { this.noise(0.4, 300, 'lowpass', 0.5, 1, 90); }

  // ---------------------------------------------------------------- world
  footstep(surface: Surface, heavy = false) {
    const v = heavy ? 1.3 : 1, j = 0.85 + Math.random() * 0.3;
    switch (surface) {
      case 'grass': this.noise(0.09, 1800 * j, 'bandpass', 0.12 * v, 0.8); break;
      case 'dirt': this.noise(0.08, 700 * j, 'lowpass', 0.2 * v); break;
      case 'stone': this.noise(0.05, 2400 * j, 'bandpass', 0.16 * v, 2); this.tone(220 * j, 0.04, 'triangle', 0.05 * v, 160); break;
      case 'wood': this.tone(160 * j, 0.07, 'triangle', 0.16 * v, 110); this.noise(0.05, 900, 'bandpass', 0.08 * v, 2); break;
      case 'snow': this.noise(0.14, 3200 * j, 'highpass', 0.1 * v); this.noise(0.12, 500, 'lowpass', 0.1 * v); break;
      case 'sand': this.noise(0.12, 4200 * j, 'highpass', 0.08 * v); break;
      case 'water': this.noise(0.18, 1200 * j, 'bandpass', 0.2 * v, 1.5, 500); break;
      case 'metal': this.tone(900 * j, 0.08, 'triangle', 0.08 * v, 700); break;
    }
  }
  splash(big = false) { this.noise(big ? 0.7 : 0.35, 1500, 'bandpass', big ? 0.6 : 0.35, 0.8, 400); }
  mine(ore = false) { this.tone(ore ? 1700 : 1100 + Math.random() * 200, 0.12, 'square', 0.12, 800); this.noise(0.1, 3000, 'highpass', 0.3); }
  chop() { this.noise(0.12, 700, 'bandpass', 0.6, 1.5); this.tone(180, 0.08, 'triangle', 0.25, 120); }
  dig() { this.noise(0.18, 500, 'lowpass', 0.5, 1, 200); }
  harvest() { this.noise(0.15, 3000, 'highpass', 0.15); }
  door(open = true) { this.tone(open ? 300 : 260, 0.5, 'sawtooth', 0.04, open ? 420 : 180); this.noise(0.4, 900, 'bandpass', 0.08, 8); if (!open) this.noise(0.1, 300, 'lowpass', 0.5, 1, undefined, 0.45); }
  coins(n = 3) { for (let i = 0; i < Math.min(6, n); i++) this.tone(2400 + Math.random() * 1600, 0.12, 'sine', 0.1, undefined, i * 0.05); }
  pickup() { this.tone(660, 0.08, 'sine', 0.12, 990); }
  click() { this.tone(1200, 0.03, 'square', 0.05); }
  craft() { for (let i = 0; i < 3; i++) this.tone(500 + i * 120, 0.08, 'triangle', 0.12, undefined, i * 0.09); }
  place() { this.noise(0.1, 400, 'lowpass', 0.4); this.tone(140, 0.08, 'triangle', 0.2); }
  eat() { for (let i = 0; i < 3; i++) this.noise(0.06, 900, 'bandpass', 0.2, 2, undefined, i * 0.12); }
  levelUp() { const n = [523, 659, 784, 1047]; n.forEach((f, i) => { this.tone(f, 0.7, 'triangle', 0.18, undefined, i * 0.1, this.sfx); this.tone(f, 1.0, 'sine', 0.06, undefined, i * 0.1, this.reverb); }); }
  achievement() { [784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.12, undefined, i * 0.08)); }
  /** a heavy hoofbeat (two thuds) */
  hoof(vol = 1) { this.noise(0.09, 180, 'lowpass', 0.8 * vol); this.tone(70, 0.08, 'sine', 0.5 * vol, 40); this.noise(0.07, 160, 'lowpass', 0.5 * vol, 1, undefined, 0.11); }
  /** an eerie breath when a story voice begins — a whisper without words */
  whisper() {
    for (let i = 0; i < 5; i++) this.noise(0.25 + Math.random() * 0.3, 1400 + Math.random() * 1600, 'bandpass', 0.1, 4 + Math.random() * 4, 900 + Math.random() * 600, i * 0.18 + Math.random() * 0.08);
    this.tone(220, 1.2, 'sine', 0.05, 180, 0, this.reverb);
  }
  /** Distant rolling thunder (brown noise). */
  thunder() { this.noise(3.5, 260, 'lowpass', 0.9, 0.7, 70, 0, this.amb, true); this.noise(0.5, 1200, 'lowpass', 0.4, 0.7, 200, 0.05, this.amb, true); }
  /** Low heartbeat thump – used in the opening. */
  heartbeat() { this.tone(70, 0.25, 'sine', 0.9, 38); this.tone(70, 0.22, 'sine', 0.6, 38, 0.22); }
  /** a distant horn call */
  horn(f = 110) { if (!this.ctx) return; for (const r of [1, 1.5, 2]) this.tone(f * r, 2.4, 'sawtooth', 0.025 / r, f * r * 0.99, 0, this.reverb, 0.6); }

  // ---------------------------------------------------------------- music voice helpers (used by the music engine)
  note(bus: AudioNode, freq: number, at: number, len: number, voice: 'pad' | 'pluck' | 'flute' | 'bell' | 'lute' | 'horn' | 'bass' | 'choir', vol: number) {
    const ctx = this.ctx; if (!ctx) return;
    const out = ctx.createGain(); out.connect(bus);
    const env = (g: AudioParam, a: number, peak: number, rel: number) => { g.setValueAtTime(0.0001, at); g.exponentialRampToValueAtTime(peak, at + a); g.setTargetAtTime(0.0001, at + Math.max(a, len - rel), rel / 3); };
    const osc = (type: OscillatorType, f: number, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.start(at); o.stop(at + len + 1.5); return o; };
    switch (voice) {
      case 'pad': case 'choir': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = voice === 'choir' ? 1400 : 900; lp.Q.value = voice === 'choir' ? 4 : 0.7;
        for (const d of [-9, 0, 8]) osc(voice === 'choir' ? 'triangle' : 'sawtooth', freq, d).connect(lp);
        lp.connect(out); env(out.gain, len * 0.35, vol * 0.25, len * 0.5); break;
      }
      case 'pluck': case 'lute': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(voice === 'lute' ? 3200 : 2400, at); lp.frequency.exponentialRampToValueAtTime(400, at + 0.6);
        osc(voice === 'lute' ? 'sawtooth' : 'triangle', freq).connect(lp); if (voice === 'lute') osc('square', freq * 2, 4).connect(lp);
        lp.connect(out); out.gain.setValueAtTime(0.0001, at); out.gain.exponentialRampToValueAtTime(vol * 0.3, at + 0.005); out.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(1.6, len + 0.6)); break;
      }
      case 'flute': {
        const o = osc('sine', freq); const lfo = osc('sine', 5); const lg = ctx.createGain(); lg.gain.value = freq * 0.008; lfo.connect(lg).connect(o.frequency);
        o.connect(out); env(out.gain, 0.08, vol * 0.18, 0.2); break;
      }
      case 'bell': {
        for (const [r, g] of [[1, 1], [2.76, 0.4], [5.4, 0.2]]) { const o = osc('sine', freq * r); const gg = ctx.createGain(); gg.gain.value = g; o.connect(gg).connect(out); }
        out.gain.setValueAtTime(0.0001, at); out.gain.exponentialRampToValueAtTime(vol * 0.16, at + 0.004); out.gain.exponentialRampToValueAtTime(0.0001, at + 3); break;
      }
      case 'horn': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, at); lp.frequency.linearRampToValueAtTime(1100, at + 0.4);
        osc('sawtooth', freq).connect(lp); osc('sawtooth', freq, 6).connect(lp); lp.connect(out); env(out.gain, 0.25, vol * 0.16, 0.4); break;
      }
      case 'bass': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        osc('triangle', freq).connect(lp); osc('sine', freq / 2).connect(lp); lp.connect(out); env(out.gain, 0.02, vol * 0.4, 0.15); break;
      }
    }
  }
  drum(bus: AudioNode, at: number, kind: 'kick' | 'tom' | 'frame' | 'hat' | 'heart' | 'clap', vol: number) {
    const ctx = this.ctx; if (!ctx || !this.white) return;
    const g = ctx.createGain(); g.connect(bus);
    if (kind === 'kick' || kind === 'tom' || kind === 'heart') {
      const o = ctx.createOscillator(); o.type = 'sine';
      const f0 = kind === 'kick' ? 110 : kind === 'tom' ? 160 : 75;
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f0 * 0.45, at + 0.18);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + (kind === 'tom' ? 0.35 : 0.28));
      o.connect(g); o.start(at); o.stop(at + 0.4);
    } else {
      const src = ctx.createBufferSource(); src.buffer = this.white;
      const f = ctx.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : kind === 'clap' ? 1500 : 600; f.Q.value = kind === 'frame' ? 1.5 : 1;
      const len = kind === 'hat' ? 0.05 : kind === 'clap' ? 0.12 : 0.2;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol * (kind === 'hat' ? 0.3 : 0.6), at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      src.connect(f).connect(g); src.start(at, Math.random(), len + 0.05);
    }
  }
}

export const audio = new AudioEngine();
