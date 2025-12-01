// src/systems/AudioSystem.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { CHORDS } from '../core/Constants.js';

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

        // Note assignment state
        this.activePerformers = [];
        this.assignedNotes = new Map(); // Map<performerIndex, [freq1, freq2]>
        this.currentChordIndex = 0;

        // Voice structure: [ [Voice1, Voice2], [Voice1, Voice2], ... ] per performer
        this.performerVoices = [];
    }

    /**
     * Initializes the AudioContext, master effects, and voices.
     * @param {number} performerCount - The number of performers.
     * @async
     * @returns {Promise<void>}
     */
    async init(performerCount) {
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

        this.performerVoices = [];
        for (let i = 0; i < performerCount; i++) {
            // Each performer gets 2 voices
            const voices = [
                this._createVoice(i, 0),
                this._createVoice(i, 1)
            ];
            this.performerVoices.push(voices);
        }

        this.isReady = true;
    }

    /**
     * Creates a single audio voice (synthesizer) with independent panning.
     * @private
     * @param {number} pIdx - Performer Index.
     * @param {number} vIdx - Voice Index (0 or 1).
     * @returns {Object} The voice object containing oscillators, filters, and panner.
     */
    _createVoice(pIdx, vIdx) {
        const v = {};

        // Oscillators
        v.osc1 = this.ctx.createOscillator();
        v.osc2 = this.ctx.createOscillator();

        // Gain (VCA)
        v.gain = this.ctx.createGain();

        // Panner
        v.panner = this.ctx.createStereoPanner();

        // Filters
        v.highpass = this.ctx.createBiquadFilter();
        v.filter = this.ctx.createBiquadFilter(); // Lowpass

        // Configuration
        v.osc1.type = 'sawtooth';
        v.osc2.type = 'triangle';

        v.osc1.frequency.value = CONFIG.audio.rootFreq;
        v.osc2.frequency.value = CONFIG.audio.rootFreq;

        v.osc1.detune.value = -4;
        v.osc2.detune.value = 4;

        v.gain.gain.value = 0.0;
        v.panner.pan.value = 0;

        // Highpass Setup
        v.highpass.type = 'highpass';
        v.highpass.frequency.value = 10;
        v.highpass.Q.value = 0.7;

        // Lowpass Setup
        v.filter.type = 'lowpass';
        v.filter.Q.value = 1.0;
        v.filter.frequency.value = 8000;

        // Routing: Osc -> Gain -> Highpass -> Lowpass -> Panner -> MasterPulse
        v.osc1.connect(v.gain);
        v.osc2.connect(v.gain);

        v.gain.connect(v.highpass);
        v.highpass.connect(v.filter);
        v.filter.connect(v.panner);
        v.panner.connect(this.masterPulse);

        v.osc1.start();
        v.osc2.start();

        return v;
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
     * Assigns notes to performers based on a Voice Leading Agent logic.
     * Called when the composition of active performers changes.
     * @private
     * @param {boolean[]} presenceMap - Array indicating which performers are active.
     */
    _reassignNotes(presenceMap) {
        const root = CONFIG.audio.rootFreq;

        // Pick a chord from the progression
        // We can cycle or pick randomly. Let's cycle for structure.
        this.currentChordIndex = (this.currentChordIndex + 1) % CHORDS.length;
        const chord = CHORDS[this.currentChordIndex];
        const intervals = chord.intervals;

        // Pool of available notes (frequencies)
        // Ensure we cover multiple octaves
        const pool = [];
        [1, 2, 4].forEach(octave => {
            intervals.forEach(ratio => {
                pool.push(root * ratio * octave);
            });
        });

        // Assign notes
        // P0 (Bass) always gets Root + Fifth/Octave if active
        // Others get notes from the chord to form "wistful chords"

        presenceMap.forEach((isActive, idx) => {
            if (!isActive) {
                this.assignedNotes.set(idx, [0, 0]);
                return;
            }

            if (idx === 0) {
                // Bass Performer
                // Voice 1: Deep Root (Bass) - Fixed D2
                // Voice 2: Harmony Note (e.g., 5th or 10th)
                const bassNote = root;
                // Pick a nice harmony note for the second voice, maybe the 5th or 3rd from the chord
                // Let's pick a random note from the lower register of the chord
                const harmonyNote = pool[Math.floor(Math.random() * 3)] * 2;
                this.assignedNotes.set(idx, [bassNote, harmonyNote]);
            } else {
                // Harmony Performers
                // Pick 2 distinct notes from the pool, preferably in mid-high register
                // Filter pool for higher notes (> root * 2)
                const highPool = pool.filter(f => f > root * 2);

                // Deterministic random based on index to avoid jitter
                const r1 = (idx * 7 + this.currentChordIndex * 3) % highPool.length;
                const r2 = (idx * 11 + this.currentChordIndex * 5) % highPool.length;

                let n1 = highPool[r1];
                let n2 = highPool[r2];

                // If same, shift one
                if (n1 === n2 && highPool.length > 1) {
                    n2 = highPool[(r2 + 1) % highPool.length];
                }

                this.assignedNotes.set(idx, [n1, n2]);
            }
        });
    }

    /**
     * Updates audio parameters based on the state of all performers.
     * @param {Performer[]} performers - Array of performer states.
     */
    update(performers) {
        if (!this.isReady) return;
        const now = this.ctx.currentTime;

        // 1. Detect Composition Changes
        const currentPresence = performers.map(p => p.hasPerformer);
        let compositionChanged = false;

        if (this.activePerformers.length !== currentPresence.length) {
            compositionChanged = true;
        } else {
            for (let i = 0; i < currentPresence.length; i++) {
                if (this.activePerformers[i] !== currentPresence[i]) {
                    compositionChanged = true;
                    break;
                }
            }
        }

        if (compositionChanged) {
            this.activePerformers = [...currentPresence];
            this._reassignNotes(currentPresence);
        }

        // 2. Update Voices
        performers.forEach((p, idx) => {
            const voices = this.performerVoices[idx];
            if (!voices) return;

            const notes = this.assignedNotes.get(idx) || [CONFIG.audio.rootFreq, CONFIG.audio.rootFreq];
            const isActive = p.hasPerformer;

            // Common Performer Params
            // Expression Triangle controls Volume
            // Height controls filter brightness? Or Volume?
            // "Through the expression triangle they control the volume of both notes"
            // Let's use Triangle Area or Height for Volume.
            // Let's use Height (0..1).
            const inputVol = THREE.MathUtils.clamp(p.triangle.height || 0.0, 0, 1);

            // Panning controlled by Performer Data (Yaw)
            // Yaw is approx -1.5 to 1.5 radians. Map to -1 to 1.
            let panVal = THREE.MathUtils.clamp(p.current.yaw / 1.5, -0.9, 0.9);

            // If virtual, maybe use position? Virtuals have yaw too.

            // --- Voice 1 ---
            const v1 = voices[0];
            const freq1 = notes[0];

            // --- Voice 2 ---
            const v2 = voices[1];
            const freq2 = notes[1];

            if (isActive) {
                // --- Update Frequency ---
                v1.osc1.frequency.setTargetAtTime(freq1, now, 0.1);
                v1.osc2.frequency.setTargetAtTime(freq1 * 1.002, now, 0.1);

                v2.osc1.frequency.setTargetAtTime(freq2, now, 0.1);
                v2.osc2.frequency.setTargetAtTime(freq2 * 0.998, now, 0.1);

                // --- Update Volume & Filter ---

                // Bass (Index 0) - Specific Rules
                if (idx === 0) {
                    // "Bass should ALWAYS be playing" -> imply constant volume for Bass Note?
                    // "Bass's volume is fixed... panning is fixed"

                    // Voice 1 (Bass Note)
                    v1.gain.gain.setTargetAtTime(0.6, now, 0.1); // Fixed Volume
                    v1.panner.pan.setTargetAtTime(0, now, 0.1);  // Fixed Center
                    v1.highpass.frequency.setTargetAtTime(10, now, 0.2); // Full bass
                    v1.filter.frequency.setTargetAtTime(3000, now, 0.2); // Moderate brightness

                    // Voice 2 (Harmony Note assigned to Bass Player)
                    // Controls apply to this note? "Each performer should control two notes"
                    // But "Bass's volume is fixed". Does that mean *both* notes of P0?
                    // Or just the Bass function?
                    // "Bass should ALWAYS be playing... The other notes assigned to the performers aim to create beautiful chords"
                    // I interpret this as: Voice 1 (True Bass) is fixed. Voice 2 (P0's chord note) is controlled like others.

                    const vol2 = THREE.MathUtils.lerp(0, 0.5, inputVol);
                    v2.gain.gain.setTargetAtTime(vol2, now, 0.1);
                    // Panning for V2? "Bass is... fixed". Assuming P0's pan is fixed for both or just bass?
                    // "Bass is, once again, fixed".
                    // Let's keep P0 V2 somewhat centered or slightly wide to avoid mud.
                    v2.panner.pan.setTargetAtTime(0, now, 0.1);
                    v2.filter.frequency.setTargetAtTime(THREE.MathUtils.lerp(500, 6000, inputVol), now, 0.1);

                } else {
                    // Other Performers
                    // Volume controlled by expression
                    const vol = THREE.MathUtils.lerp(0, 0.4, inputVol);

                    // Voice 1
                    v1.gain.gain.setTargetAtTime(vol, now, 0.1);
                    v1.filter.frequency.setTargetAtTime(THREE.MathUtils.lerp(500, 8000, inputVol), now, 0.1);

                    // Voice 2
                    v2.gain.gain.setTargetAtTime(vol, now, 0.1);
                    v2.filter.frequency.setTargetAtTime(THREE.MathUtils.lerp(500, 8000, inputVol), now, 0.1);

                    // Panning
                    // "Both speakers get relatively equal levels of gain with different frequencies"
                    // This suggests spreading the two voices of the performer.
                    // If Performer Pan is P, maybe Voice 1 is P - width, Voice 2 is P + width?
                    // Or Frequency-based panning (Haas effect or spectral panning)?
                    // Let's try spreading them.
                    const spread = 0.3;
                    const p1 = Math.max(-1, Math.min(1, panVal - spread));
                    const p2 = Math.max(-1, Math.min(1, panVal + spread));

                    v1.panner.pan.setTargetAtTime(p1, now, 0.1);
                    v2.panner.pan.setTargetAtTime(p2, now, 0.1);
                }

            } else {
                // Mute
                v1.gain.gain.setTargetAtTime(0, now, 1.0);
                v2.gain.gain.setTargetAtTime(0, now, 1.0);
            }
        });

        // Master LFO (Pulse) - Based on average BPM
        let weighted = 0;
        let totalWeight = 0;
        performers.forEach((p, idx) => {
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
