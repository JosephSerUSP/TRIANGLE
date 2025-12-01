// src/core/Constants.js

/**
 * Musical intervals used for harmony generation.
 * Represents frequency ratios relative to the root note.
 * @type {number[]}
 */
export const BEAUTIFUL_INTERVALS = [
    1.0,    // Unison
    1.25,   // Major 3rd
    1.5,    // Perfect 5th
    1.875,  // Major 7th
    2.25,   // Major 9th
    2.8125, // #11
    3.0     // 2 oct + 5th
];

/**
 * Color codes for the performers (Physical, Virtual A, Virtual B).
 * @type {number[]}
 */
export const PERFORMER_COLORS = [
    0x88eeee, // Physical bass
    0xff66ff, // Virtual A
    0xffdd55  // Virtual B
];
