// src/systems/AudioSystem.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

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

        this.masterPulse.connect(this.masterGain);
        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);

        this.lfo = this.ctx.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = 0.5;

        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.value = 0.4;

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
     * Creates a single audio voice (synthesizer).
     * @private
     * @returns {Object} The voice object containing oscillators and filters.
     */
    _createVoice() {
        const v = {};

        // Oscillators
        v.osc1 = this.ctx.createOscillator();
        v.osc2 = this.ctx.createOscillator();

        // Gain (VCA)
        v.gain = this.ctx.createGain();

        // Filters
        v.highpass = this.ctx.createBiquadFilter();
        v.filter = this.ctx.createBiquadFilter(); // Lowpass

        // Configuration
        v.osc1.type = 'sawtooth';
        v.osc2.type = 'triangle';

        v.osc1.frequency.value = CONFIG.audio.rootFreq;
        v.osc2.frequency.value = CONFIG.audio.rootFreq;

        v.osc1.detune.value = 0;
        v.osc2.detune.value = 4; // Slight detune as requested

        v.gain.gain.value = 0.0;

        // Highpass Setup
        v.highpass.type = 'highpass';
        v.highpass.frequency.value = 10; // Default to bypass (low)
        v.highpass.Q.value = 0.7;

        // Lowpass Setup
        v.filter.type = 'lowpass';
        v.filter.Q.value = 1.0;
        v.filter.frequency.value = 8000; // Fixed High Brightness from snippet

        // Routing: Osc -> Gain -> Highpass -> Lowpass -> Out
        v.osc1.connect(v.gain);
        v.osc2.connect(v.gain);

        v.gain.connect(v.highpass);
        v.highpass.connect(v.filter);

        v.osc1.start();
        v.osc2.start();

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
     * Modifies frequency, filter cutoff, and gain.
     * @param {Performer[]} performers - Array of performer states.
     */
    update(performers) {
        if (!this.isReady) return;
        const now = this.ctx.currentTime;

        // Determine active indices to assign roles
        // Logic: Lowest active index = Bass, others = Harmony
        const activeIdxs = [];
        performers.forEach((p, i) => {
            if (p.hasPerformer) activeIdxs.push(i);
        });

        performers.forEach((p, idx) => {
            const v = this.voices[idx];
            if (!v) return;

            const isActive = p.hasPerformer;

            if (isActive) {
                // Determine Role
                const isBassRole = (activeIdxs.length > 0 && activeIdxs[0] === idx);

                let targetFreq;

                if (isBassRole) {
                    // DRONE D BASS
                    targetFreq = CONFIG.audio.rootFreq; // D2

                    // Highpass: let lows through
                    v.highpass.frequency.setTargetAtTime(10, now, 0.2);

                    // Slightly louder for bass
                     v.gain.gain.setTargetAtTime(0.6, now, 1.5);
                } else {
                    // HARMONY
                    const ratio = p.noteRatio || 1.0;
                    // Pitch up one octave
                    targetFreq = CONFIG.audio.rootFreq * ratio * 2.0;

                    // Highpass: Cut low end
                    v.highpass.frequency.setTargetAtTime(300, now, 0.2);

                     // Volume for harmony
                     v.gain.gain.setTargetAtTime(0.4, now, 1.5);
                }

                // Apply Frequency with Portamento
                v.osc1.frequency.setTargetAtTime(targetFreq, now, 0.1);
                v.osc2.frequency.setTargetAtTime(targetFreq * 1.002, now, 0.1);

                // We can still use height to modulate the Lowpass filter slightly for expression
                // User snippet used fixed 8000Hz, but dynamic expression is "Evocative"
                // Let's keep a bit of filter movement but keep it bright.
                const minCutoff = 2000;
                const maxCutoff = 10000;
                const height = THREE.MathUtils.clamp(p.triangle.height || 0.5, 0, 1);
                const cutoff = THREE.MathUtils.lerp(minCutoff, maxCutoff, height);
                v.filter.frequency.setTargetAtTime(cutoff, now, 0.1);

            } else {
                // Stop / Release
                v.gain.gain.setTargetAtTime(0, now, 2.0); // Long tail release
            }
        });

        // Master LFO update (optional, keeps the pulse alive)
        let weighted = 0;
        let totalWeight = 0;
        performers.forEach((p, idx) => {
            if (!p.hasPerformer) return;
            const weight = 1;
            weighted += p.current.bpmPref * weight;
            totalWeight += weight;
        });
        const bpm = totalWeight > 0 ? weighted / totalWeight : 60;
        let pulseHz = (bpm / 60) * 0.5;
        pulseHz = THREE.MathUtils.clamp(pulseHz, CONFIG.audio.lfoRateMin, CONFIG.audio.lfoRateMax);
        this.lfo.frequency.setTargetAtTime(pulseHz, now, 0.3);
    }
}
