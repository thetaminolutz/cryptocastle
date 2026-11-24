// Fixed story locations of the opening (world coordinates).
export const START = { x: 0.5, z: 0.5 };
export const SPRING = { x: 9, z: -9, r: 3.6 };
export const CAMPFIRE = { x: -22, z: -32 };
export const GORGE = { x0: -78, x1: -40, z: -106, r: 6, depth: 10 };
export const HERALD_SPOT = { x: -58, z: -96 };
export const TOWER = { x: -30, z: -84 };

// Chapters 2–4
/** the old barrow cemetery where grave robbers dig (chapter 2) */
export const GRAVEYARD = { x: 96, z: -232 };
/** nominal centre of the Pale Citadel; the real site is searched near it on good ground */
export const CITADEL_NOMINAL = { x: 250, z: -560 };
/** half-size of the citadel's white walls (m) and its flattened radius */
export const CITADEL_HALF = 34;
export const CITADEL_R = 46;
/** the scorpion labyrinth lies beneath the citadel: 13x13 cells of 6 m, floor 12 m down */
export const LAB = { cells: 13, cell: 6, depth: 12, width: 3, height: 3.4 };

// Chapters 5–12
/** the Monument of Warning: a priest strangled by serpents, alone in the wilderness */
export const MONUMENT = { x: -620, z: -980 };
/** the Cathedral where the Herald judges */
export const CATHEDRAL = { x: 520, z: -820 };
/** the Hollow King's black fortress at the far edge of the story map */
export const HOLLOW_TOWER = { x: 1180, z: -1560 };
/** the long-dead sorcerer whose will became the Herald and the Stranger */
export const SORCERER = 'Morvaine';
