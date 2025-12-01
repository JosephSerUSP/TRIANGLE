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
        this.barCounter = 0; // Count bars to handle longer loops
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

        // Simple convolution reverb
        this.reverb = this.ctx.createConvolver();
        this._createReverbImpulse();

        // Routing
        // Instruments -> Compressor -> Master
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
            primary: new PluckSynth(this.ctx, this.compressor),
            secondary: new StringPad(this.ctx, this.reverb)
        });

        // P2: Arp + String
        this.instruments.push({
            primary: new ArpSynth(this.ctx, this.compressor),
            secondary: new StringPad(this.ctx, this.reverb)
        });

        // Connect all secondary strings to compressor too for volume control
        // Note: Instruments route to 'destination' passed in constructor.
        // Primary instances go to compressor. Secondary go to reverb.
        // We also want secondary strings to have some compression control if needed,
        // but currently they go Reverb -> ReverbGain -> Master.
        // The original code tried connecting inst.secondary.output to compressor too.
        // If we do that, we get dry signal parallel to wet.
        // Let's keep it simple: Strings -> Reverb -> Master.

        // Ensure secondary outputs are also connected to main mix if we want dry signal?
        // No, strings are purely ambient here usually.
        // But the previous code had: inst.secondary.output.connect(this.compressor);
        // This adds a DRY signal. If we want strings louder, we should probably keep this or rely on wet.
        // Let's ADD the dry signal connection to compressor so we have dry + wet.
        this.instruments.forEach(inst => {
            inst.secondary.output.connect(this.compressor);
        });

        this.isReady = true;
    }

    _createReverbImpulse() {
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
            this.barCounter++;
        }
    }

    /**
     * Triggers notes for the specific time slot.
     */
    _scheduleNote(beatNumber, time) {
        // Change chord every 4 bars (64 sixteenths * 4? No, beatNumber is 0..15)
        // beatNumber resets every bar. barCounter counts bars.
        // Change chord if barCounter % 4 === 0 and beatNumber === 0.
        if (beatNumber === 0 && this.barCounter % 4 === 0) {
            this.chordIndex = (this.chordIndex + 1) % this.progression.length;
        }

        const currentChord = this.progression[this.chordIndex];
        const baseFreq = CONFIG.audio.rootFreq;

        const p0 = this._performerStates ? this._performerStates[0] : { active: false, expression: 0, pan: 0 };
        const p1 = this._performerStates ? this._performerStates[1] : { active: false, expression: 0, pan: 0 };
        const p2 = this._performerStates ? this._performerStates[2] : { active: false, expression: 0, pan: 0 };

        // --- Apply Continuous Modulation ---
        // This is imperfect in a scheduler, ideally should be in render loop, but this works for per-16th updates
        if (this.instruments[0]) {
             this.instruments[0].primary.setPan(p0.pan);
             this.instruments[0].primary.modulate({ timbre: p0.expression });
             this.instruments[0].secondary.setPan(p0.pan * 0.5); // Spread less
             this.instruments[0].secondary.modulate({ timbre: p0.expression });
        }
        if (this.instruments[1]) {
             this.instruments[1].primary.setPan(p1.pan);
             this.instruments[1].primary.modulate({ timbre: p1.expression });
             this.instruments[1].secondary.setPan(p1.pan * 0.5);
             this.instruments[1].secondary.modulate({ timbre: p1.expression });
        }
        if (this.instruments[2]) {
             this.instruments[2].primary.setPan(p2.pan);
             this.instruments[2].primary.modulate({ timbre: p2.expression });
             this.instruments[2].secondary.setPan(p2.pan * 0.5);
             this.instruments[2].secondary.modulate({ timbre: p2.expression });
        }

        // --- Performer A: Driving Bass Pulse ---
        if (p0.active) {
            // Bass:
            const bassStep = this.bassPattern[beatNumber];
            if (bassStep > 0) {
                // 1 = Root, 2 = Fifth
                const interval = bassStep === 1 ? currentChord.bass : currentChord.bass + 7;
                const freq = baseFreq * Math.pow(2, interval / 12);

                const vel = 0.5 + (p0.expression * 0.5);
                this.instruments[0].primary.playNote(freq, time, 0.2, vel);
            }

            // String: Sustain chord
            // Trigger new chord pad every 2 bars for slower evolution?
            // Or just retrigger every bar but with long attack/release
            if (beatNumber === 0 && this.barCounter % 2 === 0) {
                const notes = currentChord.notes;
                notes.forEach(n => {
                    const f = baseFreq * 2 * Math.pow(2, n/12); // Octave up
                    // Longer duration for smoother pad
                    this.instruments[0].secondary.playNote(f, time, 4.0, 0.4 * p0.expression);
                });
            }
        }

        // --- Performer B: Ostinato + String ---
        if (p1.active) {
            // Ostinato
            const scaleIndex = this.ostinatoPattern[beatNumber];

            // Add probability based on expression. Lower expression = fewer notes.
            // density: 0.2 to 1.0
            const density = 0.2 + p1.expression * 0.8;

            if (scaleIndex !== undefined && Math.random() < density) {
                const noteIndex = scaleIndex % currentChord.notes.length;
                const interval = currentChord.notes[noteIndex];
                const f = baseFreq * 4 * Math.pow(2, interval/12); // 2 Octaves up

                const vel = 0.3 + (p1.expression * 0.6);
                this.instruments[1].primary.playNote(f, time, 0.1, vel);
            }

             // String: Long pad
            if (beatNumber === 0 && this.barCounter % 2 === 0) {
                const n = currentChord.notes[2]; // 3rd or 5th
                const f = baseFreq * 4 * Math.pow(2, n/12);
                this.instruments[1].secondary.playNote(f, time, 4.0, 0.3 * p1.expression);
            }
        }

        // --- Performer C: Arpeggio + String ---
        if (p2.active) {
            // Arpeggio
            // Add probability for evolving rhythm
            const density = 0.1 + p2.expression * 0.9;

            if (Math.random() < density) {
                const arpIndex = beatNumber % currentChord.notes.length;
                const interval = currentChord.notes[arpIndex];
                const f = baseFreq * 4 * Math.pow(2, interval/12);

                const vel = (0.3 + (p2.expression * 0.5)) * (0.8 + Math.random() * 0.4);
                this.instruments[2].primary.playNote(f, time, 0.1, vel);
            }

             // String
            if (beatNumber === 8 && this.barCounter % 2 === 0) { // Halfway through bar
                 const n = currentChord.notes[1];
                 const f = baseFreq * 2 * Math.pow(2, n/12);
                 this.instruments[2].secondary.playNote(f, time, 4.0, 0.3 * p2.expression);
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
            expression: THREE.MathUtils.clamp(p.triangle.height || 0.5, 0.0, 1.0),
            // Map Yaw (-PI/2 to PI/2) to Pan (-1 to 1)
            pan: THREE.MathUtils.clamp((p.current.yaw || 0) / (Math.PI / 2), -1, 1)
        }));
    }
}
