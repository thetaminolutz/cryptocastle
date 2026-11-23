// WebAudio bootstrap. iOS only lets audio start inside a user gesture, so
// unlock() must be called from the first tap. Full music/SFX arrive in M14.
import { settings } from './settings';

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = settings.values.masterVolume;
      this.master.connect(this.ctx.destination);
      settings.onChange((s, k) => { if (k === 'masterVolume' && this.master) this.master.gain.value = s.masterVolume; });
      // Play one silent buffer – required by older iOS to fully unlock.
      const b = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = b; src.connect(this.ctx.destination); src.start(0);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume(); }

  /** Distant rolling thunder (filtered noise). */
  thunder() {
    const ctx = this.ctx, out = this.master;
    if (!ctx || !out) return;
    const len = 3.5, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < d.length; i++) { v = v * 0.985 + (Math.random() * 2 - 1) * 0.015; d[i] = v * 6; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * settings.values.ambienceVolume, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(lp).connect(g).connect(out);
    src.start(t);
  }

  /** Low heartbeat thump – used in the opening. */
  heartbeat() {
    const ctx = this.ctx, out = this.master;
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    for (const [dt, g] of [[0, 0.9], [0.22, 0.6]] as const) {
      const o = ctx.createOscillator();
      const gain = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(70, t + dt);
      o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.18);
      gain.gain.setValueAtTime(0.0001, t + dt);
      gain.gain.exponentialRampToValueAtTime(g * settings.values.sfxVolume, t + dt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.25);
      o.connect(gain).connect(out);
      o.start(t + dt); o.stop(t + dt + 0.3);
    }
  }
}

export const audio = new AudioEngine();
