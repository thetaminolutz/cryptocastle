// Villager data: names, traits, likes, dialogue templates, rumours, shop stock.
import type { Job } from '../world/villages';

export const NAMES_M = ['Aldric', 'Bram', 'Cedric', 'Doran', 'Edwin', 'Fendrel', 'Gareth', 'Hob', 'Ivo', 'Joren', 'Kell', 'Lothar', 'Marek', 'Nils', 'Osric', 'Piet', 'Rowan', 'Silas', 'Tobin', 'Ulric', 'Wat', 'Yorick', 'Anselm', 'Brother Elias'];
export const NAMES_F = ['Ada', 'Brenna', 'Cora', 'Dagny', 'Elsbeth', 'Freya', 'Greta', 'Hilde', 'Isolde', 'Jessa', 'Katrin', 'Liesl', 'Mara', 'Nell', 'Odile', 'Petra', 'Rosalind', 'Sabine', 'Tilda', 'Una', 'Wynn', 'Ysolde', 'Agnes', 'Maude'];
export const SURNAMES = ['Thornfield', 'Ashby', 'Millward', 'Brookes', 'Fenwick', 'Hollins', 'Ravensworth', 'Coldwell', 'Barrow', 'Mossgrove', 'Underhill', 'Blackwood', 'Greaves', 'Harrow', 'Oakley', 'Stone'];

export type Trait = 'friendly' | 'grumpy' | 'greedy' | 'brave' | 'cowardly' | 'gossipy' | 'pious' | 'sociable';
export const TRAITS: Trait[] = ['friendly', 'grumpy', 'greedy', 'brave', 'cowardly', 'gossipy', 'pious', 'sociable'];

/** Item ids villagers may like or dislike as gifts. */
export const GIFTABLE = ['petals', 'moonpetal', 'berries', 'cooked_meat', 'roast_mushroom', 'berry_mash', 'gold_bar', 'silver_bar', 'crystal_shard', 'leather', 'fang', 'toad_slime', 'bone', 'ectoplasm', 'resin', 'glowcap', 'raw_meat', 'mushroom'];
export const DISLIKED_BY_ALL = ['toad_slime', 'ectoplasm', 'bone'];

export const JOB_TITLE: Record<Job, string> = {
  farmer: 'Farmer', blacksmith: 'Blacksmith', guard: 'Guard', merchant: 'Merchant', alchemist: 'Alchemist', tailor: 'Tailor',
  priest: 'Priest', child: 'Child', innkeeper: 'Innkeeper', hunter: 'Hunter', beggar: 'Beggar', villager: 'Villager', banker: 'Banker', arena_master: 'Arena Master'
};

/** What each job asks for when you look for work: item, amount range, reward per item (gold). */
export const JOB_NEEDS: Partial<Record<Job, [string, number, number, number][]>> = {
  farmer: [['fiber', 6, 12, 1], ['stick', 6, 10, 1], ['planks', 4, 8, 2]],
  blacksmith: [['coal', 3, 6, 4], ['iron_ore', 2, 5, 9], ['copper_ore', 3, 6, 6], ['log', 4, 8, 2]],
  innkeeper: [['raw_meat', 3, 6, 4], ['berries', 4, 8, 2], ['mushroom', 3, 6, 2]],
  alchemist: [['glowcap', 2, 4, 8], ['moonpetal', 1, 2, 12], ['venom_sac', 1, 2, 12], ['toad_slime', 2, 4, 4], ['fern', 3, 6, 2]],
  tailor: [['hide', 2, 4, 5], ['fiber', 8, 14, 1], ['petals', 2, 5, 3]],
  hunter: [['hide', 2, 4, 5], ['fang', 2, 3, 5]],
  priest: [['moonpetal', 1, 2, 12], ['resin', 2, 4, 3]],
  guard: [['bandage', 2, 4, 5], ['rusty_sword', 1, 1, 14]],
  merchant: [['crystal_shard', 1, 3, 14], ['silver_ore', 1, 3, 16], ['leather', 2, 4, 9]],
  villager: [['log', 4, 8, 2], ['stone', 6, 10, 1], ['berries', 3, 6, 2]]
};

export interface ShopDef { name: string; stock: [string, number][]; buys: string[]; }
export const SHOPS: Partial<Record<Job, ShopDef>> = {
  blacksmith: { name: 'Smithy', stock: [['stone_pickaxe', 2], ['stone_axe', 2], ['copper_pickaxe', 1], ['iron_sword', 1], ['iron_mace', 1], ['wooden_shield', 2], ['iron_shield', 1], ['iron_bar', 6], ['copper_bar', 6], ['torch', 10]],
    buys: ['iron_ore', 'copper_ore', 'silver_ore', 'gold_ore', 'coal', 'iron_bar', 'copper_bar', 'rusty_sword', 'iron_sword', 'iron_mace', 'mithril_ore', 'fang', 'troll_hide'] },
  merchant: { name: 'General Store', stock: [['cooked_meat', 6], ['berry_mash', 4], ['torch', 12], ['rope', 8], ['planks', 30], ['bandage', 6], ['wooden_shield', 1], ['glass', 6], ['brick', 12], ['flint_spear', 2]],
    buys: ['log', 'planks', 'stone', 'hide', 'leather', 'raw_meat', 'berries', 'mushroom', 'fiber', 'rope', 'crystal_shard', 'gem', 'silver_bar', 'gold_bar', 'moonstone', 'chitin', 'bone'] },
  alchemist: { name: 'Alchemist', stock: [['poultice', 4], ['antidote', 4], ['bandage', 8], ['glowcap', 3], ['moonpetal', 2]],
    buys: ['glowcap', 'moonpetal', 'venom_sac', 'toad_slime', 'fern', 'petals', 'ectoplasm', 'ember_core', 'resin', 'mushroom'] },
  tailor: { name: 'Tailor', stock: [['rope', 6], ['leather', 6], ['bandage', 4]],
    buys: ['hide', 'leather', 'fiber', 'petals', 'troll_hide'] },
  innkeeper: { name: 'The Inn', stock: [['cooked_meat', 8], ['roast_mushroom', 6], ['berry_mash', 6]],
    buys: ['raw_meat', 'berries', 'mushroom', 'cooked_meat'] }
};

// ---- dialogue templates. {name}, {player}, {village}, {time}, {weather}, {job}
export const GREET = {
  morning: ['Morning, {player}.', 'Early on your feet, stranger.', 'The cock’s barely crowed and here you are.'],
  day: ['Good day to you.', 'Well met, traveller.', 'What brings you to {village}?'],
  evening: ['Evening. Mind the road after dark.', 'The day’s nearly done, {player}.', 'Off to the tavern, are you?'],
  night: ['What are you doing out at this hour?', 'It’s late. Things walk at night.', 'Shouldn’t you be indoors?']
};
export const GREET_REP = {
  hostile: ['You again. Say what you want and go.', 'I’ve nothing for the likes of you.', 'Keep your hands where I can see them.'],
  cool: ['Hm.', 'Yes?', 'Make it quick.'],
  warm: ['Ah, {player}! Good to see you.', 'Always a pleasure, friend.', 'There’s my favourite wanderer.'],
  beloved: ['{player}! {village} owes you more than it can say.', 'Sit, sit — anything you need.', 'Our hero returns!']
};
export const WEATHER_LINES: Record<string, string[]> = {
  rain: ['Wet enough for you?', 'This rain will rot the barley.'],
  storm: ['Hear that thunder? The old gods are angry.', 'Bar the shutters tonight.'],
  snow: ['Cold bites deep this year.'],
  fog: ['Can’t see your own hand in this fog.', 'Fog like this hides things.'],
  sandstorm: ['Sand in everything. Everything!'],
  clear: ['Fine weather, at least.', 'Clear skies. Enjoy them while they last.']
};
export const TRAIT_LINES: Record<Trait, string[]> = {
  friendly: ['Anything I can help you with?', 'Don’t be a stranger now.'],
  grumpy: ['Busy. Always busy.', 'Another wanderer. Wonderful.'],
  greedy: ['Got coin? Then we can talk.', 'Everything has a price.'],
  brave: ['If trouble comes, I’ll be ready.', 'I’m not afraid of what lurks out there.'],
  cowardly: ['Did you hear that? No? Good. Good.', 'I never go past the well after dark.'],
  gossipy: ['Have you heard? No? Oh, let me tell you…', 'I hear everything in this village. Everything.'],
  pious: ['Light keep you.', 'Have you been to the chapel? You should.'],
  sociable: ['Join us at the tavern later!', 'Good company is worth more than gold.']
};
export const RUMOURS = [
  'They say wolves have been seen near the {dir} road. Big ones.',
  'Bandits are camping somewhere {dir} of here. Took a cart of grain last week.',
  'A hunter swears he saw a troll in the {biome} to the {dir}. Size of a barn.',
  'There’s a rider who comes at dusk. Amber eyes. He asks questions no one should know to ask.',
  'Old Wat says there are caves under the hills {dir} of here — and things glowing inside.',
  'Something has been killing sheep. Not wolves. Wolves don’t leave the wool.',
  'The dead don’t rest well on the moors. Take silver if you go.',
  'I heard a white city lies beyond a maze of tunnels full of scorpions. Pale walls, they say.',
  'The {biome} to the {dir} is full of strange plants that only bloom at night.',
  'A merchant came through with crystal from the deep caves. Glowed like moonlight.',
  'Don’t drink from the swamp. Toadlings breed there, and they bite.',
  'There’s a statue out in the wilds of a man strangled by serpents. Nobody knows who made it.'
];
export const CHATTER = [
  'Barley’s coming in thin.', 'Did you see the size of that pig?', 'My knees say rain.', 'The smith’s been quiet lately.',
  'Who left the gate open again?', 'Heard wolves last night.', 'Pass the bread.', 'Ha! You wish.', 'Mind your own business.',
  'Priest says the stars are wrong this year.', 'Have you paid the innkeeper yet?', 'My boy wants to be a guard.', 'Not another stranger…'
];
export const GIFT_REACT = {
  love: ['Oh! How did you know? Thank you!', 'For me? You’re too kind.'],
  like: ['That’s thoughtful. Thank you.', 'I can use this.'],
  neutral: ['Er… thank you, I suppose.', 'Hm. Alright.'],
  dislike: ['What am I supposed to do with that?', 'Is this a joke?']
};
