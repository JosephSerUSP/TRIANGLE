/**
 * Defines the chord progression for the audio system.
 * Each object in the array represents a chord.
 * @property {string} name - The name of the chord.
 * @property {number[]} notes - The intervals of the chord in semitones from the root.
 * @property {number} bass - The bass note of the chord in semitones from the root.
 * @type {Array<object>}
 */
export const CHORD_PROGRESSION = [
    { name: 'DMaj9', notes: [0, 4, 7, 11, 14], bass: 0 },
    { name: 'Bm9', notes: [-3, 0, 4, 7, 11], bass: -3 },
    { name: 'Em9', notes: [2, 5, 9, 12, 16], bass: 2 },
    { name: 'A13', notes: [7, 11, 14, 17, 21], bass: 7 }
];

/**
 * Defines musical scales.
 * Each property is a scale, represented by an array of intervals in semitones from the root.
 * @type {object}
 */
export const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11, 12],
    dorian: [0, 2, 3, 5, 7, 9, 10, 12]
};
