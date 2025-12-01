// src/systems/AudioSystem.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { BassInstrument, ChordInstrument, LeadInstrument, PercussionInstrument } from './Instruments.js';

// Bossa Nova Chords (D Dorian: Dm7, Em7, Fmaj7, G7, Am7, Bm7b5, Cmaj7)
// Voicings: Root, 3rd, 5th, 7th, 9th/13th
// Frequencies relative to A4=440.
// Let's define simple frequency arrays for a few lush chords.
const CHORDS = [
    // Dm9: D2, F3, A3, C4, E4
    [73.42, 174.61, 220.00, 261.63, 329.63],
    // G13: G2, B3, F4, A4, E5
    [98.00, 246.94, 349.23, 440.00, 659.25],
    // Cmaj9: C3, E3, G3, B3, D4
    [130.81, 164.81, 196.00, 246.94, 293.66],
    // A7alt (Bossa turnaround): A2, C#3, G3, Bb3, F4
    [110.00, 138.59, 196.00, 233.08, 349.23]
];

// Root notes for Bass corresponding to chords
const ROOTS = [
    73.42, // D2
    98.00, // G2
    65.41, // C2 (Low C)
    55.00  // A1
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
        this.compressor = null;

        // Performers' Instrument Sets
        // Each element will be { inst1, inst2 }
        this.performerInstruments = [];

        // Rhythm State
        this.nextNoteTime = 0;
        this.beatCount = 0;
        this.tempo = 80; // BPM
        this.lookahead = 0.1; // seconds
        this.scheduleAheadTime = 0.1; // seconds

        // Progression State
        this.currentChordIndex = 0;
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
        this.compressor.threshold.value = -12;
        this.compressor.ratio.value = 12; // Limiter-ish
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;

        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);

        // Setup 3 Performers x 2 Instruments
        this.performerInstruments = [];

        // Performer 0: Bass + Shaker (Rhythm Section)
        const p0 = {
            inst1: new BassInstrument(this.ctx, this.masterGain),
            inst2: new PercussionInstrument(this.ctx, this.masterGain, 'shaker')
        };
        this.performerInstruments.push(p0);

        // Performer 1: Chords + Clave (Harmony/Comping)
        const p1 = {
            inst1: new ChordInstrument(this.ctx, this.masterGain),
            inst2: new PercussionInstrument(this.ctx, this.masterGain, 'clave')
        };
        this.performerInstruments.push(p1);

        // Performer 2: Melody + Counter Pad (Melody/Texture)
        const p2 = {
            inst1: new LeadInstrument(this.ctx, this.masterGain),
            inst2: new ChordInstrument(this.ctx, this.masterGain) // Pad
        };
        // Tweak Pad settings
        p2.inst2.filter.frequency.value = 800; // Darker pad
        p2.inst2.triggerAttack = (time, vel) => {
             // Override attack for pad swell
             p2.inst2.output.gain.setTargetAtTime(vel * 0.3, time, 1.0);
        };
        this.performerInstruments.push(p2);

        this.isReady = true;
        this.nextNoteTime = this.ctx.currentTime + 0.5;
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
     * Handles scheduling of Bossa rhythm.
     * @param {Performer[]} performers - Array of performer states.
     */
    update(performers) {
        if (!this.isReady) return;

        const now = this.ctx.currentTime;

        // 1. Continuous Control Update
        this._updateContinuousControls(performers, now);

        // 2. Rhythm Scheduler
        // Schedule notes while they are within the lookahead window
        while (this.nextNoteTime < now + this.scheduleAheadTime) {
            this._scheduleBeat(this.nextNoteTime, performers);
            this._advanceNote();
        }
    }

    _updateContinuousControls(performers, now) {
        // P0 (Bass): Volume based on presence
        if (performers[0] && this.performerInstruments[0]) {
            const p = performers[0];
            const vol = p.presence;
            // Bass is triggered by scheduler, but we can gate master volume of the inst
            // Actually, envelope handles volume. We can modulate filter with Triangle Width maybe?
             // Or maybe just let the scheduler handle trigger logic.
        }

        // P1 (Chords): Filter Cutoff based on Triangle Height
        if (performers[1] && this.performerInstruments[1]) {
            const p = performers[1];
            if (p.hasPerformer) {
                // Map height to brightness
                const brightness = p.triangle.height || 0.5;
                this.performerInstruments[1].inst1.setFilter(brightness);
            }
        }

        // P2 (Melody): Pitch based on Yaw/Position
        if (performers[2] && this.performerInstruments[2]) {
            const p = performers[2];
            if (p.hasPerformer) {
                // Use yaw to bend pitch or select note from scale
                // Let's use current chord scale
                // Simple implementation: Map Yaw to scale degree offset
                const scale = CHORDS[this.currentChordIndex];
                // Map yaw (-1 to 1) to index 0-4
                const idx = Math.floor(THREE.MathUtils.mapLinear(p.current.yaw, -1, 1, 0, 4.99));
                const note = scale[Math.max(0, Math.min(4, idx))];

                // Octave up for lead
                this.performerInstruments[2].inst1.playNote(note * 2, now);
                this.performerInstruments[2].inst1.setVolume(0.5);
            } else {
                this.performerInstruments[2].inst1.setVolume(0);
            }

            // Pad volume based on presence
            this.performerInstruments[2].inst2.setVolume(p.presence * 0.3, 0.5);
        }
    }

    _scheduleBeat(time, performers) {
        // Bossa Rhythm Pattern (16th notes loop of 16 steps)
        // 1 bar = 4 beats = 16 sixteenths.
        // Bossa Clave: X . . X . . X . . . X . X . . . (approx)
        // Standard Bossa Nova (one bar):
        // Beat 1: Bass
        // Beat 1.5 (2-and): Bass (Syncopation)
        // Beat 3: Bass
        // Chords: 1, 1a, 2a, 3, 3a, 4a... Bossa has many variations.

        const step = this.beatCount % 16;

        // --- CHORD PROGRESSION CHANGE ---
        // Change chord every bar (16 steps)
        if (step === 0) {
            this.currentChordIndex = (this.currentChordIndex + 1) % CHORDS.length;

            // P2 Pad update
            if (this.performerInstruments[2]) {
                this.performerInstruments[2].inst2.setChord(CHORDS[this.currentChordIndex], time);
            }
        }

        const chordFreqs = CHORDS[this.currentChordIndex];
        const bassFreq = ROOTS[this.currentChordIndex];

        // --- P0: BASS & SHAKER ---
        if (performers[0].hasPerformer) {
            // Bass Pattern: On 1 and 3 (Root), and syncopation
            // 0 (1.1) -> Root
            // 6 (2.3) -> 5th? Or Root Syncopated
            // 8 (3.1) -> 5th (Typical Bossa: Root .. 5th ..)
            // 11 (3.4) -> 5th

            if (step === 0) {
                this.performerInstruments[0].inst1.playNote(bassFreq, time);
                this.performerInstruments[0].inst1.triggerAttack(time, 0.8);
            } else if (step === 8) {
                // Play 5th (x1.5)
                this.performerInstruments[0].inst1.playNote(bassFreq * 1.5, time);
                this.performerInstruments[0].inst1.triggerAttack(time, 0.6);
            } else if (step === 11) { // Pickup to next bar
                 this.performerInstruments[0].inst1.playNote(bassFreq * 1.5, time);
                 this.performerInstruments[0].inst1.triggerAttack(time, 0.5);
            }

            // Shaker: Every 16th, accented on beats
            const shakerAmp = (step % 4 === 0) ? 0.3 : 0.1;
            this.performerInstruments[0].inst2.trigger(time, shakerAmp);
        }

        // --- P1: CHORDS & CLAVE ---
        if (performers[1].hasPerformer) {
            // Guitar Chords Pattern (The "Bossa Strum")
            // Hit on: 1, 2&, 3&, 4& (Syncopated)
            // Steps: 0, 6, 10, 14
            const isHit = [0, 6, 10, 14].includes(step);

            if (isHit) {
                this.performerInstruments[1].inst1.setChord(chordFreqs, time);
                this.performerInstruments[1].inst1.triggerAttack(time, 0.6);
            }

            // Clave (Rimshot) - occasional accents
            // 2 (1&) and 12 (4) ?
            if (step === 3 || step === 12) {
                 this.performerInstruments[1].inst2.trigger(time, 0.6);
            }
        }
    }

    _advanceNote() {
        // Advance time by one 16th note
        // BPM 80 -> Quarter note = 60/80 = 0.75s
        // 16th note = 0.75 / 4 = 0.1875s
        const secondsPerBeat = 60.0 / this.tempo;
        const sixteenthTime = secondsPerBeat * 0.25;

        this.nextNoteTime += sixteenthTime;
        this.beatCount++;
    }
}
