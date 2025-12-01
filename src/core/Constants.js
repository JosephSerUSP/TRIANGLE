// src/core/Constants.js

/**
 * Musical intervals used for harmony generation.
 * Represents frequency ratios relative to the root note.
 * @constant
 * @type {number[]}
 */
export const BEAUTIFUL_INTERVALS = [
    2.25,   // Major 9th (E)
    1.5,    // Perfect 5th (A)
    3.0,    // Perfect 5th octave up (A)
    1.875,  // Major 7th (C#)
    3.75,   // Major 7th octave up
    2.8125, // #11 (G#)
    1.25    // Major 3rd (F#)
];

/**
 * Chord definitions for the Voice Leading Agent.
 * Each chord contains a list of intervals relative to the root (D2).
 * Aiming for "beautiful, wistful chords" (e.g., Dm9, BbMaj7, Gm9).
 * Intervals: 1.0 (Root), 1.2 (Min3), 1.25 (Maj3), 1.5 (P5), 1.78 (Min7), 1.875 (Maj7), 2.0 (Octave), etc.
 */
export const CHORDS = [
    // D Minor 9 (D, F, A, C, E) -> Wistful, deep
    {
        name: "Dm9",
        intervals: [1.0, 1.2, 1.5, 1.78, 2.25, 2.4, 3.0, 3.56]
    },
    // Bb Major 7 / D (Bb, D, F, A) -> Lydian-ish feel over D pedal? Or just beautiful relative major.
    // Relative to D: Bb is b6 (1.6), D is 1, F is b3 (1.2), A is 5 (1.5).
    // Let's stick to simple ratios relative to D root for easier math.
    {
        name: "BbMaj7",
        intervals: [0.8, 1.0, 1.2, 1.5, 1.6, 2.0, 2.4, 3.0] // 0.8 is Bb below D? No, 1.6/2 = 0.8.
    },
    // G Minor 9 (G, Bb, D, F, A) -> Subdominant minor, very wistful.
    // G is 4th (1.33), Bb (1.6), D (1.0), F (1.2), A (1.5)
    {
        name: "Gm9",
        intervals: [1.0, 1.2, 1.333, 1.5, 1.6, 2.0, 2.4, 2.666]
    },
    // A Suspended / A7 (A, D, E, G) -> Tension
    // A (1.5), D (1.0/2.0), E (2.25), G (1.33/2.66)
    {
        name: "Asus",
        intervals: [1.0, 1.125, 1.5, 1.78, 2.25, 3.0] // 1.125 is E? 1.5 * 1.5 = 2.25.
    },
    // D Dorian (D, E, F, G, A, B, C)
    {
        name: "D Dorian",
        intervals: [1.0, 1.125, 1.2, 1.333, 1.5, 1.68, 1.78, 2.0]
    }
];


/**
 * Color codes for the performers (Physical, Virtual A, Virtual B).
 * @constant
 * @type {number[]}
 */
export const PERFORMER_COLORS = [
    0x88eeee, // Physical bass
    0xff66ff, // Virtual A
    0xffdd55  // Virtual B
];
