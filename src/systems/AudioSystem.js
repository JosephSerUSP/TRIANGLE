import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

// Hamauzu-style Chord Ratios (Relative to D2 Root)
// P1: D2 (1.0), A2 (1.5)
// P2: G3 (2.66...), E4 (4.5)
// P3: B4 (6.66...), C#5 (7.5)
const CHORD_RATIOS = [
    { a: 1.0, b: 1.5 },     // Bass: D2 + A2
    { a: 2.6667, b: 4.5 },  // Mid: G3 + E4
    { a: 6.6667, b: 7.5 }   // High: B4 + C#5
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
     * Creates a single audio voice (synthesizer) with two independent oscillators/gains.
     * @private
     * @returns {Object} The voice object containing oscillators and filters.
     */
    _createVoice() {
        const v = {};

        // Oscillators
        v.oscA = this.ctx.createOscillator();
        v.oscB = this.ctx.createOscillator();

        // Independent Gains
        v.gainA = this.ctx.createGain();
        v.gainB = this.ctx.createGain();

        // Filters
        v.highpass = this.ctx.createBiquadFilter();
        v.filter = this.ctx.createBiquadFilter(); // Lowpass

        // Configuration
        v.oscA.type = 'sawtooth';
        v.oscB.type = 'sawtooth'; // Both saws for digital string feel

        v.oscA.frequency.value = CONFIG.audio.rootFreq;
        v.oscB.frequency.value = CONFIG.audio.rootFreq;

        // Slight detune for ensemble feel
        v.oscA.detune.value = -3;
        v.oscB.detune.value = 3;

        v.gainA.gain.value = 0.0;
        v.gainB.gain.value = 0.0;

        // Highpass Setup
        v.highpass.type = 'highpass';
        v.highpass.frequency.value = 100; // Default clear mud
        v.highpass.Q.value = 0.7;

        // Lowpass Setup
        v.filter.type = 'lowpass';
        v.filter.Q.value = 1.0;
        v.filter.frequency.value = 8000; // Bright digital

        // Routing:
        // OscA -> GainA -> Highpass
        // OscB -> GainB -> Highpass
        // Highpass -> Lowpass -> Out
        v.oscA.connect(v.gainA);
        v.gainA.connect(v.highpass);

        v.oscB.connect(v.gainB);
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
     * Modifies frequency, filter cutoff, and gain.
     * @param {Performer[]} performers - Array of performer states.
     */
    update(performers) {
        if (!this.isReady) return;
        const now = this.ctx.currentTime;

        // Determine active indices to assign roles (Bass, Mid, High)
        // Sort active performers by index to keep role assignment stable
        const activePerformerIndices = performers
            .map((p, idx) => ({ idx, hasPerformer: p.hasPerformer }))
            .filter(item => item.hasPerformer)
            .map(item => item.idx);
            // .sort((a, b) => a - b) // Indices are naturally sorted if iteration is order-based, but safe to assume.

        performers.forEach((p, idx) => {
            const v = this.voices[idx];
            if (!v) return;

            const isActive = p.hasPerformer;

            if (isActive) {
                // Determine Role based on rank in active list
                const rank = activePerformerIndices.indexOf(idx);
                // Cycle roles if more than 3 performers (0, 1, 2, 0...)
                const roleIdx = rank % 3;
                const ratios = CHORD_RATIOS[roleIdx];

                // Frequencies
                const freqA = CONFIG.audio.rootFreq * ratios.a;
                const freqB = CONFIG.audio.rootFreq * ratios.b;

                v.oscA.frequency.setTargetAtTime(freqA, now, 0.1);
                v.oscB.frequency.setTargetAtTime(freqB, now, 0.1);

                // Volume / Balance Control using Tilt (Roll)
                // Roll is typically -PI/2 to PI/2, but heavily centered.
                // We clamp it to -0.5 to 0.5 for usable range.
                // Map to 0..1
                const roll = THREE.MathUtils.clamp(p.current.roll, -0.6, 0.6);
                const balance = (roll + 0.6) / 1.2; // 0 (Left) to 1 (Right)

                let gainA, gainB;
                const masterVol = 0.5 * p.presence;

                if (roleIdx === 0) {
                    // BASS ROLE (P1)
                    // Note A (Drone D2) is constant volume (relative to presence)
                    // Note B (Interval) is manipulated by Height (as requested: "volume of second note")
                    // Actually, let's use Height for Note B volume to feel like a fader.

                    gainA = masterVol * 0.8; // Drone always on

                    const fader = THREE.MathUtils.clamp(p.triangle.height, 0, 1);
                    gainB = masterVol * fader * 0.8;

                    // Bass filter: allow lows
                    v.highpass.frequency.setTargetAtTime(10, now, 0.2);

                } else {
                    // MID & HIGH ROLES (P2, P3)
                    // "Manipulate volume of each note" -> Crossfade/Balance via Roll

                    gainA = masterVol * (1.0 - balance);
                    gainB = masterVol * balance;

                    // Mid/High filter: cut lows to clean up mix
                    v.highpass.frequency.setTargetAtTime(150, now, 0.2);
                }

                v.gainA.gain.setTargetAtTime(gainA, now, 0.1);
                v.gainB.gain.setTargetAtTime(gainB, now, 0.1);

                // Dynamic Lowpass Filter based on Depth or Area?
                // "Sharp, buzzing, crisp" -> Keep it open generally.
                // Maybe modulate slightly with Depth (Area)
                // Closer (larger area) = Brighter
                const brightness = THREE.MathUtils.clamp(p.triangle.area * 5.0, 0, 1);
                const cutoff = THREE.MathUtils.lerp(4000, 12000, brightness);
                v.filter.frequency.setTargetAtTime(cutoff, now, 0.2);

            } else {
                // Stop / Release
                v.gainA.gain.setTargetAtTime(0, now, 2.0);
                v.gainB.gain.setTargetAtTime(0, now, 2.0);
            }
        });

        // Master LFO update
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