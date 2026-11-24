// Building pieces (data). Grid = 2 m, wall height = 2.4 m.
// snap: 'cell' = centre of a 2x2 cell, 'edge' = on a cell edge, 'corner' = grid corner,
// 'free' = anywhere (furniture, 0.25 m steps).
export const GRID = 2;
export const WALL_H = 2.4;

export type Snap = 'cell' | 'edge' | 'corner' | 'free';
export type PieceCat = 'structure' | 'furniture' | 'light';
export type PieceUse = 'door' | 'bed' | 'chest' | 'sit' | 'claim' | 'tablet' | 'rite' | 'gate' | 'board' | 'waystone' | 'stash' | 'hoard' | 'loot' | 'fresco' | 'plinth' | 'altar_judge' | 'grave' | 'meteor' | 'caravan' | 'lore';

/** Local axis-aligned collision box: [minX, minY, minZ, maxX, maxY, maxZ] (rot 0, facing -Z). */
export type Box = [number, number, number, number, number, number];

export interface PieceDef {
  id: string; name: string; cat: PieceCat; snap: Snap;
  cost: [string, number][];
  boxes: Box[];
  /** height of the walkable top relative to the anchor (for stacking) */
  top: number;
  light?: [number, number, number, number];   // r, g, b (HDR), radius
  use?: PieceUse;
  icon: string;
  /** generated only (villages); not in the build catalogue */
  hidden?: boolean;
}

const steps = (n: number, w: number, d: number, h: number): Box[] =>
  Array.from({ length: n }, (_, i) => [-w / 2, 0, d / 2 - (d / n) * (i + 1), w / 2, (h / n) * (i + 1), d / 2 - (d / n) * i] as Box);

export const PIECES: Record<string, PieceDef> = {};
const P = (d: PieceDef) => { PIECES[d.id] = d; };

// ---- structure (wood)
P({ id: 'floor', name: 'Wooden Floor', cat: 'structure', snap: 'cell', cost: [['planks', 2]], boxes: [[-1, -0.2, -1, 1, 0, 1]], top: 0, icon: 'floor' });
P({ id: 'wall', name: 'Wooden Wall', cat: 'structure', snap: 'edge', cost: [['planks', 3]], boxes: [[-1, 0, -0.1, 1, WALL_H, 0.1]], top: WALL_H, icon: 'wall' });
P({ id: 'half_wall', name: 'Half Wall', cat: 'structure', snap: 'edge', cost: [['planks', 2]], boxes: [[-1, 0, -0.1, 1, 1.2, 0.1]], top: 1.2, icon: 'halfwall' });
P({ id: 'window_wall', name: 'Window Wall', cat: 'structure', snap: 'edge', cost: [['planks', 3], ['stick', 2]], boxes: [[-1, 0, -0.1, 1, 0.9, 0.1], [-1, 1.8, -0.1, 1, WALL_H, 0.1], [-1, 0, -0.1, -0.5, WALL_H, 0.1], [0.5, 0, -0.1, 1, WALL_H, 0.1]], top: WALL_H, icon: 'window' });
P({ id: 'door_wall', name: 'Door', cat: 'structure', snap: 'edge', cost: [['planks', 4], ['stick', 2]], boxes: [[-1, 0, -0.1, -0.5, WALL_H, 0.1], [0.5, 0, -0.1, 1, WALL_H, 0.1], [-1, 2.05, -0.1, 1, WALL_H, 0.1]], top: WALL_H, use: 'door', icon: 'door' });
P({ id: 'roof', name: 'Shingle Roof', cat: 'structure', snap: 'cell', cost: [['planks', 2], ['stick', 1]], boxes: steps(4, 2, 2, 1.6), top: 1.6, icon: 'roof' });
P({ id: 'thatch_roof', name: 'Thatch Roof', cat: 'structure', snap: 'cell', cost: [['fiber', 6], ['stick', 2]], boxes: steps(4, 2, 2, 1.6), top: 1.6, icon: 'roof' });
P({ id: 'gable', name: 'Gable', cat: 'structure', snap: 'edge', cost: [['planks', 2]], boxes: [[-1, 0, -0.08, 1, 0.8, 0.08], [0, 0.8, -0.08, 1, 1.6, 0.08]], top: 1.6, icon: 'gable' });
P({ id: 'stairs', name: 'Stairs', cat: 'structure', snap: 'cell', cost: [['planks', 3]], boxes: steps(8, 1.8, 2, WALL_H), top: WALL_H, icon: 'stairs' });
P({ id: 'pillar', name: 'Pillar', cat: 'structure', snap: 'corner', cost: [['log', 1]], boxes: [[-0.17, 0, -0.17, 0.17, WALL_H, 0.17]], top: WALL_H, icon: 'pillar' });
P({ id: 'fence', name: 'Fence', cat: 'structure', snap: 'edge', cost: [['stick', 2], ['planks', 1]], boxes: [[-1, 0, -0.06, 1, 1.0, 0.06]], top: 1, icon: 'fence' });
// ---- structure (stone)
P({ id: 'stone_floor', name: 'Stone Floor', cat: 'structure', snap: 'cell', cost: [['stone', 3]], boxes: [[-1, -0.25, -1, 1, 0, 1]], top: 0, icon: 'floor' });
P({ id: 'stone_wall', name: 'Stone Wall', cat: 'structure', snap: 'edge', cost: [['stone', 5]], boxes: [[-1, 0, -0.15, 1, WALL_H, 0.15]], top: WALL_H, icon: 'wall' });
P({ id: 'brick_wall', name: 'Brick Wall', cat: 'structure', snap: 'edge', cost: [['brick', 4]], boxes: [[-1, 0, -0.15, 1, WALL_H, 0.15]], top: WALL_H, icon: 'wall' });
// ---- furniture
P({ id: 'bed', name: 'Bed', cat: 'furniture', snap: 'free', cost: [['planks', 4], ['fiber', 6]], boxes: [[-0.55, 0, -1.05, 0.55, 0.55, 1.05]], top: 0.55, use: 'bed', icon: 'bed' });
P({ id: 'chest', name: 'Chest', cat: 'furniture', snap: 'free', cost: [['planks', 6]], boxes: [[-0.45, 0, -0.3, 0.45, 0.6, 0.3]], top: 0.6, use: 'chest', icon: 'chest' });
P({ id: 'table', name: 'Table', cat: 'furniture', snap: 'free', cost: [['planks', 4]], boxes: [[-0.8, 0, -0.5, 0.8, 0.8, 0.5]], top: 0.8, icon: 'table' });
P({ id: 'chair', name: 'Chair', cat: 'furniture', snap: 'free', cost: [['planks', 2]], boxes: [[-0.25, 0, -0.25, 0.25, 0.5, 0.25]], top: 0.5, use: 'sit', icon: 'chair' });
P({ id: 'shelf', name: 'Shelf', cat: 'furniture', snap: 'free', cost: [['planks', 3]], boxes: [[-0.7, 0, -0.18, 0.7, 1.8, 0.18]], top: 1.8, icon: 'shelf' });
P({ id: 'carpet', name: 'Carpet', cat: 'furniture', snap: 'free', cost: [['fiber', 8], ['petals', 1]], boxes: [], top: 0.02, icon: 'carpet' });
P({ id: 'banner', name: 'Banner', cat: 'furniture', snap: 'free', cost: [['fiber', 4], ['stick', 2], ['petals', 1]], boxes: [[-0.1, 0, -0.1, 0.1, 2.4, 0.1]], top: 2.4, icon: 'banner' });
P({ id: 'painting', name: 'Painting', cat: 'furniture', snap: 'free', cost: [['planks', 1], ['petals', 2]], boxes: [], top: 0, icon: 'painting' });
P({ id: 'weapon_rack', name: 'Weapon Rack', cat: 'furniture', snap: 'free', cost: [['planks', 3], ['stick', 2]], boxes: [[-0.6, 0, -0.15, 0.6, 1.4, 0.15]], top: 1.4, icon: 'rack' });
P({ id: 'plant_pot', name: 'Plant Pot', cat: 'furniture', snap: 'free', cost: [['clay', 2], ['petals', 1]], boxes: [[-0.2, 0, -0.2, 0.2, 0.5, 0.2]], top: 0.5, icon: 'pot' });
P({ id: 'claim_stone', name: 'Boundary Stone', cat: 'furniture', snap: 'free', cost: [['stone', 12], ['rope', 2]], boxes: [[-0.3, 0, -0.3, 0.3, 1.3, 0.3]], top: 1.3, use: 'claim', icon: 'claim' });
// ---- light
P({ id: 'fireplace', name: 'Fireplace', cat: 'light', snap: 'free', cost: [['stone', 10], ['log', 1]], boxes: [[-0.9, 0, -0.45, 0.9, 2.4, 0.45]], top: 2.4, light: [3.4, 1.7, 0.6, 12], icon: 'fireplace' });
P({ id: 'wall_torch', name: 'Wall Torch', cat: 'light', snap: 'free', cost: [['torch', 1]], boxes: [], top: 0, light: [2.6, 1.4, 0.55, 9], icon: 'torch' });
P({ id: 'lantern', name: 'Lantern Post', cat: 'light', snap: 'free', cost: [['iron_bar', 1], ['glass', 1], ['torch', 1], ['stick', 2]], boxes: [[-0.1, 0, -0.1, 0.1, 2.2, 0.1]], top: 2.2, light: [2.8, 2.0, 1.1, 13], icon: 'lantern' });

// ---- village-only pieces
P({ id: 'well', name: 'Well', cat: 'structure', snap: 'free', cost: [], boxes: [[-0.95, 0, -0.95, 0.95, 0.85, 0.95]], top: 0.85, icon: 'pot', hidden: true });
P({ id: 'stall', name: 'Market Stall', cat: 'furniture', snap: 'free', cost: [], boxes: [[-1, 0, -0.35, 1, 0.9, 0.35]], top: 0.9, icon: 'table', hidden: true });
P({ id: 'crops', name: 'Crops', cat: 'furniture', snap: 'free', cost: [], boxes: [], top: 0, icon: 'carpet', hidden: true });
P({ id: 'altar', name: 'Altar', cat: 'furniture', snap: 'free', cost: [], boxes: [[-0.8, 0, -0.35, 0.8, 1.05, 0.35]], top: 1.05, light: [1.6, 1.2, 0.6, 7], icon: 'table', hidden: true });
P({ id: 'pew', name: 'Pew', cat: 'furniture', snap: 'free', cost: [], boxes: [[-0.8, 0, -0.22, 0.8, 0.5, 0.22]], top: 0.5, use: 'sit', icon: 'chair', hidden: true });
P({ id: 'anvil_piece', name: 'Anvil', cat: 'furniture', snap: 'free', cost: [], boxes: [[-0.35, 0, -0.25, 0.35, 0.85, 0.25]], top: 0.85, icon: 'table', hidden: true });
P({ id: 'forge', name: 'Forge', cat: 'light', snap: 'free', cost: [], boxes: [[-0.7, 0, -0.5, 0.7, 0.95, 0.5]], top: 0.95, light: [3, 1.4, 0.4, 9], icon: 'fireplace', hidden: true });

// ---- the Tower of the First Rite
P({ id: 'tablet', name: 'Copper Tablet', cat: 'furniture', snap: 'free', cost: [], boxes: [], top: 0, use: 'tablet', icon: 'painting', hidden: true });
P({ id: 'rite_chest', name: 'Rusty Chest', cat: 'furniture', snap: 'free', cost: [], boxes: [[-0.45, 0, -0.3, 0.45, 0.6, 0.3]], top: 0.6, use: 'rite', icon: 'chest', hidden: true });
P({ id: 'flag_one', name: 'Faded Flag', cat: 'furniture', snap: 'free', cost: [], boxes: [], top: 0, icon: 'banner', hidden: true });
P({ id: 'straw', name: 'Straw', cat: 'furniture', snap: 'free', cost: [], boxes: [], top: 0, icon: 'carpet', hidden: true });
P({ id: 'bones', name: 'Bones', cat: 'furniture', snap: 'free', cost: [], boxes: [], top: 0, icon: 'carpet', hidden: true });

// ---- the Pale Citadel, the labyrinth, waystones, the graveyard
P({ id: 'marble_wall', name: 'White Stone Wall', cat: 'structure', snap: 'edge', cost: [], boxes: [[-1, 0, -0.3, 1, WALL_H, 0.3]], top: WALL_H, icon: 'wall', hidden: true });
P({ id: 'marble_half', name: 'White Parapet', cat: 'structure', snap: 'free', cost: [], boxes: [[-1, 0, -0.25, 1, 1.3, 0.25]], top: 1.3, icon: 'halfwall', hidden: true });
P({ id: 'crenel', name: 'Crenellation', cat: 'structure', snap: 'edge', cost: [], boxes: [[-1, 0, -0.3, 1, 0.9, 0.3]], top: 0.9, icon: 'wall', hidden: true });
P({ id: 'wall_tower', name: 'Wall Tower', cat: 'structure', snap: 'free', cost: [], boxes: [[-2.2, 0, -2.2, 2.2, 10, 2.2]], top: 10, icon: 'pillar', hidden: true, light: [2.6, 1.5, 0.6, 10] });
P({ id: 'citadel_gate', name: 'Sealed Gate', cat: 'structure', snap: 'free', cost: [], boxes: [[-4, 0, -0.5, 4, 5.4, 0.5]], top: 5.4, use: 'gate', icon: 'door', hidden: true });
P({ id: 'lab_arch', name: 'Labyrinth Arch', cat: 'structure', snap: 'free', cost: [], boxes: [[-2.6, 3.2, -0.6, 2.6, 4.0, 0.6]], top: 4, icon: 'door', hidden: true });
P({ id: 'quest_board', name: 'Quest Board', cat: 'furniture', snap: 'free', cost: [], boxes: [[-1, 0, -0.15, 1, 2.2, 0.15]], top: 2.2, use: 'board', icon: 'painting', hidden: true });
P({ id: 'waystone', name: 'Waystone', cat: 'furniture', snap: 'free', cost: [], boxes: [[-0.4, 0, -0.4, 0.4, 2.0, 0.4]], top: 2, use: 'waystone', icon: 'claim', hidden: true, light: [0.5, 0.9, 1.6, 6] });
P({ id: 'stash', name: 'Bank Vault', cat: 'furniture', snap: 'free', cost: [], boxes: [[-0.6, 0, -0.4, 0.6, 1.2, 0.4]], top: 1.2, use: 'stash', icon: 'chest', hidden: true });
P({ id: 'gravestone', name: 'Gravestone', cat: 'furniture', snap: 'free', cost: [], boxes: [[-0.35, 0, -0.1, 0.35, 0.9, 0.1]], top: 0.9, icon: 'claim', hidden: true });
P({ id: 'grave_pit', name: 'Open Grave', cat: 'furniture', snap: 'free', cost: [], boxes: [], top: 0, use: 'grave', icon: 'carpet', hidden: true });
P({ id: 'hoard_chest', name: 'Robbers\' Hoard', cat: 'furniture', snap: 'free', cost: [], boxes: [[-0.5, 0, -0.35, 0.5, 0.65, 0.35]], top: 0.65, use: 'hoard', icon: 'chest', hidden: true });

P({ id: 'loot_chest', name: 'Old Chest', cat: 'furniture', snap: 'free', cost: [], boxes: [[-0.5, 0, -0.35, 0.5, 0.65, 0.35]], top: 0.65, use: 'loot', icon: 'chest', hidden: true });
P({ id: 'cracked_wall', name: 'Cracked Wall', cat: 'furniture', snap: 'free', cost: [], boxes: [], top: 0, icon: 'wall', hidden: true });

P({ id: 'fresco', name: 'The Living Fresco', cat: 'furniture', snap: 'free', cost: [], boxes: [], top: 0, use: 'fresco', icon: 'painting', hidden: true });
P({ id: 'monument', name: 'Monument of Warning', cat: 'structure', snap: 'free', cost: [], boxes: [[-3.5, 0, -3.5, 3.5, 2.2, 3.5], [-1.4, 2.2, -1.4, 1.4, 11, 1.4]], top: 11, use: 'plinth', icon: 'pillar', hidden: true });
P({ id: 'black_wall', name: 'Black Wall', cat: 'structure', snap: 'edge', cost: [], boxes: [[-1, 0, -0.35, 1, WALL_H, 0.35]], top: WALL_H, icon: 'wall', hidden: true });
P({ id: 'black_spire', name: 'Black Spire', cat: 'structure', snap: 'free', cost: [], boxes: [[-4, 0, -4, 4, 2, 4]], top: 2, icon: 'pillar', hidden: true, light: [2.4, 0.6, 0.3, 14] });
P({ id: 'cathedral_spire', name: 'Cathedral Spire', cat: 'structure', snap: 'free', cost: [], boxes: [[-2.4, 0, -2.4, 2.4, 22, 2.4]], top: 22, icon: 'pillar', hidden: true });
P({ id: 'judgment_altar', name: 'Altar of Judgment', cat: 'furniture', snap: 'free', cost: [], boxes: [[-1.2, 0, -0.6, 1.2, 1.1, 0.6]], top: 1.1, use: 'altar_judge', icon: 'table', hidden: true, light: [2.6, 1.6, 0.6, 9] });
P({ id: 'rose_window', name: 'Rose Window', cat: 'furniture', snap: 'free', cost: [], boxes: [], top: 0, icon: 'painting', hidden: true });

P({ id: 'meteor', name: 'Fallen Star', cat: 'furniture', snap: 'free', cost: [], boxes: [[-0.9, 0, -0.9, 0.9, 1.0, 0.9]], top: 1, use: 'meteor', icon: 'pot', hidden: true, light: [1.2, 1.6, 2.6, 9] });
P({ id: 'caravan', name: 'Caravan Wagon', cat: 'furniture', snap: 'free', cost: [], boxes: [[-1.1, 0, -2, 1.1, 2.2, 2]], top: 2.2, use: 'caravan', icon: 'table', hidden: true, light: [2.4, 1.6, 0.7, 8] });

P({ id: 'lore_page', name: 'Lore Page', cat: 'furniture', snap: 'free', cost: [], boxes: [], top: 0, use: 'lore', icon: 'painting', hidden: true, light: [1.4, 1.2, 0.6, 3] });

export const CLAIM_RADIUS = 22;

/** Blueprints: pieces relative to the anchor cell (dx, dz in cells, y in m, edge side for walls). */
export interface PlanPiece { id: string; x: number; y: number; z: number; rot: number; }
export interface Blueprint { id: string; name: string; desc: string; pieces: PlanPiece[]; }

function hut(w: number, d: number, roof: string, name: string, id: string, desc: string): Blueprint {
  const out: PlanPiece[] = [];
  for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) out.push({ id: 'floor', x: i * 2 + 1, y: 0, z: k * 2 + 1, rot: 0 });
  for (let i = 0; i < w; i++) {
    out.push({ id: i === Math.floor(w / 2) ? 'door_wall' : 'wall', x: i * 2 + 1, y: 0, z: 0, rot: 0 });
    out.push({ id: i === 0 ? 'window_wall' : 'wall', x: i * 2 + 1, y: 0, z: d * 2, rot: Math.PI });
  }
  for (let k = 0; k < d; k++) {
    out.push({ id: k === 0 && d > 1 ? 'window_wall' : 'wall', x: 0, y: 0, z: k * 2 + 1, rot: Math.PI / 2 });
    out.push({ id: 'wall', x: w * 2, y: 0, z: k * 2 + 1, rot: -Math.PI / 2 });
  }
  // gable roof: two slopes meeting in the middle (depth direction), closed gable ends
  const half = Math.ceil(d / 2);
  for (let k = 0; k < d; k++) {
    const front = k < half, level = front ? k : d - 1 - k;
    for (const x of [0, w * 2]) out.push({ id: 'gable', x, y: WALL_H + level * 1.6, z: k * 2 + 1, rot: front ? -Math.PI / 2 : Math.PI / 2 });
  }
  for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) {
    const front = k < half;
    const level = front ? k : d - 1 - k;
    out.push({ id: roof, x: i * 2 + 1, y: WALL_H + level * 1.6, z: k * 2 + 1, rot: front ? Math.PI : 0 });
  }
  return { id, name, desc, pieces: out };
}

export const BLUEPRINTS: Blueprint[] = [
  hut(2, 2, 'thatch_roof', 'Woodcutter’s Hut', 'hut_small', 'A one-room hut with a door and a window. 4×4 m.'),
  hut(3, 2, 'roof', 'Cottage', 'cottage', 'A cosy cottage with a shingle roof. 6×4 m.'),
  hut(4, 4, 'roof', 'Longhouse', 'longhouse', 'A great hall for a growing homestead. 8×8 m.')
];
