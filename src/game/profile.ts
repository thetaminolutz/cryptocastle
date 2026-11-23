// Turns the choices of the First Rite into numbers: stats, perks and flags.
import { BASE_STATS, CALLINGS, RACES, Profile, Stats } from '../data/character';
import { PLAYER_TUNING, type Player } from '../entities/player';
import type { Combat } from './combat';
import type { Interaction } from './interaction';

export interface Traits {
  stats: Stats;
  nightEye: boolean; farSight: boolean; silent: boolean; blend: boolean; beast: boolean; lockpicking: boolean;
  priceMul: number; vampire: boolean; werewolf: boolean; dwarf: boolean; repMul: number;
}

export function deriveStats(p: Profile): Stats {
  const s = { ...BASE_STATS };
  const race = RACES.find((r) => r.id === p.race)!, cal = CALLINGS.find((c) => c.id === p.calling)!;
  for (const src of [race.stats, cal.stats]) for (const [k, v] of Object.entries(src)) s[k as keyof Stats] += v as number;
  if (p.abilities.includes('stamina')) s.stamina += 25;
  return s;
}

/** Apply a profile to the player, combat and interaction; returns flags for other systems. */
export function applyProfile(p: Profile, player: Player, combat: Combat, inter: Interaction, level: number): Traits {
  const has = (a: string) => p.created && p.abilities.includes(a as never);
  const s = p.created ? deriveStats(p) : { ...BASE_STATS };
  const T = player.tune;
  Object.assign(T, PLAYER_TUNING);
  const agi = (s.agility - 10) * 0.012;
  T.walk = PLAYER_TUNING.walk * (1 + agi + (has('speed') ? 0.08 : 0) + (p.race === 'catfolk' ? 0.05 : 0));
  T.sprint = PLAYER_TUNING.sprint * (1 + agi + (has('speed') ? 0.08 : 0) + (p.race === 'catfolk' ? 0.05 : 0));
  T.jump = PLAYER_TUNING.jump * (has('jumping') ? 1.1 : 1) * (p.race === 'catfolk' ? 1.06 : 1); // 1.1² ≈ 1.2 height
  T.staminaMax = s.stamina;
  T.staminaRegen = PLAYER_TUNING.staminaRegen * (has('stamina') ? 1.25 : 1);
  if (p.race === 'catfolk') T.fallSafe = PLAYER_TUNING.fallSafe * 1.35;
  if (p.race === 'lizardfolk' || has('swimming')) { T.swim *= 1.35; T.swimFast *= 1.35; T.breathMax *= p.race === 'lizardfolk' && has('swimming') ? 3 : 2; }
  player.maxLife = s.life + (level - 1) * 5;
  player.life = Math.min(player.life, player.maxLife);
  player.takenMul = (1 - (s.defence - 10) * 0.015) * (has('iron_skin') ? 0.9 : 1);
  player.regenMul = has('light_healing') ? 2 : 1;
  combat.perks.dmg = (1 + (s.strength - 10) * 0.02) * (has('strength') ? 1.1 : 1);
  combat.perks.crit = 0.08 + Math.max(0, s.luck - 10) * 0.005;
  combat.perks.lifesteal = p.race === 'vampire' ? 0.08 : 0;
  combat.perks.fire = has('make_fire') ? 0.12 : 0;
  combat.perks.curse = has('death_curse') ? 0.1 : 0;
  combat.perks.block = has('force_shield') ? 0.15 : 0;
  inter.herbMul = has('herbalism') ? 2 : 1;
  return {
    stats: s,
    nightEye: has('night_eye') || p.race === 'darkelf' || p.race === 'werewolf',
    farSight: has('far_sight') || p.calling === 'scout',
    silent: has('silent_steps'), blend: has('blend_in') || p.race === 'darkelf', beast: has('beast_tongue'), lockpicking: has('lockpicking'),
    priceMul: (has('haggling') ? 0.85 : 1) * (p.calling === 'bard' ? 0.92 : 1),
    vampire: p.race === 'vampire', werewolf: p.race === 'werewolf', dwarf: p.race === 'dwarf',
    repMul: p.race === 'human' ? 1.3 : 1
  };
}
