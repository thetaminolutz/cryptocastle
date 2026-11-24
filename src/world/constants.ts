export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 128;
export const SEA_LEVEL = 50;
export const ATLAS_TILES = 16;      // tiles per row
export const TILE_PX = 16;
export const ATLAS_PX = ATLAS_TILES * TILE_PX;

export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
/** index into a chunk's voxel array: x + z*16 + y*256 */
export const vIndex = (x: number, y: number, z: number) => x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
