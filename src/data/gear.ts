// Weapons, armour, clothing, jewellery, armour sets, affixes and the unique named
// items (data). Registered into ITEMS by items.ts.
import type { ItemDef, WeaponStats, DmgType } from './items';

export type EquipSlot = 'head' | 'chest' | 'legs' | 'boots' | 'gloves' | 'cloak' | 'ring' | 'amulet';
export const EQUIP_SLOTS = ['head', 'amulet', 'chest', 'cloak', 'gloves', 'ring1', 'legs', 'ring2', 'boots'] as const;
export type EquipKey = typeof EQUIP_SLOTS[number];
export const SLOT_NAME: Record<EquipKey, string> = { head: 'Head', amulet: 'Amulet', chest: 'Chest', cloak: 'Cloak', gloves: 'Gloves', ring1: 'Ring', legs: 'Legs', ring2: 'Ring', boots: 'Boots' };
export const slotKind = (k: EquipKey): EquipSlot => (k === 'ring1' || k === 'ring2' ? 'ring' : k);

/** Stat bonuses from gear, sets and affixes (all additive). */
export interface Bonus {
  life?: number; stamina?: number; def?: number;
  dmg?: number; crit?: number; lifesteal?: number; fire?: number; curse?: number; frost?: number;
  speed?: number; jump?: number; regen?: number; staminaRegen?: number; block?: number;
  nightEye?: number; light?: number; xp?: number; gold?: number; breath?: number;
  fireRes?: number; poisonRes?: number; stealth?: number; ranged?: number; attackSpeed?: number;
}

/** How a worn piece looks on the hero. */
export interface GearLook {
  color: number;
  style?: 'helm' | 'crown' | 'hood' | 'cap' | 'circlet' | 'plate' | 'mail' | 'leather' | 'robe' | 'cloth';
  metal?: boolean; trim?: number; glow?: number;
}

export interface ArmorDef { slot: EquipSlot; def: number; set?: string; look?: GearLook; }

export interface SetDef { id: string; name: string; pieces: string[]; two: Bonus; four: Bonus; desc: string; }
export const SETS: Record<string, SetDef> = {};
const SET = (d: SetDef) => { SETS[d.id] = d; };

const W = (dmg: number, type: DmgType, reach: number, speed: number, stamina: number, ranged?: WeaponStats['ranged']): WeaponStats => ({ dmg, type, reach, speed, stamina, ranged });
const tk = (kind: NonNullable<ItemDef['tool']>['kind'], speed: number, dur = 300) => ({ kind, tier: 0, power: 0.3, durability: dur, speed });

export const GEAR: ItemDef[] = [];
const G = (d: ItemDef) => { GEAR.push({ stack: 1, ...d }); };

// ------------------------------------------------------------------ weapons
G({ id: 'iron_dagger', name: 'Iron Dagger', cat: 'weapon', desc: 'Quick, quiet and close.', icon: { shape: 'dagger', color: '#b8b8c0' }, weapon: W(12, 'pierce', 1.7, 1.55, 4), tool: tk('dagger', 1.55), value: 20 });
G({ id: 'saber', name: 'Saber', cat: 'weapon', rarity: 'fine', desc: 'A curved blade for elegant cuts.', icon: { shape: 'saber', color: '#c8c8d0' }, weapon: W(18, 'slash', 2.3, 1.3, 5), tool: tk('saber', 1.3), value: 40 });
G({ id: 'long_sword', name: 'Long Sword', cat: 'weapon', rarity: 'fine', desc: 'Two hands, long reach, honest work.', icon: { shape: 'longsword', color: '#c0c0c8' }, weapon: W(26, 'slash', 2.8, 0.95, 8), tool: tk('longsword', 0.95), value: 60 });
G({ id: 'battle_axe', name: 'Battle Axe', cat: 'weapon', rarity: 'fine', desc: 'Bites deep into shields and whatever is behind them.', icon: { shape: 'axe', color: '#9a9aa2' }, weapon: W(28, 'slash', 2.4, 0.85, 9), tool: { kind: 'axe', tier: 3, power: 1.6, durability: 400, speed: 0.85 }, value: 55 });
G({ id: 'war_hammer', name: 'War Hammer', cat: 'weapon', rarity: 'fine', desc: 'Skeletons and armour hate it equally.', icon: { shape: 'hammer', color: '#8a8a92' }, weapon: W(32, 'blunt', 2.3, 0.75, 11), tool: tk('hammer', 0.75, 500), value: 60 });
G({ id: 'morning_star', name: 'Morning Star', cat: 'weapon', rarity: 'fine', desc: 'A spiked ball that does not ask twice.', icon: { shape: 'mace', color: '#7a7a82' }, weapon: W(27, 'blunt', 2.2, 0.85, 9), tool: tk('morningstar', 0.85), value: 50 });
G({ id: 'spiked_club', name: 'Spiked Club', cat: 'weapon', desc: 'A club that learned cruelty.', icon: { shape: 'club', color: '#6a4a2a' }, weapon: W(16, 'blunt', 2.1, 0.9, 8), tool: tk('club', 0.9, 200), value: 12 });
G({ id: 'claw_whip', name: 'Claw Whip', cat: 'weapon', rarity: 'rare', desc: 'Leather and hooked claws; it reaches where swords cannot.', icon: { shape: 'whip', color: '#7a5a3a' }, weapon: W(15, 'slash', 3.4, 1.2, 6), tool: tk('whip', 1.2), value: 70 });
G({ id: 'iron_spear', name: 'Iron Spear', cat: 'weapon', rarity: 'fine', desc: 'Keeps trolls at a respectful distance.', icon: { shape: 'spear', color: '#a8a8b0' }, weapon: W(20, 'pierce', 3.0, 1.0, 6), tool: tk('spear', 1), value: 35 });
G({ id: 'hunting_bow', name: 'Hunting Bow', cat: 'weapon', desc: 'Ash wood and gut string. Needs arrows.', icon: { shape: 'bow', color: '#8a6a42' }, weapon: W(14, 'pierce', 30, 1.0, 5, { speed: 34, ammo: 'arrow' }), tool: tk('bow', 1), value: 25 });
G({ id: 'long_bow', name: 'Longbow', cat: 'weapon', rarity: 'fine', desc: 'Taller than a dwarf and twice as stubborn.', icon: { shape: 'bow', color: '#5a3a22' }, weapon: W(22, 'pierce', 40, 0.8, 6, { speed: 44, ammo: 'arrow' }), tool: tk('bow', 0.8), value: 60 });
G({ id: 'crossbow', name: 'Crossbow', cat: 'weapon', rarity: 'fine', desc: 'Slow to load, hard to argue with.', icon: { shape: 'crossbow', color: '#6a5a4a' }, weapon: W(30, 'pierce', 40, 0.6, 4, { speed: 52, ammo: 'arrow' }), tool: tk('crossbow', 0.6), value: 70 });
G({ id: 'ember_wand', name: 'Ember Wand', cat: 'weapon', rarity: 'fine', desc: 'A twig of charred oak that remembers the fire.', icon: { shape: 'wand', color: '#c85a20' }, weapon: W(14, 'fire', 26, 1.1, 10, { speed: 24 }), tool: tk('wand', 1.1, 0), value: 55 });
G({ id: 'frost_wand', name: 'Frost Wand', cat: 'weapon', rarity: 'fine', desc: 'Cold to the touch, colder to the target.', icon: { shape: 'wand', color: '#7ac0e8' }, weapon: W(13, 'ice', 26, 1.1, 10, { speed: 24 }), tool: tk('wand', 1.1, 0), value: 55 });
G({ id: 'arrow', name: 'Arrow', cat: 'material', stack: 99, desc: 'Flint-tipped, goose-feathered.', icon: { shape: 'stick', color: '#8a6a42' }, value: 1 });
G({ id: 'round_shield', name: 'Round Shield', cat: 'shield', desc: 'Light and quick to raise.', icon: { shape: 'shield', color: '#7a5a3a' }, shield: { block: 0.7 }, value: 10 });
G({ id: 'kite_shield', name: 'Kite Shield', cat: 'shield', rarity: 'fine', desc: 'Covers you from chin to shin.', icon: { shape: 'shield', color: '#8a3a2a' }, shield: { block: 0.85 }, value: 45 });
G({ id: 'tower_shield', name: 'Tower Shield', cat: 'shield', rarity: 'rare', desc: 'A wall you carry. Slow, but nothing gets through.', icon: { shape: 'shield', color: '#a0a0a8' }, shield: { block: 0.95 }, bonus: { speed: -0.08 }, value: 80 });

// ------------------------------------------------------------------ armour sets
const A = (id: string, name: string, slot: EquipSlot, def: number, set: string | undefined, look: GearLook, desc: string, value: number, rarity: ItemDef['rarity'] = 'common', shape?: ItemDef['icon']['shape']) =>
  G({ id, name, cat: 'armor', rarity, desc, icon: { shape: shape ?? slot, color: '#' + look.color.toString(16).padStart(6, '0') }, armor: { slot, def, set, look }, value });

const LEATHER = 0x6a4a2e, IRON = 0x8a8c94, MITHRIL = 0xc8e0f0, PALE = 0xe8e4d8, ASH = 0x3a3438;
A('leather_cap', 'Leather Cap', 'head', 2, 'leather', { color: LEATHER, style: 'cap' }, 'Boiled leather, stitched snug.', 10);
A('leather_jerkin', 'Leather Jerkin', 'chest', 4, 'leather', { color: LEATHER, style: 'leather' }, 'Stiff hide over padding.', 18);
A('leather_breeches', 'Leather Breeches', 'legs', 3, 'leather', { color: 0x4a3420 }, 'Patched at the knees.', 14);
A('leather_boots', 'Hunter’s Boots', 'boots', 2, 'leather', { color: 0x3a2618 }, 'Soft soles for quiet steps.', 10);
A('leather_gloves', 'Leather Gloves', 'gloves', 1, 'leather', { color: 0x4a3020 }, 'A good grip on bowstring and blade.', 8);
SET({ id: 'leather', name: 'Hunter’s Leathers', pieces: ['leather_cap', 'leather_jerkin', 'leather_breeches', 'leather_boots', 'leather_gloves'], two: { speed: 0.05 }, four: { crit: 0.08, ranged: 0.15 }, desc: 'Light feet, keen eyes.' });

A('iron_helm', 'Iron Helm', 'head', 5, 'iron', { color: IRON, style: 'helm', metal: true }, 'A nasal helm, dented by someone else’s bad day.', 40, 'fine');
A('iron_cuirass', 'Iron Cuirass', 'chest', 9, 'iron', { color: IRON, style: 'plate', metal: true }, 'Heavy, cold, reassuring.', 80, 'fine');
A('iron_greaves', 'Iron Greaves', 'legs', 6, 'iron', { color: IRON, metal: true }, 'Shin plates over mail.', 55, 'fine');
A('iron_sabatons', 'Iron Sabatons', 'boots', 4, 'iron', { color: 0x6a6c74, metal: true }, 'Each step a statement.', 35, 'fine');
A('iron_gauntlets', 'Iron Gauntlets', 'gloves', 3, 'iron', { color: IRON, metal: true }, 'Fingers of jointed steel.', 30, 'fine');
SET({ id: 'iron', name: 'Ironclad', pieces: ['iron_helm', 'iron_cuirass', 'iron_greaves', 'iron_sabatons', 'iron_gauntlets'], two: { life: 20 }, four: { def: 6, block: 0.08 }, desc: 'Stand where others fall.' });

A('mithril_circlet', 'Mithril Circlet', 'head', 4, 'mithril', { color: MITHRIL, style: 'circlet', metal: true, glow: 0.3 }, 'Light as thought.', 140, 'rare');
A('mithril_mail', 'Mithril Mail', 'chest', 10, 'mithril', { color: MITHRIL, style: 'mail', metal: true }, 'Rings so fine it flows like silk.', 260, 'rare');
A('mithril_leggings', 'Mithril Leggings', 'legs', 7, 'mithril', { color: MITHRIL, metal: true }, 'You forget you are wearing them.', 180, 'rare');
A('mithril_boots', 'Mithril Boots', 'boots', 4, 'mithril', { color: 0xa8c0d0, metal: true }, 'They never sink in mud.', 120, 'rare');
A('mithril_gloves', 'Mithril Gloves', 'gloves', 3, 'mithril', { color: MITHRIL, metal: true }, 'Cold, then warm, then part of you.', 110, 'rare');
SET({ id: 'mithril', name: 'Moonsilver', pieces: ['mithril_circlet', 'mithril_mail', 'mithril_leggings', 'mithril_boots', 'mithril_gloves'], two: { stamina: 25 }, four: { dmg: 0.1, regen: 1, nightEye: 1 }, desc: 'Forged under a full moon.' });

A('pale_helm', 'Pale Guard Helm', 'head', 5, 'pale', { color: PALE, style: 'helm', metal: true, trim: 0xc8a040 }, 'Worn by the Citadel’s watch.', 70, 'fine');
A('pale_cuirass', 'Pale Guard Cuirass', 'chest', 9, 'pale', { color: PALE, style: 'plate', metal: true, trim: 0xc8a040 }, 'White enamel over steel. Hard to keep clean.', 140, 'fine');
A('pale_greaves', 'Pale Guard Greaves', 'legs', 6, 'pale', { color: PALE, metal: true }, 'Polished every dawn.', 90, 'fine');
A('pale_boots', 'Pale Guard Boots', 'boots', 4, 'pale', { color: 0xc8c4b8, metal: true }, 'Heel-iron rings on the flagstones.', 60, 'fine');
SET({ id: 'pale', name: 'Pale Guard', pieces: ['pale_helm', 'pale_cuirass', 'pale_greaves', 'pale_boots'], two: { life: 15, dmg: 0.05 }, four: { block: 0.12, def: 4 }, desc: 'The white walls walk with you.' });

A('ashen_hood', 'Ashen Hood', 'head', 1, 'ashen', { color: ASH, style: 'hood' }, 'Grey as cold embers.', 30, 'fine');
A('ashen_robe', 'Ashen Robe', 'chest', 3, 'ashen', { color: ASH, style: 'robe', trim: 0x8a2a1a }, 'Smells faintly of old fires.', 60, 'fine');
A('ashen_wraps', 'Ashen Wraps', 'gloves', 1, 'ashen', { color: 0x2a2428 }, 'Bandages over burn scars.', 25, 'fine');
SET({ id: 'ashen', name: 'Ashen Vestments', pieces: ['ashen_hood', 'ashen_robe', 'ashen_wraps'], two: { fire: 0.1 }, four: { curse: 0.1 }, desc: 'For those who play with fire.' });

// ---- cosmetic outfits and simple clothes
A('noble_doublet', 'Noble Doublet', 'chest', 1, undefined, { color: 0x5a1e2a, style: 'cloth', trim: 0xd8b050 }, 'Velvet and gold thread. Merchants bow lower.', 90, 'fine');
A('festival_tunic', 'Festival Tunic', 'chest', 0, undefined, { color: 0xc89a30, style: 'cloth', trim: 0x2a6a3a }, 'Bright as a harvest bonfire.', 30);
A('beggars_rags', 'Beggar’s Rags', 'chest', 0, undefined, { color: 0x6a6050, style: 'cloth' }, 'Nobody looks twice at rags.', 1);
A('travel_cloak', 'Travel Cloak', 'cloak', 1, undefined, { color: 0x3a4a3a }, 'Keeps the rain off. Mostly.', 15);
A('red_cloak', 'Crimson Cloak', 'cloak', 1, undefined, { color: 0x7a1a14 }, 'Seen from far away. That is the point.', 40, 'fine');
A('iron_ring', 'Iron Ring', 'ring', 0, undefined, { color: 0x8a8a92 }, 'Plain and solid.', 6, 'common', 'ring');
A('silver_ring', 'Silver Ring', 'ring', 1, undefined, { color: 0xd8dce4 }, 'A thin band of silver.', 30, 'fine', 'ring');
A('bone_amulet', 'Bone Amulet', 'amulet', 0, undefined, { color: 0xe8e0cc }, 'Carved knucklebones on a thong.', 8, 'common', 'amulet');

// ------------------------------------------------------------------ unique named items
const U = (d: Omit<ItemDef, 'stack'>) => G({ rarity: 'legendary', ...d });
const UA = (id: string, name: string, slot: EquipSlot, def: number, look: GearLook, desc: string, lore: string, bonus: Bonus, rarity: ItemDef['rarity'] = 'legendary') =>
  U({ id, name, cat: 'armor', rarity, desc, lore, bonus, icon: { shape: slot, color: '#' + look.color.toString(16).padStart(6, '0'), accent: '#e8b030' }, armor: { slot, def, look }, value: 300 });

U({ id: 'whisperfang', name: 'Whisperfang', cat: 'weapon', desc: 'A long sword with a dark-red grip that whistles when swung.', lore: 'Forged for a duellist who never lost — until the night the blade sang a different name.', icon: { shape: 'longsword', color: '#c8c8d8', accent: '#7a1a1a' }, weapon: W(32, 'slash', 2.8, 1.05, 7), tool: tk('longsword', 1.05, 900), bonus: { crit: 0.12 }, value: 400 });
U({ id: 'gravediggers_spade', name: 'The Gravedigger’s Spade', cat: 'tool', desc: 'A spade that has buried more than earth. Digs fast; the dead fear it.', lore: 'Old Hob dug every grave in the barrow for sixty years. The last one was his own — and it was empty.', icon: { shape: 'shovel', color: '#8a8a7a', accent: '#e8b030' }, weapon: W(22, 'holy', 2.2, 1.0, 6), tool: { kind: 'shovel', tier: 5, power: 2.6, durability: 0, speed: 1.6 }, value: 300 });
U({ id: 'ember_tongue', name: 'Ember Tongue', cat: 'weapon', desc: 'A saber whose edge glows like a coal.', lore: 'Quenched in the Ash Dragon’s blood, they say. The smith lost both hands in the quenching.', icon: { shape: 'saber', color: '#e86a2a' }, weapon: W(24, 'fire', 2.3, 1.3, 5), tool: tk('saber', 1.3, 800), bonus: { fire: 0.25 }, value: 380 });
U({ id: 'frostbite', name: 'Frostbite', cat: 'weapon', desc: 'A dagger of blue-white steel. Wounds freeze shut — and so do muscles.', lore: 'Found in the hand of a frozen pilgrim, still warm.', icon: { shape: 'dagger', color: '#a8e0ff' }, weapon: W(17, 'ice', 1.8, 1.6, 4), tool: tk('dagger', 1.6, 700), bonus: { frost: 0.3 }, value: 320 });
U({ id: 'bishops_censer', name: 'The Bishop’s Censer', cat: 'weapon', desc: 'A morning star of blessed brass. It still smokes.', lore: 'The Drowned Bishop swung it at the flood until the water closed over the bell tower.', icon: { shape: 'mace', color: '#d8b050' }, weapon: W(30, 'holy', 2.2, 0.85, 9), tool: tk('morningstar', 0.85, 900), bonus: { regen: 0.5 }, value: 380 });
U({ id: 'the_last_thread', name: 'The Last Thread', cat: 'weapon', desc: 'A claw whip of silver wire. Every life is a thread; this one cuts.', lore: 'Atropos keeps a pair of shears behind the bar. She says she has never used them. Nobody asks twice.', icon: { shape: 'whip', color: '#d8dce4' }, weapon: W(20, 'slash', 3.6, 1.25, 6), tool: tk('whip', 1.25, 800), bonus: { lifesteal: 0.06 }, value: 420 });
U({ id: 'troll_kings_maul', name: 'The Troll King’s Maul', cat: 'weapon', desc: 'A war hammer made from a mountain’s knuckle.', lore: 'He used it to crown himself. Twice, because the first crown broke.', icon: { shape: 'hammer', color: '#6a6a5a' }, weapon: W(44, 'blunt', 2.5, 0.65, 13), tool: tk('hammer', 0.65, 0), bonus: { life: 20 }, value: 450 });
U({ id: 'queens_stinger', name: 'The Queen’s Stinger', cat: 'weapon', desc: 'A spear tipped with the Scorpion Queen’s barb. The venom never dries.', lore: 'Her children still look for it in the dark.', icon: { shape: 'spear', color: '#c8b060' }, weapon: W(26, 'poison', 3.0, 1.05, 6), tool: tk('spear', 1.05, 900), bonus: { poisonRes: 1 }, value: 400 });
U({ id: 'hollow_edge', name: 'The Hollow Edge', cat: 'weapon', rarity: 'cursed', desc: 'A black long sword that drinks the light. Strong — and it takes something back.', lore: 'Every bearer grew a little emptier. The last one grew a crown.', icon: { shape: 'longsword', color: '#2a2a3a', accent: '#7a1a1a' }, weapon: W(40, 'shadow', 2.8, 1.0, 7), tool: tk('longsword', 1.0, 0), bonus: { curse: 0.15, life: -25 }, value: 500 });
U({ id: 'falcon_wing', name: 'Falcon Wing', cat: 'weapon', desc: 'A bow strung with a golden feather. Arrows fly straighter than truth.', lore: 'Made from the Golden Falcon’s own pinion. It still wants the sky.', icon: { shape: 'bow', color: '#e8b030' }, weapon: W(26, 'pierce', 45, 1.15, 5, { speed: 52, ammo: 'arrow' }), tool: tk('bow', 1.15, 0), bonus: { ranged: 0.15, speed: 0.04 }, value: 420 });
U({ id: 'thunder_bolt', name: 'Thunderbolt', cat: 'weapon', desc: 'A crossbow etched with lightning. The string hums before a storm.', lore: 'Built by a kobold genius who was promptly struck by lightning.', icon: { shape: 'crossbow', color: '#8a9ab8' }, weapon: W(40, 'pierce', 45, 0.65, 4, { speed: 60, ammo: 'arrow' }), tool: tk('crossbow', 0.65, 0), bonus: { crit: 0.08 }, value: 400 });
U({ id: 'hemeras_wand', name: 'Hemera’s Wand', cat: 'weapon', desc: 'A wand of white birch that holds a scrap of daylight.', lore: 'Hemera, the day, gave it to a child afraid of the dark. The child grew up and stopped being afraid of anything.', icon: { shape: 'wand', color: '#f8e8a0' }, weapon: W(22, 'holy', 28, 1.2, 9, { speed: 30 }), tool: tk('wand', 1.2, 0), bonus: { light: 1 }, value: 380 });
U({ id: 'moonsilver_blade', name: 'Moonsilver Blade', cat: 'weapon', desc: 'Mithril folded with moonstone. It glows when the dead are near.', lore: 'Forged on the one night a century when both moons are full.', icon: { shape: 'sword', color: '#d8e8ff' }, weapon: W(32, 'holy', 2.5, 1.25, 6), tool: tk('sword', 1.25, 0), bonus: { nightEye: 1 }, value: 420 });
U({ id: 'bandit_kings_cleaver', name: 'The Bandit King’s Cleaver', cat: 'weapon', desc: 'A heavy battle axe with a purse tied to the haft.', lore: '“Your money or your life” — he took both, and kept the change.', icon: { shape: 'axe', color: '#8a7a6a' }, weapon: W(34, 'slash', 2.4, 0.9, 9), tool: { kind: 'axe', tier: 4, power: 2.2, durability: 0, speed: 0.9 }, bonus: { gold: 0.25 }, value: 380 });
U({ id: 'aegis_of_dawn', name: 'Aegis of Dawn', cat: 'shield', desc: 'A round shield of gilded bronze that catches the first light.', lore: 'Raised over the Citadel’s gate on the day it was sealed.', icon: { shape: 'shield', color: '#e8c050' }, shield: { block: 0.95 }, bonus: { def: 3, regen: 0.5 }, value: 400 });

UA('crown_of_the_drowned', 'Crown of the Drowned', 'head', 3, { color: 0x6a8a7a, style: 'crown', metal: true, glow: 0.4 }, 'A green-bronze crown crusted with pearls. You can breathe a long time with it on.', 'The Drowned Bishop wore it to his last sermon. The congregation is still listening, under the lake.', { breath: 3, nightEye: 1 });
UA('hemeras_lantern', 'Hemera’s Lantern', 'amulet', 0, { color: 0xf8d870 }, 'A tiny lantern on a chain. It is never dark around you.', 'A spark of the first morning, kept in glass so it would not go out.', { light: 1, regen: 0.5 });
UA('ring_of_the_ninth_hour', 'Ring of the Ninth Hour', 'ring', 0, { color: 0x4a3a6a }, 'A ring of black iron. Wounds close fast after dark.', 'Every clock in the Citadel stops at the ninth hour once a year. Nobody knows why.', { regen: 1.5 });
UA('cloak_of_the_ashen', 'Cloak of the Ashen', 'cloak', 2, { color: 0x6a6a6e }, 'Grey and threadbare. Eyes slide off you.', 'The Stranger had two. He gave one away a long time ago.', { stealth: 1, def: 1 });
UA('stormcallers_gauntlets', 'Stormcaller’s Gauntlets', 'gloves', 3, { color: 0x5a6a8a, metal: true }, 'Iron gauntlets that crackle when you clench them.', 'Their wearer called down lightning on the Ash Dragon. The dragon called back.', { crit: 0.05, dmg: 0.05 });
UA('boots_of_the_hare', 'Boots of the Hare', 'boots', 2, { color: 0xb89a70 }, 'Soft boots lined with rabbit fur. You are quick in them.', 'Stolen from a gnome who has never stopped looking for them.', { speed: 0.12, jump: 0.1 });
UA('heart_of_the_mountain', 'Heart of the Mountain', 'amulet', 2, { color: 0x8a5a3a }, 'A warm red stone that beats, very slowly.', 'The dwarves say every mountain has one. They do not say how they know.', { life: 40 });
UA('widows_veil', 'The Widow’s Veil', 'head', 1, { color: 0x1a1a1e, style: 'hood' }, 'Black lace. Your hits leave a curse behind — and so does grief.', 'Worn by the swamp hag at her own wedding.', { curse: 0.12, life: -10 }, 'cursed');
UA('ash_dragon_scale', 'Ash Dragon Scale', 'chest', 12, { color: 0x3a2a2a, style: 'plate', metal: true, trim: 0xc84a20 }, 'A breastplate of a single dragon scale. Fire barely warms it.', 'The Ash Dragon shed one scale every hundred years. This is the newest.', { fireRes: 0.6 });
UA('bishops_mitre', 'The Bishop’s Mitre', 'head', 2, { color: 0xe8e0d0, style: 'crown', trim: 0xc8a040 }, 'A tall white mitre, still damp.', 'Pulled from the flood by a fisherman who quit fishing the next day.', { regen: 1, xp: 0.05 });
UA('kobold_kings_crown', 'The Kobold King’s Crown', 'head', 2, { color: 0xd8a030, style: 'crown', metal: true }, 'Too small, very shiny. Gold seems to find you.', 'He had a new one made every year from the gold of the old one. It got smaller every time.', { gold: 0.3 });
UA('ring_of_thorns', 'Ring of Thorns', 'ring', 1, { color: 0x3a5a2a }, 'Briars wound into a band. Your guard is harder to break.', 'Grown, not made, in the hedge around a forgotten shrine.', { block: 0.1 });
UA('signet_of_the_herald', 'Signet of the Herald', 'ring', 0, { color: 0x2a2a2a }, 'A black seal with an amber eye. You learn faster when he is watching.', 'He gives one to each of his errand-runners. He has given out a great many.', { xp: 0.15 });
UA('lachesis_measure', 'Lachesis’ Measure', 'amulet', 0, { color: 0xc8a8e8 }, 'A silver measuring-cord coiled into a pendant. Your breath lasts longer.', 'Lachesis of the Gilded Spindle measures every guest’s thread. She lets some of them see.', { stamina: 30, staminaRegen: 0.25 });
UA('scorpion_queens_carapace', 'The Scorpion Queen’s Carapace', 'chest', 11, { color: 0x6a3a1a, style: 'plate', trim: 0xc8a060 }, 'A breastplate of living chitin. Poison slides off it.', 'Her children keep trying to climb into it.', { poisonRes: 1 });
UA('falconers_glove', 'The Falconer’s Glove', 'gloves', 2, { color: 0x8a6a3a }, 'A thick gauntlet with a perch-ring. Your shots land harder.', 'The falconer is gone. The falcon came back, golden and furious.', { ranged: 0.2 });
UA('pilgrims_sandals', 'Pilgrim’s Sandals', 'boots', 1, { color: 0x9a7a5a }, 'Worn soles, tireless feet.', 'They have walked to the Monument of Warning and back eleven times.', { staminaRegen: 0.35, speed: 0.04 });
UA('midas_ring', 'Old Mordecai’s Ring', 'ring', 0, { color: 0xf0c040 }, 'A heavy gold ring. Coins stick to you.', 'Mordecai swears it is not the one he lost. He also swears he never lost one.', { gold: 0.5 });
UA('veil_of_the_stranger', 'Veil of Ash', 'cloak', 3, { color: 0x4a4a4e }, 'A long grey cloak. Monsters lose track of you.', 'Woven from the smoke of a campfire that has burned for three hundred years.', { stealth: 1, regen: 0.5 });
UA('hollow_kings_crown', 'The Hollow King’s Crown', 'head', 6, { color: 0x1a1a22, style: 'crown', metal: true, glow: 0.8 }, 'A crown of black iron with nothing inside it. It makes you strong. It makes you hollow.', 'Whoever wears it longest becomes the next Hollow King. That is how it has always worked.', { dmg: 0.2, life: -30, curse: 0.1 }, 'cursed');

/** Weapon affixes: rolled onto dropped and crafted weapons. */
export interface AffixDef { id: string; name: string; prefix: boolean; bonus: Bonus; dmgMul?: number; speedMul?: number; }
export const AFFIXES: Record<string, AffixDef> = {
  burning: { id: 'burning', name: 'of Burning', prefix: false, bonus: { fire: 0.18 } },
  frost: { id: 'frost', name: 'of Frost', prefix: false, bonus: { frost: 0.2 } },
  vampiric: { id: 'vampiric', name: 'Vampiric', prefix: true, bonus: { lifesteal: 0.04 } },
  swift: { id: 'swift', name: 'Swift', prefix: true, bonus: { attackSpeed: 0.15 } },
  keen: { id: 'keen', name: 'Keen', prefix: true, bonus: { crit: 0.08 } },
  heavy: { id: 'heavy', name: 'Heavy', prefix: true, bonus: {}, dmgMul: 1.18, speedMul: 0.9 },
  cursed: { id: 'cursed', name: 'of the Grave', prefix: false, bonus: { curse: 0.12 } },
  guarding: { id: 'guarding', name: 'of Guarding', prefix: false, bonus: { block: 0.08, def: 2 } }
};

/** Loot pools for dungeons and bosses. */
export const LOOT_TIERS: Record<'low' | 'mid' | 'high', string[]> = {
  low: ['iron_dagger', 'spiked_club', 'hunting_bow', 'round_shield', 'leather_cap', 'leather_jerkin', 'leather_breeches', 'leather_boots', 'leather_gloves', 'iron_ring', 'bone_amulet', 'travel_cloak', 'beggars_rags'],
  mid: ['saber', 'long_sword', 'battle_axe', 'war_hammer', 'morning_star', 'iron_spear', 'long_bow', 'crossbow', 'ember_wand', 'frost_wand', 'kite_shield', 'iron_helm', 'iron_cuirass', 'iron_greaves', 'iron_sabatons', 'iron_gauntlets', 'silver_ring', 'red_cloak', 'ashen_hood', 'ashen_robe', 'ashen_wraps', 'noble_doublet', 'festival_tunic'],
  high: ['claw_whip', 'tower_shield', 'mithril_circlet', 'mithril_mail', 'mithril_leggings', 'mithril_boots', 'mithril_gloves']
};
export const UNIQUES = GEAR.filter((d) => d.rarity === 'legendary' || d.rarity === 'cursed').map((d) => d.id);
