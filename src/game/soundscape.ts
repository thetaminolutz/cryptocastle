// Decides what the world sounds like right now: which music theme, the ambience
// beds, footsteps under the player, monsters announcing themselves, coins.
import { audio, Surface } from '../engine/audio';
import { Music } from '../engine/music';
import { Ambience } from '../engine/ambience';
import { Biome } from '../world/biomes';
import { B } from '../world/blocks';
import type { Game } from './game';
import type { Creature } from '../entities/creatures';

const BIOME_THEME: Partial<Record<Biome, string>> = {
  [Biome.MoonlitForest]: 'forest', [Biome.SunnyMeadows]: 'meadow', [Biome.DarkPine]: 'pine', [Biome.MistySwamp]: 'swamp', [Biome.SunkenForest]: 'swamp',
  [Biome.RedDesert]: 'desert', [Biome.SnowyMountains]: 'snow', [Biome.FrozenTundra]: 'snow', [Biome.VolcanicAshlands]: 'ash', [Biome.MushroomGrove]: 'mushroom',
  [Biome.CoastalCliffs]: 'coast', [Biome.Beach]: 'coast', [Biome.Ocean]: 'coast', [Biome.HauntedMoor]: 'moor', [Biome.FloatingRocks]: 'snow', [Biome.CrystalCaves]: 'mushroom'
};

const growlKind = (c: Creature): Parameters<typeof audio.growl>[1] => {
  const id = c.def.id;
  if (/spider|crawler|wasp|scorpion|bat/.test(id)) return 'bug';
  if (/skeleton|wight|lich|ghost|knight|hollow/.test(id)) return 'undead';
  if (/harpy|falcon|gargoyle/.test(id)) return 'bird';
  if (/spirit|wisp/.test(id)) return 'spirit';
  if (/bandit|robber|cultist|kobold|goblin|orc|champion|hag|lord|king|bishop/.test(id)) return 'man';
  return 'beast';
};

export class Soundscape {
  readonly music = new Music();
  readonly amb = new Ambience();
  private stepT = 0;
  private heard = new WeakSet<Creature>();
  private calm = 0;
  private wasFighting = false;
  private lastGold = -1;
  private wasWater = false;

  constructor(private g: Game) {
    document.addEventListener('click', (e) => { const t = e.target as HTMLElement; if (t.closest?.('.btn, .tabs button, .codex-tabs button, .cr-chip, .cr-card, .jr-item, .slot')) audio.click(); }, true);
  }

  update(dt: number) {
    const g = this.g, p = g.player;
    // ---- music
    const foes = g.creatures.alive.filter((c) => c.alerted && c.pos.distanceTo(p.pos) < 26 && c.state !== 'hidden');
    const boss = foes.some((c) => c.def.boss);
    const fighting = foes.length > 0;
    if (fighting) this.calm = 0; else this.calm += dt;
    if (this.wasFighting && !fighting && this.calm > 1.5) { this.wasFighting = false; if (g.lastKillT < 6) this.music.victory(); }
    if (fighting) this.wasFighting = true;
    let theme: string;
    if (g.story.step === 'wake' || g.story.step === 'stranger' || g.story.step === 'gorge') theme = 'opening';
    else if (g.herald.busy || g.heraldNear) theme = 'herald';
    else if (boss) theme = 'boss';
    else if (fighting || (this.calm < 4 && (this.music.current === 'tense' || this.music.current === 'boss'))) theme = 'tense';
    else if (g.delves.current() || g.chapters.inLabyrinth()) theme = 'dungeon';
    else if (g.inTavern) theme = 'tavern';
    else if (g.chapters.inCitadel()) theme = 'citadel';
    else if (g.sky.isNight) theme = 'night';
    else theme = BIOME_THEME[g.biome] ?? 'forest';
    this.music.play(theme, theme === 'tense' || theme === 'boss' ? 1.2 : 3);

    // ---- ambience
    const under = g.isUnderwater;
    const cave = g.delves.current() || g.chapters.inLabyrinth() ? 1 : 0;
    const night = g.sky.isNight;
    const kind = g.weather.kind;
    const water = Math.max(0, 1 - g.waterDistance / 20);
    const forest = [Biome.MoonlitForest, Biome.DarkPine, Biome.SunnyMeadows, Biome.MushroomGrove, Biome.CoastalCliffs].includes(g.biome) ? 1 : 0.3;
    this.amb.update(dt, {
      wind: kind === 'storm' ? 1 : kind === 'sandstorm' ? 0.9 : kind === 'snow' ? 0.6 : [Biome.SnowyMountains, Biome.FrozenTundra, Biome.CoastalCliffs].includes(g.biome) ? 0.5 : 0.2,
      rain: kind === 'rain' ? 0.7 : kind === 'storm' ? 1 : 0,
      water, birds: !night && !cave && kind !== 'rain' && kind !== 'storm' ? forest : 0, crickets: night && !cave && kind !== 'snow' ? forest : 0,
      cave, fire: g.nearFire, crowd: g.inTavern ? 1 : 0, underwater: under
    });

    // ---- footsteps
    if (p.grounded && p.speed > 0.8 && p.state !== 'roll') {
      this.stepT -= dt * (p.speed / 2.2);
      if (this.stepT <= 0) { this.stepT = 1; audio.footstep(this.surface(), p.speed > 6); }
    } else this.stepT = Math.min(this.stepT, 0.2);
    if (p.inWater && !this.wasWater && p.vel.y < -3) audio.splash(p.vel.y < -8);
    this.wasWater = p.inWater;

    // ---- monsters announce themselves
    for (const c of foes) if (!this.heard.has(c)) { this.heard.add(c); audio.growl((c.def.height * (c.def.scale ?? 1)) / 3, growlKind(c)); }

    // ---- coins
    if (this.lastGold >= 0 && g.gold > this.lastGold) audio.coins(Math.ceil((g.gold - this.lastGold) / 10));
    this.lastGold = g.gold;
  }

  private surface(): Surface {
    const g = this.g, p = g.player.pos;
    if (g.player.inWater) return 'water';
    const ground = g.world.groundY(p.x, p.z, p.y + 0.5);
    if (p.y - ground > 0.25) return 'wood'; // on a floor or furniture
    const m = g.world.material(Math.floor(p.x), Math.floor(p.y - 0.3), Math.floor(p.z));
    if (m === B.SNOW || m === B.SNOW_GRASS || m === B.ICE || m === B.TUNDRA) return 'snow';
    if (m === B.SAND || m === B.RED_SAND || m === B.ASH) return 'sand';
    if (m === B.STONE || m === B.COBBLE || m === B.GRAVEL || m === B.BASALT || m === B.RED_ROCK || m === B.MOSS_STONE || m === B.CLIFF || m === B.CRYSTAL) return 'stone';
    if (m === B.DIRT || m === B.MUD || m === B.CLAY || m === B.FOREST_FLOOR) return 'dirt';
    if (m === B.PLANKS) return 'wood';
    return 'grass';
  }
}
