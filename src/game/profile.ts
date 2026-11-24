// Turns the choices of the First Rite into numbers: stats, perks and flags.
import { BASE_STATS, CALLINGS, RACES, Profile, Stats } from '../data/character';
import { PLAYER_TUNING, type Player } from '../entities/player';
import type { Combat } from './combat';
import type { Interaction } from './interaction';
import type { GearTotals } from './equipment';

export interface Traits {
  stats: Stats;
  nightEye: boolean; farSight: boolean; silent: boolean; blend: boolean; beast: boolean; lockpicking: boolean;
  priceMul: number; vampire: boolean; werewolf: boolean; dwarf: boolean; repMul: number;
  /** carries a light (Hemera's gifts) */
  light: boolean;
  def: number;
}

export function deriveStats(p: Profile): Stats {
  const s = { ...BASE_STATS };
  const race = RACES.find((r) => r.id === p.race)!, cal = CALLINGS.find((c) => c.id === p.calling)!;
  for (const src of [race.stats, cal.stats]) for (const [k, v] of Object.entries(src)) s[k as keyof Stats] += v as number;
  if (p.abilities.includes('stamina')) s.stamina += 25;
  return s;
}

/** Apply a profile to the player, combat and interaction; returns flags for other systems. */
export function applyProfile(p: Profile, player: Player, combat: Combat, inter: Interaction, level: number, gear?: GearTotals): Traits {
  const g = gear?.bonus ?? {};
  const has = (a: string) => p.created && p.abilities.includes(a as never);
  const s = p.created ? deriveStats(p) : { ...BASE_STATS };
  const T = player.tune;
  Object.assign(T, PLAYER_TUNING);
  const agi = (s.agility - 10) * 0.012;
  const spd = 1 + agi + (has('speed') ? 0.08 : 0) + (p.race === 'catfolk' ? 0.05 : 0) + (g.speed ?? 0);
  T.walk = PLAYER_TUNING.walk * spd;
  T.sprint = PLAYER_TUNING.sprint * spd;
  T.jump = PLAYER_TUNING.jump * (has('jumping') ? 1.1 : 1) * (p.race === 'catfolk' ? 1.06 : 1) * (1 + (g.jump ?? 0)); // 1.1² ≈ 1.2 height
  T.staminaMax = s.stamina + (g.stamina ?? 0);
  T.staminaRegen = PLAYER_TUNING.staminaRegen * (has('stamina') ? 1.25 : 1) * (1 + (g.staminaRegen ?? 0));
  T.breathMax *= 1 + (g.breath ?? 0);
  if (p.race === 'catfolk') T.fallSafe = PLAYER_TUNING.fallSafe * 1.35;
  if (p.race === 'lizardfolk' || has('swimming')) { T.swim *= 1.35; T.swimFast *= 1.35; T.breathMax *= p.race === 'lizardfolk' && has('swimming') ? 3 : 2; }
  player.maxLife = Math.max(20, s.life + (level - 1) * 5 + (g.life ?? 0));
  player.life = Math.min(player.life, player.maxLife);
  const def = gear?.def ?? 0;
  player.takenMul = (1 - (s.defence - 10) * 0.015) * (has('iron_skin') ? 0.9 : 1) * (1 - def / (def + 45));
  player.regenMul = (has('light_healing') ? 2 : 1) + (g.regen ?? 0);
  const pk = combat.perks;
  pk.dmg = (1 + (s.strength - 10) * 0.02) * (has('strength') ? 1.1 : 1) * (1 + (g.dmg ?? 0)) * (gear?.dmgMul ?? 1);
  pk.crit = 0.08 + Math.max(0, s.luck - 10) * 0.005 + (g.crit ?? 0);
  pk.lifesteal = (p.race === 'vampire' ? 0.08 : 0) + (g.lifesteal ?? 0);
  pk.fire = (has('make_fire') ? 0.12 : 0) + (g.fire ?? 0);
  pk.curse = (has('death_curse') ? 0.1 : 0) + (g.curse ?? 0);
  pk.block = (has('force_shield') ? 0.15 : 0) + (g.block ?? 0);
  pk.frost = g.frost ?? 0; pk.ranged = g.ranged ?? 0; pk.attackSpeed = (g.attackSpeed ?? 0) + ((gear?.speedMul ?? 1) - 1);
  pk.xp = 1 + (g.xp ?? 0); pk.gold = 1 + (g.gold ?? 0); pk.fireRes = Math.min(0.9, g.fireRes ?? 0); pk.poisonRes = g.poisonRes ?? 0;
  inter.herbMul = has('herbalism') ? 2 : 1;
  return {
    stats: s,
    nightEye: has('night_eye') || p.race === 'darkelf' || p.race === 'werewolf' || (g.nightEye ?? 0) > 0,
    light: (g.light ?? 0) > 0, def,
    farSight: has('far_sight') || p.calling === 'scout',
    silent: has('silent_steps'), blend: has('blend_in') || p.race === 'darkelf' || (g.stealth ?? 0) > 0, beast: has('beast_tongue'), lockpicking: has('lockpicking'),
    priceMul: (has('haggling') ? 0.85 : 1) * (p.calling === 'bard' ? 0.92 : 1),
    vampire: p.race === 'vampire', werewolf: p.race === 'werewolf', dwarf: p.race === 'dwarf',
    repMul: p.race === 'human' ? 1.3 : 1
  };
}
