// src/systems/AudioSystem.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { CHORD_PROGRESSION, SCALES } from './audio/MusicTheory.js';
import { PulseBass, StringPad, PluckSynth, ArpSynth, KickDrum } from './audio/Instruments.js';

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
        this.kick = null;

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

        // Kick drum heat state (0.0 to 1.0)
        this.kickHeat = 0.0;
        this.kickState = 'SILENT'; // SILENT, TIMID, BUILDING, POUNDING
        this.activePerformerCount = 0;

        // Channel state tracking for Intro/Outro logic
        // Status: 'SILENT', 'INTRO', 'MAIN', 'OUTRO'
        this.channelStates = [
            { status: 'SILENT', startTime: 0, leaveTime: 0 },
            { status: 'SILENT', startTime: 0, leaveTime: 0 },
            { status: 'SILENT', startTime: 0, leaveTime: 0 }
        ];
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

        // Initialize Kick
        this.kick = new KickDrum(this.ctx, this.compressor);

        // Connect all secondary strings to compressor too for volume control
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
        // Change chord every 4 bars
        if (beatNumber === 0 && this.barCounter % 4 === 0) {
            this.chordIndex = (this.chordIndex + 1) % this.progression.length;
        }

        const currentChord = this.progression[this.chordIndex];
        const baseFreq = CONFIG.audio.rootFreq;
        const cycleIndex = Math.floor(this.barCounter / 4);

        // --- Kick Drum Logic ---
        if (this.kickHeat > 0.01) {
            // 4-on-the-floor kick pattern
            if (beatNumber % 4 === 0) {
                // Modulate kick based on heat
                // Low heat: Timid (lower velocity, no click)
                // High heat: Pounding (high velocity, click)

                // Curve the velocity response
                const kickVel = 0.3 + (this.kickHeat * 0.7);
                // "Timid" kick might pitch down slightly less punchy

                this.kick.playNote(50, time, 0.2, kickVel);
            }
        }


        // --- Performer State Loop ---
        for (let i = 0; i < 3; i++) {
            if (!this._performerStates || !this._performerStates[i]) continue;

            const pState = this._performerStates[i];
            const channel = this.channelStates[i];
            const inst = this.instruments[i];

            // Calculate Evolution Factor based on time active
            // Ramps from 0 to 1 over 30 seconds
            let evolution = 0.0;
            if (channel.status === 'MAIN' || channel.status === 'INTRO') {
                const activeTime = time - channel.startTime;
                evolution = THREE.MathUtils.clamp(activeTime / 30.0, 0.0, 1.0);
            }
            if (channel.status === 'OUTRO') {
                evolution = 0.0;
            }

            // Modulation (Timbre/Pan)
            // If OUTRO, lower timbre/cutoff
            let timbre = pState.expression;
            if (channel.status === 'OUTRO') {
                timbre *= 0.5; // Darker
            }

            inst.primary.setPan(pState.pan);
            inst.primary.modulate({ timbre: timbre });
            inst.secondary.setPan(pState.pan * 0.5);
            inst.secondary.modulate({ timbre: timbre });

            // If SILENT, skip note generation
            if (channel.status === 'SILENT') continue;

            // --- Pattern Logic ---

            // Performer A: Bass + String
            if (i === 0) {
                // Bass Variation Logic
                let bassNoteToPlay = null;

                // INTRO: Sparse
                if (channel.status === 'INTRO') {
                     if (beatNumber === 0) bassNoteToPlay = 1; // Root
                }
                // OUTRO: Sparse
                else if (channel.status === 'OUTRO') {
                    if (beatNumber === 0 || beatNumber === 8) bassNoteToPlay = 1;
                }
                // MAIN: Evolves with time
                else {
                    // Check for forced driving expression
                    if (pState.expression > 0.8 && evolution > 0.8) {
                        // Driving 8th notes only when evolved and expressive
                         if (beatNumber % 2 === 0) bassNoteToPlay = 1;
                    } else {
                        // Standard Pattern, but only play busy parts if evolved
                        const step = this.bassPattern[beatNumber];
                        if (step > 0) {
                            // If it's a "busy" beat (not 0, 4, 8, 12), check evolution
                            if (beatNumber % 4 !== 0) {
                                if (Math.random() < evolution) bassNoteToPlay = step;
                            } else {
                                bassNoteToPlay = step;
                            }
                        }
                    }
                }

                if (bassNoteToPlay) {
                    // Harmonic Variation (Recontextualization)
                    // Cycle % 4 == 1 -> Inversion (3rd)
                    // Cycle % 4 == 3 -> Pedal Point (Key Root)
                    let interval = (bassNoteToPlay === 1 ? currentChord.bass : currentChord.bass + 7);

                    if (channel.status === 'MAIN') {
                        if (cycleIndex % 4 === 1 && bassNoteToPlay === 1) {
                            // Inversion: Play the 3rd of the chord (index 2 in notes)
                            // But currentChord.bass is offset.
                            // currentChord.notes[2] is the interval for the 3rd relative to key.
                            interval = currentChord.notes[2] - 12; // octave down
                        } else if (cycleIndex % 4 === 3) {
                            // Pedal Point on D (0)
                            interval = 0; // D1
                        }
                    }

                    const freq = baseFreq * Math.pow(2, interval / 12);
                    const vel = 0.5 + (timbre * 0.5);
                    inst.primary.playNote(freq, time, 0.2, vel);
                }

                // String Pad
                // Retrigger occasionally
                const padTriggerBeat = 0;
                // Intro/Outro: longer pads
                const padIntervalBars = (channel.status === 'MAIN') ? 2 : 4;

                if (beatNumber === padTriggerBeat && this.barCounter % padIntervalBars === 0) {
                     const notes = currentChord.notes;
                     notes.forEach(n => {
                        const f = baseFreq * 2 * Math.pow(2, n/12);
                        // String volume increased in class, here we ensure timbre allows it through
                        inst.secondary.playNote(f, time, 4.0, 0.5 + 0.5 * timbre);
                    });
                }
            }

            // Performer B: Ostinato + String
            else if (i === 1) {
                const scaleIndex = this.ostinatoPattern[beatNumber];

                // Density based on state AND evolution
                let density = 0.0;
                if (channel.status === 'INTRO') density = 0.1; // Very sparse start
                if (channel.status === 'OUTRO') density = 0.1;
                if (channel.status === 'MAIN') {
                     // Ramps from 0.2 to 0.8 based on evolution
                     density = 0.2 + (evolution * 0.6);
                     // Expression adds on top
                     density += pState.expression * 0.2;
                }

                if (scaleIndex !== undefined && Math.random() < density) {
                    const noteIndex = scaleIndex % currentChord.notes.length;
                    const interval = currentChord.notes[noteIndex];
                    const f = baseFreq * 4 * Math.pow(2, interval/12);
                    const vel = 0.3 + (timbre * 0.6);
                    inst.primary.playNote(f, time, 0.1, vel);
                }

                // Pad
                if (beatNumber === 0 && this.barCounter % 2 === 0) {
                     const n = currentChord.notes[2];
                     const f = baseFreq * 4 * Math.pow(2, n/12);
                     inst.secondary.playNote(f, time, 4.0, 0.5 + 0.4 * timbre);
                }
            }

            // Performer C: Arpeggio + String
            else if (i === 2) {
                 let density = 0.0;
                if (channel.status === 'INTRO') density = 0.05;
                if (channel.status === 'OUTRO') density = 0.05;
                if (channel.status === 'MAIN') {
                    // Gradual build up
                    density = 0.1 + (evolution * 0.7);
                    density += pState.expression * 0.2;
                }

                if (Math.random() < density) {
                    const arpIndex = beatNumber % currentChord.notes.length;
                    const interval = currentChord.notes[arpIndex];
                    const f = baseFreq * 4 * Math.pow(2, interval/12);
                    const vel = (0.3 + (timbre * 0.5)) * (0.8 + Math.random() * 0.4);
                    inst.primary.playNote(f, time, 0.1, vel);
                }

                // String
                 if (beatNumber === 8 && this.barCounter % 2 === 0) {
                     const n = currentChord.notes[1];
                     const f = baseFreq * 2 * Math.pow(2, n/12);
                     inst.secondary.playNote(f, time, 4.0, 0.5 + 0.4 * timbre);
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

        // Cache simplified state for the scheduler
        this._performerStates = performers.map(p => ({
            active: p.hasPerformer,
            expression: THREE.MathUtils.clamp(p.triangle.height || 0.5, 0.0, 1.0),
            pan: THREE.MathUtils.clamp((p.current.yaw || 0) / (Math.PI / 2), -1, 1)
        }));

        const now = this.ctx.currentTime;
        const INTRO_DURATION = 16.0; // Slowed down from 8.0 for more gradual entry
        const OUTRO_DURATION = 4.0; // 4 seconds linger

        let activeCount = 0;

        // State Machine Update
        for (let i = 0; i < 3; i++) {
            const p = this._performerStates[i];
            const channel = this.channelStates[i];

            if (p.active) {
                activeCount++;
                // If previously silent or outro, start Intro
                if (channel.status === 'SILENT' || channel.status === 'OUTRO') {
                    channel.status = 'INTRO';
                    channel.startTime = now;
                }

                // Check Intro -> Main transition
                if (channel.status === 'INTRO') {
                    if (now - channel.startTime > INTRO_DURATION) {
                        channel.status = 'MAIN';
                    }
                }
            } else {
                // Performer gone
                if (channel.status === 'MAIN' || channel.status === 'INTRO') {
                    channel.status = 'OUTRO';
                    channel.leaveTime = now;
                }

                // Check Outro -> Silent
                if (channel.status === 'OUTRO') {
                    if (now - channel.leaveTime > OUTRO_DURATION) {
                        channel.status = 'SILENT';
                    }
                }
            }
        }

        this.activePerformerCount = activeCount;

        // --- Kick Heat Update ---
        const targetHeat = this._calculateTargetKickHeat(activeCount);

        // Move current heat towards target heat slowly
        // If we are building up (3 performers), we want it slow (e.g. over 10-15 seconds)
        // If we are dropping (2 or less), we might want it faster or immediate.

        const dt = 1.0 / 60.0; // Approx frame time
        let heatRate = 0.05 * dt; // Slow default

        if (activeCount >= 3) {
            // "After some time, it becomes a truly exciting, pounding kick"
            // Let's make it take ~20 seconds to go from 0.3 (timid) to 1.0 (pounding)
            // 0.7 diff / 20s = 0.035 per sec
            heatRate = 0.035 * dt;
        } else if (activeCount === 2) {
            // Decaying down to timid or building up to timid
            heatRate = 0.1 * dt;
        } else {
            // Rapid decay
            heatRate = 0.5 * dt;
        }

        if (this.kickHeat < targetHeat) {
            this.kickHeat = Math.min(this.kickHeat + heatRate, targetHeat);
        } else if (this.kickHeat > targetHeat) {
            this.kickHeat = Math.max(this.kickHeat - heatRate, targetHeat);
        }
    }

    _calculateTargetKickHeat(count) {
        if (count < 2) return 0.0;
        if (count === 2) return 0.3; // Timid
        if (count >= 3) return 1.0; // Pounding
        return 0.0;
    }
}
