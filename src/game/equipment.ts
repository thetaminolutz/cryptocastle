// Totals of everything worn and held: defence, stat bonuses, armour-set bonuses,
// weapon affixes, and the look of the worn pieces for the hero model.
import { ITEMS } from '../data/items';
import { AFFIXES, Bonus, EQUIP_SLOTS, GearLook, SETS, EquipKey } from '../data/gear';
import type { Inventory } from './inventory';

export interface GearTotals { def: number; bonus: Bonus; sets: { name: string; n: number; total: number }[]; dmgMul: number; speedMul: number; }
export type WornLook = Partial<Record<'head' | 'chest' | 'legs' | 'boots' | 'gloves' | 'cloak', GearLook>>;

const addB = (into: Bonus, b: Bonus | undefined) => { if (!b) return; for (const [k, v] of Object.entries(b)) (into as Record<string, number>)[k] = ((into as Record<string, number>)[k] ?? 0) + (v as number); };

export function gearTotals(inv: Inventory): GearTotals {
  const bonus: Bonus = {};
  let def = 0, dmgMul = 1, speedMul = 1;
  const setCount = new Map<string, number>();
  for (const k of EQUIP_SLOTS) {
    const s = inv.equip[k]; if (!s) continue;
    const d = ITEMS[s.id]; if (!d?.armor) continue;
    def += d.armor.def;
    addB(bonus, d.bonus);
    if (d.armor.set) setCount.set(d.armor.set, (setCount.get(d.armor.set) ?? 0) + 1);
  }
  const sets: GearTotals['sets'] = [];
  for (const [id, n] of setCount) {
    const set = SETS[id]; if (!set) continue;
    if (n >= 2) addB(bonus, set.two);
    if (n >= 4) addB(bonus, set.four);
    sets.push({ name: set.name, n, total: set.pieces.length });
  }
  // held weapon (+ affix) and a shield on the belt
  const held = inv.held;
  if (held) {
    const d = ITEMS[held.id];
    if (d && (d.weapon || d.cat === 'tool')) addB(bonus, d.bonus);
    const a = held.affix ? AFFIXES[held.affix] : null;
    if (a) { addB(bonus, a.bonus); dmgMul *= a.dmgMul ?? 1; speedMul *= a.speedMul ?? 1; }
  }
  const shield = inv.slots.slice(0, 6).find((x) => x && ITEMS[x.id].shield);
  if (shield) addB(bonus, ITEMS[shield.id].bonus);
  def += bonus.def ?? 0;
  return { def, bonus, sets, dmgMul, speedMul };
}

export function wornLook(inv: Inventory): WornLook {
  const out: WornLook = {};
  for (const k of ['head', 'chest', 'legs', 'boots', 'gloves', 'cloak'] as const) {
    const s = inv.equip[k as EquipKey];
    const look = s ? ITEMS[s.id]?.armor?.look : undefined;
    if (look) out[k] = look;
  }
  return out;
}
