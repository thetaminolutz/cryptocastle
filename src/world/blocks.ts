// Material table (data). Every grid point of the world stores one material id.
// `top` = texture layer used on flat ground, `side` = layer used on steep slopes.
// IDs are stored in saves: never renumber existing ones, only append.

export interface BlockDef {
  id: number;
  name: string;
  top: string; side: string;
  liquid?: boolean;
  light?: number;     // emitted light 0..15 (baked into the light flood fill)
  glow?: number;      // self-illumination in the shader 0..1
  hardness?: number;  // seconds to mine by hand (from M5)
  grassy?: boolean;   // grass/flowers may grow on it
}

const D = (id: number, name: string, top: string, side = top, extra: Partial<BlockDef> = {}): BlockDef =>
  ({ id, name, top, side, hardness: 1, ...extra });

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, OAK_LOG: 6, OAK_LEAVES: 7,
  BEDROCK: 8, GRAVEL: 9, SNOW: 10, COAL_ORE: 11, IRON_ORE: 12, COBBLE: 13, PLANKS: 14,
  PINE_LOG: 15, PINE_LEAVES: 16, BIRCH_LOG: 17, BIRCH_LEAVES: 18, SNOW_GRASS: 19, ICE: 20,
  MOSS_STONE: 21, LAVA: 22, CLAY: 23,
  DRY_GRASS: 24, FOREST_FLOOR: 25, MUD: 26, RED_SAND: 27, RED_ROCK: 28, ASH: 29, BASALT: 30,
  CRYSTAL: 31, COPPER_ORE: 32, SILVER_ORE: 33, GOLD_ORE: 34, MITHRIL_ORE: 35, MOONSTONE_ORE: 36,
  SWAMP_GRASS: 37, TUNDRA: 38, CLIFF: 39, MYCELIUM: 40
} as const;

export const BLOCKS: BlockDef[] = [
  D(B.AIR, 'Air', 'stone'),
  D(B.GRASS, 'Grass', 'grass', 'dirt', { grassy: true }),
  D(B.DIRT, 'Dirt', 'dirt'),
  D(B.STONE, 'Stone', 'stone', 'stone', { hardness: 3 }),
  D(B.SAND, 'Sand', 'sand'),
  D(B.WATER, 'Water', 'sand', 'sand', { liquid: true }),
  D(B.OAK_LOG, 'Oak Log', 'wood_end', 'bark_oak'),
  D(B.OAK_LEAVES, 'Oak Leaves', 'grass'),
  D(B.BEDROCK, 'Bedrock', 'basalt', 'basalt', { hardness: Infinity }),
  D(B.GRAVEL, 'Gravel', 'gravel'),
  D(B.SNOW, 'Snow', 'snow', 'snow'),
  D(B.COAL_ORE, 'Coal Ore', 'ore_coal', 'ore_coal', { hardness: 4 }),
  D(B.IRON_ORE, 'Iron Ore', 'ore_iron', 'ore_iron', { hardness: 5 }),
  D(B.COBBLE, 'Cobblestone', 'cobble', 'cobble', { hardness: 3 }),
  D(B.PLANKS, 'Planks', 'planks'),
  D(B.PINE_LOG, 'Pine Log', 'wood_end', 'bark_pine'),
  D(B.PINE_LEAVES, 'Pine Needles', 'grass'),
  D(B.BIRCH_LOG, 'Birch Log', 'wood_end', 'bark_birch'),
  D(B.BIRCH_LEAVES, 'Birch Leaves', 'grass'),
  D(B.SNOW_GRASS, 'Snowy Grass', 'snow', 'dirt'),
  D(B.ICE, 'Ice', 'ice', 'ice', { liquid: true }),
  D(B.MOSS_STONE, 'Mossy Stone', 'moss_stone', 'moss_stone', { hardness: 3 }),
  D(B.LAVA, 'Lava', 'lava', 'lava', { liquid: true, light: 15, glow: 1 }),
  D(B.CLAY, 'Clay', 'clay'),
  D(B.DRY_GRASS, 'Dry Grass', 'dry_grass', 'dirt', { grassy: true }),
  D(B.FOREST_FLOOR, 'Forest Floor', 'forest_floor', 'dirt', { grassy: true }),
  D(B.MUD, 'Mud', 'mud'),
  D(B.RED_SAND, 'Red Sand', 'red_sand', 'red_rock'),
  D(B.RED_ROCK, 'Red Rock', 'red_rock', 'red_rock', { hardness: 3 }),
  D(B.ASH, 'Ash', 'ash', 'basalt'),
  D(B.BASALT, 'Basalt', 'basalt', 'basalt', { hardness: 4 }),
  D(B.CRYSTAL, 'Crystal', 'crystal', 'crystal', { light: 11, glow: 0.7, hardness: 4 }),
  D(B.COPPER_ORE, 'Copper Ore', 'ore_copper', 'ore_copper', { hardness: 4 }),
  D(B.SILVER_ORE, 'Silver Ore', 'ore_silver', 'ore_silver', { hardness: 5 }),
  D(B.GOLD_ORE, 'Gold Ore', 'ore_gold', 'ore_gold', { hardness: 5 }),
  D(B.MITHRIL_ORE, 'Mithril Ore', 'ore_mithril', 'ore_mithril', { hardness: 7, light: 4, glow: 0.25 }),
  D(B.MOONSTONE_ORE, 'Moonstone Ore', 'ore_moonstone', 'ore_moonstone', { hardness: 8, light: 6, glow: 0.4 }),
  D(B.SWAMP_GRASS, 'Swamp Grass', 'swamp_grass', 'mud', { grassy: true }),
  D(B.TUNDRA, 'Tundra', 'tundra', 'dirt', { grassy: true }),
  D(B.CLIFF, 'Cliff Rock', 'cliff_rock', 'cliff_rock', { hardness: 3 }),
  D(B.MYCELIUM, 'Mycelium', 'mycelium', 'dirt', { grassy: true, glow: 0.12 })
];

export const MAX_MATERIALS = 64;
