// Quest table (data). A quest is a list of stages; a stage is done when all of its
// objectives are. Places are names resolved at runtime (the citadel's position
// depends on the seed), so quests stay plain data.
export type Place = 'campfire' | 'herald' | 'tower' | 'graveyard' | 'lab_entrance' | 'citadel' | 'arena' | 'quest_board';

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
  reward: { gold: 150, xp: 260, items: [['iron_shield', 1]] }, done: 'Chapter 4 complete — The Arena Trials. The crowd chants your name.' });

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
