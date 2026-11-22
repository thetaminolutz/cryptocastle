# DUSKMERE

*Enter. Or turn back.*

An offline, touch-first 3D voxel (pixel-art) medieval adventure that runs as a
Progressive Web App in Safari on iPad (target: iPad Air 5 / M1, iPadOS 17+).
TypeScript + Vite + Three.js; no CDNs, no network calls at runtime.

## Status

| Milestone | State |
|---|---|
| M1 Project setup, PWA, icons, touch-safe CSS, FPS counter | ✅ done |
| M2 Voxel engine (worker chunk gen, greedy meshing, atlas, low-res pixel pass, fog, day/night) | ✅ done |
| M3 Player & touch controls (physics, jump, climb, swim, stamina) | next |
| M4–M15 | see the feature bible |

Right now you fly over the world with a test camera: left thumb = joystick
(push to the edge to go fast), drag on the right = look, **Up/Down** buttons = fly
up/down. Keyboard: WASD, Space, C, Shift. ☰ opens Settings.

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

- **A new block:** add a painter for its texture in `src/world/atlas.ts`, append
  its tile name to `TILE_NAMES` in `src/world/tiles.ts`, then append a row to
  `BLOCKS` in `src/world/blocks.ts`. Never renumber existing block IDs (saves
  store them).
- Items, enemies, NPCs and quests will live as data tables in `src/data/`.

## Performance notes

- 3D is rendered at ~45 % of the physical screen resolution and upscaled with
  nearest-neighbour; the UI stays sharp.
- Chunks are 16×16×128, generated and greedy-meshed in Web Workers, one opaque
  and one liquid mesh per chunk. View distance 6 ≈ 85–120 draw calls and
  ~150–200 k triangles.
- If FPS stays under 45 for 5 s, the game lowers render scale, then view
  distance, then particles (Settings → Auto quality).
