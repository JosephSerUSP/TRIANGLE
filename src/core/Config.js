/**
 * @fileoverview Immutable default configuration for TRIANGLE, grouped by subsystem.
 *
 * Nothing in the app mutates this object (it is deep-frozen). Runtime state
 * such as view mode, autopilot and the measured camera size lives in App.js /
 * VisionSystem instead. Modules read it directly or receive slices of it.
 */

function deepFreeze(o) {
    Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); });
    return Object.freeze(o);
}

export const CONFIG = deepFreeze({
    /**
     * Stage slots. Slot count everywhere (manager, visualizer, listener) derives
     * from this array. `role` picks the voice in PerformanceListener.
     * `autopilot: true` means the slot is driven by AutopilotSystem while
     * autopilot is enabled; otherwise it follows a camera pose.
     */
    slots: [
        { id: 0, role: 'bass',     colorHex: 0x88eeee, autopilot: false },
        { id: 1, role: 'ostinato', colorHex: 0xff66ff, autopilot: true },
        { id: 2, role: 'arp',      colorHex: 0xffdd55, autopilot: true }
    ],

    /** Startup defaults for App-owned runtime state. */
    defaults: {
        autopilotEnabled: true,
        /** 0: lattice, 1: lattice + triangle, 2: lattice + triangle + debug */
        viewMode: 0,
        /** See audio.mappingModes. */
        mappingMode: 'canon'
    },

    vision: {
        /** Requested camera size; the real size is reported by VisionSystem. */
        idealWidth: 640,
        idealHeight: 480,
        /** Mirror webcam coordinates once, in PoseExtractor. */
        mirrored: true,
        minKeypointScore: 0.3,
        minPoseScore: 0.25
    },

    /** Exponential smoothing rates (1/s) and presence hysteresis. */
    smoothing: {
        orientationRate: 6.0,
        depthRate: 3.0,
        triangleRate: 8.0,
        presenceRate: 3.0,
        /** Seconds a slot keeps `active` after its source disappears. */
        lossGraceSec: 0.5,
        /** Seconds a source must be seen before a slot becomes `active`. */
        acquireSec: 0.1
    },

    interaction: {
        maxRoll: Math.PI / 2,
        maxPitch: Math.PI / 6,
        maxYaw: Math.PI / 2
    },

    layout: {
        activeThreshold: 0.001,
        maxDividerAngle: 0.5
    },

    visual: {
        gridSize: 10000,
        gridDivisions: 20,
        phaseScale: 500.0,
        triangleScale: 320,
        triangleZ: 500,
        /** Slot whose lattice is shown, dimmed, when nobody is present (null = black). */
        idleSlot: 0
    },

    audio: {
        rootFreq: 73.42, // D2
        baseTempo: 120,
        bpmMin: 80,
        bpmMax: 140,
        introSec: 8.0,
        outroSec: 4.0,
        /** Max 16th notes the scheduler may queue in one pass (tab-resume guard). */
        maxCatchUpSteps: 4,
        /**
         * D1 is an open experiment: press M to cycle.
         *  canon   - fixed Shibuya-kei progression, 120 BPM; hand height = expression.
         *  tempo   - canon + average hand width of active slots drives tempo.
         *  harmony - tempo + each slot's hand height picks an interval that
         *            transposes its voice (README's original "noteRatio" idea).
         */
        mappingModes: ['canon', 'tempo', 'harmony'],
        /** Semitone offsets chosen by hand height in `harmony` mode. */
        harmonyIntervals: [0, 4, 7, 11, 14, 19],
        mix: {
            master: 0.8,
            reverb: 0.3,
            padReverbSend: 0.6,
            kick: 1.0,
            bass: 0.6,
            ostinato: 0.8,
            arp: 0.2,
            pad: 0.2
        }
    }
});
