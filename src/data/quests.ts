// Quest table (data). A quest is a list of stages; a stage is done when all of its
// objectives are. Places are names resolved at runtime (the citadel's position
// depends on the seed), so quests stay plain data.
export type Place = 'campfire' | 'herald' | 'tower' | 'graveyard' | 'lab_entrance' | 'citadel' | 'arena' | 'quest_board'
  | 'village1' | 'falcon_meadow' | 'monument' | 'chapel' | 'cathedral' | 'hollow_tower' | 'errand';

export type Objective =
  | { kind: 'goto'; at: Place; r: number; text: string }
  | { kind: 'kill'; enemy: string; n: number; text: string; at?: Place; r?: number }
  | { kind: 'collect'; item: string; n: number; text: string; at?: Place }
  | { kind: 'flag'; flag: string; text: string; at?: Place };

export interface Stage { text: string; objectives: Objective[]; }
export interface Reward { gold?: number; xp?: number; items?: [string, number][]; }
export interface QuestDef {
  id: string; title: string; desc: string;
  /** main story chapter number */
  chapter?: number;
  /** offered on the citadel's quest board */
  board?: boolean;
  stages: Stage[];
  reward: Reward;
  /** quest started automatically when this one completes */
  next?: string;
  /** text shown (toast) on completion */
  done?: string;
}

export const QUESTS: Record<string, QuestDef> = {};
const Q = (d: QuestDef) => { QUESTS[d.id] = d; };

// ------------------------------------------------------------------ main story
Q({ id: 'ch1', chapter: 1, title: 'Find the Herald', desc: 'You woke with no name and no face. Somewhere in these woods, someone is waiting for you.',
  stages: [
    { text: 'A light flickers between the trees.', objectives: [{ kind: 'flag', flag: 'met_stranger', text: 'Find the light in the woods', at: 'campfire' }] },
    { text: 'The Ashen Stranger told you to follow the stream to the gorge.', objectives: [{ kind: 'flag', flag: 'met_herald', text: 'Follow the stream to the gorge', at: 'herald' }] },
    { text: 'The Herald sent you to the tower beyond the gorge.', objectives: [{ kind: 'flag', flag: 'rite_done', text: 'Complete the First Rite in the tower', at: 'tower' }] }
  ],
  reward: { xp: 60 }, next: 'ch2', done: 'Chapter 1 complete — Find the Herald' });

Q({ id: 'ch2', chapter: 2, title: 'The Grave Robbers’ Hoard', desc: 'The Herald wants back what was stolen from the old barrow cemetery. He did not say what it was.',
  stages: [
    { text: 'Grave robbers dig in the old barrow cemetery, north-east of the tower.', objectives: [{ kind: 'goto', at: 'graveyard', r: 22, text: 'Find the old barrow cemetery' }] },
    { text: 'They are still here, and they do not want to share.', objectives: [{ kind: 'kill', enemy: 'grave_robber', n: 4, text: 'Drive off the grave robbers', at: 'graveyard', r: 60 }] },
    { text: 'Their hoard is hidden among the graves.', objectives: [{ kind: 'flag', flag: 'hoard_opened', text: 'Open the robbers’ hoard', at: 'graveyard' }] }
  ],
  reward: { gold: 40, xp: 90 }, next: 'ch3', done: 'Chapter 2 complete — The Grave Robbers’ Hoard' });

Q({ id: 'ch3', chapter: 3, title: 'The Scorpion Labyrinth', desc: 'A torn map from the hoard shows the Pale Citadel — and a way in beneath its sealed gate.',
  stages: [
    { text: 'The map marks an arch of pale stone south of the citadel’s walls.', objectives: [{ kind: 'goto', at: 'lab_entrance', r: 14, text: 'Find the labyrinth entrance' }] },
    { text: 'Somewhere in the dark there is a stair up into the citadel. The scorpions know where.', objectives: [{ kind: 'flag', flag: 'citadel_reached', text: 'Find the way through the labyrinth', at: 'citadel' }] }
  ],
  reward: { gold: 30, xp: 140, items: [['bandage', 2]] }, next: 'ch4', done: 'Chapter 3 complete — The Scorpion Labyrinth' });

Q({ id: 'ch4', chapter: 4, title: 'The Arena Trials', desc: 'In the Pale Citadel, names are earned in the arena. Kallias the Unbowed keeps the lists.',
  stages: [
    { text: 'The arena lies on the north side of the citadel.', objectives: [{ kind: 'flag', flag: 'arena_signed', text: 'Speak to the arena master', at: 'arena' }] },
    { text: 'Three trials: the pack, the champion, the beast. Step into the ring when you are ready.', objectives: [{ kind: 'flag', flag: 'arena_won', text: 'Win the three arena trials', at: 'arena' }] }
  ],
  reward: { gold: 150, xp: 260, items: [['iron_shield', 1]] }, next: 'ch5', done: 'Chapter 4 complete — The Arena Trials. The crowd chants your name.' });

Q({ id: 'ch5', chapter: 5, title: 'The Killer Sheep', desc: 'Four shepherds of the first village were found dead in their pastures. The villagers blame wolves. The wolves have an alibi.',
  stages: [
    { text: 'The first village lies a short walk from the clearing where you woke.', objectives: [{ kind: 'goto', at: 'village1', r: 55, text: 'Go to the first village' }] },
    { text: 'The flock grazes in the fields around the village. At night, it hunts.', objectives: [{ kind: 'kill', enemy: 'killer_sheep', n: 6, text: 'Put down the killer sheep', at: 'village1', r: 120 }] }
  ],
  reward: { gold: 70, xp: 300, items: [['festival_tunic', 1]] }, next: 'ch6', done: 'Chapter 5 complete — The Killer Sheep. The village throws you a very awkward feast.' });

Q({ id: 'ch6', chapter: 6, title: 'The Golden Falcon', desc: 'A falcon of living gold hunts the meadows, and it has started hunting hunters. Nobody has ever hit it twice.',
  stages: [
    { text: 'Shepherds saw it circling over the open meadows beyond the village.', objectives: [{ kind: 'goto', at: 'falcon_meadow', r: 40, text: 'Find the Golden Falcon’s hunting ground' }] },
    { text: 'It is fast. Bows help. Patience helps more.', objectives: [{ kind: 'kill', enemy: 'golden_falcon', n: 1, text: 'Bring down the Golden Falcon' }] }
  ],
  reward: { gold: 90, xp: 420, items: [['wish_shard', 1]] }, next: 'ch7', done: 'Chapter 6 complete — The Golden Falcon.' });

Q({ id: 'ch7', chapter: 7, title: 'The Monument of Warning', desc: 'Far to the south-west, alone in the wilds, stands a statue nobody built. The Herald does not want you to read it. That is reason enough.',
  stages: [
    { text: 'Travellers say it can be seen from a day away: a priest and two serpents.', objectives: [{ kind: 'goto', at: 'monument', r: 30, text: 'Journey to the Monument of Warning' }] },
    { text: 'Words are cut into the plinth, worn almost smooth.', objectives: [{ kind: 'flag', flag: 'monument_read', text: 'Read the plinth', at: 'monument' }] }
  ],
  reward: { xp: 450 }, next: 'ch8', done: 'Chapter 7 complete — The Monument of Warning.' });

Q({ id: 'ch8', chapter: 8, title: 'The Living Fresco', desc: 'The chapel of the Pale Citadel has a painted wall that paints itself. It has been painting you.',
  stages: [
    { text: 'The fresco covers the back wall of the Citadel’s chapel.', objectives: [{ kind: 'flag', flag: 'fresco_seen', text: 'Study the Living Fresco', at: 'chapel' }] },
    { text: 'One panel shows a robed figure with two faces: one grey and kind, one gaunt with amber eyes. You know both.', objectives: [{ kind: 'flag', flag: 'stranger_truth', text: 'Ask the Ashen Stranger about the fresco', at: 'campfire' }] }
  ],
  reward: { xp: 500 }, next: 'ch9', done: 'Chapter 8 complete — The Living Fresco and the secret of the Ashen Stranger.' });

Q({ id: 'ch9', chapter: 9, title: 'The Herald’s Errands', desc: 'The Herald has work for you. It gets darker every time. Obey, refuse — or try to be clever.',
  stages: [{ text: 'He will find you when he has an errand. Listen to the hoofbeats.', objectives: [{ kind: 'flag', flag: 'errands_two', text: 'Settle two of the Herald’s errands' }] }],
  reward: { xp: 500, gold: 80 }, next: 'ch10', done: 'Chapter 9 complete — The Herald’s Errands.' });

Q({ id: 'ch10', chapter: 10, title: 'Judgment in the Cathedral', desc: 'The Herald summons you to the Cathedral to be judged. Every errand, every choice, every hesitation is written down.',
  stages: [
    { text: 'The Cathedral stands east of the Pale Citadel, black against the sky.', objectives: [{ kind: 'goto', at: 'cathedral', r: 26, text: 'Go to the Cathedral' }] },
    { text: 'Approach the altar and face his judgment.', objectives: [{ kind: 'flag', flag: 'judged', text: 'Face the Herald’s judgment', at: 'cathedral' }] }
  ],
  reward: { xp: 700, gold: 120 }, next: 'ch11', done: 'Chapter 10 complete — Judgment in the Cathedral.' });

Q({ id: 'ch11', chapter: 11, title: 'Gathering Allies', desc: 'The Hollow King’s tower cannot be taken alone. The villages have reason to fear him — and to trust you, if you earned it.',
  stages: [{ text: 'Ask the guards of villages that trust you to stand with you (reputation “Friendly” or better).', objectives: [{ kind: 'flag', flag: 'allies_gathered', text: 'Win the pledges of three guards' }] }],
  reward: { xp: 600 }, next: 'ch12', done: 'Chapter 11 complete — Gathering Allies.' });

Q({ id: 'ch12', chapter: 12, title: 'The Hollow King’s Tower', desc: 'A black fortress at the far edge of the world. Your allies will meet you there.',
  stages: [
    { text: 'Far to the south-east, past the Cathedral, the tower waits.', objectives: [{ kind: 'goto', at: 'hollow_tower', r: 45, text: 'Reach the Hollow King’s Tower' }] },
    { text: 'He waits at the top of the stair.', objectives: [{ kind: 'kill', enemy: 'hollow_king', n: 1, text: 'Defeat the Hollow King' }] }
  ],
  reward: { xp: 2000, gold: 400 }, done: 'Chapter 12 complete — The Hollow King’s Tower.' });

// ------------------------------------------------------------------ the Herald's errands
Q({ id: 'errand_box', title: 'Errand: The Sealed Box', desc: 'Deliver the sealed box to the ruin he named — before nightfall, and without opening it.',
  stages: [{ text: 'The box is heavy, and something inside it is beating.', objectives: [{ kind: 'flag', flag: 'box_delivered', text: 'Deliver the box before nightfall', at: 'errand' }] }],
  reward: { gold: 60, xp: 120 } });
Q({ id: 'errand_spy', title: 'Errand: The Merchant’s Night', desc: 'Watch the merchant he named, after dark. Then tell him what you saw.',
  stages: [{ text: 'Stay close to the merchant at night without being seen leaving.', objectives: [{ kind: 'flag', flag: 'spied', text: 'Watch the merchant at night', at: 'errand' }] }],
  reward: { xp: 120 } });
Q({ id: 'errand_news', title: 'Errand: False News', desc: 'Tell the people of a village that the Hollow King’s riders are coming. They are not.',
  stages: [{ text: 'Spread the news to three villagers.', objectives: [{ kind: 'flag', flag: 'news_spread', text: 'Spread the Herald’s news', at: 'errand' }] }],
  reward: { gold: 40, xp: 120 } });
Q({ id: 'errand_wine', title: 'Errand: The Wine', desc: 'At The Last Thread, Lachesis drinks wine every night. Tonight her cup should hold the contents of this vial.',
  stages: [{ text: 'Find Lachesis in the Pale Citadel.', objectives: [{ kind: 'flag', flag: 'wine_done', text: 'Deal with Lachesis’ wine', at: 'citadel' }] }],
  reward: { gold: 100, xp: 160 } });
Q({ id: 'errand_grave', title: 'Errand: Old Hob’s Bones', desc: 'A favour owed. Dig up Old Hob’s grave in the barrow cemetery and bring the Herald what you find.',
  stages: [{ text: 'The open grave by the hoard. Dig.', objectives: [{ kind: 'flag', flag: 'hob_dug', text: 'Dig up Old Hob’s grave', at: 'graveyard' }] }],
  reward: { xp: 150 } });

// ------------------------------------------------------------------ the quest board (side quests)
Q({ id: 'board_rats', board: true, title: 'Rats in the Wine Cellar', desc: 'Atropos of The Last Thread pays for every giant rat that will never gnaw a barrel again.',
  stages: [{ text: 'Giant rats nest in fields and forests all over the land.', objectives: [{ kind: 'kill', enemy: 'rat', n: 6, text: 'Kill giant rats' }] }],
  reward: { gold: 25, xp: 40 } });
Q({ id: 'board_slime', board: true, title: 'The Alchemist’s Order', desc: 'An alchemist needs toad slime for a salve. “Fresh, if you please — not the stuff from the gutter.”',
  stages: [{ text: 'Toadlings lurk in moonlit forests and swamps.', objectives: [{ kind: 'collect', item: 'toad_slime', n: 5, text: 'Gather toad slime' }] }],
  reward: { gold: 30, xp: 45, items: [['antidote', 1]] } });
Q({ id: 'board_scorpions', board: true, title: 'Thin the Labyrinth', desc: 'The guards want fewer scorpions crawling up the stair at night.',
  stages: [{ text: 'The labyrinth lies beneath the citadel.', objectives: [{ kind: 'kill', enemy: 'scorpion', n: 5, text: 'Kill giant scorpions', at: 'citadel', r: 80 }] }],
  reward: { gold: 45, xp: 70 } });
Q({ id: 'board_bones', board: true, title: 'Bones for the Ossuary', desc: 'The chapel’s ossuary is short of… material. The priest does not ask where it comes from.',
  stages: [{ text: 'Skeletons and old battlefields are full of them.', objectives: [{ kind: 'collect', item: 'bone', n: 8, text: 'Bring bones' }] }],
  reward: { gold: 20, xp: 35 } });
