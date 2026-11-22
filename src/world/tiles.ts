// Tile name → atlas index. Shared by main thread (atlas painter) and workers (mesher).
import { BLOCKS } from './blocks';

export const TILE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'water', 'oak_log', 'oak_log_top',
  'oak_leaves', 'bedrock', 'gravel', 'snow', 'coal_ore', 'iron_ore', 'cobble', 'planks',
  'pine_log', 'pine_log_top', 'pine_leaves', 'birch_log', 'birch_log_top', 'birch_leaves',
  'snow_side', 'ice', 'moss_stone', 'lava', 'clay'
] as const;
export type TileName = typeof TILE_NAMES[number];

export const TILE_INDEX: Record<string, number> = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i]));

/** Per block id: [top, side, bottom] tile index. */
export const BLOCK_TILES: Uint8Array = (() => {
  const a = new Uint8Array(256 * 3);
  for (const b of BLOCKS) {
    a[b.id * 3] = TILE_INDEX[b.top];
    a[b.id * 3 + 1] = TILE_INDEX[b.side];
    a[b.id * 3 + 2] = TILE_INDEX[b.bottom];
  }
  return a;
})();
