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
| M11 Remaining enemies, bosses, dungeons, unique items, armour sets | ✅ done |
| M12 Herald errands, profile, wish shards, Living Fresco, endings | ✅ done |
| M13 Procedural quests, world events, achievements, Codex | ✅ done |
| M14 Adaptive audio | ✅ done |
| M15 Polish, balancing, tutorial hints, performance, README | next |
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

**Enemies, bosses, dungeons and gear (M11):** 41 enemy types across the biomes
and danger levels (dire and frost wolves, water spirits that rise from lakes,
armoured orcs, killer sheep, harpies, winged demons, swamp hags, ice golems, sand
worms, vampire bats, dark knights, cultists, mimics, skeleton archers, goblins
and shamans, ogres, myconids, crystal crawlers, fire salamanders, yetis, giant
crabs, barrow wights, gargoyles, giant wasps, bog lurkers, will-o'-wisps…), some
of them shooting arrows, venom, frost, shadow bolts or fireballs; **12 bosses**
(the Troll King, the Scorpion Queen in the labyrinth, the Drowned Bishop, the
Golden Falcon roaming the meadows, the Ash Dragon, the Hollow King, the Bandit
Lord, the Spider Matriarch, the Kobold King, the Barrow Lich, the Hag Mother, the
Frost Colossus) with phases, summoned minions, ranged attacks, telegraphed ground
slams (a red ring — dodge out) and a boss health bar. **Dungeons** are generated
from the seed (about one per 620 m cell): a pale arch and a ramp lead down to two
floors of torch-lit rooms and corridors carved into the rock, themed by biome
(crypts, spider nests, kobold mines, bandit hideouts, troll caves, drowned
chapels, frozen vaults, ember forges, hag hollows); enemies wake as you enter
each room, the boss waits in the deepest room with its chest, and a cracked wall
hides a treasure room you can dig into. Cleared dungeons stay cleared for a week.
**Gear:** a Gear tab (paper doll) with head, chest, legs, boots, gloves, cloak, two
rings and an amulet; armour adds defence and is visible on your character (helms,
crowns, plate with pauldrons, mail, robes, greaves, gauntlets, cloak colours);
five armour sets with 2- and 4-piece bonuses (Hunter's Leathers, Ironclad,
Moonsilver, Pale Guard, Ashen Vestments), cosmetic outfits, rings and amulets;
new weapon kinds (daggers, sabers, long swords, battle axes, war hammers,
morning stars, claw whips, spears, bows, crossbows with arrows, fire and frost
wands, round / kite / tower shields) with proper 3D models and aim-assisted
ranged attacks; random affixes on dropped weapons (Vampiric, Swift, Keen,
Heavy, of Burning, of Frost…); and **35 unique named items with lore**
(Whisperfang, The Gravedigger's Spade, Hemera's Lantern, Crown of the Drowned,
The Last Thread, The Hollow Edge, Falcon Wing…) dropped by bosses and found in
hidden treasure rooms.

**The Herald and the end of the story (M12):** the Herald now rides in (hoofbeats
first) after every boss fight, calls you by your character's name and judges how
you fought — brave, clever, cowardly or cruel — with gold, permanent boons,
fines or curses. When you are near death in a boss fight he lays his hands on
you and heals you, for a favour he will collect. He hands out **errands** with
moral weight (deliver a sealed box before nightfall without opening it, spy on a
merchant, spread false news in a village, poison Lachesis' wine, dig up Old Hob)
that you can obey, refuse or trick; refusing has a price. A hidden **profile**
built only from in-game behaviour (favourite weapon, where you hesitate, what you
flee from, what kills you, who you are kind or cruel to, night or day) feeds his
unsettling remarks. **Wish shards** (from bosses and some elites) summon him to
grant a wish — a treasure, a level, a secret, the map, a loyal hound companion,
or bringing back someone his errands took — some with a hidden price. Every
chapel has a **Living Fresco** that paints panels of what you actually did. The
main story runs on through chapter 5 (the killer sheep), 6 (the Golden Falcon), 7
(the Monument of Warning: a priest strangled by serpents), 8 (the Fresco and the
Ashen Stranger's secret), 9 (the errands), 10 (judgment in the Cathedral — or a
fight with its Warden), 11 (allies pledged by village guards who trust you) and
12 (the assault on the Hollow King's black tower with your allies), ending in
**three endings**: take the crown, shatter it, or — if you uncovered the truth —
speak the sorcerer's name. The world stays open afterwards.

**Endless side content (M13):** generated side quests from villagers (“Any
trouble around here?”) and the Citadel's quest board (three fresh notices every
three days): fetch and deliver, hunts, **bounties on named elites** (“Varra the
Patient”), finding lost people, clearing camps, defending a village at night and
bringing rare herbs — with map markers and the tracking arrow. **World events**
rolled at dusk and dawn: a **blood moon** (red sky, bolder monsters, more elites),
**falling stars** that leave a glowing crater of mithril, crystals and moonstone, a
**travelling caravan** with rare wares and wish shards, **village festivals**, and
**dragons** passing overhead. A **Codex** tab with the **bestiary** (fills in as you
defeat enemies, with weaknesses and resistances), **collections** (herbarium,
minerals, 12 ancient coins, unique items, regions and biomes — completing a set
pays out), 20 **lore pages** hidden in dungeons, and **62 achievements**.

**Audio (M14), all synthesised in code:** a mixer (master, music, effects,
ambience — each with its own slider) with a compressor and a reverb send; a
**generative music engine** that never repeats exactly and cross-fades between
themes: calm exploration themes per biome (forest flute, meadow plucks, pine
choirs, swamp bells and frame drums, desert lute, snowy bells, ashland horns,
mushroom bells, coastal flute, moor horns), night, **tense** combat music, a
heavier **boss** theme, **victory** fanfares after fights, the Herald's eerie
theme, lively **tavern** jigs in inns, dungeon drones with heartbeat drums, the
Citadel, and the opening's heartbeat drums with distant horns. **Ambience** beds
follow the world: wind, rain, rivers and lakes, birdsong by day, crickets at
night, dripping caves, crackling fires, the murmur of a crowded inn, muffled
sound underwater. **Effects:** footsteps per surface (grass, dirt, stone, wood,
snow, sand, water), swings and hits that sound different on flesh, bone, metal
and stone, blocks, parries, bow and crossbow shots, fire / ice / holy / shadow
spells, mining, chopping, digging, harvesting, doors, coins, pickups, crafting,
building, eating, level-ups, achievements, hoofbeats, splashes, monsters that
announce themselves (beasts, insects, the undead, birds, spirits, people) and
the Herald's wordless whisper.

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
