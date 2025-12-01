// src/core/Constants.js

/**
 * Musical intervals used for harmony generation.
 * Represents frequency ratios relative to the root note.
 * @constant
 * @type {number[]}
 */
export const BEAUTIFUL_INTERVALS = [
    2.25,   // Major 9th
    1.5,    // Perfect 5th
    3.0,    // Perfect 5th octave up
    1.875,  // Major 7th
    3.75,   // Major 7th octave up
    2.8125, // #11
    1.25    // Major 3rd
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
