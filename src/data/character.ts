// Character creation data: races, callings, abilities, appearance options, names.

export type Gender = 'male' | 'female';
export type RaceId = 'human' | 'darkelf' | 'barbarian' | 'vampire' | 'lizardfolk' | 'dwarf' | 'werewolf' | 'catfolk';
export type CallingId = 'knight' | 'bard' | 'mage' | 'hunter' | 'scout' | 'guardian' | 'thief' | 'assassin';
export type AbilityId = 'far_sight' | 'strength' | 'stamina' | 'blend_in' | 'make_fire' | 'speed' | 'jumping' | 'light_healing' | 'force_shield'
  | 'death_curse' | 'iron_skin' | 'night_eye' | 'beast_tongue' | 'lockpicking' | 'swimming' | 'herbalism' | 'haggling' | 'silent_steps';

export interface Stats { life: number; stamina: number; mana: number; strength: number; agility: number; defence: number; magic: number; luck: number; }
export const BASE_STATS: Stats = { life: 100, stamina: 100, mana: 50, strength: 10, agility: 10, defence: 10, magic: 10, luck: 10 };

export interface RaceDef { id: RaceId; name: string; desc: string; trait: string; stats: Partial<Stats>; skin: number[]; height: number; }
export const RACES: RaceDef[] = [
  { id: 'human', name: 'Human', desc: 'Balanced in all things.', trait: 'Villagers warm to you faster.', stats: {}, skin: [0xe8c8a8, 0xc8966e, 0x8a5a3a, 0x5a3a24], height: 1 },
  { id: 'darkelf', name: 'Dark Elf', desc: 'Nimble and elegant, born of the long night.', trait: 'Better stealth; you see in the dark.', stats: { agility: 4, magic: 2, life: -10 }, skin: [0x8a8aa8, 0x6a6a8a, 0x9aa0b8, 0x4a4a62], height: 1.03 },
  { id: 'barbarian', name: 'Barbarian', desc: 'Broad, scarred and unbreakable.', trait: 'More life and strength, less magic.', stats: { life: 30, strength: 5, magic: -5 }, skin: [0xd8b090, 0xb07a52, 0x8a5a3a, 0xe0c0a0], height: 1.08 },
  { id: 'vampire', name: 'Vampire', desc: 'Pale, patient and very old.', trait: 'Your strikes steal life. Strong at night, weak in bright sun.', stats: { strength: 2, magic: 3 }, skin: [0xe8e4e0, 0xd8d0d4, 0xc8c4cc, 0xf0ece8], height: 1.02 },
  { id: 'lizardfolk', name: 'Lizardfolk', desc: 'Scaled, cold-blooded, at home in the water.', trait: 'Swim fast, hold your breath longer, resist poison.', stats: { defence: 2, agility: 2 }, skin: [0x5a7a4a, 0x4a6a5a, 0x7a8a4a, 0x3a5a4a], height: 1 },
  { id: 'dwarf', name: 'Dwarf', desc: 'Stone-hearted, stubborn, gloriously bearded.', trait: 'Mine faster, axe bonus, see ore glints. Sturdy.', stats: { defence: 4, strength: 2, agility: -2, life: 15 }, skin: [0xe0b898, 0xc8906a, 0x9a6a4a, 0xd8a888], height: 0.8 },
  { id: 'werewolf', name: 'Werewolf', desc: 'Something wild sleeps under your skin.', trait: 'Strong magic affinity; a short rage at night (more damage).', stats: { magic: 4, strength: 2 }, skin: [0xc8a080, 0x9a7458, 0x7a5a42, 0xd8b090], height: 1.04 },
  { id: 'catfolk', name: 'Catfolk', desc: 'Light-footed, curious, landing always on your feet.', trait: 'Fast, high jumps, no fall damage from medium heights.', stats: { agility: 5, life: -10 }, skin: [0xd8a060, 0x8a6a4a, 0xe8e0d0, 0x4a4040], height: 0.95 }
];

export interface CallingDef { id: CallingId; name: string; desc: string; gear: [string, number][]; stats: Partial<Stats>; branches: [string, string, string]; }
export const CALLINGS: CallingDef[] = [
  { id: 'knight', name: 'Knight', desc: 'Sword and shield, defence and the charge.', gear: [['rusty_sword', 1], ['wooden_shield', 1]], stats: { defence: 3, strength: 2 }, branches: ['Blade', 'Bulwark', 'Charge'] },
  { id: 'bard', name: 'Bard', desc: 'A slim saber, songs that heal and inspire — and better prices.', gear: [['rusty_sword', 1], ['bandage', 3]], stats: { luck: 4, magic: 2 }, branches: ['Song', 'Wit', 'Saber'] },
  { id: 'mage', name: 'Mage', desc: 'Staff in hand, fire, ice and lightning in the mind.', gear: [['staff', 1], ['torch', 3]], stats: { magic: 6, mana: 50, life: -10 }, branches: ['Fire', 'Ice', 'Storm'] },
  { id: 'hunter', name: 'Hunter', desc: 'Bows, traps, tracking — and a loyal companion.', gear: [['flint_spear', 1], ['stone_knife', 1]], stats: { agility: 3, luck: 1 }, branches: ['Bow', 'Traps', 'Beasts'] },
  { id: 'scout', name: 'Scout', desc: 'Speed, far sight, maps and climbing.', gear: [['stone_knife', 1], ['rope', 3]], stats: { agility: 4, stamina: 20 }, branches: ['Pathfinder', 'Climber', 'Eagle Eye'] },
  { id: 'guardian', name: 'Guardian', desc: 'Heavy armour, hammers, taunts and force shields.', gear: [['club', 1], ['wooden_shield', 1]], stats: { defence: 5, life: 20, agility: -2 }, branches: ['Hammer', 'Ward', 'Taunt'] },
  { id: 'thief', name: 'Thief', desc: 'Daggers, locks and other people’s pockets.', gear: [['stone_knife', 1], ['bandage', 2]], stats: { agility: 3, luck: 3 }, branches: ['Locks', 'Pockets', 'Shadows'] },
  { id: 'assassin', name: 'Assassin', desc: 'Stealth, poison and the strike from behind.', gear: [['stone_knife', 1], ['antidote', 1]], stats: { agility: 3, strength: 2 }, branches: ['Poison', 'Stealth', 'Execution'] }
];

export const ABILITIES: { id: AbilityId; name: string; desc: string }[] = [
  { id: 'far_sight', name: 'Far Sight', desc: 'See further through mist and fog.' },
  { id: 'strength', name: 'Strength', desc: 'Your blows land 10% harder.' },
  { id: 'stamina', name: 'Stamina', desc: '+25 stamina, faster recovery.' },
  { id: 'blend_in', name: 'Blend In', desc: 'Enemies notice you later.' },
  { id: 'make_fire', name: 'Make Fire', desc: 'Strikes may set foes alight. Grows into Fire Burst.' },
  { id: 'speed', name: 'Speed', desc: 'Move 8% faster.' },
  { id: 'jumping', name: 'Jumping Power', desc: 'Jump 20% higher.' },
  { id: 'light_healing', name: 'Light Healing', desc: 'Wounds close faster.' },
  { id: 'force_shield', name: 'Force Shield', desc: 'Block more, even without a shield.' },
  { id: 'death_curse', name: 'Death Curse', desc: 'Your hits may curse enemies.' },
  { id: 'iron_skin', name: 'Iron Skin', desc: 'Take 10% less damage.' },
  { id: 'night_eye', name: 'Night Eye', desc: 'See in the dark.' },
  { id: 'beast_tongue', name: 'Beast Tongue', desc: 'Animals stay calm around you.' },
  { id: 'lockpicking', name: 'Lockpicking', desc: 'Open locked chests (at your own risk).' },
  { id: 'swimming', name: 'Swimming', desc: 'Swim faster, breathe longer.' },
  { id: 'herbalism', name: 'Herbalism', desc: 'Gather twice the herbs and plants.' },
  { id: 'haggling', name: 'Haggling', desc: 'Better prices with merchants.' },
  { id: 'silent_steps', name: 'Silent Steps', desc: 'Your footfalls make no sound; ambushes rarely surprise you.' }
];
export const ABILITY_PICKS = 10;
export const EXCLUSIONS: [AbilityId, AbilityId][] = [
  ['light_healing', 'death_curse'], ['force_shield', 'iron_skin'], ['blend_in', 'beast_tongue'],
  ['speed', 'iron_skin'], ['silent_steps', 'make_fire'], ['haggling', 'lockpicking']
];

export interface Look {
  gender: Gender; race: RaceId; skin: number; hairStyle: number; hairColor: number; beard: boolean;
  eyeSize: number; brows: number; nose: number; mouth: number; cheeks: number; scars: boolean;
  jacket: number; trousers: number; boots: number; headwear: 0 | 1 | 2; // none, hood, cap
}
export const HAIR_COLORS = [0x1e1610, 0x3a2614, 0x6a4a24, 0xa06830, 0xd8c088, 0x8a8a8a, 0xe8e8e8, 0x7a1e1a];
export const CLOTH_COLORS = [0x5a3d2b, 0x3d5233, 0x38455f, 0x73291f, 0x8c7340, 0x2a2a2e, 0x6a5a7a, 0xb8b0a0];
export const HAIR_STYLES = ['Shorn', 'Short', 'Long', 'Braided', 'Wild'];

export function defaultLook(): Look {
  return { gender: 'male', race: 'human', skin: 0, hairStyle: 1, hairColor: 1, beard: false, eyeSize: 0.5, brows: 0.5, nose: 0.5, mouth: 0.5, cheeks: 0.5, scars: false, jacket: 0, trousers: 5, boots: 0, headwear: 1 };
}

export interface Profile { name: string; look: Look; race: RaceId; calling: CallingId; abilities: AbilityId[]; created: boolean; }

// The Naming Gnome
export const GNOME_SILLY = ['Mudbottom', 'Sir Trips-a-lot', 'Puddle', 'Gnat', 'Wobblechin', 'Turnip', 'Lord Snivel', 'Crumb'];
export const GNOME_DARK = ['Nyx', 'Thanatos', 'Hypnos', 'Lethe', 'Styx', 'Erebos', 'Moros', 'Keres', 'Acheron', 'Nemesis'];
export const PLAIN_NAMES = ['bob', 'tom', 'player', 'hero', 'test', 'abc', 'max', 'name', 'me', 'joe', 'ben', 'john', 'anna'];
export const GNOME_RUDE = ['Dull ones don’t last long out here.', 'Pfah. A name like a wet sock.', 'I’ve met turnips with more mystery.', 'Your mother must have been very tired.'];
