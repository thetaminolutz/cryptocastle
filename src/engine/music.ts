// Generative, adaptive music: every theme is a recipe (scale, tempo, voices, drum
// pattern) played by a look-ahead scheduler, so nothing repeats exactly. Themes
// cross-fade: calm exploration per biome, night, tense combat, victory stingers,
// the Herald's eerie theme, tavern jigs, dungeon drones and the opening's
// heartbeat drums with distant horns.
import { audio } from './audio';

type Voice = 'pad' | 'pluck' | 'flute' | 'bell' | 'lute' | 'horn' | 'bass' | 'choir';
export interface Theme {
  root: number; scale: number[]; bpm: number;
  pad?: Voice; lead?: Voice; bass?: boolean; drums?: string; drumKind?: 'kick' | 'tom' | 'frame' | 'heart';
  density: number; leadOct?: number; hornCalls?: boolean; hats?: boolean; vol?: number; chords?: number[];
}

const MINOR = [0, 2, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11], PHRYG = [0, 1, 3, 5, 7, 8, 10], PENTA = [0, 3, 5, 7, 10], LYDIAN = [0, 2, 4, 6, 7, 9, 11], HARM = [0, 2, 3, 5, 7, 8, 11];

export const THEMES: Record<string, Theme> = {
  // exploration, per biome family
  forest: { root: 50, scale: DORIAN, bpm: 64, pad: 'pad', lead: 'flute', bass: true, density: 0.45, chords: [0, 5, 3, 4] },
  meadow: { root: 55, scale: MAJOR, bpm: 76, pad: 'pad', lead: 'pluck', bass: true, density: 0.6, chords: [0, 3, 4, 0] },
  pine: { root: 45, scale: MINOR, bpm: 58, pad: 'choir', lead: 'flute', bass: true, density: 0.35, chords: [0, 5, 6, 4] },
  swamp: { root: 43, scale: PHRYG, bpm: 52, pad: 'pad', lead: 'bell', density: 0.25, drums: 'x.......x...x...', drumKind: 'frame', chords: [0, 1, 0, 6] },
  desert: { root: 50, scale: HARM, bpm: 70, pad: 'pad', lead: 'lute', bass: true, density: 0.5, drums: 'x..x..x.x..x....', drumKind: 'frame', chords: [0, 0, 6, 4] },
  snow: { root: 52, scale: LYDIAN, bpm: 54, pad: 'choir', lead: 'bell', density: 0.3, chords: [0, 1, 4, 0] },
  ash: { root: 40, scale: PHRYG, bpm: 60, pad: 'pad', lead: 'horn', bass: true, density: 0.3, drums: 'x.....x.x.......', drumKind: 'tom', chords: [0, 1, 5, 1] },
  mushroom: { root: 57, scale: LYDIAN, bpm: 66, pad: 'pad', lead: 'bell', density: 0.5, chords: [0, 1, 3, 1] },
  coast: { root: 52, scale: PENTA, bpm: 62, pad: 'pad', lead: 'flute', bass: true, density: 0.4, chords: [0, 4, 5, 3] },
  moor: { root: 45, scale: HARM, bpm: 56, pad: 'choir', lead: 'flute', density: 0.3, hornCalls: true, chords: [0, 5, 4, 0] },
  night: { root: 45, scale: MINOR, bpm: 50, pad: 'pad', lead: 'bell', density: 0.22, chords: [0, 5, 3, 6] },
  // places and moods
  tavern: { root: 57, scale: MAJOR, bpm: 112, lead: 'lute', bass: true, density: 0.85, drums: 'x...x.x.x...x.x.', drumKind: 'frame', hats: true, leadOct: 1, chords: [0, 4, 5, 4], vol: 0.9 },
  dungeon: { root: 38, scale: PHRYG, bpm: 48, pad: 'pad', lead: 'bell', density: 0.15, drums: 'x...............', drumKind: 'heart', chords: [0, 1, 0, 1] },
  tense: { root: 45, scale: HARM, bpm: 120, pad: 'pad', lead: 'horn', bass: true, density: 0.55, drums: 'x..xx..xx.x.x..x', drumKind: 'tom', hats: true, chords: [0, 1, 5, 4], vol: 1.1 },
  boss: { root: 41, scale: PHRYG, bpm: 132, pad: 'choir', lead: 'horn', bass: true, density: 0.6, drums: 'x.xxx.x.x.xxx.x.', drumKind: 'kick', hats: true, chords: [0, 1, 6, 4], vol: 1.2 },
  herald: { root: 44, scale: [0, 1, 4, 6, 7, 10], bpm: 46, pad: 'choir', lead: 'bell', density: 0.25, drums: 'x.......x.......', drumKind: 'heart', chords: [0, 3, 1, 0] },
  opening: { root: 45, scale: MINOR, bpm: 54, pad: 'pad', density: 0.08, drums: 'x..x............', drumKind: 'heart', hornCalls: true, chords: [0, 0, 5, 0] },
  citadel: { root: 55, scale: MAJOR, bpm: 72, pad: 'choir', lead: 'bell', bass: true, density: 0.45, chords: [0, 3, 4, 0] }
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private bus: GainNode | null = null;
  private layer: { gain: GainNode; theme: Theme; name: string } | null = null;
  private step = 0;
  private next = 0;
  private melody = 0;
  private timer = 0;
  private stingerT = -1;
  current = '';

  constructor() {
    audio.onReady(() => {
      const ctx = audio.ctx!;
      this.bus = ctx.createGain(); this.bus.connect(audio.music!);
      const send = ctx.createGain(); send.gain.value = 0.35; this.bus.connect(send).connect(audio.reverb!);
      this.timer = window.setInterval(() => this.schedule(), 90);
    });
  }

  /** Switch theme (cross-fades over `fade` seconds). */
  play(name: string, fade = 2.5) {
    if (name === this.current || !THEMES[name]) return;
    this.current = name;
    const ctx = audio.ctx; if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    if (this.layer) { const old = this.layer.gain; old.gain.cancelScheduledValues(t); old.gain.setValueAtTime(old.gain.value, t); old.gain.linearRampToValueAtTime(0.0001, t + fade); setTimeout(() => old.disconnect(), fade * 1000 + 3000); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(THEMES[name].vol ?? 1, t + fade); g.connect(this.bus);
    this.layer = { gain: g, theme: THEMES[name], name };
    this.step = 0; this.next = Math.max(this.next, t + 0.1);
  }

  /** a short fanfare over whatever plays (victory, level up) */
  victory() {
    const ctx = audio.ctx; if (!ctx || !this.bus) return;
    const t = ctx.currentTime + 0.05;
    const seq = [[60, 0], [64, 0.18], [67, 0.36], [72, 0.6]];
    for (const [m, dt] of seq) { audio.note(this.bus, mtof(m), t + dt, 0.5, 'horn', 1.6); audio.note(this.bus, mtof(m - 12), t + dt, 0.5, 'horn', 1.2); }
    audio.note(this.bus, mtof(72), t + 0.6, 1.6, 'choir', 2);
    audio.drum(this.bus, t, 'tom', 0.8); audio.drum(this.bus, t + 0.6, 'kick', 1);
    this.stingerT = ctx.currentTime + 2.2;
  }

  private schedule() {
    const ctx = audio.ctx; const L = this.layer;
    if (!ctx || !L || ctx.state !== 'running') return;
    const T = L.theme, out = L.gain;
    const sixteenth = 60 / T.bpm / 4;
    while (this.next < ctx.currentTime + 0.35) {
      const at = this.next, s = this.step % 16, bar = Math.floor(this.step / 16);
      const ducked = this.stingerT > at ? 0.35 : 1;
      const chordDeg = (T.chords ?? [0])[bar % (T.chords?.length ?? 1)];
      const deg = (d: number, oct = 0) => { const n = T.scale.length; const o = Math.floor(d / n); return T.root + T.scale[((d % n) + n) % n] + 12 * (o + oct); };
      // pads: a chord each bar
      if (s === 0 && T.pad) for (const d of [0, 2, 4]) audio.note(out, mtof(deg(chordDeg + d, 0)), at, sixteenth * 16 * 1.05, T.pad, 0.9 * ducked);
      // bass on the beat
      if (T.bass && (s === 0 || (s === 8 && Math.random() < 0.6))) audio.note(out, mtof(deg(chordDeg, -1)), at, sixteenth * 6, 'bass', ducked);
      // drums
      if (T.drums && T.drums[s] === 'x') audio.drum(out, at, T.drumKind ?? 'kick', 0.55 * ducked);
      if (T.drumKind === 'heart' && T.drums && T.drums[s] === 'x') audio.drum(out, at + sixteenth * 0.9, 'heart', 0.35 * ducked);
      if (T.hats && s % 2 === 1) audio.drum(out, at, 'hat', 0.25 * ducked);
      // melody: a wandering line on the scale, phrases with rests
      if (T.lead && s % 2 === 0 && Math.random() < T.density) {
        this.melody += Math.round((Math.random() - 0.5) * 3.2);
        this.melody = Math.max(-2, Math.min(9, this.melody));
        if (Math.random() < 0.25) this.melody = chordDeg + [0, 2, 4][Math.floor(Math.random() * 3)];
        const len = sixteenth * (Math.random() < 0.3 ? 4 : 2);
        audio.note(out, mtof(deg(this.melody, 1 + (T.leadOct ?? 0))), at, len, T.lead, ducked);
      }
      // distant horns now and then
      if (T.hornCalls && s === 0 && bar % 4 === 2 && Math.random() < 0.6) audio.note(out, mtof(deg(chordDeg, -1)), at, sixteenth * 12, 'horn', 0.7 * ducked);
      this.next += sixteenth * (s % 2 === 0 ? 1.04 : 0.96); // a little swing
      this.step++;
    }
  }

  stop() { if (this.timer) clearInterval(this.timer); }
}
