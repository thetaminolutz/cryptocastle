// "The game knows you": a hidden profile built only from in-game behaviour —
// weapons, fights, fleeing, hesitating, deaths, how you treat people, night or day.
// The Herald reads it to judge fights and to say unsettling things.
import type { Player } from '../entities/player';
import type { Creatures } from '../entities/creatures';

export interface WatchSave {
  weapon: Record<string, number>; fled: Record<string, number>; deaths: Record<string, number>; hesitate: Record<string, number>;
  kind: Record<string, number>; cruel: Record<string, number>;
  parries: number; blocks: number; rolls: number; hits: number; shots: number; swings: number; night: number; day: number; bandages: number;
  obey: number; defy: number; trick: number; favours: number; truth: number;
}

export type FightStyle = 'brave' | 'clever' | 'cowardly' | 'cruel';

const blank = (): WatchSave => ({ weapon: {}, fled: {}, deaths: {}, hesitate: {}, kind: {}, cruel: {}, parries: 0, blocks: 0, rolls: 0, hits: 0, shots: 0, swings: 0, night: 0, day: 0, bandages: 0, obey: 0, defy: 0, trick: 0, favours: 0, truth: 0 });
const top = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1])[0];

export class Watcher {
  d: WatchSave = blank();
  /** the current big fight */
  private fight = { on: false, hits: 0, parries: 0, rolls: 0, fleeT: 0, shots: 0, swings: 0, procs: 0, lowLife: 0 };
  private stillT = 0;
  private lastState = '';
  private chaseDist = new Map<object, number>();

  constructor(private player: Player, private creatures: Creatures, private placeName: () => string) {}

  load(s: WatchSave | undefined) { if (s) this.d = { ...blank(), ...s }; }
  serialize() { return this.d; }

  inc(map: keyof Pick<WatchSave, 'weapon' | 'fled' | 'deaths' | 'hesitate' | 'kind' | 'cruel'>, key: string, n = 1) { this.d[map][key] = (this.d[map][key] ?? 0) + n; }
  event(e: 'parry' | 'block' | 'hit' | 'swing' | 'shot' | 'proc' | 'bandage', weaponKind?: string) {
    const f = this.fight;
    if (e === 'parry') { this.d.parries++; f.parries++; }
    if (e === 'block') this.d.blocks++;
    if (e === 'hit') { this.d.hits++; f.hits++; }
    if (e === 'swing') { this.d.swings++; f.swings++; if (weaponKind) this.inc('weapon', weaponKind); }
    if (e === 'shot') { this.d.shots++; f.shots++; if (weaponKind) this.inc('weapon', weaponKind); }
    if (e === 'proc') f.procs++;
    if (e === 'bandage') this.d.bandages++;
  }
  beginFight() { this.fight = { on: true, hits: 0, parries: 0, rolls: 0, fleeT: 0, shots: 0, swings: 0, procs: 0, lowLife: 0 }; }

  update(dt: number, night: boolean) {
    const p = this.player;
    if (night) this.d.night += dt / 3600; else this.d.day += dt / 3600;
    if (p.state !== this.lastState) { if (p.state === 'roll') { this.d.rolls++; this.fight.rolls++; } this.lastState = p.state; }
    const threats = this.creatures.list.filter((c) => c.state !== 'dead' && !c.ally && c.alerted && c.pos.distanceTo(p.pos) < 30);
    // hesitating: standing still while something hunts you
    if (threats.some((c) => c.pos.distanceTo(p.pos) < 18) && p.speed < 0.3) {
      this.stillT += dt;
      if (this.stillT > 4) { this.inc('hesitate', this.placeName()); this.stillT = -20; }
    } else this.stillT = Math.min(0, this.stillT + dt);
    // fleeing: running away from a chaser while hurt
    for (const c of threats) {
      const d = c.pos.distanceTo(p.pos), prev = this.chaseDist.get(c) ?? d;
      if (p.life < p.maxLife * 0.45 && d > prev + 0.02 && p.speed > 4) { this.fight.fleeT += dt; if (d > 26 && prev <= 26) this.inc('fled', c.def.id); }
      this.chaseDist.set(c, d);
    }
    if (this.fight.on && p.life < p.maxLife * 0.25) this.fight.lowLife += dt;
  }

  /** how the last big fight went */
  fightStyle(): FightStyle {
    const f = this.fight;
    this.fight.on = false;
    if (f.fleeT > 6) return 'cowardly';
    if (f.procs > 6 || (this.d.cruel.fleeing ?? 0) > 3) return 'cruel';
    if (f.parries >= 2 || f.shots > f.swings || f.rolls > 6) return 'clever';
    return 'brave';
  }

  /** something eerie the Herald can say, drawn from the profile */
  remark(name: string): string {
    const d = this.d;
    const lines: string[] = [];
    const h = top(d.hesitate); if (h && h[1] >= 2) lines.push(`You hesitated in ${h[0]} again, ${name}. I counted. ${h[1]} times.`);
    const f = top(d.fled); if (f && f[1] >= 2) lines.push(`You run from ${f[0].replace(/_/g, ' ')}s. ${f[1]} times now. Do they follow you in your sleep?`);
    const w = top(d.weapon); if (w && w[1] > 40) lines.push(`Always the ${w[0]}. You trust it more than you trust anyone.`);
    const dd = top(d.deaths); if (dd && dd[1] >= 2) lines.push(`${dd[0][0].toUpperCase() + dd[0].slice(1)} has killed you ${dd[1]} times. It remembers your taste.`);
    if (d.night > d.day * 1.5 && d.night > 0.3) lines.push('You walk mostly at night. So do I.');
    if (d.parries > 15) lines.push('You wait for the blow and turn it aside. Patient. I like patient things.');
    if (d.bandages > 12) lines.push('So many bandages. You bleed easily, little one.');
    const k = top(d.kind); if (k && k[1] >= 3) lines.push(k[0].startsWith('-') ? `You were cruel to ${k[0].slice(1)}. They will not forget. Neither will I.` : `You are kind to ${k[0]}. Kindness is a lever. Others will find it.`);
    if (!lines.length) lines.push(`I am watching how you walk, ${name}. Every step tells me something.`);
    return lines[Math.floor(Math.random() * lines.length)];
  }
}
