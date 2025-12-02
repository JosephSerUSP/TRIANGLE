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

        // Map<string, Object> - Voice allocation
        // Key: Performer ID, Value: { type, primary, secondary, lastUsed }
        this.voices = new Map();

        // Types available to cycle through
        this.voiceTypes = ['BASS', 'OSTINATO', 'ARP'];

        // Sequencer State
        this.isPlaying = false;
        this.currentSixteenthNote = 0;
        this.barCounter = 0;
        this.nextNoteTime = 0.0;
        this.tempo = 120.0;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;

        this.chordIndex = 0;
        this.progression = CHORD_PROGRESSION;

        // Patterns
        this.clavePattern = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];
        this.bassPattern = [1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 0, 2, 0];
        this.kickPattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
        this.ostinatoPattern = [0, 2, 4, 7, 4, 2, 0, 2, 0, 2, 4, 7, 4, 2, 0, 2];

        this.kickIntensity = 0.0;

        // Channel state tracking per voice
        // Map<string, { status, startTime, leaveTime }>
        this.voiceStates = new Map();
    }

    async init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.ratio.value = 12;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = CONFIG.audio.mix.master;

        this.reverb = this.ctx.createConvolver();
        this._createReverbImpulse();

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = CONFIG.audio.mix.reverb;
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);

        this.kickDrum = new KickDrum(this.ctx, this.compressor);

        this.isReady = true;
    }

    _createReverbImpulse() {
        const rate = this.ctx.sampleRate;
        const length = rate * 2.0;
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
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this._scheduleNote(this.currentSixteenthNote, this.nextNoteTime);
            this._advanceNote();
        }
        setTimeout(() => this._scheduler(), this.lookahead);
    }

    _advanceNote() {
        const secondsPerBeat = 60.0 / this.tempo;
        this.nextNoteTime += 0.25 * secondsPerBeat;
        this.currentSixteenthNote++;
        if (this.currentSixteenthNote === 16) {
            this.currentSixteenthNote = 0;
            this.barCounter++;
        }
    }

    _createVoice(type) {
        let primary, secondary;
        if (type === 'BASS') {
            primary = new PulseBass(this.ctx, this.compressor);
        } else if (type === 'OSTINATO') {
            primary = new PluckSynth(this.ctx, this.compressor);
        } else { // ARP
            primary = new ArpSynth(this.ctx, this.compressor);
        }
        secondary = new StringPad(this.ctx, this.reverb);
        secondary.output.connect(this.compressor);

        return { type, primary, secondary };
    }

    _scheduleNote(beatNumber, time) {
        if (beatNumber === 0 && this.barCounter % 4 === 0) {
            this.chordIndex = (this.chordIndex + 1) % this.progression.length;
        }

        const currentChord = this.progression[this.chordIndex];
        const baseFreq = CONFIG.audio.rootFreq;
        const cycleIndex = Math.floor(this.barCounter / 4);

        if (this.kickIntensity > 0.001) {
            if (this.kickPattern[beatNumber]) {
                this.kickDrum.playNote(time, this.kickIntensity);
            }
        }

        // Iterate over active voices
        this.voices.forEach((voice, id) => {
            const vState = this.voiceStates.get(id);
            if (!vState || vState.status === 'SILENT') return;

            // Get Performer Data
            const pState = this._cachedPerformers ? this._cachedPerformers.find(p => p.id === id) : null;
            if (!pState) return;

            let timbre = pState.expression; // height
            // Use Energy for intensity if available?
            // The previous Performer didn't have energy. The new one does.
            // Let's use energy to boost volume/timbre.
            if (pState.energy !== undefined) {
                timbre = (timbre + pState.energy) * 0.5;
            }

            if (vState.status === 'OUTRO') {
                timbre *= 0.5;
            }

            voice.primary.setPan(pState.pan);
            voice.primary.modulate({ timbre: timbre });
            voice.secondary.setPan(pState.pan * 0.5);
            voice.secondary.modulate({ timbre: timbre });

            // Musical Logic based on Voice Type
            if (voice.type === 'BASS') {
                // ... Bass Logic ...
                let bassNoteToPlay = null;
                if (vState.status === 'INTRO') {
                    if (beatNumber === 0) bassNoteToPlay = 1;
                } else if (vState.status === 'OUTRO') {
                    if (beatNumber === 0 || beatNumber === 8) bassNoteToPlay = 1;
                } else {
                    if (pState.energy > 0.6) { // High Energy -> Driving
                         if (beatNumber % 2 === 0) bassNoteToPlay = 1;
                    } else {
                        const step = this.bassPattern[beatNumber];
                        if (step > 0) bassNoteToPlay = step;
                    }
                }

                if (bassNoteToPlay) {
                    let interval = (bassNoteToPlay === 1 ? currentChord.bass : currentChord.bass + 7);
                    if (vState.status === 'MAIN') {
                        if (cycleIndex % 4 === 1 && bassNoteToPlay === 1) {
                            interval = currentChord.notes[2] - 12;
                        } else if (cycleIndex % 4 === 3) {
                            interval = 0;
                        }
                    }
                    const freq = baseFreq * Math.pow(2, interval / 12);
                    const vel = 0.5 + (timbre * 0.5);
                    voice.primary.playNote(freq, time, 0.2, vel);
                }

                // Pad
                const padIntervalBars = (vState.status === 'MAIN') ? 2 : 4;
                if (beatNumber === 0 && this.barCounter % padIntervalBars === 0) {
                     const n = currentChord.notes[0];
                     const f = baseFreq * 2 * Math.pow(2, n/12);
                     voice.secondary.playNote(f, time, 4.0, 0.4 * timbre);
                }

            } else if (voice.type === 'OSTINATO') {
                // ... Ostinato Logic ...
                const scaleIndex = this.ostinatoPattern[beatNumber];
                let density = 0.5;
                if (vState.status === 'INTRO') density = 0.2;
                if (vState.status === 'OUTRO') density = 0.1;
                if (vState.status === 'MAIN') density = 0.2 + timbre * 0.8;

                if (scaleIndex !== undefined && Math.random() < density) {
                    const noteIndex = scaleIndex % currentChord.notes.length;
                    const interval = currentChord.notes[noteIndex];
                    const f = baseFreq * 4 * Math.pow(2, interval/12);
                    const vel = 0.3 + (timbre * 0.6);
                    voice.primary.playNote(f, time, 0.1, vel);
                }

                if (beatNumber === 0 && this.barCounter % 2 === 0) {
                     const n = currentChord.notes[2];
                     const f = baseFreq * 4 * Math.pow(2, n/12);
                     voice.secondary.playNote(f, time, 4.0, 0.3 * timbre);
                }

            } else if (voice.type === 'ARP') {
                // ... Arp Logic ...
                 let density = 0.5;
                if (vState.status === 'INTRO') density = 0.1;
                if (vState.status === 'OUTRO') density = 0.05;
                if (vState.status === 'MAIN') density = 0.1 + timbre * 0.9;

                if (Math.random() < density) {
                    const arpIndex = beatNumber % currentChord.notes.length;
                    const interval = currentChord.notes[arpIndex];
                    const f = baseFreq * 4 * Math.pow(2, interval/12);
                    const vel = (0.3 + (timbre * 0.5)) * (0.8 + Math.random() * 0.4);
                    voice.primary.playNote(f, time, 0.1, vel);
                }

                 if (beatNumber === 8 && this.barCounter % 2 === 0) {
                     const n = currentChord.notes[1];
                     const f = baseFreq * 2 * Math.pow(2, n/12);
                     voice.secondary.playNote(f, time, 4.0, 0.3 * timbre);
                }
            }
        });
    }

    update(performers) {
        if (!this.isReady) return;

        // Sync Voices with Performers
        // 1. Assign voices to new performers
        // 2. Mark voices as unused if performer gone

        // Count active performers for Kick logic
        const activePerformers = performers.filter(p => p.hasPerformer);

        activePerformers.forEach(p => {
            if (!this.voices.has(p.id)) {
                // Allocate new voice
                // Pick type based on count?
                // 0 -> Bass, 1 -> Ostinato, 2 -> Arp, 3 -> Ostinato, ...
                const type = this.voiceTypes[this.voices.size % this.voiceTypes.length];
                this.voices.set(p.id, this._createVoice(type));

                // Initialize state
                this.voiceStates.set(p.id, {
                    status: 'SILENT',
                    startTime: 0,
                    leaveTime: 0
                });
            }
        });

        // Clean up or mark silent voices for removed performers
        // We might want to keep the voice around for OUTRO
        // Map keys are IDs.

        this._cachedPerformers = performers.map(p => ({
            id: p.id,
            active: p.hasPerformer,
            expression: THREE.MathUtils.clamp(p.triangle.height || 0.5, 0.0, 1.0),
            pan: THREE.MathUtils.clamp((p.current.yaw || 0) / (Math.PI / 2), -1, 1),
            energy: p.energy // New Metric
        }));

        const now = this.ctx.currentTime;
        const INTRO_DURATION = 8.0;
        const OUTRO_DURATION = 4.0;

        // Update State Machine
        this.voices.forEach((voice, id) => {
            const pState = this._cachedPerformers.find(p => p.id === id);
            // If pState is undefined, it means performer completely removed from manager list.
            // Or pState.active is false (still in manager but lost tracking)

            let isActive = pState && pState.active;

            let vState = this.voiceStates.get(id);

            if (isActive) {
                if (vState.status === 'SILENT' || vState.status === 'OUTRO') {
                    vState.status = 'INTRO';
                    vState.startTime = now;
                }
                if (vState.status === 'INTRO') {
                    if (now - vState.startTime > INTRO_DURATION) {
                        vState.status = 'MAIN';
                    }
                }
            } else {
                if (vState.status === 'MAIN' || vState.status === 'INTRO') {
                    vState.status = 'OUTRO';
                    vState.leaveTime = now;
                }
                if (vState.status === 'OUTRO') {
                    if (now - vState.leaveTime > OUTRO_DURATION) {
                        vState.status = 'SILENT';
                        // Optionally remove voice here if we want to save resources
                        // this.voices.delete(id);
                    }
                }
            }
        });

        // Kick Intensity
        const activeCount = activePerformers.length;
        let targetKick = 0.0;
        if (activeCount === 2) targetKick = 0.4;
        if (activeCount >= 3) targetKick = 1.0;
        this.kickIntensity += (targetKick - this.kickIntensity) * 0.05;
    }
}
