// Named regions: Voronoi cells (~420 m) with a generated name that fits the biome
// at their centre, and a danger level that rises with distance from the start.
import { hash3 } from './noise';
import { BIOMES } from './biomes';
import type { TerrainGen } from './terrain';

const CELL = 420;
const PRE = ['Har', 'Vel', 'Dun', 'Ash', 'Mor', 'Gal', 'Thorn', 'Wyn', 'Ebon', 'Grey', 'Sil', 'Cor', 'Dra', 'Hol', 'Kel', 'Lun', 'Nar', 'Os', 'Rav', 'Sca', 'Tor', 'Ul', 'Wolf', 'Bryn', 'Cael', 'Elder', 'Fal', 'Gloam', 'Mire', 'Nyx'];
const SUF = ['row', 'mere', 'wick', 'holt', 'dale', 'ford', 'gard', 'fell', 'stead', 'wyn', 'reach', 'barrow', 'march', 'moor', 'vale', 'haven', 'thorpe', 'crest', 'hollow', 'den'];

export interface Region { id: string; name: string; subtitle: string; danger: number; }

export class Regions {
  private cache = new Map<string, Region>();
  constructor(private gen: TerrainGen, private seed: number) {}

  private centre(cx: number, cz: number): [number, number] {
    return [(cx + 0.2 + hash3(cx, 1, cz, this.seed) * 0.6) * CELL, (cz + 0.2 + hash3(cx, 2, cz, this.seed) * 0.6) * CELL];
  }

  at(x: number, z: number): Region {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    let best = 1e18, bx = 0, bz = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const [px, pz] = this.centre(gx + i, gz + j);
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < best) { best = d; bx = gx + i; bz = gz + j; }
    }
    const id = `${bx},${bz}`;
    let r = this.cache.get(id);
    if (!r) {
      const [px, pz] = this.centre(bx, bz);
      const col = this.gen.column(Math.floor(px), Math.floor(pz));
      const bd = BIOMES[col.biome];
      const h = (k: number) => hash3(bx, k, bz, this.seed);
      const word = bd.regionWords[Math.floor(h(5) * bd.regionWords.length)];
      let name = `${PRE[Math.floor(h(3) * PRE.length)]}${SUF[Math.floor(h(4) * SUF.length)]} ${word}`;
      const danger = Math.max(1, Math.min(10, Math.round(1 + Math.hypot(px, pz) / 500)));
      if (bx === 0 && bz === 0 || (Math.hypot(px, pz) < CELL * 0.7 && this.isOriginCell(bx, bz))) name = 'The Moonlit Hollow';
      r = { id, name, subtitle: `${bd.name} · Danger ${'◆'.repeat(Math.min(5, Math.ceil(danger / 2)))}${'◇'.repeat(5 - Math.min(5, Math.ceil(danger / 2)))}`, danger };
      this.cache.set(id, r);
    }
    return r;
  }

  private isOriginCell(bx: number, bz: number): boolean {
    // the cell that contains (0,0)
    const gx = 0, gz = 0;
    let best = 1e18, ox = 0, oz = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const [px, pz] = this.centre(gx + i, gz + j);
      const d = px * px + pz * pz;
      if (d < best) { best = d; ox = gx + i; oz = gz + j; }
    }
    return ox === bx && oz === bz;
  }
}
