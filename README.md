# DUSKMERE

*Enter. Or turn back.*

An offline, touch-first 3D voxel (pixel-art) medieval adventure that runs as a
Progressive Web App in Safari on iPad (target: iPad Air 5 / M1, iPadOS 17+).
TypeScript + Vite + Three.js; no CDNs, no network calls at runtime.

## Status

| Milestone | State |
|---|---|
| M1 Project setup, PWA, icons, touch-safe CSS, FPS counter | ✅ done |
| M2 World engine (worker chunk gen, atlas, low-res pixel pass, fog, day/night) | ✅ done |
| M3 Smooth terrain + player & touch controls (walk, sprint, jump, climb, swim, dodge, stamina, life, 1st/3rd person) | ✅ done |
| M4 Biomes, plants, animals, caves, ores, weather + realistic graphics overhaul | ✅ done |
| M5 Gathering, inventory, hotbar, crafting, tools, saving | next |
| M4–M15 | see the feature bible |

The world is **smooth and realistic**: terrain is a density field meshed with
Surface Nets and textured with procedural 128 px materials + normal maps
(tri-planar, blended between materials), lit by a sun/moon with soft shadows,
filmic tone mapping, height fog, an atmospheric sky with clouds, stars and moon
phases, and reflective water with shore foam. Trees are built from leaf-cluster
cards; grass, flowers, ferns, reeds, rocks and mushrooms sway in the wind.
A retro "pixel look" can still be switched on in Settings.

**World content (M4):** 14 biomes that blend into each other (Moonlit Forest,
Sunny Meadows, Dark Pine Forest, Misty Swamp, Red Desert with mesas and canyons,
Snowy Mountains, Frozen Tundra, Volcanic Ashlands with lava pools, Mushroom Grove,
Coastal Cliffs, Haunted Moor, Sunken Forest, Floating Rocks, plus ocean/beaches)
and the underground Crystal Caves. Caves with entrances, ravines, ores (coal,
copper, iron, silver, gold, mithril, moonstone). Named regions with a danger
level that rises with distance. Wildlife: deer, rabbits, boars, wolves, bears,
sheep, goats, horses, birds and fish. Weather per biome: rain, thunderstorms,
fog, snow, sandstorms, fireflies on warm nights.

Controls (touch): left thumb = floating joystick (push to the edge to sprint),
drag on the right = camera, **Jump** (tap; hold against a steep wall or a tree to
climb; in water: swim up), **Dodge** = roll. Look down + forward in water = dive.
◐ toggles first/third person, ☰ opens Settings.
Keyboard: WASD, Shift sprint, Space jump/climb, Q dodge.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173 (also reachable from the iPad on the same Wi-Fi)
npm run build      # static site in dist/
npm run preview    # serve dist/ exactly as it will be deployed (service worker active)
```

Useful URL parameters: `?skip` jumps straight into the world, `?seed=anything`
picks a world seed.

## Put it on the iPad (GitHub Pages)

An iPad can't run a web game from a file in the Files app, so the `dist/` folder
must be hosted once over HTTPS. After the first visit everything is cached and it
works in Airplane Mode.

1. On github.com open this repository → **Settings** → **Pages**.
2. Under **Build and deployment → Source** choose **GitHub Actions**.
3. Merge/push to the `main` branch. The workflow in `.github/workflows/deploy.yml`
   builds the game and publishes it (see the **Actions** tab, takes ~1 minute).
4. Your link is `https://<your-github-name>.github.io/<repo-name>/`.
   (Pages on a private repo needs a paid GitHub plan; otherwise make the repo
   public or use Netlify/Cloudflare Pages and upload `dist/`.)

On the iPad:

1. Open the link in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open Duskmere **from the Home Screen** once while online and wait for
   "Ready to play offline".
4. From now on it works offline. Installing to the Home Screen also stops iOS
   from deleting your saves.

### Updates

Push a new version → the next time you open the game online it downloads in the
background and shows **"Update available – tap to reload"**. Tap it to switch.

## Project layout

```
src/engine   renderer (low-res pixel pass), input, audio, settings, PWA, FPS/auto-quality
src/world    noise, block table, procedural texture atlas, terrain, mesher, chunk worker, sky
src/entities player, NPCs, enemies (test fly camera for now)
src/game     game loop / game systems
src/ui       HUD, touch controls, menus, screens
src/data     content tables (items, enemies, NPCs, quests – from M5 on)
scripts/     icon generator (pixel-art PNGs, run automatically on build)
```

## Adding content

- **A new terrain material:** add a painter for its texture in `src/world/atlas.ts`,
  append its tile name to `TILE_NAMES` in `src/world/tiles.ts`, then append a row
  to `BLOCKS` in `src/world/blocks.ts` (top tile = flat ground, side tile = steep
  slopes). Never renumber existing IDs (saves store them).
- **A new biome:** add a row to `BIOMES` in `src/world/biomes.ts` (materials,
  trees, plants, animals, weather, fog) and, if it needs its own terrain shape,
  a case in `biomeHeight()` in `src/world/terrain.ts`.
- **A new tree or plant:** add a model in `buildTree()` / `buildPlant()` in
  `src/world/vegetation.ts` and list it in a biome's `trees` / `plants`.
- **A new texture:** add a painter to `PAINTERS` in `src/world/textures.ts`.
- **A new animal:** add a model + behaviour row to `SPECIES` in
  `src/entities/animals.ts` and list it in a biome's `animals`.
- **Player tuning** (speeds, stamina costs, fall damage): `PLAYER_TUNING` in
  `src/entities/player.ts`.
- Items, enemies, NPCs and quests will live as data tables in `src/data/`.

## Performance notes

- 3D renders at a fraction of the physical screen resolution (Low 45 %,
  Medium 62 %, High 80 %) with MSAA and is upscaled; the UI stays sharp.
- Trees and plants are instanced (one draw call per kind), culled to the view,
  and only nearby ones are drawn into the shadow map.
- Chunks are 16×16×128 density samples, generated and meshed (Surface Nets) in
  Web Workers: one terrain and one liquid mesh per chunk.
- If FPS stays under 45 for 5 s, the game lowers render scale, then shadows,
  then grass, then view distance, then particles (Settings → Auto quality).
