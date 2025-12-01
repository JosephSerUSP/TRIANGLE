// ============================================================================
// CONFIGURATION
// ============================================================================
/**
 * Global configuration object for the application.
 * Controls camera settings, interaction limits, audio parameters, and visual properties.
 * @constant
 * @type {Object}
 */
export const CONFIG = {
    /** Camera settings */
    camera: { width: 640, height: 480 },
    /** Whether to mirror the video input */
    mirrored: true,
    /** Smoothing factor for pose transitions */
    smoothing: 0.1,
    /** Smoothing factor for depth transitions */
    depthSmoothing: 0.05,
    /** Enable or disable debug mode */
    debug: false,
    /** Grid visual settings */
    grid: {
        size: 10000,
        divisions: 20,
        phaseScale: 500.0
    },
    /** Interaction limits for rotation */
    interaction: {
        maxRoll: Math.PI / 2,
        maxPitch: Math.PI / 6,
        maxYaw: Math.PI / 2
    },
    /** Audio synthesis parameters */
    audio: {
        rootFreq: 73.42, // D2
        detune: 4,
        filterMin: 100,
        filterMax: 8000,
        bpmMin: 40,
        bpmMax: 140,
        lfoRateMin: 0.3,
        lfoRateMax: 8.0
    }
};

/**
 * Musical intervals used for harmony generation.
 * Represents frequency ratios relative to the root note.
 * @constant
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
 * @constant
 * @type {number[]}
 */
export const PERFORMER_COLORS = [
    0x88eeee, // Physical bass
    0xff66ff, // Virtual A
    0xffdd55  // Virtual B
];
