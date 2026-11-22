// Block definitions (data table). Tile indices refer to the procedural atlas (atlas.ts).
// To add a block: add a tile painter in atlas.ts, then a row here. IDs are stored in
// saves, so never renumber existing blocks – only append.

export const enum Render { Air = 0, Opaque = 1, Cutout = 2, Liquid = 3 }

export interface BlockDef {
  id: number;
  name: string;
  top: string; side: string; bottom: string;
  render: Render;
  solid: boolean;      // collides with entities
  light?: number;      // emitted block light 0..15
  hardness?: number;   // seconds to break by hand (used from M5)
}

const T = (id: number, name: string, tex: string | [string, string, string], render = Render.Opaque, extra: Partial<BlockDef> = {}): BlockDef => {
  const [top, side, bottom] = typeof tex === 'string' ? [tex, tex, tex] : tex;
  return { id, name, top, side, bottom, render, solid: render === Render.Opaque || render === Render.Cutout, hardness: 1, ...extra };
};

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, OAK_LOG: 6, OAK_LEAVES: 7,
  BEDROCK: 8, GRAVEL: 9, SNOW: 10, COAL_ORE: 11, IRON_ORE: 12, COBBLE: 13, PLANKS: 14,
  PINE_LOG: 15, PINE_LEAVES: 16, BIRCH_LOG: 17, BIRCH_LEAVES: 18, SNOW_GRASS: 19, ICE: 20,
  MOSS_STONE: 21, LAVA: 22, CLAY: 23
} as const;

export const BLOCKS: BlockDef[] = [
  T(B.AIR, 'Air', 'stone', Render.Air, { solid: false }),
  T(B.GRASS, 'Grass', ['grass_top', 'grass_side', 'dirt']),
  T(B.DIRT, 'Dirt', 'dirt'),
  T(B.STONE, 'Stone', 'stone', Render.Opaque, { hardness: 3 }),
  T(B.SAND, 'Sand', 'sand'),
  T(B.WATER, 'Water', 'water', Render.Liquid, { solid: false }),
  T(B.OAK_LOG, 'Oak Log', ['oak_log_top', 'oak_log', 'oak_log_top']),
  T(B.OAK_LEAVES, 'Oak Leaves', 'oak_leaves', Render.Cutout),
  T(B.BEDROCK, 'Bedrock', 'bedrock', Render.Opaque, { hardness: Infinity }),
  T(B.GRAVEL, 'Gravel', 'gravel'),
  T(B.SNOW, 'Snow', 'snow'),
  T(B.COAL_ORE, 'Coal Ore', 'coal_ore', Render.Opaque, { hardness: 4 }),
  T(B.IRON_ORE, 'Iron Ore', 'iron_ore', Render.Opaque, { hardness: 5 }),
  T(B.COBBLE, 'Cobblestone', 'cobble', Render.Opaque, { hardness: 3 }),
  T(B.PLANKS, 'Planks', 'planks'),
  T(B.PINE_LOG, 'Pine Log', ['pine_log_top', 'pine_log', 'pine_log_top']),
  T(B.PINE_LEAVES, 'Pine Needles', 'pine_leaves', Render.Cutout),
  T(B.BIRCH_LOG, 'Birch Log', ['birch_log_top', 'birch_log', 'birch_log_top']),
  T(B.BIRCH_LEAVES, 'Birch Leaves', 'birch_leaves', Render.Cutout),
  T(B.SNOW_GRASS, 'Snowy Grass', ['snow', 'snow_side', 'dirt']),
  T(B.ICE, 'Ice', 'ice'),
  T(B.MOSS_STONE, 'Mossy Stone', 'moss_stone', Render.Opaque, { hardness: 3 }),
  T(B.LAVA, 'Lava', 'lava', Render.Liquid, { solid: false, light: 15 }),
  T(B.CLAY, 'Clay', 'clay')
];
