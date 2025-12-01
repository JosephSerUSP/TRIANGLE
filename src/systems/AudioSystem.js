import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

// ============================================================================
// AUDIO SYSTEM (Triad, one voice per performer)
// ============================================================================
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
            const v = this._createVoice(i === 0); // voice 0 = bass
            v.filter.connect(this.masterPulse);
            this.voices.push(v);
        }

        this.isReady = true;
    }

    /**
     * Creates a single audio voice (synthesizer).
     * @private
     * @param {boolean} isBass - Whether this voice is a bass voice.
     * @returns {Object} The voice object containing oscillators and filters.
     */
    _createVoice(isBass) {
        const v = {};
        v.isBass = isBass;
        v.osc1 = this.ctx.createOscillator();
        v.osc2 = this.ctx.createOscillator();
        v.gain = this.ctx.createGain();
        v.filter = this.ctx.createBiquadFilter();

        v.osc1.type = 'sawtooth';
        v.osc2.type = isBass ? 'sine' : 'triangle';

        v.osc1.frequency.value = CONFIG.audio.rootFreq;
        v.osc2.frequency.value = CONFIG.audio.rootFreq;

        v.osc1.detune.value = CONFIG.audio.detune;
        v.osc2.detune.value = -CONFIG.audio.detune;

        v.gain.gain.value = 0.0;

        v.filter.type = 'lowpass';
        v.filter.Q.value = 1.0;
        v.filter.frequency.value = 400;

        v.osc1.connect(v.gain);
        v.osc2.connect(v.gain);
        v.gain.connect(v.filter);

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
     * @param {PerformerState[]} performers - Array of performer states.
     */
    update(performers) {
        if (!this.isReady) return;
        const now = this.ctx.currentTime;

        // Per-voice mapping
        performers.forEach((p, idx) => {
            const v = this.voices[idx];
            if (!v) return;

            const has = p.hasPerformer;
            const area = p.triangle.area;
            const height = THREE.MathUtils.clamp(p.triangle.height, 0, 1);
            const ratio = p.noteRatio || 1.0;

            let freq = CONFIG.audio.rootFreq * ratio;
            if (v.isBass) freq *= 0.5; // one octave down for bass

            v.osc1.frequency.setTargetAtTime(freq, now, 0.1);
            v.osc2.frequency.setTargetAtTime(freq, now, 0.1);

            const cutoff = THREE.MathUtils.lerp(CONFIG.audio.filterMin, CONFIG.audio.filterMax, height);
            v.filter.frequency.setTargetAtTime(cutoff, now, 0.1);

            let targetGain = has ? (0.12 + area * 2.4) : 0.0;
            targetGain = THREE.MathUtils.clamp(targetGain, 0, v.isBass ? 0.9 : 0.6);

            const timeConst = has ? 0.3 : 1.8;
            v.gain.gain.setTargetAtTime(targetGain, now, timeConst);
        });

        // Ensemble BPM -> master LFO rate
        let weighted = 0;
        let totalWeight = 0;
        performers.forEach((p, idx) => {
            if (!p.hasPerformer) return;
            const weight = idx === 0 ? 2 : 1; // physical performer slightly heavier
            weighted += p.current.bpmPref * weight;
            totalWeight += weight;
        });

        const bpm = totalWeight > 0 ? weighted / totalWeight : 60;
        let pulseHz = (bpm / 60) * 0.5; // pulse roughly every 2 beats
        pulseHz = THREE.MathUtils.clamp(pulseHz, CONFIG.audio.lfoRateMin, CONFIG.audio.lfoRateMax);
        this.lfo.frequency.setTargetAtTime(pulseHz, now, 0.3);
    }
}
