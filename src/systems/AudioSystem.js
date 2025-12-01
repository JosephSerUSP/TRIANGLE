import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

/**
 * Hamauzu-inspired intervals (semitones from Root).
 * Based on the structure:
 * Bass: Root (Drone) + Major 2nd (9th) -> Ambiguous, suspended bass
 * Mid: Perfect 4th (sus4) + Perfect 5th -> Quartal body
 * High: Major 6th (13th) + Major 7th -> Longing, semitone tension
 */
const CHORD_INTERVALS = [
    [0, 2],    // Performer 0 (Bass): D2, E2
    [17, 19],  // Performer 1 (Mid): G3, A3
    [33, 35]   // Performer 2 (High): B4, C#5
];

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
     * Creates a single audio voice (synthesizer) with independent note control.
     * @private
     * @returns {Object} The voice object containing oscillators and filters.
     */
    _createVoice() {
        const v = {};

        // Oscillators
        v.osc1 = this.ctx.createOscillator();
        v.osc2 = this.ctx.createOscillator();

        // Individual Gains (for independent volume control)
        v.gain1 = this.ctx.createGain();
        v.gain2 = this.ctx.createGain();

        // Merge Gain (post-mix)
        v.preMergeGain = this.ctx.createGain();

        // Filters
        v.highpass = this.ctx.createBiquadFilter();
        v.filter = this.ctx.createBiquadFilter(); // Lowpass

        // Configuration
        v.osc1.type = 'sawtooth'; // Richer sound for drone/bass/body
        v.osc2.type = 'triangle'; // Smoother sound for colors

        // Frequencies will be set in update()
        v.osc1.frequency.value = CONFIG.audio.rootFreq;
        v.osc2.frequency.value = CONFIG.audio.rootFreq;

        v.gain1.gain.value = 0.0;
        v.gain2.gain.value = 0.0;
        v.preMergeGain.gain.value = 1.0;

        // Highpass Setup
        v.highpass.type = 'highpass';
        v.highpass.frequency.value = 10;
        v.highpass.Q.value = 0.7;

        // Lowpass Setup
        v.filter.type = 'lowpass';
        v.filter.Q.value = 1.0;
        v.filter.frequency.value = 8000;

        // Routing:
        // Osc1 -> Gain1 -> PreMerge
        // Osc2 -> Gain2 -> PreMerge
        // PreMerge -> Highpass -> Lowpass -> Out

        v.osc1.connect(v.gain1);
        v.gain1.connect(v.preMergeGain);

        v.osc2.connect(v.gain2);
        v.gain2.connect(v.preMergeGain);

        v.preMergeGain.connect(v.highpass);
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
     * Maps performer data to gain crossfades for the Hamauzu chord logic.
     * @param {Performer[]} performers - Array of performer states.
     */
    update(performers) {
        if (!this.isReady) return;
        const now = this.ctx.currentTime;
        const root = CONFIG.audio.rootFreq;

        performers.forEach((p, idx) => {
            const v = this.voices[idx];
            if (!v) return;

            // Get assigned intervals or default to Root if index out of bounds
            const intervals = CHORD_INTERVALS[idx] || [0, 0];

            // Calculate Target Frequencies
            const freq1 = root * Math.pow(2, intervals[0] / 12);
            const freq2 = root * Math.pow(2, intervals[1] / 12);

            // Apply Frequencies (Portamento for smoothness)
            v.osc1.frequency.setTargetAtTime(freq1, now, 0.05);
            v.osc2.frequency.setTargetAtTime(freq2, now, 0.05);

            // Calculate Gains based on Performer Data
            let targetGain1 = 0;
            let targetGain2 = 0;

            // Overall voice presence
            const isActive = p.hasPerformer && p.presence > 0.01;

            // Global Filter modulation (Expression)
            // Map height to filter cutoff for extra expressiveness
            const height = THREE.MathUtils.clamp(p.triangle.height || 0.5, 0, 1);
            const cutoff = THREE.MathUtils.lerp(1500, 12000, height); // Brighter as hands go up
            v.filter.frequency.setTargetAtTime(isActive ? cutoff : 800, now, 0.2);

            if (isActive) {
                if (idx === 0) {
                    // --- BASS (Performer 0) ---
                    // Note 1 (Drone): Constant volume when active.
                    // Note 2 (Color): Controlled by expression (Height/Depth).
                    targetGain1 = 0.5;

                    // Map height to Note 2 volume (0.0 to 0.4)
                    const colorAmt = THREE.MathUtils.clamp(p.triangle.height, 0, 1);
                    targetGain2 = colorAmt * 0.4;

                    // Bass needs low frequencies, so ensure Highpass is low
                    v.highpass.frequency.setTargetAtTime(20, now, 0.2);

                } else if (idx === 1) {
                    // --- MID (Performer 1) ---
                    // Crossfade between Note 1 (sus4) and Note 2 (5th)
                    // Controlled by Roll (leaning left/right)

                    // Normalize roll (-0.5 to 0.5 rad approx) to 0..1
                    const roll = p.current.roll || 0;
                    const t = THREE.MathUtils.clamp((roll / 1.0) + 0.5, 0, 1);

                    targetGain1 = (1.0 - t) * 0.4;
                    targetGain2 = t * 0.4;

                    // Mid frequency cleanup
                    v.highpass.frequency.setTargetAtTime(150, now, 0.2);

                } else {
                    // --- HIGH (Performer 2) ---
                    // Crossfade between Note 1 (13th) and Note 2 (Maj7)
                    // Controlled by Height (reaching up for tension)

                    const t = THREE.MathUtils.clamp(p.triangle.height, 0, 1);

                    // Default to Note 1 (Sweet), reach up for Note 2 (Longing)
                    targetGain1 = (1.0 - t) * 0.35;
                    targetGain2 = t * 0.35;

                    // High frequency cleanup
                    v.highpass.frequency.setTargetAtTime(300, now, 0.2);
                }
            }

            // Apply Gains
            // If !isActive, these targets naturally go to 0 because we didn't set them non-zero above?
            // Wait, if !isActive, targetGain1/2 remain 0 (initialized).

            v.gain1.gain.setTargetAtTime(targetGain1, now, 0.1);
            v.gain2.gain.setTargetAtTime(targetGain2, now, 0.1);
        });

        // Master LFO update
        // We can base pulse rate on average BPM preference
        let weighted = 0;
        let totalWeight = 0;
        performers.forEach((p) => {
            if (!p.hasPerformer) return;
            weighted += p.current.bpmPref;
            totalWeight += 1;
        });
        const bpm = totalWeight > 0 ? weighted / totalWeight : 60;
        let pulseHz = (bpm / 60) * 0.5;
        pulseHz = THREE.MathUtils.clamp(pulseHz, CONFIG.audio.lfoRateMin, CONFIG.audio.lfoRateMax);
        this.lfo.frequency.setTargetAtTime(pulseHz, now, 0.3);
    }
}
