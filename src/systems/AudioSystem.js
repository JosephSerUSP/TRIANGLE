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
        this.compressor = null;
        this.analyser = null;

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

        // Master Chain: MasterGain -> Compressor -> Analyser -> Destination
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;

        this.compressor = this.ctx.createDynamicsCompressor();
        // Default compressor settings are usually fine, or we can tune them
        // The prompt uses default createDynamicsCompressor() without explicit params
        // but we can keep previous ones if they were good, or stick to defaults.
        // Prompt says: "comp = ctx.createDynamicsCompressor();"

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.85;

        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        this.voices = [];
        for (let i = 0; i < voiceCount; i++) {
            this.voices.push(this._createVoice(i));
        }

        this.isReady = true;
    }

    /**
     * Creates a single audio voice (synthesizer).
     * @private
     * @param {number} index - The voice index.
     * @returns {Object} The voice object.
     */
    _createVoice(index) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();

        // Fixed "Bright & Stable" Filter
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 1;
        filter.frequency.value = 8000; // Fixed High Brightness

        const vca = this.ctx.createGain();
        vca.gain.value = 0; // Start silent

        // Routing
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(vca);
        vca.connect(this.masterGain);

        // Initial Params - SAW/TRI Mix for rich texture
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.value = 4; // Very slight natural detune

        osc1.start();
        osc2.start();

        return {
            nodes: { osc1, osc2, vca, filter },
            isPlaying: false,
            currentFreq: 0,
            index: index
        };
    }

    /**
     * Resumes the AudioContext if it is suspended.
     */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Triggers the voice to play a frequency.
     * @param {number} index - The voice index.
     * @param {number} freq - The target frequency.
     */
    play(index, freq) {
        if (!this.isReady) return;
        const v = this.voices[index];
        if (!v) return;

        const now = this.ctx.currentTime;
        const { osc1, osc2, vca } = v.nodes;

        // Check if we need to update frequency
        // We update frequency even if already playing to support sliding
        if (v.currentFreq !== freq) {
             // Smooth slide to new frequency (portamento)
             osc1.frequency.setTargetAtTime(freq, now, 0.1);
             osc2.frequency.setTargetAtTime(freq * 1.002, now, 0.1);
             v.currentFreq = freq;
        }

        // Check if we need to trigger attack
        if (!v.isPlaying) {
            // Attack
            vca.gain.cancelScheduledValues(now);
            vca.gain.setTargetAtTime(0.3, now, 1.5); // Slow, breathing attack
            v.isPlaying = true;
        }
    }

    /**
     * Stops the voice.
     * @param {number} index - The voice index.
     */
    stop(index) {
        if (!this.isReady) return;
        const v = this.voices[index];
        if (!v) return;

        if (v.isPlaying) {
            const now = this.ctx.currentTime;
            const { vca } = v.nodes;

            // Release
            vca.gain.cancelScheduledValues(now);
            vca.gain.setTargetAtTime(0, now, 2.0); // Long tail release

            v.isPlaying = false;
        }
    }
}
