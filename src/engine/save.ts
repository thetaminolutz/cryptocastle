// Save games in IndexedDB (3+ slots) with export/import as a JSON file.
// The world itself is regenerated from the seed; only changes are stored.
import type { Stack } from '../game/inventory';
import type { WorldDelta } from '../world/world';
import type { PlacedProp } from '../world/props';
import type { BuildSave } from '../world/building';

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;

export interface SaveData {
  version: number;
  slot: number;
  seed: number;
  mode: 'wanderer' | 'onelife';
  created: number;
  updated: number;
  playTime: number;      // seconds
  day: number; time: number;
  player: { pos: [number, number, number]; yaw: number; life: number; stamina: number };
  inventory: { slots: (Stack | null)[]; selected: number };
  world: WorldDelta;
  props: PlacedProp[];
  building?: BuildSave;
  stats?: { gold: number; xp: number; level: number; maxLife: number; kills: Record<string, number> };
  lostPack?: { x: number; y: number; z: number; items: (Stack | null)[] } | null;
  story?: unknown;
  quests?: unknown;
  map?: unknown;
  chapters?: unknown;
  villagers?: Record<string, import('../entities/villagers').NPCSave>;
  shops?: Record<string, import('../game/dialogue').ShopState>;
}

/** A fallen One-Life character, remembered in the Cemetery of the Fallen. */
export interface Grave { id?: number; name: string; cause: string; day: number; level: number; date: number; seed: number; }

const DB = 'duskmere';
const STORE = 'saves';
const GRAVES = 'graves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
      if (!db.objectStoreNames.contains(GRAVES)) db.createObjectStore(GRAVES, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { resolve(req.result); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
  });
}

/** Upgrade old saves to the current format (versioned so updates never break saves). */
export function migrate(d: SaveData): SaveData {
  if (!d.version) d.version = 1;
  d.props ??= [];
  d.building ??= { pieces: [], respawn: null };
  d.stats ??= { gold: 0, xp: 0, level: 1, maxLife: 100, kills: {} };
  d.mode ??= 'wanderer';
  d.world ??= { edits: [], trees: [], plants: [] };
  return d;
}

export const saves = {
  async list(): Promise<(SaveData | null)[]> {
    try {
      const all = await tx<SaveData[]>('readonly', (s) => s.getAll() as IDBRequest<SaveData[]>);
      return Array.from({ length: SLOT_COUNT }, (_, i) => { const d = all.find((x) => x.slot === i); return d ? migrate(d) : null; });
    } catch { return Array(SLOT_COUNT).fill(null); }
  },
  async load(slot: number): Promise<SaveData | null> {
    const d = await tx<SaveData | undefined>('readonly', (s) => s.get(slot) as IDBRequest<SaveData | undefined>);
    return d ? migrate(d) : null;
  },
  async write(d: SaveData): Promise<void> { d.updated = Date.now(); await tx('readwrite', (s) => s.put(d)); },
  async remove(slot: number): Promise<void> { await tx('readwrite', (s) => s.delete(slot)); },
  async addGrave(g: Grave): Promise<void> { await tx('readwrite', (s) => s.add(g), GRAVES); },
  async graves(): Promise<Grave[]> { try { return await tx<Grave[]>('readonly', (s) => s.getAll() as IDBRequest<Grave[]>, GRAVES); } catch { return []; } },

  exportFile(d: SaveData) {
    const blob = new Blob([JSON.stringify(d)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `duskmere-slot${d.slot + 1}-day${d.day + 1}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importFile(): Promise<SaveData | null> {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return resolve(null);
        try {
          const d = JSON.parse(await f.text()) as SaveData;
          if (typeof d.seed !== 'number' || !d.player) throw new Error('not a save');
          resolve(migrate(d));
        } catch { resolve(null); }
      };
      inp.click();
    });
  }
};

export function formatPlayTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
