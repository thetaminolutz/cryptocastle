// Achievements (data): each checks a snapshot of the game. Shown in the Codex.
export interface AchState {
  kills: number; killsBy: Record<string, number>; bosses: string[]; level: number; gold: number; quests: number; chapters: number; jobs: number;
  dungeons: number; uniques: number; setsComplete: number; regions: number; herbs: number; minerals: number; lore: number; coins: number;
  deaths: number; obey: number; defy: number; trick: number; wishes: number; pet: boolean; ending: string | null; villages: number; waystones: number;
  built: number; crafted: number; playHours: number; nights: number; biomes: number; arenaWins: number; events: Record<string, number>;
  parries: number; mode: string; elites: number; bestiary: number; equipped: number; truth: number;
}
export interface AchDef { id: string; name: string; desc: string; check: (s: AchState) => boolean; }
const A: AchDef[] = [];
const a = (id: string, name: string, desc: string, check: (s: AchState) => boolean) => A.push({ id, name, desc, check });

a('first_blood', 'First Blood', 'Kill your first monster.', (s) => s.kills >= 1);
a('hunter', 'Hunter', 'Kill 50 monsters.', (s) => s.kills >= 50);
a('slayer', 'Slayer', 'Kill 250 monsters.', (s) => s.kills >= 250);
a('legend', 'Walking Legend', 'Kill 1000 monsters.', (s) => s.kills >= 1000);
a('toad_tamer', 'Toad Tamer', 'Kill 20 toadlings.', (s) => (s.killsBy.toadling ?? 0) >= 20);
a('rat_catcher', 'Rat Catcher', 'Kill 30 giant rats.', (s) => (s.killsBy.rat ?? 0) >= 30);
a('arachnophobe', 'Arachnophobe', 'Kill 25 spiders of any kind.', (s) => (s.killsBy.spider ?? 0) + (s.killsBy.crystal_crawler ?? 0) >= 25);
a('bone_breaker', 'Bone Breaker', 'Destroy 40 skeletons.', (s) => (s.killsBy.skeleton ?? 0) + (s.killsBy.skeleton_archer ?? 0) >= 40);
a('wool_gathering', 'Not So Innocent', 'Put down 10 killer sheep.', (s) => (s.killsBy.killer_sheep ?? 0) >= 10);
a('elite', 'Glowing Eyes', 'Defeat 10 elite monsters.', (s) => s.elites >= 10);
a('first_boss', 'Bigger They Come', 'Defeat a boss.', (s) => s.bosses.length >= 1);
a('five_bosses', 'Kingslayer', 'Defeat five different bosses.', (s) => s.bosses.length >= 5);
a('all_bosses', 'Nothing Left to Fear', 'Defeat all twelve bosses.', (s) => s.bosses.length >= 12);
a('queen', 'Regicide', 'Defeat the Scorpion Queen.', (s) => s.bosses.includes('scorpion_queen'));
a('falcon', 'Clipped Wings', 'Bring down the Golden Falcon.', (s) => s.bosses.includes('golden_falcon'));
a('dragon', 'Dragonsbane', 'Defeat the Ash Dragon.', (s) => s.bosses.includes('ash_dragon'));
a('lvl5', 'Apprentice', 'Reach level 5.', (s) => s.level >= 5);
a('lvl15', 'Journeyman', 'Reach level 15.', (s) => s.level >= 15);
a('lvl30', 'Veteran', 'Reach level 30.', (s) => s.level >= 30);
a('lvl50', 'Master of Duskmere', 'Reach level 50.', (s) => s.level >= 50);
a('rich', 'Heavy Purse', 'Carry 1000 gold.', (s) => s.gold >= 1000);
a('quests10', 'Helping Hand', 'Finish 10 quests.', (s) => s.quests >= 10);
a('jobs10', 'Odd Jobs', 'Finish 10 generated side quests.', (s) => s.jobs >= 10);
a('chapter4', 'Champion of the Arena', 'Finish chapter 4.', (s) => s.chapters >= 4);
a('chapter8', 'Two Faces', 'Finish chapter 8.', (s) => s.chapters >= 8);
a('ending', 'The End?', 'Reach an ending.', (s) => !!s.ending);
a('ending_truth', 'Names Are Older Than Crowns', 'Reach the sorcerer’s ending.', (s) => s.ending === 'truth');
a('dungeon1', 'Delver', 'Clear a dungeon.', (s) => s.dungeons >= 1);
a('dungeon10', 'Deep Delver', 'Clear 10 dungeons.', (s) => s.dungeons >= 10);
a('unique1', 'Named Steel', 'Find a unique item.', (s) => s.uniques >= 1);
a('unique10', 'Hoarder of Legends', 'Find 10 unique items.', (s) => s.uniques >= 10);
a('set', 'Matching Outfit', 'Complete an armour set.', (s) => s.setsComplete >= 1);
a('dressed', 'Fully Dressed', 'Wear something in all nine gear slots.', (s) => s.equipped >= 9);
a('regions10', 'Wanderer', 'Discover 10 regions.', (s) => s.regions >= 10);
a('regions30', 'Cartographer', 'Discover 30 regions.', (s) => s.regions >= 30);
a('biomes', 'Every Sky', 'Visit 10 different biomes.', (s) => s.biomes >= 10);
a('villages', 'Friend of Many', 'Discover 5 villages.', (s) => s.villages >= 5);
a('waystones', 'Stone Speaker', 'Attune 5 waystones.', (s) => s.waystones >= 5);
a('herbarium', 'Herbarium', 'Gather every herb in the Codex.', (s) => s.herbs >= 10);
a('minerals', 'Prospector', 'Collect every mineral in the Codex.', (s) => s.minerals >= 9);
a('lore', 'Reader of Ruins', 'Find 10 lore pages.', (s) => s.lore >= 10);
a('coins', 'Numismatist', 'Collect 12 ancient coins.', (s) => s.coins >= 12);
a('bestiary', 'Bestiary', 'Fill 30 bestiary entries.', (s) => s.bestiary >= 30);
a('builder', 'Builder', 'Place 50 building pieces.', (s) => s.built >= 50);
a('crafter', 'Crafter', 'Craft 50 things.', (s) => s.crafted >= 50);
a('obedient', 'Good Servant', 'Obey three of the Herald’s errands.', (s) => s.obey >= 3);
a('rebel', 'No Master', 'Defy the Herald three times.', (s) => s.defy >= 3);
a('trickster', 'Clever Little Lamb', 'Trick the Herald twice.', (s) => s.trick >= 2);
a('wish', 'Be Careful What You Wish For', 'Make a wish with a wish shard.', (s) => s.wishes >= 1);
a('pet', 'Good Dog', 'Gain a loyal companion.', (s) => s.pet);
a('parry', 'Turn the Blade', 'Parry 50 attacks.', (s) => s.parries >= 50);
a('arena', 'Crowd Favourite', 'Win the arena five times.', (s) => s.arenaWins >= 5);
a('blood_moon', 'Under the Red Moon', 'Live through a blood moon.', (s) => (s.events.blood ?? 0) >= 1);
a('meteor', 'Star Catcher', 'See a star fall.', (s) => (s.events.meteor ?? 0) >= 1);
a('caravan', 'Exotic Goods', 'Buy from a travelling caravan.', (s) => (s.events.bought ?? 0) >= 1);
a('dragon_seen', 'Look Up', 'See a dragon pass overhead.', (s) => (s.events.dragon ?? 0) >= 1);
a('festival', 'Merrymaker', 'Witness a village festival.', (s) => (s.events.festival ?? 0) >= 1);
a('survivor', 'Ten Nights', 'Survive ten nights.', (s) => s.nights >= 10);
a('one_life', 'Only One Chance', 'Reach level 10 in One Life mode.', (s) => s.mode === 'onelife' && s.level >= 10);
a('die_hard', 'Hard to Kill', 'Die and get back up 10 times.', (s) => s.deaths >= 10);
a('truth', 'The Whole Truth', 'Learn three secrets about the sorcerer.', (s) => s.truth >= 3);
a('long_walk', 'Long Road', 'Play for 10 hours.', (s) => s.playHours >= 10);

export const ACHIEVEMENTS = A;

// ---- Codex collections
export const HERBS = ['fiber', 'petals', 'moonpetal', 'berries', 'mushroom', 'glowcap', 'reed', 'fern', 'cactus_flesh', 'resin'];
export const MINERALS = ['coal', 'copper_ore', 'iron_ore', 'silver_ore', 'gold_ore', 'mithril_ore', 'moonstone', 'crystal_shard', 'flint'];
export const COINS = ['coin_ember', 'coin_tide', 'coin_crown', 'coin_moon', 'coin_serpent', 'coin_falcon', 'coin_skull', 'coin_wheat', 'coin_tower', 'coin_key', 'coin_eye', 'coin_rose'];
export const LORE: { id: string; title: string; text: string }[] = [
  { id: 'l1', title: 'A Child’s Rhyme', text: 'Faceless, faceless, where did you go? Into the clearing, white as snow. Who gave you eyes? The rider with the amber eyes. What did it cost? Ask the ones he lost.' },
  { id: 'l2', title: 'Ledger of the Pale Watch', text: 'Gate sealed in the 41st year of the Spindle. No further entries are to be made regarding the reasons. — Captain Ilse Varn' },
  { id: 'l3', title: 'Note in a Dead Hand', text: 'If you find this, do not wear any crown, however kindly offered. He is very kind when he wants something.' },
  { id: 'l4', title: 'The Gravedigger’s Account', text: 'Sixty years I have dug. The graves the Herald orders are never deep enough, he says. I think they are deep enough for anybody but him.' },
  { id: 'l5', title: 'Recipe for Ash-Bread', text: 'Rye, salt, a little ash from a fire that has never gone out. The old man by the stream lets you take some. He says it is good for the memory.' },
  { id: 'l6', title: 'Morvaine’s Fragment I', text: 'I will not go into the dark. If my body must, then my will shall stay — divided, so that neither half can betray the other.' },
  { id: 'l7', title: 'Morvaine’s Fragment II', text: 'The warning half grows tired. It sits by fires and talks to children. The ruling half grows hungry. I did not foresee the hunger.' },
  { id: 'l8', title: 'Morvaine’s Fragment III', text: 'A vessel. A crowned one. Every few generations a new one, hollowed out so that I may sit inside. The faceless ones are best: nobody misses a face that was never there.' },
  { id: 'l9', title: 'Song of the Spindle', text: 'Clotho spins and Lachesis measures, Atropos cuts — so says the old song. In the Citadel only two of the three still keep their inns. Nobody asks after the first.' },
  { id: 'l10', title: 'Kobold Tally', text: 'Shiny: 4,812. Shinier: 33. Shiniest: the King’s hat. (Do not touch the King’s hat.)' },
  { id: 'l11', title: 'A Shepherd’s Last Page', text: 'The flock watches me at night. Not grazing. Watching. Dog won’t go near them. I will move them to the far pasture tomorrow, if' },
  { id: 'l12', title: 'Rules of the Herald (as told)', text: 'One: obey when he calls. Two: speak of him to no one. Three: what is broken is punished. Four: the Cathedral remembers every name.' },
  { id: 'l13', title: 'Dwarven Mining Warning', text: 'Where the stone hums, mine slowly. Where the stone sings, mine not at all. Where the stone weeps, run.' },
  { id: 'l14', title: 'Letter Never Sent', text: 'My love — I went to the clearing to look for you and found only a fire and a grey man who knew my name. He said you had chosen a face and walked away. I do not believe him.' },
  { id: 'l15', title: 'The Monument’s Mason', text: 'We did not carve the serpents. We carved the priest. When we came back in the morning, the serpents were there.' },
  { id: 'l16', title: 'Bestiary Margin Note', text: 'Elite beasts have eyes that glow. Do not mistake this for intelligence. Mistake it for hunger.' },
  { id: 'l17', title: 'Hag’s Curse (fragment)', text: '…and may your thread be measured short, and may the one who cuts it smile…' },
  { id: 'l18', title: 'Prayer of the Drowned Choir', text: 'We sang as the water rose. We are singing still. Come down and listen; it is quiet here, and nobody is ever late.' },
  { id: 'l19', title: 'Arena Rules', text: 'No poison. No magic from the stands. No complaining if you die. — Kallias' },
  { id: 'l20', title: 'The Hollow King’s Coronation', text: 'He put on the crown and smiled, and the smile stayed on his face long after everything behind it had gone.' }
];
