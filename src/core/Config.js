// src/core/Config.js

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
    /**
     * View mode:
     * 0: Lattice Only
     * 1: Lattice + Triangle
     * 2: Lattice + Triangle + Debug
     */
    viewMode: 1,
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
        lfoRateMax: 8.0,
        /** Audio mix settings */
        mix: {
            master: 0.8,
            reverb: 0.3,
            kick: 1.0,
            bass: 0.6,
            ostinato: 0.5,
            arp: 0.4,
            pad: 0.6
        }
    }
};
