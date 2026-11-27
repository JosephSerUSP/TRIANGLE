/**
 * @fileoverview Harmony data. Each chord: `notes` = [root, 3rd, 5th, 7th, 9th]
 * (or 13th) in semitones from D; `bass` = bass note offset.
 */
export const CHORD_PROGRESSION = [
    { name: 'DMaj9', notes: [0, 4, 7, 11, 14], bass: 0 },
    { name: 'Bm9', notes: [-3, 0, 4, 7, 11], bass: -3 },
    { name: 'Em9', notes: [2, 5, 9, 12, 16], bass: 2 },
    { name: 'A13', notes: [7, 11, 14, 17, 21], bass: 7 }
];

/** Index of each chord tone inside `notes`. */
export const CHORD_TONE = Object.freeze({ root: 0, third: 1, fifth: 2, seventh: 3, ninth: 4 });
