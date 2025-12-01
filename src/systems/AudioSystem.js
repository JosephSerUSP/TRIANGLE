// src/systems/AudioSystem.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { CHORD_PROGRESSION, SCALES } from './audio/MusicTheory.js';
import { PulseBass, StringPad, PluckSynth, ArpSynth } from './audio/Instruments.js';

/**
 * Manages audio synthesis for the application.
 * Uses the Web Audio API to create voices and effects.
 */
export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.isReady = false;

        this.masterGain = null;
        this.compressor = null;
        this.reverb = null;

        // Performers' instruments: Array of { inst1, inst2 }
        this.instruments = [];

        // Sequencer State
        this.isPlaying = false;
        this.currentSixteenthNote = 0;
        this.nextNoteTime = 0.0;
        this.tempo = 120.0;
        this.lookahead = 25.0; // ms
        this.scheduleAheadTime = 0.1; // s

        this.chordIndex = 0;
        this.progression = CHORD_PROGRESSION;

        // Bossa Clave (3-2) in 16th notes: X..X..X...X.X...
        // 1 represents a hit
        this.clavePattern = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];

        // Bass pattern (dotted quarter + eighth feel / driving)
        // 1 = root, 2 = fifth
        this.bassPattern = [1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 0, 2, 0];

        // Ostinato Pattern (Performer B)
        this.ostinatoPattern = [0, 2, 4, 7, 4, 2, 0, 2, 0, 2, 4, 7, 4, 2, 0, 2]; // Scale degrees
    }

    /**
     * Initializes the AudioContext and instruments.
     * @param {number} performerCount - Expected number of performers (should be 3).
     */
    async init(performerCount) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        // Master Chain: Compress -> Reverb -> Master
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.ratio.value = 12;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;

        // Simple convolution reverb (impulse response generation could be better, using simple decay for now)
        this.reverb = this.ctx.createConvolver();
        this._createReverbImpulse();

        // Routing
        // Instruments -> Compressor -> Reverb -> Master -> Out
        // Actually usually parallel reverb: Instruments -> Compressor -> Master. Instruments -> Reverb -> Master.
        // Let's do series for simplicity or parallel.
        // Let's do Instruments -> Compressor -> Master.
        // And Instruments -> Reverb -> Master (send).

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        // Reverb Send
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0.3;
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);

        // Performer Setup
        // A (0): Bass + String
        // B (1): Ostinato + String
        // C (2): Arp + String

        this.instruments = [];

        // P0: Bass + String
        this.instruments.push({
            primary: new PulseBass(this.ctx, this.compressor),
            secondary: new StringPad(this.ctx, this.reverb)
        });

        // P1: Ostinato + String
        this.instruments.push({
            primary: new PluckSynth(this.ctx, this.compressor), // Send Pluck to Comp for tightness
            secondary: new StringPad(this.ctx, this.reverb)
        });

        // P2: Arp + String
        this.instruments.push({
            primary: new ArpSynth(this.ctx, this.compressor),
            secondary: new StringPad(this.ctx, this.reverb)
        });

        // Connect all secondary strings to compressor too for volume control
        this.instruments.forEach(inst => {
            inst.secondary.output.connect(this.compressor);
        });

        this.isReady = true;
    }

    _createReverbImpulse() {
        // Create a simple impulse response for reverb
        const rate = this.ctx.sampleRate;
        const length = rate * 2.0; // 2 seconds
        const decay = 2.0;
        const impulse = this.ctx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = length - i;
            left[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
            right[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
        }
        this.reverb.buffer = impulse;
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (!this.isPlaying) {
            this.isPlaying = true;
            this.nextNoteTime = this.ctx.currentTime + 0.1;
            this._scheduler();
        }
    }

    _scheduler() {
        if (!this.isPlaying) return;

        // While there are notes that will play within the scheduleAheadTime
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this._scheduleNote(this.currentSixteenthNote, this.nextNoteTime);
            this._advanceNote();
        }

        setTimeout(() => this._scheduler(), this.lookahead);
    }

    _advanceNote() {
        const secondsPerBeat = 60.0 / this.tempo;
        this.nextNoteTime += 0.25 * secondsPerBeat; // 16th notes
        this.currentSixteenthNote++;
        if (this.currentSixteenthNote === 16) {
            this.currentSixteenthNote = 0;
        }
    }

    /**
     * Triggers notes for the specific time slot.
     */
    _scheduleNote(beatNumber, time) {
        // Determine current chord
        // 16 beats per bar. Change chord every bar?
        // Let's iterate chords every 4 bars (64 beats) or 1 bar.
        // Let's do 1 bar per chord for now.

        // We need a global beat counter or derive from time?
        // For simplicity, let's keep a beat counter in the class if we want chord changes.
        // Actually, let's use a simple counter variable stored on the instance that increments.
        if (beatNumber === 0) {
            this.chordIndex = (this.chordIndex + 1) % this.progression.length;
        }

        const currentChord = this.progression[this.chordIndex];
        const rootKey = 40; // E2 as roughly center? D2 = 38. Let's say MIDI note numbers.
        // Helper to get freq from interval
        const getFreq = (semitones) => {
             // 69 is A4 (440)
             // D2 is 38.
             // We can map 0 in CHORD_PROGRESSION to D2 or D3.
             // Let's say bass is relative to D2 (38).
             // Harmony relative to D3 (50).
             return 440 * Math.pow(2, (semitones - 69) / 12);
        };

        // We need access to performer state to modulate volume/intensity.
        // We can't pass performer state into _scheduleNote easily because it's async loop.
        // We will store "current intensities" in the class, updated by update().

        const p0 = this._performerStates ? this._performerStates[0] : { active: false };
        const p1 = this._performerStates ? this._performerStates[1] : { active: false };
        const p2 = this._performerStates ? this._performerStates[2] : { active: false };

        // --- Performer A: Driving Bass Pulse ---
        if (p0.active) {
            const bassStep = this.bassPattern[beatNumber];
            if (bassStep > 0) {
                // 1 = Root, 2 = Fifth
                const interval = bassStep === 1 ? currentChord.bass : currentChord.bass + 7;
                // Bass range: D1 - D2.
                // currentChord.bass is relative semitone. D is 0?
                // If D=0 (Config.rootFreq), then bass=0 is D.
                // Let's calculate frequency manually using Config.rootFreq
                const baseFreq = CONFIG.audio.rootFreq; // D2
                const freq = baseFreq * Math.pow(2, interval / 12);

                // Velocity modulated by performer expression (triangle height)
                const vel = 0.5 + (p0.expression * 0.5);
                this.instruments[0].primary.playNote(freq, time, 0.2, vel);
            }

            // String: Sustain chord
            // Trigger new chord pad at beat 0
            if (beatNumber === 0) {
                // Play full chord
                // Select random notes or full stack
                const notes = currentChord.notes;
                notes.forEach(n => {
                    const f = CONFIG.audio.rootFreq * 2 * Math.pow(2, n/12); // Octave up
                    this.instruments[0].secondary.playNote(f, time, 2.0, 0.3 * p0.expression);
                });
            }
        }

        // --- Performer B: Ostinato + String ---
        if (p1.active) {
            // Ostinato: Play scale degree from pattern
            // Scale degree relative to chord root? Or key center?
            // "Ostinato" usually implies a fixed pattern against changing chords, or adapting.
            // Let's adapt to chord.
            const scaleIndex = this.ostinatoPattern[beatNumber];
            if (scaleIndex !== undefined) {
                // Map scale index to chord note index?
                // chord.notes has 5 notes usually.
                const noteIndex = scaleIndex % currentChord.notes.length;
                const interval = currentChord.notes[noteIndex];
                const f = CONFIG.audio.rootFreq * 4 * Math.pow(2, interval/12); // 2 Octaves up

                const vel = 0.4 + (p1.expression * 0.4);
                this.instruments[1].primary.playNote(f, time, 0.1, vel);
            }

             // String: Long pad, maybe higher voicing
            if (beatNumber === 0) {
                const n = currentChord.notes[2]; // 3rd or 5th
                const f = CONFIG.audio.rootFreq * 4 * Math.pow(2, n/12);
                this.instruments[1].secondary.playNote(f, time, 2.0, 0.2 * p1.expression);
            }
        }

        // --- Performer C: Arpeggio + String ---
        if (p2.active) {
            // Arpeggio: 16th notes running up/down
            // Beat 0: Note 0, Beat 1: Note 1...
            const arpIndex = beatNumber % currentChord.notes.length;
            const interval = currentChord.notes[arpIndex];
            // Maybe zig zag? 0 1 2 3 4 3 2 1...
            // Let's keep simple up for now.

            const f = CONFIG.audio.rootFreq * 4 * Math.pow(2, interval/12);

            // Randomize velocity slightly for human feel
            const vel = (0.3 + (p2.expression * 0.5)) * (0.8 + Math.random() * 0.4);

            // Only play if p2 is fairly active
            if (p2.expression > 0.1) {
                 this.instruments[2].primary.playNote(f, time, 0.1, vel);
            }

             // String
            if (beatNumber === 8) { // Halfway through bar
                 const n = currentChord.notes[1];
                 const f = CONFIG.audio.rootFreq * 2 * Math.pow(2, n/12);
                 this.instruments[2].secondary.playNote(f, time, 2.0, 0.2 * p2.expression);
            }
        }
    }

    /**
     * Updates internal state based on performers.
     * @param {Performer[]} performers
     */
    update(performers) {
        if (!this.isReady) return;

        // Cache simplified state for the scheduler to use
        this._performerStates = performers.map(p => ({
            active: p.hasPerformer,
            // Expression mapped to 0..1. Triangle height is usually 0..1.
            expression: THREE.MathUtils.clamp(p.triangle.height || 0.5, 0.1, 1.0),
            // Pan could be used too.
            pan: p.current.yaw // -PI/2 to PI/2
        }));

        // Modulate Tempo based on aggregate activity?
        // Or keep steady bossa? Bossa is usually steady.
        // Let's slightly nudge tempo if everyone is moving fast.
        let totalActivity = 0;
        performers.forEach(p => {
            if (p.hasPerformer) totalActivity += p.current.bpmPref; // bpmPref is roughly motion based?
        });

        // Default target is 120.
        // If high activity, go to 130. Low, 110.
        // This needs careful tuning so it doesn't sound like a warped record.
        // Let's stick to 120 for "Bossa/Shibuya" stability.
    }
}
