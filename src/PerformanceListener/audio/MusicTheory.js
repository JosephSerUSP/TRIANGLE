/**
 * Defines the chord progression for the audio system.
 * Each object in the array represents a chord.
 * @property {string} name - The name of the chord.
 * @property {number[]} notes - The intervals of the chord in semitones from the root.
 * @property {number} bass - The bass note of the chord in semitones from the root.
 * @type {Array<object>}
 */
export const CHORD_PROGRESSION = [
    // D Maj9: D, F#, A, C#, E
    { name: 'DMaj9', notes: [0, 4, 7, 11, 14], bass: 0 },

    // Bm11: B, D, F#, A, C#, E
    { name: 'Bm11', notes: [-3, 0, 4, 7, 11, 14], bass: -3 },

    // Em9: E, G, B, D, F#
    { name: 'Em9', notes: [2, 5, 9, 12, 16], bass: 2 },

    // A13sus: A, D, E, G, B, F#
    { name: 'A13sus', notes: [7, 12, 14, 19, 21, 26], bass: 7 },

    // F#m11: F#, A, C#, E, G#, B
    { name: 'F#m11', notes: [4, 7, 11, 14, 18, 21], bass: 4 },

    // G Maj9: G, B, D, F#, A
    { name: 'GMaj9', notes: [5, 9, 12, 16, 19], bass: 5 },

    // Em11: E, G, B, D, F#, A
    { name: 'Em11', notes: [2, 5, 9, 12, 16, 19], bass: 2 },

    // A7alt: A, C#, G, C (Eb), F (F) - approximated
    { name: 'A7b9', notes: [7, 13, 16, 19, 22], bass: 7 }
];

/**
 * Defines musical scales.
 * Each property is a scale, represented by an array of intervals in semitones from the root.
 * @type {object}
 */
export const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11, 12],
    dorian: [0, 2, 3, 5, 7, 9, 10, 12],
    minor: [0, 2, 3, 5, 7, 8, 10, 12],
    lydian: [0, 2, 4, 6, 7, 9, 11, 12]
};
