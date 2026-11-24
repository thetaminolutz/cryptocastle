// Item, tool and recipe tables (data). Add new content here.
import { B } from '../world/blocks';
import { Plant, Tree } from '../world/biomes';
import { GEAR, type ArmorDef, type Bonus } from './gear';

export type Rarity = 'common' | 'fine' | 'rare' | 'epic' | 'legendary' | 'cursed';
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8b0a0', fine: '#5fbf5a', rare: '#4f8fe8', epic: '#a65ee0', legendary: '#e8b030', cursed: '#e0343c'
};

export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sickle' | 'knife' | 'staff' | 'torch' | 'sword' | 'spear' | 'mace' | 'club'
  | 'dagger' | 'saber' | 'longsword' | 'hammer' | 'morningstar' | 'whip' | 'bow' | 'crossbow' | 'wand';
export type DmgType = 'slash' | 'pierce' | 'blunt' | 'fire' | 'ice' | 'poison' | 'holy' | 'shadow';
export interface WeaponStats { dmg: number; type: DmgType; reach: number; speed: number; stamina: number; /** bows, crossbows, wands: projectile speed and ammo */ ranged?: { speed: number; ammo?: string }; }
export type Category = 'material' | 'tool' | 'food' | 'placeable' | 'misc' | 'weapon' | 'shield' | 'armor';
export type Station = 'hand' | 'workbench' | 'campfire' | 'furnace' | 'anvil';

export interface ItemDef {
  id: string; name: string; cat: Category; rarity?: Rarity; stack?: number;
  desc: string;
  icon: { shape: IconShape; color: string; accent?: string };
  tool?: { kind: ToolKind; tier: number; power: number; durability: number; speed: number };
  food?: { heal: number; stamina?: number; cures?: string };
  weapon?: WeaponStats;
  shield?: { block: number };
  place?: string; // placeable prop id
  value?: number; // base price (economy, M8)
  /** wearable: slot, defence, set, look */
  armor?: ArmorDef;
  /** stat bonuses while held (weapons/shields) or worn */
  bonus?: Bonus;
  /** unique items: a line of lore */
  lore?: string;
}
export type IconShape = 'log' | 'plank' | 'stick' | 'stone' | 'ore' | 'bar' | 'gem' | 'fiber' | 'rope' | 'berry' | 'mushroom' | 'flower'
  | 'leaf' | 'pickaxe' | 'axe' | 'shovel' | 'sickle' | 'knife' | 'staff' | 'torch' | 'campfire' | 'bench' | 'furnace' | 'anvil'
  | 'sand' | 'clump' | 'meal' | 'potion' | 'glass' | 'brick' | 'coal' | 'shard' | 'flint' | 'sword' | 'spear' | 'mace' | 'club' | 'shield' | 'meat' | 'hide' | 'bone' | 'fang' | 'coin'
  | 'dagger' | 'saber' | 'longsword' | 'hammer' | 'whip' | 'bow' | 'crossbow' | 'wand' | 'head' | 'chest' | 'legs' | 'boots' | 'gloves' | 'cloak' | 'ring' | 'amulet';

const I = (d: ItemDef) => d;
export const ITEMS: Record<string, ItemDef> = {};
const add = (...defs: ItemDef[]) => { for (const d of defs) ITEMS[d.id] = { stack: 99, rarity: 'common', ...d }; };

// ---- raw materials
add(
  I({ id: 'log', name: 'Log', cat: 'material', desc: 'A length of rough timber.', icon: { shape: 'log', color: '#7a5a3a', accent: '#c8a070' }, value: 2 }),
  I({ id: 'birch_log', name: 'Birch Log', cat: 'material', desc: 'Pale, papery bark.', icon: { shape: 'log', color: '#d8d4c8', accent: '#c8a070' }, value: 2 }),
  I({ id: 'pine_log', name: 'Pine Log', cat: 'material', desc: 'Smells of resin.', icon: { shape: 'log', color: '#5a3e28', accent: '#c8a070' }, value: 2 }),
  I({ id: 'stick', name: 'Stick', cat: 'material', desc: 'Useful for handles and kindling.', icon: { shape: 'stick', color: '#8a6a42' }, value: 1 }),
  I({ id: 'stone', name: 'Stone', cat: 'material', desc: 'A fist-sized rock.', icon: { shape: 'stone', color: '#8a8680' }, value: 1 }),
  I({ id: 'flint', name: 'Flint', cat: 'material', desc: 'Breaks into sharp edges.', icon: { shape: 'flint', color: '#4a4a52' }, value: 2 }),
  I({ id: 'dirt', name: 'Soil', cat: 'material', desc: 'Earth, dark and damp.', icon: { shape: 'clump', color: '#6a4a30' }, value: 0 }),
  I({ id: 'sand', name: 'Sand', cat: 'material', desc: 'Fine grains. Melts into glass.', icon: { shape: 'sand', color: '#d8c48a' }, value: 0 }),
  I({ id: 'red_sand', name: 'Red Sand', cat: 'material', desc: 'Rust-coloured desert sand.', icon: { shape: 'sand', color: '#b8683a' }, value: 0 }),
  I({ id: 'clay', name: 'Clay', cat: 'material', desc: 'Fire it to make bricks.', icon: { shape: 'clump', color: '#9a9aa8' }, value: 1 }),
  I({ id: 'gravel', name: 'Gravel', cat: 'material', desc: 'Loose stones.', icon: { shape: 'sand', color: '#7a7470' }, value: 0 }),
  I({ id: 'snowball', name: 'Snow', cat: 'material', desc: 'Cold. Melts in the hand.', icon: { shape: 'clump', color: '#eef4fc' }, value: 0 }),
  I({ id: 'ash', name: 'Ash', cat: 'material', desc: 'Volcanic dust.', icon: { shape: 'sand', color: '#4a4848' }, value: 0 }),
  I({ id: 'basalt', name: 'Basalt', cat: 'material', desc: 'Dense black volcanic rock.', icon: { shape: 'stone', color: '#2e2a2a' }, value: 2 }),
  I({ id: 'coal', name: 'Coal', cat: 'material', desc: 'Burns hot and long.', icon: { shape: 'coal', color: '#1e1c1c' }, value: 3 }),
  I({ id: 'copper_ore', name: 'Copper Ore', cat: 'material', desc: 'Green-veined rock.', icon: { shape: 'ore', color: '#c87a3a', accent: '#5aa07a' }, value: 5 }),
  I({ id: 'iron_ore', name: 'Iron Ore', cat: 'material', desc: 'Heavy, rust-flecked.', icon: { shape: 'ore', color: '#c8a080' }, value: 8 }),
  I({ id: 'silver_ore', name: 'Silver Ore', cat: 'material', rarity: 'fine', desc: 'Gleams in torchlight.', icon: { shape: 'ore', color: '#d8dce4' }, value: 14 }),
  I({ id: 'gold_ore', name: 'Gold Ore', cat: 'material', rarity: 'fine', desc: 'Men have killed for less.', icon: { shape: 'ore', color: '#f0c040' }, value: 22 }),
  I({ id: 'mithril_ore', name: 'Mithril Ore', cat: 'material', rarity: 'rare', desc: 'Light as a feather, hard as sorrow.', icon: { shape: 'ore', color: '#8ae8f0' }, value: 45 }),
  I({ id: 'moonstone', name: 'Moonstone', cat: 'material', rarity: 'epic', desc: 'It glows faintly when the moon is up.', icon: { shape: 'gem', color: '#d8d0ff' }, value: 90 }),
  I({ id: 'crystal_shard', name: 'Crystal Shard', cat: 'material', rarity: 'fine', desc: 'Hums when held near the ear.', icon: { shape: 'shard', color: '#7ae0ff', accent: '#a070e0' }, value: 12 }),
  I({ id: 'fiber', name: 'Plant Fiber', cat: 'material', desc: 'Twist it into rope.', icon: { shape: 'fiber', color: '#8aa050' }, value: 0 }),
  I({ id: 'reed', name: 'Reeds', cat: 'material', desc: 'Hollow stems from the water’s edge.', icon: { shape: 'fiber', color: '#a0a060' }, value: 1 }),
  I({ id: 'torn_map', name: 'Torn Map', cat: 'misc', stack: 1, desc: 'From the robbers’ hoard: the Pale Citadel’s walls, and an arch of pale stone marked “the only way in”.', icon: { shape: 'leaf', color: '#d8c8a0' }, value: 0 }),
  I({ id: 'wish_shard', name: 'Wish Shard', cat: 'misc', rarity: 'epic', desc: 'A splinter of green light, warm as a heartbeat. Offer it to the Herald and ask for something.', icon: { shape: 'shard', color: '#40e070', accent: '#b0ffb0' }, value: 0 }),
  I({ id: 'sealed_box', name: 'Sealed Box', cat: 'misc', stack: 1, desc: 'Black wood, a seal of amber wax. Something inside is beating. The Herald said: do not open it.', icon: { shape: 'bench', color: '#2a2020' }, value: 0 }),
  I({ id: 'nightshade_vial', name: 'Vial of Nightshade', cat: 'misc', stack: 1, desc: 'A tiny bottle, cold to hold. Meant for Lachesis’ wine.', icon: { shape: 'potion', color: '#5a2a6a' }, value: 0 }),
  I({ id: 'hobs_bones', name: 'Old Hob’s Bones', cat: 'misc', stack: 1, desc: 'Wrapped in a gravedigger’s apron. They feel heavier than bones should.', icon: { shape: 'bone', color: '#d8d0b8' }, value: 0 }),
  I({ id: 'fern', name: 'Fern Frond', cat: 'material', desc: 'Soothing when crushed.', icon: { shape: 'leaf', color: '#4a9a3a' }, value: 1 }),
  I({ id: 'petals', name: 'Wildflower', cat: 'material', desc: 'Bright petals for dyes.', icon: { shape: 'flower', color: '#e05050', accent: '#f0c040' }, value: 1 }),
  I({ id: 'moonpetal', name: 'Moonpetal', cat: 'material', rarity: 'fine', desc: 'Blooms only in moonlight. A healer’s herb.', icon: { shape: 'flower', color: '#a8d0ff', accent: '#ffffff' }, value: 8 }),
  I({ id: 'cactus_flesh', name: 'Cactus Flesh', cat: 'food', desc: 'Bitter, but full of water.', icon: { shape: 'leaf', color: '#4a8a3a' }, food: { heal: 4, stamina: 15 }, value: 1 }),
  I({ id: 'resin', name: 'Resin', cat: 'material', desc: 'Sticky sap. Burns well.', icon: { shape: 'gem', color: '#d89030' }, value: 2 })
);
// ---- food
add(
  I({ id: 'berries', name: 'Wild Berries', cat: 'food', desc: 'Sweet and tart.', icon: { shape: 'berry', color: '#b0102a' }, food: { heal: 6 }, value: 1 }),
  I({ id: 'mushroom', name: 'Forest Mushroom', cat: 'food', desc: 'Better cooked.', icon: { shape: 'mushroom', color: '#c83a2a' }, food: { heal: 3 }, value: 1 }),
  I({ id: 'glowcap', name: 'Glowcap', cat: 'material', rarity: 'fine', desc: 'A luminous fungus prized by alchemists.', icon: { shape: 'mushroom', color: '#5ad8ff' }, value: 6 }),
  I({ id: 'roast_mushroom', name: 'Roasted Mushroom', cat: 'food', desc: 'Smoky and filling.', icon: { shape: 'meal', color: '#8a5a30' }, food: { heal: 14, stamina: 10 }, value: 4 }),
  I({ id: 'berry_mash', name: 'Berry Mash', cat: 'food', desc: 'Warm berries, crushed.', icon: { shape: 'meal', color: '#9a1a3a' }, food: { heal: 18 }, value: 5 }),
  I({ id: 'poultice', name: 'Healing Poultice', cat: 'food', rarity: 'fine', desc: 'Moonpetal bound in fern. Closes wounds.', icon: { shape: 'potion', color: '#7ac0a0' }, food: { heal: 40 }, value: 18 })
);
// ---- refined
add(
  I({ id: 'planks', name: 'Planks', cat: 'material', desc: 'Sawn timber for building.', icon: { shape: 'plank', color: '#b48a58' }, value: 1 }),
  I({ id: 'rope', name: 'Rope', cat: 'material', desc: 'Strong twisted fiber.', icon: { shape: 'rope', color: '#b0a070' }, value: 2 }),
  I({ id: 'copper_bar', name: 'Copper Bar', cat: 'material', desc: 'Soft metal for early tools.', icon: { shape: 'bar', color: '#d0843a' }, value: 12 }),
  I({ id: 'iron_bar', name: 'Iron Bar', cat: 'material', desc: 'The backbone of every smithy.', icon: { shape: 'bar', color: '#a8a8b0' }, value: 20 }),
  I({ id: 'silver_bar', name: 'Silver Bar', cat: 'material', rarity: 'fine', desc: 'Pure and bright.', icon: { shape: 'bar', color: '#e0e4ec' }, value: 34 }),
  I({ id: 'gold_bar', name: 'Gold Bar', cat: 'material', rarity: 'fine', desc: 'Heavy with promise.', icon: { shape: 'bar', color: '#f0c040' }, value: 50 }),
  I({ id: 'mithril_bar', name: 'Mithril Bar', cat: 'material', rarity: 'rare', desc: 'Silver-blue, unbelievably light.', icon: { shape: 'bar', color: '#8ae8f0' }, value: 100 }),
  I({ id: 'glass', name: 'Glass', cat: 'material', desc: 'Clear as still water.', icon: { shape: 'glass', color: '#b8e0f0' }, value: 2 }),
  I({ id: 'brick', name: 'Brick', cat: 'material', desc: 'Fired clay.', icon: { shape: 'brick', color: '#a8583a' }, value: 2 })
);
// ---- tools: tier 1 wood, 2 stone, 3 copper, 4 iron, 5 mithril
const toolSet = (mat: string, matName: string, tier: number, color: string, power: number, dur: number, rarity: Rarity = 'common') => {
  const kinds: [ToolKind, string, IconShape][] = [['pickaxe', 'Pickaxe', 'pickaxe'], ['axe', 'Axe', 'axe'], ['shovel', 'Shovel', 'shovel']];
  for (const [kind, name, shape] of kinds) add({ id: `${mat}_${kind}`, name: `${matName} ${name}`, cat: 'tool', stack: 1, rarity, desc: `Tier ${tier} ${name.toLowerCase()}.`, icon: { shape, color }, tool: { kind, tier, power, durability: dur, speed: 1 }, value: tier * 8 });
};
toolSet('wood', 'Wooden', 1, '#a07a4a', 1, 60);
toolSet('stone', 'Stone', 2, '#8a8680', 1.5, 130);
toolSet('copper', 'Copper', 3, '#d0843a', 2, 250);
toolSet('iron', 'Iron', 4, '#b0b0b8', 3, 500, 'fine');
toolSet('mithril', 'Mithril', 5, '#8ae8f0', 4.5, 1500, 'rare');
add(
  I({ id: 'stone_knife', name: 'Flint Knife', cat: 'tool', stack: 1, desc: 'For cutting fiber and skinning.', icon: { shape: 'knife', color: '#5a5a62' }, tool: { kind: 'knife', tier: 1, power: 1, durability: 120, speed: 1.4 }, value: 4 }),
  I({ id: 'stone_sickle', name: 'Stone Sickle', cat: 'tool', stack: 1, desc: 'Harvests plants in a sweep.', icon: { shape: 'sickle', color: '#8a8680' }, tool: { kind: 'sickle', tier: 2, power: 1, durability: 150, speed: 1.3 }, value: 6 }),
  I({ id: 'staff', name: 'Gnarled Staff', cat: 'tool', stack: 1, desc: 'Your only companion since the clearing.', icon: { shape: 'staff', color: '#6a4a2e' }, tool: { kind: 'staff', tier: 0, power: 0.6, durability: 0, speed: 1 }, value: 1 }),
  I({ id: 'torch', name: 'Torch', cat: 'tool', stack: 20, desc: 'Light in the dark. Hold it to see.', icon: { shape: 'torch', color: '#8a6a42', accent: '#ffb040' }, tool: { kind: 'torch', tier: 0, power: 0.3, durability: 0, speed: 1 }, value: 2 })
);
// ---- weapons & shields
const W = (dmg: number, type: DmgType, reach: number, speed: number, stamina: number): WeaponStats => ({ dmg, type, reach, speed, stamina });
add(
  I({ id: 'club', name: 'Wooden Club', cat: 'weapon', stack: 1, desc: 'A heavy knot of oak. Crude, but it works.', icon: { shape: 'club', color: '#7a5a3a' }, weapon: W(9, 'blunt', 2.0, 0.9, 7), tool: { kind: 'club', tier: 0, power: 0.4, durability: 120, speed: 0.9 }, value: 3 }),
  I({ id: 'flint_spear', name: 'Flint Spear', cat: 'weapon', stack: 1, desc: 'Keeps danger at arm’s length — and then some.', icon: { shape: 'spear', color: '#5a5a62' }, weapon: W(10, 'pierce', 2.8, 1.0, 6), tool: { kind: 'spear', tier: 0, power: 0.3, durability: 140, speed: 1 }, value: 6 }),
  I({ id: 'rusty_sword', name: 'Rusty Sword', cat: 'weapon', stack: 1, desc: 'Pitted and notched, taken from someone who no longer needs it.', icon: { shape: 'sword', color: '#9a7a62' }, weapon: W(13, 'slash', 2.3, 1.1, 6), tool: { kind: 'sword', tier: 0, power: 0.3, durability: 160, speed: 1.1 }, value: 12 }),
  I({ id: 'iron_sword', name: 'Iron Sword', cat: 'weapon', stack: 1, rarity: 'fine', desc: 'Balanced, honest steel.', icon: { shape: 'sword', color: '#b8b8c0' }, weapon: W(20, 'slash', 2.4, 1.15, 6), tool: { kind: 'sword', tier: 0, power: 0.3, durability: 400, speed: 1.15 }, value: 45 }),
  I({ id: 'iron_mace', name: 'Iron Mace', cat: 'weapon', stack: 1, rarity: 'fine', desc: 'Bones were not meant to meet this.', icon: { shape: 'mace', color: '#8a8a92' }, weapon: W(24, 'blunt', 2.1, 0.85, 9), tool: { kind: 'mace', tier: 0, power: 0.5, durability: 450, speed: 0.85 }, value: 50 }),
  I({ id: 'silver_sword', name: 'Silver Sword', cat: 'weapon', stack: 1, rarity: 'rare', desc: 'The restless dead fear its gleam.', icon: { shape: 'sword', color: '#e0e8f0' }, weapon: W(24, 'holy', 2.4, 1.2, 6), tool: { kind: 'sword', tier: 0, power: 0.3, durability: 380, speed: 1.2 }, value: 90 }),
  I({ id: 'wooden_shield', name: 'Wooden Shield', cat: 'shield', stack: 1, desc: 'Keep it on your belt to raise it when you block.', icon: { shape: 'shield', color: '#8a6a42' }, shield: { block: 0.75 }, value: 6 }),
  I({ id: 'iron_shield', name: 'Iron Shield', cat: 'shield', stack: 1, rarity: 'fine', desc: 'A heater shield rimmed with iron.', icon: { shape: 'shield', color: '#a0a0a8' }, shield: { block: 0.88 }, value: 40 })
);
add(...GEAR);
// ---- creature loot & remedies
add(
  I({ id: 'raw_meat', name: 'Raw Meat', cat: 'food', desc: 'Cook it first if you value your stomach.', icon: { shape: 'meat', color: '#b03a3a' }, food: { heal: 2 }, value: 2 }),
  I({ id: 'cooked_meat', name: 'Roast Meat', cat: 'food', desc: 'Hot, greasy and wonderful.', icon: { shape: 'meat', color: '#8a4a22' }, food: { heal: 24, stamina: 20 }, value: 6 }),
  I({ id: 'hide', name: 'Hide', cat: 'material', desc: 'Raw animal skin. Tan it into leather.', icon: { shape: 'hide', color: '#8a6a4a' }, value: 3 }),
  I({ id: 'leather', name: 'Leather', cat: 'material', desc: 'Supple and strong.', icon: { shape: 'hide', color: '#6a4a2a' }, value: 6 }),
  I({ id: 'bone', name: 'Bone', cat: 'material', desc: 'Clean and white.', icon: { shape: 'bone', color: '#e8e0cc' }, value: 1 }),
  I({ id: 'fang', name: 'Fang', cat: 'material', desc: 'Still sharp.', icon: { shape: 'fang', color: '#f0ead8' }, value: 3 }),
  I({ id: 'chitin', name: 'Chitin', cat: 'material', desc: 'A plate of spider shell.', icon: { shape: 'shard', color: '#3a3a2a' }, value: 4 }),
  I({ id: 'venom_sac', name: 'Venom Sac', cat: 'material', rarity: 'fine', desc: 'Handle with great care.', icon: { shape: 'potion', color: '#6ac03a' }, value: 8 }),
  I({ id: 'troll_hide', name: 'Troll Hide', cat: 'material', rarity: 'rare', desc: 'Thick as a door.', icon: { shape: 'hide', color: '#5a6a4a' }, value: 30 }),
  I({ id: 'ectoplasm', name: 'Ectoplasm', cat: 'material', rarity: 'fine', desc: 'Cold, faintly glowing residue of the dead.', icon: { shape: 'potion', color: '#b0e0ff' }, value: 14 }),
  I({ id: 'ember_core', name: 'Ember Core', cat: 'material', rarity: 'fine', desc: 'Still burns in your hand.', icon: { shape: 'gem', color: '#ff7a2a' }, value: 16 }),
  I({ id: 'toad_slime', name: 'Toad Slime', cat: 'material', desc: 'Foul-smelling. Alchemists want it anyway.', icon: { shape: 'potion', color: '#7a9a3a' }, value: 2 }),
  I({ id: 'bandage', name: 'Bandage', cat: 'food', desc: 'Stops bleeding and closes small wounds.', icon: { shape: 'rope', color: '#e8e0d0' }, food: { heal: 8, cures: 'bleed' }, value: 3 }),
  I({ id: 'antidote', name: 'Antidote', cat: 'food', rarity: 'fine', desc: 'Bitter. Draws poison from the blood.', icon: { shape: 'potion', color: '#a0e050' }, food: { heal: 5, cures: 'poison' }, value: 10 })
);

// ---- placeable stations
add(
  I({ id: 'workbench', name: 'Workbench', cat: 'placeable', stack: 5, desc: 'Craft tools and furniture here.', icon: { shape: 'bench', color: '#a07a4a' }, place: 'workbench', value: 10 }),
  I({ id: 'campfire', name: 'Campfire', cat: 'placeable', stack: 5, desc: 'Cook food. Keeps the dark at bay.', icon: { shape: 'campfire', color: '#8a8680', accent: '#ff8a20' }, place: 'campfire', value: 6 }),
  I({ id: 'furnace', name: 'Furnace', cat: 'placeable', stack: 5, desc: 'Smelt ore into bars.', icon: { shape: 'furnace', color: '#6a6660', accent: '#ff6a20' }, place: 'furnace', value: 20 }),
  I({ id: 'anvil', name: 'Anvil', cat: 'placeable', stack: 5, desc: 'Forge metal tools.', icon: { shape: 'anvil', color: '#5a5a62' }, place: 'anvil', value: 60 })
);

export interface Recipe { out: string; n: number; inputs: [string, number][]; station: Station; time?: number; }
const R = (out: string, n: number, station: Station, ...inputs: [string, number][]): Recipe => ({ out, n, inputs, station });
export const RECIPES: Recipe[] = [
  R('planks', 4, 'hand', ['log', 1]), R('planks', 4, 'hand', ['birch_log', 1]), R('planks', 4, 'hand', ['pine_log', 1]),
  R('stick', 4, 'hand', ['planks', 1]),
  R('rope', 1, 'hand', ['fiber', 3]), R('rope', 1, 'hand', ['reed', 2]),
  R('stone_knife', 1, 'hand', ['flint', 1], ['stick', 1], ['fiber', 2]),
  R('torch', 4, 'hand', ['stick', 1], ['coal', 1]), R('torch', 2, 'hand', ['stick', 1], ['resin', 1]),
  R('workbench', 1, 'hand', ['planks', 6]),
  R('campfire', 1, 'hand', ['stone', 4], ['stick', 3]),
  R('poultice', 1, 'hand', ['moonpetal', 1], ['fern', 2]),
  R('wood_pickaxe', 1, 'workbench', ['planks', 3], ['stick', 2]),
  R('wood_axe', 1, 'workbench', ['planks', 3], ['stick', 2]),
  R('wood_shovel', 1, 'workbench', ['planks', 1], ['stick', 2]),
  R('stone_pickaxe', 1, 'workbench', ['stone', 3], ['stick', 2], ['rope', 1]),
  R('stone_axe', 1, 'workbench', ['stone', 3], ['stick', 2], ['rope', 1]),
  R('stone_shovel', 1, 'workbench', ['stone', 1], ['stick', 2], ['rope', 1]),
  R('stone_sickle', 1, 'workbench', ['flint', 2], ['stick', 1], ['rope', 1]),
  R('furnace', 1, 'workbench', ['stone', 12], ['clay', 2]),
  R('anvil', 1, 'workbench', ['iron_bar', 5]),
  R('copper_bar', 1, 'furnace', ['copper_ore', 2], ['coal', 1]),
  R('iron_bar', 1, 'furnace', ['iron_ore', 2], ['coal', 1]),
  R('silver_bar', 1, 'furnace', ['silver_ore', 2], ['coal', 1]),
  R('gold_bar', 1, 'furnace', ['gold_ore', 2], ['coal', 1]),
  R('mithril_bar', 1, 'furnace', ['mithril_ore', 3], ['coal', 2]),
  R('glass', 2, 'furnace', ['sand', 2]), R('brick', 2, 'furnace', ['clay', 2]),
  R('coal', 1, 'furnace', ['log', 2]),
  R('copper_pickaxe', 1, 'anvil', ['copper_bar', 3], ['stick', 2]), R('copper_axe', 1, 'anvil', ['copper_bar', 3], ['stick', 2]), R('copper_shovel', 1, 'anvil', ['copper_bar', 1], ['stick', 2]),
  R('iron_pickaxe', 1, 'anvil', ['iron_bar', 3], ['stick', 2]), R('iron_axe', 1, 'anvil', ['iron_bar', 3], ['stick', 2]), R('iron_shovel', 1, 'anvil', ['iron_bar', 1], ['stick', 2]),
  R('mithril_pickaxe', 1, 'anvil', ['mithril_bar', 3], ['iron_bar', 1], ['stick', 2]), R('mithril_axe', 1, 'anvil', ['mithril_bar', 3], ['iron_bar', 1], ['stick', 2]), R('mithril_shovel', 1, 'anvil', ['mithril_bar', 1], ['stick', 2]),
  R('roast_mushroom', 1, 'campfire', ['mushroom', 1]),
  R('cooked_meat', 1, 'campfire', ['raw_meat', 1]),
  R('club', 1, 'hand', ['log', 1]),
  R('flint_spear', 1, 'hand', ['stick', 2], ['flint', 1], ['rope', 1]),
  R('bandage', 2, 'hand', ['fiber', 3], ['fern', 1]),
  R('antidote', 1, 'campfire', ['glowcap', 1], ['berries', 2]),
  R('leather', 1, 'workbench', ['hide', 2]),
  R('wooden_shield', 1, 'workbench', ['planks', 4], ['leather', 1]),
  R('iron_sword', 1, 'anvil', ['iron_bar', 3], ['leather', 1]),
  R('iron_mace', 1, 'anvil', ['iron_bar', 4], ['stick', 1]),
  R('iron_shield', 1, 'anvil', ['iron_bar', 3], ['planks', 2], ['leather', 1]),
  R('silver_sword', 1, 'anvil', ['silver_bar', 3], ['iron_bar', 1], ['leather', 1]),
  R('berry_mash', 1, 'campfire', ['berries', 3])
];
// copper tools can also be made at a workbench before you own an anvil
RECIPES.push(R('copper_pickaxe', 1, 'workbench', ['copper_bar', 4], ['stick', 2]));
// ---- weapons and armour (M11)
RECIPES.push(
  R('arrow', 8, 'workbench', ['stick', 4], ['flint', 2], ['fiber', 2]),
  R('hunting_bow', 1, 'workbench', ['log', 1], ['rope', 2]),
  R('round_shield', 1, 'workbench', ['planks', 3], ['leather', 1]),
  R('spiked_club', 1, 'workbench', ['log', 1], ['fang', 3]),
  R('leather_cap', 1, 'workbench', ['leather', 2], ['fiber', 2]), R('leather_jerkin', 1, 'workbench', ['leather', 5], ['fiber', 4]),
  R('leather_breeches', 1, 'workbench', ['leather', 4], ['fiber', 3]), R('leather_boots', 1, 'workbench', ['leather', 2], ['fiber', 2]),
  R('leather_gloves', 1, 'workbench', ['leather', 1], ['fiber', 2]), R('travel_cloak', 1, 'workbench', ['fiber', 12], ['leather', 1]),
  R('iron_dagger', 1, 'anvil', ['iron_bar', 1], ['leather', 1]), R('iron_spear', 1, 'anvil', ['iron_bar', 2], ['stick', 2]),
  R('saber', 1, 'anvil', ['iron_bar', 3], ['leather', 1]), R('long_sword', 1, 'anvil', ['iron_bar', 4], ['leather', 1]),
  R('battle_axe', 1, 'anvil', ['iron_bar', 4], ['log', 1]), R('war_hammer', 1, 'anvil', ['iron_bar', 5], ['log', 1]),
  R('morning_star', 1, 'anvil', ['iron_bar', 4], ['stick', 2]), R('kite_shield', 1, 'anvil', ['iron_bar', 3], ['planks', 3], ['leather', 1]),
  R('crossbow', 1, 'anvil', ['iron_bar', 2], ['planks', 3], ['rope', 2]), R('long_bow', 1, 'workbench', ['pine_log', 2], ['rope', 3], ['leather', 1]),
  R('iron_helm', 1, 'anvil', ['iron_bar', 3]), R('iron_cuirass', 1, 'anvil', ['iron_bar', 7], ['leather', 2]),
  R('iron_greaves', 1, 'anvil', ['iron_bar', 5], ['leather', 1]), R('iron_sabatons', 1, 'anvil', ['iron_bar', 3]),
  R('iron_gauntlets', 1, 'anvil', ['iron_bar', 2], ['leather', 1]), R('iron_ring', 1, 'anvil', ['iron_bar', 1]),
  R('silver_ring', 1, 'anvil', ['silver_bar', 1]),
  R('mithril_circlet', 1, 'anvil', ['mithril_bar', 2], ['moonstone', 1]), R('mithril_mail', 1, 'anvil', ['mithril_bar', 6], ['leather', 2]),
  R('mithril_leggings', 1, 'anvil', ['mithril_bar', 4], ['leather', 1]), R('mithril_boots', 1, 'anvil', ['mithril_bar', 3]),
  R('mithril_gloves', 1, 'anvil', ['mithril_bar', 2], ['leather', 1])
);

// ---- gathering tables
/** Terrain material → [item, chance per dug grid point, required tool tier, soft (shovel-friendly)] */
export const MINE: Record<number, { item: string; chance: number; tier: number; soft: boolean }> = {
  [B.GRASS]: { item: 'dirt', chance: 0.25, tier: 0, soft: true }, [B.DIRT]: { item: 'dirt', chance: 0.3, tier: 0, soft: true },
  [B.FOREST_FLOOR]: { item: 'dirt', chance: 0.25, tier: 0, soft: true }, [B.DRY_GRASS]: { item: 'dirt', chance: 0.25, tier: 0, soft: true },
  [B.SWAMP_GRASS]: { item: 'dirt', chance: 0.25, tier: 0, soft: true }, [B.TUNDRA]: { item: 'dirt', chance: 0.25, tier: 0, soft: true },
  [B.MYCELIUM]: { item: 'dirt', chance: 0.25, tier: 0, soft: true }, [B.MUD]: { item: 'clay', chance: 0.12, tier: 0, soft: true },
  [B.SNOW_GRASS]: { item: 'snowball', chance: 0.3, tier: 0, soft: true }, [B.SNOW]: { item: 'snowball', chance: 0.3, tier: 0, soft: true },
  [B.SAND]: { item: 'sand', chance: 0.35, tier: 0, soft: true }, [B.RED_SAND]: { item: 'red_sand', chance: 0.35, tier: 0, soft: true },
  [B.GRAVEL]: { item: 'gravel', chance: 0.3, tier: 0, soft: true }, [B.CLAY]: { item: 'clay', chance: 0.35, tier: 0, soft: true },
  [B.ASH]: { item: 'ash', chance: 0.3, tier: 0, soft: true },
  [B.STONE]: { item: 'stone', chance: 0.35, tier: 1, soft: false }, [B.CLIFF]: { item: 'stone', chance: 0.35, tier: 1, soft: false },
  [B.MOSS_STONE]: { item: 'stone', chance: 0.35, tier: 1, soft: false }, [B.RED_ROCK]: { item: 'stone', chance: 0.3, tier: 1, soft: false },
  [B.BASALT]: { item: 'basalt', chance: 0.3, tier: 2, soft: false }, [B.COBBLE]: { item: 'stone', chance: 0.4, tier: 1, soft: false },
  [B.COAL_ORE]: { item: 'coal', chance: 0.55, tier: 1, soft: false }, [B.COPPER_ORE]: { item: 'copper_ore', chance: 0.5, tier: 1, soft: false },
  [B.IRON_ORE]: { item: 'iron_ore', chance: 0.45, tier: 2, soft: false }, [B.SILVER_ORE]: { item: 'silver_ore', chance: 0.4, tier: 3, soft: false },
  [B.GOLD_ORE]: { item: 'gold_ore', chance: 0.4, tier: 3, soft: false }, [B.MITHRIL_ORE]: { item: 'mithril_ore', chance: 0.35, tier: 4, soft: false },
  [B.MOONSTONE_ORE]: { item: 'moonstone', chance: 0.3, tier: 5, soft: false }, [B.CRYSTAL]: { item: 'crystal_shard', chance: 0.4, tier: 3, soft: false },
  [B.ICE]: { item: 'snowball', chance: 0.2, tier: 1, soft: false }
};
/** Tree kind → logs and extras when felled. */
export const TREE_DROPS: Record<number, { hp: number; drops: [string, number, number][] }> = {
  [Tree.Oak]: { hp: 7, drops: [['log', 3, 5], ['stick', 1, 3], ['resin', 0, 1]] },
  [Tree.DarkOak]: { hp: 9, drops: [['log', 4, 6], ['stick', 1, 3], ['resin', 0, 2]] },
  [Tree.Birch]: { hp: 6, drops: [['birch_log', 3, 5], ['stick', 1, 2]] },
  [Tree.Pine]: { hp: 8, drops: [['pine_log', 4, 6], ['resin', 1, 2], ['stick', 1, 2]] },
  [Tree.SnowPine]: { hp: 8, drops: [['pine_log', 4, 6], ['resin', 1, 2]] },
  [Tree.Dead]: { hp: 4, drops: [['log', 1, 2], ['stick', 3, 5]] },
  [Tree.GiantMushroom]: { hp: 6, drops: [['glowcap', 2, 4], ['mushroom', 2, 4]] },
  [Tree.Palm]: { hp: 6, drops: [['log', 2, 3], ['fiber', 2, 4]] },
  [Tree.CrystalTree]: { hp: 10, drops: [['crystal_shard', 3, 6]] },
  [Tree.Cactus]: { hp: 3, drops: [['cactus_flesh', 2, 3]] },
  [Tree.Willow]: { hp: 7, drops: [['log', 3, 4], ['fiber', 2, 4]] }
};
/** Plant kind → harvest result. */
export const PLANT_DROPS: Record<number, { verb: string; drops: [string, number, number][]; tool?: ToolKind }> = {
  [Plant.Grass]: { verb: 'Cut grass', drops: [['fiber', 1, 2]] },
  [Plant.TallGrass]: { verb: 'Cut grass', drops: [['fiber', 2, 3]] },
  [Plant.Flower]: { verb: 'Pick flower', drops: [['petals', 1, 1]] },
  [Plant.Fern]: { verb: 'Pick fern', drops: [['fern', 1, 2], ['fiber', 0, 1]] },
  [Plant.Bush]: { verb: 'Gather', drops: [['stick', 1, 2], ['fiber', 1, 2]] },
  [Plant.BerryBush]: { verb: 'Pick berries', drops: [['berries', 2, 4]] },
  [Plant.Reeds]: { verb: 'Cut reeds', drops: [['reed', 2, 3]] },
  [Plant.DeadBush]: { verb: 'Gather sticks', drops: [['stick', 2, 3]] },
  [Plant.Mushroom]: { verb: 'Pick mushroom', drops: [['mushroom', 1, 2]] },
  [Plant.GlowMushroom]: { verb: 'Pick glowcap', drops: [['glowcap', 1, 2]] },
  [Plant.Rock]: { verb: 'Pick up stones', drops: [['stone', 2, 3], ['flint', 0, 1]] },
  [Plant.Crystal]: { verb: 'Break crystal', drops: [['crystal_shard', 1, 3]] },
  [Plant.Moonpetal]: { verb: 'Pick moonpetal', drops: [['moonpetal', 1, 1]] }
};

export const item = (id: string) => ITEMS[id];

/** Melee stats of whatever is held (bare hands if nothing / non-weapon). */
export function weaponOf(id: string | null | undefined): WeaponStats {
  const d = id ? ITEMS[id] : undefined;
  if (d?.weapon) return d.weapon;
  const k = d?.tool?.kind, tier = d?.tool?.tier ?? 0;
  if (k === 'axe') return W(6 + tier * 3, 'slash', 2.1, 0.95, 7);
  if (k === 'pickaxe') return W(5 + tier * 2.5, 'pierce', 2.1, 0.9, 7);
  if (k === 'shovel') return W(4 + tier * 2, 'blunt', 2.1, 0.9, 6);
  if (k === 'knife') return W(6, 'pierce', 1.6, 1.4, 4);
  if (k === 'sickle') return W(6, 'slash', 1.8, 1.25, 5);
  if (k === 'staff') return W(6, 'blunt', 2.4, 1.05, 5);
  if (k === 'torch') return W(4, 'fire', 1.8, 1.1, 5);
  return W(3, 'blunt', 1.6, 1.3, 4);
}
