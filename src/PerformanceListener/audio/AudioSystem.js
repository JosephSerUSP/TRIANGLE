/**
 * @fileoverview Web Audio engine: lookahead scheduler, one voice pair per slot
 * (chosen by slot role), kick, mix bus. Musical decisions live in
 * Arrangement.js; this file only turns them into scheduled notes.
 */
import { clamp } from '../../core/MathUtils.js';
import { CHORD_PROGRESSION, CHORD_TONE } from './MusicTheory.js';
import { PulseBass, StringPad, PluckSynth, ArpSynth, KickDrum } from './Instruments.js';
import {
    chordIndexForBar, stepChannel, createChannel, voiceControls, targetTempo, resyncNoteTime, gate, tiltOffset, evolution, bassWalkInterval, heightTone
} from './Arrangement.js';

const PRIMARY = { bass: PulseBass, ostinato: PluckSynth, arp: ArpSynth };

export class AudioSystem {
    /** @param {Object} audioCfg CONFIG.audio */
    constructor(audioCfg) {
        this.cfg = audioCfg;
        this.ctx = null;
        this.isReady = false;
        this.mappingMode = 'canon';

        this.isPlaying = false;
        this.step = 0;           // 16th within bar
        this.bar = 0;
        this.nextNoteTime = 0;
        this.tempo = audioCfg.baseTempo;
        this.lookaheadMs = 25;
        this.scheduleAheadTime = 0.1;

        this.bassPattern = [1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 0, 2, 0];
        this.kickPattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
        this.ostinatoPattern = [0, 2, 4, 7, 4, 2, 0, 2, 0, 2, 4, 7, 4, 2, 0, 2];
        this.kickIntensity = 0;

        this.voices = [];
        this.channels = [];
        this.controls = [];
    }

    /** @param {string[]} roles  one per slot, from CONFIG.slots */
    async init(roles) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        const mix = this.cfg.mix;

        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.ratio.value = 12;
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = mix.master;
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.reverb = this.ctx.createConvolver();
        this._createReverbImpulse();
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = mix.reverb;
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);

        this.voices = roles.map(role => ({
            role,
            primary: new (PRIMARY[role] || ArpSynth)(this.ctx, this.compressor, { level: mix[role] ?? mix.arp }),
            pad: new StringPad(this.ctx, this.compressor, {
                level: mix.pad, reverb: this.reverb, send: mix.padReverbSend
            })
        }));
        this.channels = roles.map(createChannel);
        this.kickDrum = new KickDrum(this.ctx, this.compressor, { level: mix.kick });
        this.isReady = true;
    }

    _createReverbImpulse() {
        const rate = this.ctx.sampleRate, length = rate * 2;
        const impulse = this.ctx.createBuffer(2, length, rate);
        for (let c = 0; c < 2; c++) {
            const d = impulse.getChannelData(c);
            for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow((length - i) / length, 2);
        }
        this.reverb.buffer = impulse;
    }

    resume() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (!this.isPlaying) {
            this.isPlaying = true;
            this.nextNoteTime = this.ctx.currentTime + 0.1;
            this._scheduler();
        }
    }

    _scheduler() {
        if (!this.isPlaying) return;
        const horizon = this.ctx.currentTime + this.scheduleAheadTime;
        this.nextNoteTime = resyncNoteTime(this.nextNoteTime, this.ctx.currentTime, this.tempo, this.cfg.maxCatchUpSteps);
        while (this.nextNoteTime < horizon) {
            this._scheduleStep(this.step, this.nextNoteTime);
            this.nextNoteTime += 15 / this.tempo; // a 16th note
            if (++this.step === 16) { this.step = 0; this.bar++; }
        }
        setTimeout(() => this._scheduler(), this.lookaheadMs);
    }

    _freq(semitones, octave) {
        return this.cfg.rootFreq * octave * Math.pow(2, semitones / 12);
    }

    _scheduleStep(beat, time) {
        const chord = CHORD_PROGRESSION[chordIndexForBar(this.bar, CHORD_PROGRESSION.length)];
        const cycle = Math.floor(this.bar / 4);

        if (this.kickIntensity > 0.001 && this.kickPattern[beat]) this.kickDrum.playNote(time, this.kickIntensity);

        this.voices.forEach((v, i) => {
            const ctl = this.controls[i];
            const ch = this.channels[i];
            if (!ctl) return;
            const timbre = ch.status === 'OUTRO' ? ctl.expression * 0.5 : ctl.expression;
            // sculpt spreads the pair ±0.3 around the body (voice-leading branch idea).
            const spread = ctl.deterministic ? 0.3 : 0;
            v.primary.setPan(clamp(ctl.pan + spread, -1, 1), time);
            v.primary.modulate({ timbre }, time);
            v.pad.setPan(spread ? clamp(ctl.pan - spread, -1, 1) : ctl.pan * 0.5, time);
            v.pad.modulate({ timbre }, time);
            if (ch.status === 'SILENT') return;
            const tr = ctl.transpose;
            // sculpt: parts build up over the first evolutionSec of a performer's stay.
            const arc = ctl.deterministic ? 0.5 + 0.5 * evolution(ch, this.ctx.currentTime, this.cfg.evolutionSec) : 1;

            if (v.role === 'bass') {
                let note = null;
                if (ch.status === 'INTRO') { if (beat === 0) note = 1; }
                else if (ch.status === 'OUTRO') { if (beat === 0 || beat === 8) note = 1; }
                else if (ctl.expression > 0.8) { if (beat % 2 === 0) note = 1; }
                else if (this.bassPattern[beat] > 0) note = this.bassPattern[beat];

                if (note) {
                    let interval = note === 1 ? chord.bass : chord.bass + 7;
                    if (ch.status === 'MAIN') {
                        if (cycle % 4 === 1 && note === 1) interval = chord.notes[CHORD_TONE.third] - 12; // 1st inversion
                        else if (cycle % 4 === 3) interval = 0; // D pedal
                    }
                    // sculpt: tilt re-voices the bass root; otherwise in harmony/sculpt hand
                    // height does (root -> 3rd -> 5th of the CURRENT chord, always
                    // consonant), so a solo performer, who holds the bass, hears it.
                    const tone = tiltOffset(ctl) || heightTone(ctl, this.cfg);
                    const walked = note === 1 ? bassWalkInterval(chord, tone) : null;
                    if (walked !== null) interval = walked;
                    v.primary.playNote(this._freq(interval, 1), time, 0.2, 0.5 + timbre * 0.5);
                }
                const padBars = ch.status === 'MAIN' ? 2 : 4;
                if (beat === 0 && this.bar % padBars === 0) {
                    v.pad.playNote(this._freq(chord.notes[CHORD_TONE.root] + tr, 2), time, 4.0, 0.4 * timbre);
                }
            } else if (v.role === 'ostinato') {
                const density = { INTRO: 0.2, OUTRO: 0.1, MAIN: 0.2 + ctl.expression * 0.8 }[ch.status] * arc;
                if (gate(density, beat, this.bar, i, ctl.deterministic)) {
                    const len = chord.notes.length;
                    const n = chord.notes[(((this.ostinatoPattern[beat] + tiltOffset(ctl)) % len) + len) % len];
                    v.primary.playNote(this._freq(n + tr, 4), time, 0.1, 0.3 + timbre * 0.6);
                }
                if (beat === 0 && this.bar % 2 === 0) {
                    v.pad.playNote(this._freq(chord.notes[CHORD_TONE.fifth] + tr, 4), time, 4.0, 0.3 * timbre);
                }
            } else {
                const density = { INTRO: 0.1, OUTRO: 0.05, MAIN: 0.1 + ctl.expression * 0.9 }[ch.status] * arc;
                if (gate(density, beat, this.bar, i, ctl.deterministic)) {
                    const len = chord.notes.length;
                    const n = chord.notes[(((beat + tiltOffset(ctl)) % len) + len) % len];
                    const vel = (0.3 + timbre * 0.5) * (0.8 + Math.random() * 0.4);
                    v.primary.playNote(this._freq(n + tr, 4), time, 0.1, vel);
                }
                if (beat === 8 && this.bar % 2 === 0) {
                    v.pad.playNote(this._freq(chord.notes[CHORD_TONE.third] + tr, 2), time, 4.0, 0.3 * timbre);
                }
            }
        });
    }

    /**
     * @param {import('../../core/Contracts.js').PerformanceFrame} frame
     */
    update(frame) {
        if (!this.isReady) return;
        this.controls = frame.slots.map(s => voiceControls(s, this.cfg, this.mappingMode));

        const now = this.ctx.currentTime;
        this.channels.forEach((ch, i) => {
            const c = this.controls[i];
            stepChannel(ch, !!(c && c.active), now, this.cfg.introSec, this.cfg.outroSec);
        });

        const k = 1 - Math.exp(-3 * frame.dtSec);
        const activeCount = this.controls.filter(c => c.active).length;
        const targetKick = activeCount >= 3 ? 1.0 : activeCount === 2 ? 0.4 : 0;
        this.kickIntensity += (targetKick - this.kickIntensity) * k;

        const bpm = targetTempo(this.controls, this.cfg, this.mappingMode);
        this.tempo = clamp(this.tempo + (bpm - this.tempo) * (1 - Math.exp(-0.5 * frame.dtSec)), 40, 200);
    }
}
