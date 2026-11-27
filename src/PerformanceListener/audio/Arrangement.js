/**
 * @fileoverview Pure musical logic (no Web Audio): chord stepping, channel
 * lifecycle and the experimental gesture->music mapping modes. Unit-tested in
 * tests/arrangement.test.js.
 */
import { clamp, lerp } from '../../core/MathUtils.js';

/** Chord index for a bar: changes every 4 bars, bar 0 = first chord. */
export function chordIndexForBar(bar, progressionLength) {
    return Math.floor(bar / 4) % progressionLength;
}

/**
 * Advances one channel's SILENT/INTRO/MAIN/OUTRO state. Mutates `ch`.
 * `active` must already be debounced upstream (EnsembleSlot).
 */
export function stepChannel(ch, active, now, introSec, outroSec) {
    if (active) {
        if (ch.status === 'SILENT') { ch.status = 'INTRO'; ch.startTime = now; }
        // Coming back during OUTRO resumes where it left off instead of a fresh intro.
        else if (ch.status === 'OUTRO') { ch.status = ch.wasMain ? 'MAIN' : 'INTRO'; }
        if (ch.status === 'INTRO' && now - ch.startTime > introSec) ch.status = 'MAIN';
        ch.wasMain = ch.status === 'MAIN';
    } else {
        if (ch.status === 'MAIN' || ch.status === 'INTRO') { ch.status = 'OUTRO'; ch.leaveTime = now; }
        if (ch.status === 'OUTRO' && now - ch.leaveTime > outroSec) { ch.status = 'SILENT'; ch.wasMain = false; }
    }
    return ch;
}

export function createChannel() {
    return { status: 'SILENT', startTime: 0, leaveTime: 0, wasMain: false };
}

/**
 * Gesture -> per-voice control values for one slot.
 * @param {import('../../core/Contracts.js').SlotSnapshot} slot
 * @param {Object} audioCfg CONFIG.audio
 * @param {string} mode  'canon' | 'tempo' | 'harmony' | 'sculpt'
 */
export function voiceControls(slot, audioCfg, mode) {
    const t = slot.gesture.triangle;
    const height = clamp(t.height, 0, 1);
    const width = clamp(t.width, 0, 1);
    const ctl = {
        active: slot.active,
        physical: slot.binding === 'physical',
        expression: height,
        pan: clamp(slot.gesture.orientation.yaw / (Math.PI / 2), -1, 1),
        transpose: 0,
        width,
        /** Hand roll mapped to 0..1 (0.5 = level, 0/1 = a ±45° lean). Used by `sculpt`. */
        tilt: clamp(slot.gesture.orientation.roll / (Math.PI / 2) + 0.5, 0, 1),
        deterministic: mode === 'sculpt'
    };
    if ((mode === 'harmony' || mode === 'sculpt') && t.visible) {
        const iv = audioCfg.harmonyIntervals;
        ctl.transpose = iv[Math.min(iv.length - 1, Math.floor(height * iv.length))];
    }
    return ctl;
}

/**
 * Should a probabilistic voice play on this step? `sculpt` uses a fixed hash
 * per (bar % 4, beat, slot), so the same gesture always yields the same rhythm
 * (idea from the audio-refactor-deterministic branches); other modes use `rand`.
 */
export function gate(density, beat, bar, slotId, deterministic, rand = Math.random) {
    return stepNoise(beat, bar, slotId, deterministic, rand) < density;
}

/** 0..1 per-step value: hashed from (bar % 4, beat, slot) when deterministic. */
export function stepNoise(beat, bar, slotId, deterministic, rand = Math.random, salt = 0) {
    if (!deterministic) return rand();
    const x = Math.sin((bar % 4) * 78.233 + beat * 12.9898 + slotId * 37.719 + salt) * 43758.5453;
    return x - Math.floor(x);
}

/**
 * Chord-tone offset chosen by hand roll in `sculpt` (idea from the Hamauzu
 * branches): level hands = 0, tilt either way walks up/down the chord.
 */
export function tiltOffset(ctl) {
    if (!ctl.deterministic) return 0;
    return Math.round((ctl.tilt - 0.5) * 4); // -2..+2 chord tones
}

/**
 * Bass root under a `sculpt` walk: tilt either way swaps the root for the
 * chord's 3rd (|walk| = 1) or 5th (|walk| = 2), an octave down, so a solo
 * performer (always the bass slot) hears their tilt. Returns null for no walk.
 */
export function bassWalkInterval(chord, walk) {
    const tone = Math.min(2, Math.abs(walk));
    return tone === 0 ? null : chord.notes[tone] - 12;
}

/**
 * Tone of `chord` at chord-index `idx`, continuing into higher octaves past the
 * last tone (idx 5 on a 5-note chord = root + 12). Keeps every note in the chord.
 */
export function chordTone(chord, idx) {
    const len = chord.notes.length;
    const i = ((idx % len) + len) % len;
    return chord.notes[i] + 12 * Math.floor(idx / len);
}

/**
 * How many chord tones hand height lifts a voice in harmony/sculpt (0..n-1):
 * the rank of the slot's transpose in harmonyIntervals. 0 in other modes.
 */
export function harmonyStep(ctl, audioCfg) {
    return ctl.transpose ? Math.max(0, audioCfg.harmonyIntervals.indexOf(ctl.transpose)) : 0;
}

/**
 * Chord-tone step (0 root, 1 3rd, 2 5th) for the bass from the harmony
 * transpose rank: low hands = root, middle = 3rd, high = 5th.
 */
export function heightTone(ctl, audioCfg) {
    if (!ctl.transpose) return 0;
    const rank = audioCfg.harmonyIntervals.indexOf(ctl.transpose);
    return rank <= 2 ? 1 : 2;
}

/**
 * 0..1 "arc" of a channel: grows over `rampSec` since it entered (idea from the
 * audio-evolution-kick branch). `sculpt` scales density by 0.5 + 0.5 * arc,
 * so a performer's part builds up the longer they stay.
 */
export function evolution(ch, now, rampSec) {
    if (ch.status === 'SILENT') return 0;
    return clamp((now - ch.startTime) / rampSec, 0, 1);
}

/**
 * Target tempo for the ensemble. Wide arms = slow (README's original intent).
 * Humans conduct: if any physical performer is active, virtual ones don't vote.
 */
export function targetTempo(controls, audioCfg, mode) {
    if (mode === 'canon') return audioCfg.baseTempo;
    const all = controls.filter(c => c.active);
    const humans = all.filter(c => c.physical);
    const active = humans.length ? humans : all;
    if (active.length === 0) return audioCfg.baseTempo;
    const w = active.reduce((s, c) => s + c.width, 0) / active.length;
    return lerp(audioCfg.bpmMax, audioCfg.bpmMin, w);
}

/**
 * Tab-resume guard. If the scheduler fell more than `maxSteps` 16ths behind
 * (e.g. a backgrounded tab throttled setTimeout), skip the backlog instead of
 * firing it all at once. Returns the next note time to use.
 */
export function resyncNoteTime(nextNoteTime, now, tempo, maxSteps) {
    const maxLag = maxSteps * (15 / tempo);
    return now - nextNoteTime > maxLag ? now + 0.05 : nextNoteTime;
}
