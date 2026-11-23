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
| M5 Gathering, inventory, hotbar, crafting, tools, saving + skinned hero character | ✅ done |
| M6 Building mode, furniture, chests, beds, land claims, blueprints | ✅ done |
| M7 Combat, first 10 enemies, loot, death/respawn, game modes | ✅ done |
| M8 Villages, NPCs with schedules, dialogue, shops, reputation | ✅ done |
| M9 Opening, Ashen Stranger, Herald, Tower of the First Rite, character creation | ✅ done |
| M10 Quests, journal, map, main story chapters 1–4, the Pale Citadel | ✅ done |
| M11 Remaining enemies, bosses, dungeons, unique items, armour sets | next |
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

**The hero** is a procedurally modelled, skinned character with a real skeleton:
hooded cloak (spring physics), tunic, belt and pouches, bracers, boots and a
gnarled staff, animated in code (idle, walk, run, jump, swim, climb, roll, tool
swings, harvesting). The face under the hood stays blank until character creation.

**Gathering & crafting (M5):** aim at terrain and strike to dig (hands/shovel for
soft ground, pickaxes for stone and ore — better tiers unlock harder ores), chop
trees with an axe, harvest plants with Use (grass → fiber, berries, mushrooms,
herbs, reeds, stones, crystals). 50+ items, 40+ recipes at hand / workbench /
campfire / furnace / anvil; place stations in the world (fires and torches light
the night). Tools wear out. Inventory: 6-slot belt + 24-slot pack with drag & drop,
long-press info and stack splitting. Saves: 3 journeys in IndexedDB, autosave
every 2 min and when leaving the app, export/import as a file. Only changes to
the world are saved; the rest regenerates from the seed.

**Building (M6):** tap ⚒ for build mode. Pieces snap to a 2 m grid: wooden and
stone floors, walls, half walls, window walls, doors (open/close), gables, shingle
and thatch roofs, stairs, pillars, fences, brick walls. Furniture: bed (respawn
point; sleep through the night), chest (16-slot storage), table, chair (sit),
shelf, carpet, banner, painting, weapon rack, plant pot, boundary stone (land
claim). Light: fireplace, wall torch, lantern. A ghost preview shows green when
placeable and red when blocked or missing materials; Rotate, hold Place to repeat,
Remove (full refund), Undo (20 steps). **Plans:** lay out a hut, cottage or
longhouse as a blueprint, then tap "Build plans" to raise every piece you have
materials for. A lit, claimed plot keeps predators (and later monsters) away.

**Combat (M7):** tap STRIKE for light attacks (tap again mid-swing for a 3-hit
combo), hold it during the wind-up for a charged heavy blow; hold BLOCK to block
(a shield on your belt blocks more), and block just before a hit lands to
**parry** and stun the attacker; dodge rolls avoid damage. Tap an enemy to lock
on. Damage types (slash, pierce, blunt, fire, ice, poison, holy, shadow) meet
weaknesses and resistances; status effects: bleeding, poison, burning, frozen,
stunned, cursed (bandages and antidotes cure them). Enemies: Toadlings (ambush
from the undergrowth), Giant Rats, Cave Spiders, Grave Robbers, Bandits, Skeleton
Warriors, Kobolds, Trolls, Restless Ghosts, Fire Imps — they telegraph attacks,
flank, flee when weak and call for help; rare elites have blazing eyes. Wolves,
boars and bears fight back; every animal can be hunted. Loot bodies with USE.
XP and levels ("You're a Two now."). **Modes:** Wanderer (wake at your bed, lose
some gold, your pack waits where you fell) or One Life (death is permanent; a
grave is kept for the Cemetery of the Fallen).

**Villages (M8):** villages are generated from the seed (the first, e.g.
"Briarton", lies a short walk from the clearing) on flattened ground: a well and
market square with stalls, a tavern, a stone chapel, a smithy, 6–12 furnished
houses and fenced farms. Every villager has a name, job, home, workplace,
personality traits, likes and dislikes, family and a daily schedule (sleep,
work, eat, tavern, chapel); they walk A* paths around buildings, open doors,
chatter in speech bubbles, flee from monsters, and guards fight them. Talk to
anyone: greetings change with time, weather, reputation and memories; ask for
rumours, work (deliver items for gold), give gifts (they have favourites), rent
a room at the inn, trade at the general store, smithy, alchemist, tailor or inn
(prices follow reputation; shops have limited gold and restock every few days),
or pickpocket, insult and threaten — word travels, and reputation is remembered.

**The opening (M9):** a new journey begins at night in a moonlit clearing —
faceless, nameless, with only a staff. An objective line (with an arrow and
distance) leads on: toadlings ambush you at the edge of the clearing; a light in
the woods is the **Ashen Stranger**'s campfire (he warns you of the rider with
amber eyes); hoofbeats at the gorge announce **the Herald** on his armoured
black horse, who states the rules. Beyond lies the **Tower of the First Rite**:
six copper tablets, a rusty chest and a seventh tablet create your character —
gender, one of 8 races (Human, Dark Elf, Barbarian, Vampire, Lizardfolk, Dwarf,
Werewolf, Catfolk), your face in a copper mirror with live preview (skin, hair,
beard, eyes, brows, nose, mouth, cheeks, scars, clothing colours, headwear), one
of 8 callings, 10 of 18 gifts (some exclude each other), the Herald's oath
(showing your Wanderer / One Life path), a weapon and shield from the chest, and
a name from the cheeky Naming Gnome. The rite ends with the reveal of your new
face outside the tower in the morning. Race, calling and gifts really change
the numbers: life, stamina, speed, jump, swimming and breath, damage taken,
damage dealt, crits, life steal (Vampire), fire and curse procs, block, herb
yield, merchant prices and night vision.

**Quests, map and the Pale Citadel (M10):** a data-driven quest system
(`src/data/quests.ts`: stages of goto / kill / collect / flag objectives,
rewards, follow-ups) with a **Journal** tab (active, side and finished quests;
track a quest to drive the HUD arrow) and a **Map** tab: a fog-of-war parchment
map that reveals as you explore, with your position, home, discovered villages,
the citadel, quest targets, your lost pack and your own pins (tap to place or
remove; drag to pan, pinch to zoom). **Waystones** stand in every village square,
by the tower and in the citadel: touch one to attune it, touch any attuned one to
open the travel map (10 gold per trip). The main story continues: **Chapter 2**
— grave robbers at the old barrow cemetery and their hoard (with a torn map);
**Chapter 3** — the **scorpion labyrinth**, a 13×13-cell maze carved into the
rock 12 m beneath the Pale Citadel (torches, bones, giant scorpions), entered
through a pale arch outside the sealed gate and left by a long stair up into the
courtyard; **Chapter 4** — the **arena trials** (the pack, the champion, the
beast; fight again for coin afterwards). **The Pale Citadel** is a walled hub
city with white walls, corner towers and a sealed gate, two inns (*The Last
Thread*, run by **Atropos**, and *The Gilded Spindle*), a smithy, a bank with your
own vault (24 slots), a chapel, market stalls, a quest board with side quests,
an arena master (Kallias the Unbowed) and townsfolk with daily lives.

Controls (touch): left thumb = floating joystick (push to the edge to sprint),
drag on the right = camera (tap an enemy to lock on), **Strike/Mine/Chop/Dig** (hold to keep swinging), **Block**,
**Use** (appears when something is in reach: harvest, place, drink, use station),
**Jump** (hold against a wall or tree to climb; in water: swim up), **Dodge** = roll.
Tap a belt slot to hold it. ◐ toggles first/third person, ☰ opens the menu
(Pack, Craft, Settings, Save).
Keyboard: WASD, Shift sprint, Space jump/climb, F strike (place in build mode), E use, Q dodge, 1–6 belt, B build mode, R rotate.

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
- **A new enemy:** add a row (stats, loot, biomes, model) to `ENEMIES` in
  `src/data/enemies.ts`.
- **Villagers, dialogue, shops:** names, traits, templates, rumours and shop
  stock are tables in `src/data/npcs.ts`; village layouts in `src/world/villages.ts`.
- **A new building piece:** add a row to `PIECES` in `src/data/pieces.ts` and a
  model in `MODELS` in `src/world/building.ts`. Blueprints live in `BLUEPRINTS`.
- **A new texture:** add a painter to `PAINTERS` in `src/world/textures.ts`.
- **A new animal:** add a model + behaviour row to `SPECIES` in
  `src/entities/animals.ts` and list it in a biome's `animals`.
- **Player tuning** (speeds, stamina costs, fall damage): `PLAYER_TUNING` in
  `src/entities/player.ts`.
- **Items, recipes, drops:** `src/data/items.ts` (`ITEMS`, `RECIPES`, `MINE`,
  `TREE_DROPS`, `PLANT_DROPS`). Icons are drawn from the item's `icon` field.
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
