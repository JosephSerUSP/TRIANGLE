// src/systems/AudioSystem.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

// --- Musical Constants ---
// Abstract degrees relative to D:
const DEG = {
  '1': 0,   // D
  '2': 2,   // E
  '4': 5,   // G
  '5': 7,   // A
  '6': 9,   // B
  'b7': 10, // C
  '7': 11,  // C#
};

const MODES = {
  OPEN: 0,
  LONGING: 1,
  LUMINOUS: 2,
};

const NOTE_PAIRS = {
  BASS: {
    [MODES.OPEN]:    ['1', '5'],   // D + A
    [MODES.LONGING]: ['1', 'b7'],  // D + C
    [MODES.LUMINOUS]:['1', '7'],   // D + C#
  },
  MID: {
    [MODES.OPEN]:    ['4', '2'],   // G, E
    [MODES.LONGING]: ['2', '6'],   // E, B
    [MODES.LUMINOUS]:['4', '6'],   // G, B
  },
  HIGH: {
    [MODES.OPEN]:    ['5', '7'],   // A, C#
    [MODES.LONGING]: ['b7','7'],   // C, C#
    [MODES.LUMINOUS]:['6', '7'],   // B, C#
  }
};

/**
 * Manages audio synthesis for the application.
 * Uses the Web Audio API to create voices and effects.
 */
export class AudioSystem {
    /**
     * Creates a new AudioSystem instance.
     */
    constructor() {
        this.ctx = null;
        this.isReady = false;

        this.masterGain = null;
        this.masterPulse = null;
        this.compressor = null;
        this.lfo = null;
        this.lfoGain = null;

        this.voices = [];

        // Harmonic State
        this.currentMode = MODES.OPEN;
        this.lastModeChangeTime = 0;
        this.modeCycleDuration = 15; // Seconds per mode
    }

    /**
     * Initializes the AudioContext, master effects, and voices.
     * @param {number} voiceCount - The number of voices to create.
     * @async
     * @returns {Promise<void>}
     */
    async init(voiceCount) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -28;
        this.compressor.knee.value = 24;
        this.compressor.ratio.value = 3;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;

        this.masterPulse = this.ctx.createGain();
        this.masterPulse.gain.value = 0.6;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;

        // Routing: MasterPulse -> MasterGain -> Compressor -> Out
        this.masterPulse.connect(this.masterGain);
        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);

        // LFO for subtle pulse (keep alive)
        this.lfo = this.ctx.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = 0.5;

        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.value = 0.2; // Reduced LFO depth slightly

        this.lfo.connect(this.lfoGain);
        this.lfoGain.connect(this.masterPulse.gain);
        this.lfo.start();

        this.voices = [];
        for (let i = 0; i < voiceCount; i++) {
            const v = this._createVoice();
            // Connect the end of the voice chain (filter) to master
            v.filter.connect(this.masterPulse);
            this.voices.push(v);
        }

        this.isReady = true;
    }

    /**
     * Creates a single audio voice (synthesizer) with two independent signal paths.
     * @private
     * @returns {Object} The voice object containing oscillators and filters.
     */
    _createVoice() {
        const v = {};

        // Signal Path A
        v.oscA = this.ctx.createOscillator();
        v.gainA = this.ctx.createGain();

        // Signal Path B
        v.oscB = this.ctx.createOscillator();
        v.gainB = this.ctx.createGain();

        // Filters (Shared per Performer)
        v.highpass = this.ctx.createBiquadFilter();
        v.filter = this.ctx.createBiquadFilter(); // Lowpass

        // Configuration
        // Digital Strings: Sawtooths with slight detune
        v.oscA.type = 'sawtooth';
        v.oscB.type = 'sawtooth';

        v.oscA.frequency.value = CONFIG.audio.rootFreq;
        v.oscB.frequency.value = CONFIG.audio.rootFreq;

        // Detune for chorus effect
        v.oscA.detune.value = -3;
        v.oscB.detune.value = 3;

        v.gainA.gain.value = 0.0;
        v.gainB.gain.value = 0.0;

        // Highpass Setup
        v.highpass.type = 'highpass';
        v.highpass.frequency.value = 100; // Cut rumble
        v.highpass.Q.value = 0.7;

        // Lowpass Setup
        v.filter.type = 'lowpass';
        v.filter.Q.value = 1.0;
        v.filter.frequency.value = 8000;

        // Routing: Osc -> Gain -> Highpass -> Lowpass -> Out
        v.oscA.connect(v.gainA);
        v.oscB.connect(v.gainB);

        v.gainA.connect(v.highpass);
        v.gainB.connect(v.highpass);

        v.highpass.connect(v.filter);

        v.oscA.start();
        v.oscB.start();

        return v;
    }

    /**
     * Resumes the AudioContext if it is suspended.
     * Essential for starting audio after user interaction.
     */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Updates audio parameters based on the state of all performers.
     * Implements the Hamauzu-inspired harmonic algorithm.
     * @param {Performer[]} performers - Array of performer states.
     */
    update(performers) {
        if (!this.isReady) return;
        const now = this.ctx.currentTime;

        // 1. Update Global Mode (Cycle)
        if (now - this.lastModeChangeTime > this.modeCycleDuration) {
            this.currentMode = (this.currentMode + 1) % 3;
            this.lastModeChangeTime = now;
            // console.log(`Switched to Harmonic Mode: ${this.currentMode}`);
        }

        // 2. Update Voices
        performers.forEach((p, idx) => {
            const v = this.voices[idx];
            if (!v) return;

            if (p.hasPerformer) {
                // Determine Role & Notes
                let role = 'MID';
                let octaveOffsetA = 0;
                let octaveOffsetB = 0;

                // Index 0: Bass (D2 base)
                if (idx === 0) {
                    role = 'BASS';
                    octaveOffsetA = 0; // D2 range
                    octaveOffsetB = 0;
                }
                // Index 1: Mid (D3 base)
                else if (idx === 1) {
                    role = 'MID';
                    octaveOffsetA = 1; // D3 range
                    octaveOffsetB = 1;
                }
                // Index 2: High (D4 base)
                else {
                    role = 'HIGH';
                    octaveOffsetA = 2; // D4 range
                    octaveOffsetB = 3; // Shift B up more for sparkle
                }

                // Get Note Degrees
                const pair = NOTE_PAIRS[role][this.currentMode];
                const degA = pair[0];
                const degB = pair[1];

                // Calculate Frequencies
                const freqA = this._degreeToFreq(degA, octaveOffsetA);
                const freqB = this._degreeToFreq(degB, octaveOffsetB);

                // Apply Frequency
                v.oscA.frequency.setTargetAtTime(freqA, now, 0.1);
                v.oscB.frequency.setTargetAtTime(freqB, now, 0.1);

                // Calculate Gains based on Performance
                // Use triangle.roll (tilt) or skew to balance between A and B
                // Range assumed -0.5 to 0.5 roughly, map to 0..1
                let balance = 0.5;
                if (p.current && p.current.roll !== undefined) {
                     // Map roll [-0.5, 0.5] -> [0, 1]
                     balance = THREE.MathUtils.clamp((p.current.roll + 0.5), 0, 1);
                }

                const baseGain = 0.5; // Nominal volume per voice

                if (role === 'BASS') {
                    // Bass: D (Note A) is constant drone. X (Note B) is dynamic.
                    v.gainA.gain.setTargetAtTime(baseGain * 0.8, now, 0.1); // Steady drone

                    // Note B depends on balance/height/energy
                    // Let's use 'balance' to control volume of B
                    const gainB = baseGain * balance;
                    v.gainB.gain.setTargetAtTime(gainB, now, 0.1);
                } else {
                    // Others: Crossfade A <-> B
                    // gainA = (1 - t)
                    // gainB = t
                    const gainA = baseGain * (1.0 - balance);
                    const gainB = baseGain * balance;

                    v.gainA.gain.setTargetAtTime(gainA, now, 0.1);
                    v.gainB.gain.setTargetAtTime(gainB, now, 0.1);
                }

                // Filter Expression
                // Use height (0..1) to open filter
                const height = p.triangle && p.triangle.height ? p.triangle.height : 0.5;
                const minCutoff = 2000;
                const maxCutoff = 10000;
                const cutoff = THREE.MathUtils.lerp(minCutoff, maxCutoff, height);
                v.filter.frequency.setTargetAtTime(cutoff, now, 0.1);

            } else {
                // Release
                v.gainA.gain.setTargetAtTime(0, now, 1.0);
                v.gainB.gain.setTargetAtTime(0, now, 1.0);
            }
        });

        // Update LFO
        // Just keep it steady for now or map to overall energy
        this.lfo.frequency.setTargetAtTime(0.5, now, 0.5);
    }

    /**
     * Converts a scale degree to a frequency.
     * @private
     * @param {string} degree - The degree key (e.g., '1', 'b7').
     * @param {number} octaveOffset - Octaves to add to root.
     * @returns {number} The frequency in Hz.
     */
    _degreeToFreq(degree, octaveOffset) {
        const semitonesFromD = DEG[degree];
        const totalSemitones = semitonesFromD + (12 * octaveOffset);
        return CONFIG.audio.rootFreq * Math.pow(2, totalSemitones / 12);
    }
}
