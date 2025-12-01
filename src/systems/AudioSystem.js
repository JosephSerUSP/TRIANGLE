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
        this.kickDrum = null;

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

        // Channel state tracking for Intro/Outro logic
        // Status: 'SILENT', 'INTRO', 'MAIN', 'OUTRO'
        // evolution: 0.0 -> 1.0 (Gradual intensity)
        this.channelStates = [
            { status: 'SILENT', startTime: 0, leaveTime: 0, evolution: 0.0 },
            { status: 'SILENT', startTime: 0, leaveTime: 0, evolution: 0.0 },
            { status: 'SILENT', startTime: 0, leaveTime: 0, evolution: 0.0 }
        ];

        // Kick logic
        this.kickState = {
            activePerformersCount: 0,
            threePerformerStartTime: 0,
            intensity: 0.0 // 0.0 (silent) -> 0.5 (timid) -> 1.0 (pounding)
        };
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

        // Global Kick
        this.kickDrum = new KickDrum(this.ctx, this.compressor);

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
        // 4-on-the-floor
        if (beatNumber % 4 === 0) {
            if (this.kickState.intensity > 0.05) {
                // Determine tone: 0.0 -> 1.0 (Timid -> Pounding)
                // We map intensity 0.5->1.0 to Tone 0.0->1.0
                let tone = (this.kickState.intensity - 0.5) * 2.0;
                tone = Math.max(0, Math.min(1, tone));

                // Volume
                const vel = this.kickState.intensity * 0.9;

                this.kickDrum.playNote(time, vel, tone);
            }
        }


        // --- Performer State Loop ---
        for (let i = 0; i < 3; i++) {
            if (!this._performerStates || !this._performerStates[i]) continue;

            const pState = this._performerStates[i];
            const channel = this.channelStates[i];
            const inst = this.instruments[i];

            // Use smooth evolution value instead of just status
            // Base timbre on expression but scaled by evolution
            let timbre = pState.expression;

            // Apply evolution factor: early on, timbre is darker
            timbre = timbre * (0.5 + 0.5 * channel.evolution);

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

                // Evolution dependent pattern
                if (channel.evolution < 0.2) {
                     // Very sparse (Intro level)
                     if (beatNumber === 0) bassNoteToPlay = 1;
                } else if (channel.evolution < 0.6) {
                    // Standard
                     const step = this.bassPattern[beatNumber];
                     if (step > 0) bassNoteToPlay = step;
                } else {
                    // Driving (High evolution)
                    // Check expression too
                    if (pState.expression > 0.7) {
                         if (beatNumber % 2 === 0) bassNoteToPlay = 1;
                    } else {
                        const step = this.bassPattern[beatNumber];
                        if (step > 0) bassNoteToPlay = step;
                    }
                }

                if (bassNoteToPlay) {
                    let interval = (bassNoteToPlay === 1 ? currentChord.bass : currentChord.bass + 7);

                    // Recontextualization logic only when evolved enough
                    if (channel.evolution > 0.5) {
                        if (cycleIndex % 4 === 1 && bassNoteToPlay === 1) {
                            interval = currentChord.notes[2] - 12; // octave down
                        } else if (cycleIndex % 4 === 3) {
                            interval = 0; // D1
                        }
                    }

                    const freq = baseFreq * Math.pow(2, interval / 12);
                    const vel = 0.5 + (timbre * 0.5);
                    inst.primary.playNote(freq, time, 0.2, vel);
                }

                // String Pad
                const padTriggerBeat = 0;
                // Pad interval shortens as it evolves
                const padIntervalBars = (channel.evolution > 0.5) ? 2 : 4;

                if (beatNumber === padTriggerBeat && this.barCounter % padIntervalBars === 0) {
                     const notes = currentChord.notes;
                     notes.forEach(n => {
                        const f = baseFreq * 2 * Math.pow(2, n/12);
                        inst.secondary.playNote(f, time, 4.0, 0.4 * timbre);
                    });
                }
            }

            // Performer B: Ostinato + String
            else if (i === 1) {
                const scaleIndex = this.ostinatoPattern[beatNumber];
                // Density based on evolution
                let density = 0.1 + (channel.evolution * 0.4) + (pState.expression * 0.5);

                if (channel.status === 'OUTRO') density = 0.1;

                if (scaleIndex !== undefined && Math.random() < density) {
                    const noteIndex = scaleIndex % currentChord.notes.length;
                    const interval = currentChord.notes[noteIndex];
                    const f = baseFreq * 4 * Math.pow(2, interval/12);
                    const vel = 0.3 + (timbre * 0.6);
                    inst.primary.playNote(f, time, 0.1, vel);
                }

                // Pad - Harmonically richer?
                if (beatNumber === 0 && this.barCounter % 2 === 0) {
                     const n = currentChord.notes[2];
                     const f = baseFreq * 4 * Math.pow(2, n/12);
                     inst.secondary.playNote(f, time, 4.0, 0.3 * timbre);
                }
            }

            // Performer C: Arpeggio + String
            else if (i === 2) {
                 let density = 0.05 + (channel.evolution * 0.5) + (pState.expression * 0.45);
                 if (channel.status === 'OUTRO') density = 0.05;

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
                     inst.secondary.playNote(f, time, 4.0, 0.3 * timbre);
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
        const RAMP_TIME = 30.0; // Slower evolution (30 seconds to full)
        const OUTRO_DURATION = 4.0;

        let activeCount = 0;

        // State Machine Update
        for (let i = 0; i < 3; i++) {
            const p = this._performerStates[i];
            const channel = this.channelStates[i];

            if (p.active) {
                activeCount++;
                if (channel.status === 'SILENT' || channel.status === 'OUTRO') {
                    channel.status = 'MAIN'; // Direct to MAIN, but we use evolution for curve
                    channel.startTime = now;
                    channel.evolution = 0.0;
                }

                // Smoothly ramp up evolution
                if (channel.evolution < 1.0) {
                    const dt = 1.0 / 60.0; // approx frame time
                    channel.evolution += dt / RAMP_TIME;
                    if (channel.evolution > 1.0) channel.evolution = 1.0;
                }
            } else {
                // Performer gone
                if (channel.status === 'MAIN') {
                    channel.status = 'OUTRO';
                    channel.leaveTime = now;
                }

                // Ramp down evolution quickly in Outro? Or let it linger?
                if (channel.status === 'OUTRO') {
                    channel.evolution *= 0.95; // Fade out intensity
                    if (now - channel.leaveTime > OUTRO_DURATION) {
                        channel.status = 'SILENT';
                        channel.evolution = 0.0;
                    }
                }
            }
        }

        // --- Kick Drum Global Logic ---
        this.kickState.activePerformersCount = activeCount;

        let targetIntensity = 0.0;

        if (activeCount < 2) {
            targetIntensity = 0.0;
            this.kickState.threePerformerStartTime = 0;
        } else if (activeCount === 2) {
            targetIntensity = 0.5; // Timid
            this.kickState.threePerformerStartTime = 0;
        } else if (activeCount >= 3) {
            // Check how long we've been at 3
            if (this.kickState.threePerformerStartTime === 0) {
                this.kickState.threePerformerStartTime = now;
            }
            const timeAtFull = now - this.kickState.threePerformerStartTime;

            // Build up from 0.5 to 1.0 over 10 seconds
            const buildup = Math.min(timeAtFull / 10.0, 1.0);
            targetIntensity = 0.5 + 0.5 * buildup;
        }

        // Smoothly interpolate kick intensity
        const lerpFactor = 0.01; // Slow response
        this.kickState.intensity += (targetIntensity - this.kickState.intensity) * lerpFactor;
    }
}
