// Biome table (data). Each biome defines its ground materials, vegetation, animals,
// weather and fog. Terrain shape per biome lives in terrain.ts (biomeHeight).
import { B } from './blocks';

export const enum Biome {
  MoonlitForest, SunnyMeadows, DarkPine, MistySwamp, RedDesert, SnowyMountains, FrozenTundra,
  VolcanicAshlands, MushroomGrove, CoastalCliffs, HauntedMoor, SunkenForest, FloatingRocks,
  Ocean, Beach, CrystalCaves
}

export const enum Tree {
  Oak, Birch, Pine, SnowPine, Dead, GiantMushroom, Palm, CrystalTree, Cactus, Willow, DarkOak
}
export const TREE_KINDS = 11;

export const enum Plant {
  Grass, Flower, Fern, Bush, BerryBush, Reeds, DeadBush, Mushroom, GlowMushroom, Rock,
  Crystal, Moonpetal, TallGrass
}
export const PLANT_KINDS = 13;

export const enum Species { Rabbit, Deer, Boar, Wolf, Bear, Sheep, Goat, Horse, Bird, Fish }

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'sandstorm';

export interface BiomeDef {
  name: string;
  /** climate centre: temperature, moisture, weirdness */
  climate: [number, number, number] | null;
  top: number; filler: number; steep: number;
  trees: [Tree, number][];      // kind, relative weight
  treeDensity: number;          // chance per 6x6 m cell
  plants: [Plant, number][];    // kind, instances per m²
  grassTint: [number, number, number];
  animals: [Species, number][];
  weather: Partial<Record<WeatherKind, number>>;
  fogTint: [number, number, number];
  fogDensity: number;           // extra ground fog
  fireflies?: boolean;
  regionWords: string[];
}

const G = (r: number, g: number, b: number): [number, number, number] => [r, g, b];

export const BIOMES: BiomeDef[] = [];
BIOMES[Biome.MoonlitForest] = {
  name: 'Moonlit Forest', climate: [0.1, 0.35, 0],
  top: B.FOREST_FLOOR, filler: B.DIRT, steep: B.MOSS_STONE,
  trees: [[Tree.DarkOak, 5], [Tree.Oak, 2], [Tree.Birch, 2]], treeDensity: 0.8,
  plants: [[Plant.Grass, 1.2], [Plant.Fern, 0.25], [Plant.Mushroom, 0.03], [Plant.Bush, 0.04], [Plant.Moonpetal, 0.01], [Plant.Rock, 0.01]],
  grassTint: G(0.75, 0.9, 0.7), animals: [[Species.Deer, 3], [Species.Rabbit, 3], [Species.Boar, 2], [Species.Bird, 2]],
  weather: { clear: 4, cloudy: 3, rain: 2, fog: 3, storm: 1 }, fogTint: G(0.75, 0.85, 1.0), fogDensity: 0.5, fireflies: true,
  regionWords: ['Wood', 'Weald', 'Hollow', 'Shade']
};
BIOMES[Biome.SunnyMeadows] = {
  name: 'Sunny Meadows', climate: [0.35, -0.1, 0],
  top: B.GRASS, filler: B.DIRT, steep: B.STONE,
  trees: [[Tree.Oak, 4], [Tree.Birch, 2]], treeDensity: 0.06,
  plants: [[Plant.Grass, 2.6], [Plant.TallGrass, 0.25], [Plant.Flower, 0.35], [Plant.Bush, 0.01], [Plant.BerryBush, 0.01], [Plant.Rock, 0.005]],
  grassTint: G(1.0, 1.0, 0.9), animals: [[Species.Sheep, 4], [Species.Horse, 2], [Species.Rabbit, 3], [Species.Deer, 1], [Species.Bird, 3]],
  weather: { clear: 7, cloudy: 3, rain: 2, storm: 1 }, fogTint: G(1, 1, 1), fogDensity: 0, fireflies: true,
  regionWords: ['Fields', 'Meadows', 'Downs', 'Vale']
};
BIOMES[Biome.DarkPine] = {
  name: 'Dark Pine Forest', climate: [-0.35, 0.2, 0],
  top: B.FOREST_FLOOR, filler: B.DIRT, steep: B.CLIFF,
  trees: [[Tree.Pine, 6], [Tree.Dead, 0.3]], treeDensity: 0.78,
  plants: [[Plant.Grass, 0.5], [Plant.Fern, 0.3], [Plant.Rock, 0.02], [Plant.Mushroom, 0.02]],
  grassTint: G(0.7, 0.85, 0.7), animals: [[Species.Wolf, 3], [Species.Bear, 1], [Species.Deer, 2], [Species.Bird, 1]],
  weather: { clear: 3, cloudy: 4, rain: 3, fog: 3, snow: 1 }, fogTint: G(0.8, 0.9, 0.95), fogDensity: 0.4,
  regionWords: ['Pines', 'Darkwood', 'Firth', 'Timberland']
};
BIOMES[Biome.MistySwamp] = {
  name: 'Misty Swamp', climate: [0.35, 0.65, 0],
  top: B.SWAMP_GRASS, filler: B.MUD, steep: B.MUD,
  trees: [[Tree.Willow, 4], [Tree.Dead, 2]], treeDensity: 0.35,
  plants: [[Plant.Grass, 1.4], [Plant.Reeds, 0.4], [Plant.Mushroom, 0.03], [Plant.GlowMushroom, 0.01]],
  grassTint: G(0.85, 0.85, 0.6), animals: [[Species.Bird, 2], [Species.Fish, 2], [Species.Boar, 1]],
  weather: { fog: 6, cloudy: 3, rain: 3, clear: 1 }, fogTint: G(0.75, 0.85, 0.7), fogDensity: 1.6, fireflies: true,
  regionWords: ['Fen', 'Mire', 'Marsh', 'Bog']
};
BIOMES[Biome.RedDesert] = {
  name: 'Red Desert', climate: [0.7, -0.6, 0],
  top: B.RED_SAND, filler: B.RED_SAND, steep: B.RED_ROCK,
  trees: [[Tree.Cactus, 5], [Tree.Dead, 1], [Tree.Palm, 0.4]], treeDensity: 0.08,
  plants: [[Plant.DeadBush, 0.04], [Plant.Rock, 0.02]],
  grassTint: G(1.1, 0.9, 0.6), animals: [[Species.Bird, 1], [Species.Goat, 1]],
  weather: { clear: 8, sandstorm: 2, cloudy: 1 }, fogTint: G(1.1, 0.85, 0.65), fogDensity: 0.1,
  regionWords: ['Wastes', 'Canyons', 'Barrens', 'Sands']
};
BIOMES[Biome.SnowyMountains] = {
  name: 'Snowy Mountains', climate: null,
  top: B.SNOW, filler: B.STONE, steep: B.CLIFF,
  trees: [[Tree.SnowPine, 5]], treeDensity: 0.12,
  plants: [[Plant.Rock, 0.02]],
  grassTint: G(0.8, 0.9, 0.85), animals: [[Species.Goat, 3], [Species.Bird, 1]],
  weather: { clear: 4, cloudy: 3, snow: 4, fog: 2 }, fogTint: G(0.9, 0.95, 1.05), fogDensity: 0.2,
  regionWords: ['Peaks', 'Heights', 'Crags', 'Spires']
};
BIOMES[Biome.FrozenTundra] = {
  name: 'Frozen Tundra', climate: [-0.75, -0.2, 0],
  top: B.TUNDRA, filler: B.DIRT, steep: B.STONE,
  trees: [[Tree.SnowPine, 2], [Tree.Dead, 1]], treeDensity: 0.05,
  plants: [[Plant.Grass, 0.5], [Plant.Rock, 0.02], [Plant.DeadBush, 0.02]],
  grassTint: G(0.85, 0.85, 0.75), animals: [[Species.Wolf, 2], [Species.Bear, 1], [Species.Rabbit, 2]],
  weather: { snow: 5, cloudy: 3, clear: 3, fog: 1 }, fogTint: G(0.92, 0.96, 1.05), fogDensity: 0.3,
  regionWords: ['Tundra', 'Frostlands', 'Rime', 'Expanse']
};
BIOMES[Biome.VolcanicAshlands] = {
  name: 'Volcanic Ashlands', climate: [0.65, -0.15, 0.85],
  top: B.ASH, filler: B.BASALT, steep: B.BASALT,
  trees: [[Tree.Dead, 3]], treeDensity: 0.08,
  plants: [[Plant.Rock, 0.04], [Plant.DeadBush, 0.02]],
  grassTint: G(0.6, 0.5, 0.4), animals: [[Species.Bird, 0.5]],
  weather: { cloudy: 4, clear: 2, storm: 2, fog: 2 }, fogTint: G(1.15, 0.7, 0.55), fogDensity: 0.7,
  regionWords: ['Ashlands', 'Cinders', 'Scorch', 'Embers']
};
BIOMES[Biome.MushroomGrove] = {
  name: 'Mushroom Grove', climate: [0.15, 0.6, 0.85],
  top: B.MYCELIUM, filler: B.DIRT, steep: B.MOSS_STONE,
  trees: [[Tree.GiantMushroom, 5], [Tree.DarkOak, 0.5]], treeDensity: 0.35,
  plants: [[Plant.Grass, 0.6], [Plant.GlowMushroom, 0.08], [Plant.Mushroom, 0.08], [Plant.Fern, 0.1]],
  grassTint: G(0.8, 0.7, 1.0), animals: [[Species.Rabbit, 2], [Species.Deer, 1]],
  weather: { fog: 4, clear: 3, cloudy: 2, rain: 1 }, fogTint: G(0.95, 0.8, 1.1), fogDensity: 0.9, fireflies: true,
  regionWords: ['Grove', 'Sporewood', 'Glimmer', 'Glade']
};
BIOMES[Biome.CoastalCliffs] = {
  name: 'Coastal Cliffs', climate: null,
  top: B.GRASS, filler: B.DIRT, steep: B.CLIFF,
  trees: [[Tree.Pine, 1], [Tree.Oak, 1]], treeDensity: 0.05,
  plants: [[Plant.Grass, 2.0], [Plant.Flower, 0.05], [Plant.Rock, 0.02]],
  grassTint: G(0.95, 1.0, 0.85), animals: [[Species.Bird, 4], [Species.Goat, 1]],
  weather: { clear: 4, cloudy: 3, rain: 2, storm: 2, fog: 2 }, fogTint: G(0.9, 0.95, 1.0), fogDensity: 0.2,
  regionWords: ['Cliffs', 'Headland', 'Bluffs', 'Coast']
};
BIOMES[Biome.HauntedMoor] = {
  name: 'Haunted Moor', climate: [-0.2, -0.35, 0.4],
  top: B.DRY_GRASS, filler: B.DIRT, steep: B.MOSS_STONE,
  trees: [[Tree.Dead, 5]], treeDensity: 0.1,
  plants: [[Plant.Grass, 1.6], [Plant.DeadBush, 0.03], [Plant.Rock, 0.03], [Plant.Moonpetal, 0.005]],
  grassTint: G(0.95, 0.85, 0.65), animals: [[Species.Wolf, 2], [Species.Bird, 1]],
  weather: { fog: 5, cloudy: 4, rain: 2, clear: 1 }, fogTint: G(0.85, 0.88, 0.95), fogDensity: 1.2,
  regionWords: ['Moor', 'Heath', 'Barrows', 'Gloom']
};
BIOMES[Biome.SunkenForest] = {
  name: 'Sunken Forest', climate: [0.3, 0.7, -0.85],
  top: B.MUD, filler: B.MUD, steep: B.MUD,
  trees: [[Tree.Willow, 3], [Tree.Dead, 3]], treeDensity: 0.5,
  plants: [[Plant.Reeds, 0.4], [Plant.GlowMushroom, 0.02]],
  grassTint: G(0.8, 0.85, 0.6), animals: [[Species.Fish, 3], [Species.Bird, 1]],
  weather: { fog: 5, rain: 2, cloudy: 2 }, fogTint: G(0.7, 0.85, 0.8), fogDensity: 1.4, fireflies: true,
  regionWords: ['Drowned Wood', 'Sunkenmere', 'Deeps', 'Weeping Wood']
};
BIOMES[Biome.FloatingRocks] = {
  name: 'Floating Rocks', climate: [0.0, 0.0, -0.9],
  top: B.GRASS, filler: B.DIRT, steep: B.CLIFF,
  trees: [[Tree.Birch, 2], [Tree.Oak, 1]], treeDensity: 0.15,
  plants: [[Plant.Grass, 2.0], [Plant.Flower, 0.2], [Plant.Rock, 0.02]],
  grassTint: G(0.9, 1.05, 0.9), animals: [[Species.Bird, 4], [Species.Horse, 1]],
  weather: { clear: 5, cloudy: 3, fog: 2 }, fogTint: G(1, 1, 1.05), fogDensity: 0.1,
  regionWords: ['Skyreach', 'Drift', 'Isles', 'Heavens']
};
BIOMES[Biome.Ocean] = {
  name: 'Ocean', climate: null, top: B.SAND, filler: B.SAND, steep: B.STONE,
  trees: [], treeDensity: 0, plants: [[Plant.Rock, 0.01]], grassTint: G(1, 1, 1),
  animals: [[Species.Fish, 3], [Species.Bird, 1]],
  weather: { clear: 4, cloudy: 3, rain: 2, storm: 2 }, fogTint: G(0.9, 0.95, 1.05), fogDensity: 0.1,
  regionWords: ['Sea', 'Deep', 'Sound', 'Waters']
};
BIOMES[Biome.Beach] = {
  name: 'Beach', climate: null, top: B.SAND, filler: B.SAND, steep: B.STONE,
  trees: [[Tree.Palm, 3]], treeDensity: 0.05, plants: [[Plant.Rock, 0.01], [Plant.DeadBush, 0.01]], grassTint: G(1, 1, 0.9),
  animals: [[Species.Bird, 3]],
  weather: { clear: 6, cloudy: 3, rain: 2, storm: 1 }, fogTint: G(1, 1, 1), fogDensity: 0,
  regionWords: ['Strand', 'Shore', 'Sands', 'Bay']
};
BIOMES[Biome.CrystalCaves] = {
  name: 'Crystal Caves', climate: null, top: B.CRYSTAL, filler: B.STONE, steep: B.CRYSTAL,
  trees: [], treeDensity: 0, plants: [[Plant.Crystal, 0.1]], grassTint: G(1, 1, 1),
  animals: [], weather: { clear: 1 }, fogTint: G(0.8, 0.8, 1.2), fogDensity: 0, regionWords: ['Caverns', 'Geodes']
};

/** Biomes chosen by climate (others are picked by terrain: ocean, beach, cliffs, mountains). */
export const CLIMATE_BIOMES = BIOMES.map((b, i) => (b.climate ? i : -1)).filter((i) => i >= 0) as Biome[];

/** Ordered weather weights → pick deterministically from r in [0,1). */
export function pickWeather(b: Biome, r: number): WeatherKind {
  const w = BIOMES[b].weather;
  const entries = Object.entries(w) as [WeatherKind, number][];
  const total = entries.reduce((s, e) => s + e[1], 0);
  let acc = 0;
  for (const [k, v] of entries) { acc += v / total; if (r < acc) return k; }
  return entries[entries.length - 1][0];
}
