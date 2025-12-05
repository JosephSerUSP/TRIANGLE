// src/systems/AudioSystem.js
import * as THREE from 'three';
import { CONFIG } from '../../core/Config.js';
import { CHORD_PROGRESSION, SCALES } from './MusicTheory.js';
import { PulseBass, StringPad, PluckSynth, ArpSynth, KickDrum } from './Instruments.js';

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
        this.tempo = 110.0; // Slightly slower for deeper feel
        this.lookahead = 25.0; // ms
        this.scheduleAheadTime = 0.1; // s

        this.chordIndex = 0;
        this.progression = CHORD_PROGRESSION;

        // Bossa Clave (3-2) in 16th notes: X..X..X...X.X...
        // 1 represents a hit
        this.clavePattern = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];

        // Bass pattern (dotted quarter + eighth feel / driving)
        // 1 = root, 2 = fifth, 3 = octave
        this.bassPattern = [1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 0, 3, 0];

        // Kick Pattern (4-on-the-floor)
        this.kickPattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

        this.kickIntensity = 0.0;

        // Ostinato Patterns (Deterministic)
        this.ostinatoPatterns = [
            [0, 2, 4, 7, 4, 2, 0, 2, 0, 2, 4, 7, 4, 2, 0, 2], // 16th flow
            [0, 4, 7, 9, 7, 4, 0, 4, 0, 4, 7, 9, 7, 4, 0, 4], // Wider
            [0, 2, 0, 2, 4, 2, 4, 7, 4, 7, 9, 7, 9, 11, 9, 7]  // Climbing
        ];

        // Channel state tracking
        // Instead of discrete states, we use 'energy' (0.0 - 1.0)
        // This ensures persistence and smooth transitions.
        this.channelEnergies = [0, 0, 0];
        this.channelStates = [
            { status: 'SILENT' },
            { status: 'SILENT' },
            { status: 'SILENT' }
        ];
    }

    /**
     * Initializes the AudioContext, master effects chain, and all instruments.
     * This must be called after a user interaction gesture.
     * @param {number} performerCount - The number of performers to initialize instruments for.
     * @returns {Promise<void>}
     */
    async init(performerCount) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        // Master Chain: Compress -> Reverb -> Master
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.ratio.value = 12;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = CONFIG.audio.mix.master;

        // Convolution Reverb
        this.reverb = this.ctx.createConvolver();
        this._createReverbImpulse();

        // Routing
        // Instruments -> Compressor -> Master
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        // Reverb Send
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = CONFIG.audio.mix.reverb;
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);

        // Performer Setup
        // A (0): Bass (Logic) + String
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

        // Kick Drum
        this.kickDrum = new KickDrum(this.ctx, this.compressor);

        // Connect all secondary strings to compressor too for volume control
        this.instruments.forEach(inst => {
            inst.secondary.output.connect(this.compressor);
        });

        this.isReady = true;
    }

    _createReverbImpulse() {
        const rate = this.ctx.sampleRate;
        const length = rate * 3.0; // 3 seconds - longer tail
        const decay = 3.0;
        const impulse = this.ctx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = length - i;
            // Pink noise approximation for smoother reverb
            // Use distinct noise for Left/Right to ensure stereo width
            let whiteL = Math.random() * 2 - 1;
            let whiteR = Math.random() * 2 - 1;
            left[i] = whiteL * Math.pow(n / length, decay);
            right[i] = whiteR * Math.pow(n / length, decay);
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
     * Schedules all musical events for a specific 16th note time slot.
     * This is the core of the sequencer logic.
     * @private
     * @param {number} beatNumber - The current 16th note index (0-15).
     * @param {number} time - The precise AudioContext time to schedule the event.
     */
    _scheduleNote(beatNumber, time) {
        // Change chord every 4 bars
        if (beatNumber === 0 && this.barCounter % 4 === 0) {
            this.chordIndex = (this.chordIndex + 1) % this.progression.length;
        }

        const currentChord = this.progression[this.chordIndex];
        const baseFreq = CONFIG.audio.rootFreq;

        // --- Aggregate Energy Logic ---
        // Calculate total energy to drive global instruments (Kick, Bass)
        const totalEnergy = this.channelEnergies.reduce((a, b) => a + b, 0);

        // --- Kick Drum ---
        if (this.kickIntensity > 0.001) {
            if (this.kickPattern[beatNumber]) {
                this.kickDrum.playNote(time, this.kickIntensity);
            }
        }

        // --- Bass (Global Instrument) ---
        // Plays if ANY energy is present (> 0.1)
        if (totalEnergy > 0.1) {
             const inst = this.instruments[0].primary; // Reuse P0's bass synth

             // Determine Pattern Complexity based on Total Energy
             // Low Energy: Root on 1
             // Med Energy: Root-5 Pattern
             // High Energy: Driving Pattern

             let noteToPlay = null;

             if (totalEnergy < 1.0) {
                 // Simple
                 if (beatNumber === 0) noteToPlay = 1;
                 if (beatNumber === 8 && totalEnergy > 0.5) noteToPlay = 1;
             } else {
                 // Full Pattern
                 const step = this.bassPattern[beatNumber];
                 if (step > 0) noteToPlay = step;

                 // Variation every 4th bar
                 if (this.barCounter % 4 === 3 && beatNumber > 8) {
                     if (beatNumber % 2 === 0) noteToPlay = 1; // Fill
                 }
             }

             if (noteToPlay) {
                 let interval = (noteToPlay === 1 ? currentChord.bass : currentChord.bass + 7);
                 if (noteToPlay === 3) interval = currentChord.bass + 12;

                 // Pedal Point logic
                 if (this.barCounter % 8 === 7) interval = currentChord.bass; // Stay on root for resolution

                 const freq = baseFreq * Math.pow(2, interval / 12);
                 const vel = 0.4 + (Math.min(totalEnergy, 2.0) * 0.3); // Velocity scales with energy
                 inst.playNote(freq, time, 0.25, vel);

                 // Filter modulation based on energy
                 inst.modulate({ timbre: Math.min(totalEnergy / 2, 1.0) });
             }
        }

        // --- Performer Layers ---
        for (let i = 0; i < 3; i++) {
            const energy = this.channelEnergies[i];
            if (energy < 0.01) continue;

            const inst = this.instruments[i];
            const pState = this._performerStates && this._performerStates[i] ? this._performerStates[i] : { expression: 0.5, pan: 0 };

            // Map energy to timbre
            const timbre = pState.expression * energy;

            inst.primary.setPan(pState.pan);
            inst.primary.modulate({ timbre: timbre });
            inst.secondary.setPan(pState.pan * 0.5);
            inst.secondary.modulate({ timbre: timbre });

            // --- String Pad (Everyone contributes) ---
            // Trigger on downbeat, hold for 2 or 4 bars
            if (beatNumber === 0 && this.barCounter % 2 === 0) {
                // Spread notes based on ID
                // 0: Root
                // 1: 3rd
                // 2: 7th
                const chordNotes = currentChord.notes;
                let noteIdx = 0;
                if (i === 1) noteIdx = 2; // 3rd/5th depending on voicing
                if (i === 2) noteIdx = Math.min(3, chordNotes.length - 1);

                const note = chordNotes[noteIdx];
                // Octave adjustment
                const octave = (i === 0) ? 1 : 2;

                const f = baseFreq * octave * Math.pow(2, note/12);
                const vel = 0.3 * energy;
                inst.secondary.playNote(f, time, 4.0, vel);
            }

            // --- Melodic Layers ---

            // P1: Ostinato (Deterministic)
            if (i === 1) {
                // Select pattern based on bar
                const patIdx = this.barCounter % this.ostinatoPatterns.length;
                const pattern = this.ostinatoPatterns[patIdx];

                const scaleIndex = pattern[beatNumber];

                // Deterministic trigger: always play if energy high enough,
                // or mask with a rhythmic grid
                // Simple mask: play every note in pattern if energy > 0.5
                // If energy < 0.5, play only on strong beats (0, 4, 8, 12)

                let shouldPlay = true;
                if (energy < 0.5 && beatNumber % 4 !== 0) shouldPlay = false;

                if (shouldPlay) {
                    const noteIndex = scaleIndex % currentChord.notes.length;
                    const interval = currentChord.notes[noteIndex];
                    const f = baseFreq * 4 * Math.pow(2, interval/12);
                    const vel = 0.2 + (timbre * 0.4);
                    inst.primary.playNote(f, time, 0.15, vel);
                }
            }

            // P2: Arpeggio (Deterministic)
            if (i === 2) {
                // Arp pattern: Up, Down, or Random-seeded
                // Let's use a mathematical arp based on beat
                // Beat 0: Note 0
                // Beat 1: Note 1
                // ...

                // Density control
                // Energy 0.0-0.3: Quarter notes
                // Energy 0.3-0.7: Eighth notes
                // Energy 0.7-1.0: Sixteenths

                let subdiv = 4; // Quarters (0, 4, 8, 12)
                if (energy > 0.3) subdiv = 2; // Eighths
                if (energy > 0.7) subdiv = 1; // 16ths

                if (beatNumber % subdiv === 0) {
                    const numNotes = currentChord.notes.length;
                    // Pattern: Up/Down based on bar parity
                    let noteIdx;
                    if (this.barCounter % 2 === 0) {
                        noteIdx = (beatNumber / subdiv) % numNotes;
                    } else {
                        noteIdx = (numNotes - 1) - ((beatNumber / subdiv) % numNotes);
                    }

                    const interval = currentChord.notes[noteIdx];
                    const f = baseFreq * 4 * Math.pow(2, interval/12);
                    const vel = 0.2 + (timbre * 0.5);
                    inst.primary.playNote(f, time, 0.1, vel);
                }
            }
        }
    }

    /**
     * Updates internal state based on performers.
     * @param {Performer[]} performers
     */
    update(performers) {
        if (!this.isReady) return;

        // Cache state
        this._performerStates = performers.map(p => ({
            active: p.hasPerformer,
            expression: THREE.MathUtils.clamp(p.triangle.height || 0.5, 0.0, 1.0),
            pan: THREE.MathUtils.clamp((p.current.yaw || 0) / (Math.PI / 2), -1, 1)
        }));

        // Update Channel Energies (Smooth Persistence)
        const attack = 0.05; // Fast rise
        const decay = 0.005; // Very slow decay (prevents flicker dropout)

        for (let i = 0; i < 3; i++) {
            const p = this._performerStates[i];
            if (p.active) {
                this.channelEnergies[i] += attack;
            } else {
                this.channelEnergies[i] -= decay;
            }
            this.channelEnergies[i] = THREE.MathUtils.clamp(this.channelEnergies[i], 0.0, 1.0);
        }

        // Calculate Kick Intensity based on Aggregate Energy
        const totalEnergy = this.channelEnergies.reduce((a, b) => a + b, 0);
        let targetKick = 0.0;

        if (totalEnergy > 1.5) targetKick = 1.0;      // 3 people or 2 very active
        else if (totalEnergy > 0.8) targetKick = 0.6; // 1-2 people
        else if (totalEnergy > 0.2) targetKick = 0.3; // Just starting

        this.kickIntensity += (targetKick - this.kickIntensity) * 0.05;
    }
}
