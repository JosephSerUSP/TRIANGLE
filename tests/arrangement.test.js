import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordIndexForBar, stepChannel, createChannel, voiceControls, targetTempo, resyncNoteTime } from '../src/PerformanceListener/audio/Arrangement.js';
import { CHORD_PROGRESSION, CHORD_TONE } from '../src/PerformanceListener/audio/MusicTheory.js';
import { CONFIG } from '../src/core/Config.js';
import { createRestGesture } from '../src/core/Contracts.js';

test('first chord plays first; changes every 4 bars', () => {
    assert.equal(chordIndexForBar(0, 4), 0);
    assert.equal(chordIndexForBar(3, 4), 0);
    assert.equal(chordIndexForBar(4, 4), 1);
    assert.equal(chordIndexForBar(16, 4), 0);
});

test('CHORD_TONE.third really is the third', () => {
    const d = CHORD_PROGRESSION[0];
    assert.equal(d.notes[CHORD_TONE.third] - d.notes[CHORD_TONE.root], 4);
});

test('lifecycle: intro -> main -> outro; return during outro resumes main; then silent', () => {
    const ch = createChannel();
    stepChannel(ch, true, 0, 8, 4); assert.equal(ch.status, 'INTRO');
    stepChannel(ch, true, 9, 8, 4); assert.equal(ch.status, 'MAIN');
    stepChannel(ch, false, 10, 8, 4); assert.equal(ch.status, 'OUTRO');
    stepChannel(ch, true, 11, 8, 4); assert.equal(ch.status, 'MAIN');
    stepChannel(ch, false, 12, 8, 4); stepChannel(ch, false, 17, 8, 4); assert.equal(ch.status, 'SILENT');
});

const snap = (w, h, active = true) => {
    const g = createRestGesture();
    Object.assign(g.triangle, { visible: true, width: w, height: h });
    return { active, gesture: g };
};

test('expression 0 is preserved (no falsy-zero fallback)', () => {
    assert.equal(voiceControls(snap(0.5, 0), CONFIG.audio, 'canon').expression, 0);
});

test('mapping modes', () => {
    const wide = [voiceControls(snap(1, 0.9), CONFIG.audio, 'tempo')];
    assert.equal(targetTempo(wide, CONFIG.audio, 'canon'), CONFIG.audio.baseTempo);
    assert.equal(targetTempo(wide, CONFIG.audio, 'tempo'), CONFIG.audio.bpmMin);
    assert.equal(voiceControls(snap(0.5, 0.9), CONFIG.audio, 'canon').transpose, 0);
    assert.ok(voiceControls(snap(0.5, 0.9), CONFIG.audio, 'harmony').transpose > 0);
});

test('scheduler skips a long backlog but keeps small lag', () => {
    assert.equal(resyncNoteTime(9.95, 10, 120, 4), 9.95);   // 1 step behind: keep
    assert.equal(resyncNoteTime(2, 10, 120, 4), 10.05);     // tab was asleep: jump
});

test('sculpt: deterministic gates and roll-driven chord walk', async () => {
    const { gate, tiltOffset } = await import('../src/PerformanceListener/audio/Arrangement.js');
    const a = Array.from({ length: 16 }, (_, b) => gate(0.5, b, 5, 1, true));
    const b = Array.from({ length: 16 }, (_, b) => gate(0.5, b, 5, 1, true));
    assert.deepEqual(a, b);
    assert.ok(a.some(Boolean) && !a.every(Boolean));
    const s = snap(0.5, 0.5);
    s.gesture.orientation.roll = Math.PI / 4; // a 45° lean = full walk
    const ctl = voiceControls(s, CONFIG.audio, 'sculpt');
    assert.equal(tiltOffset(ctl), 2);
    assert.equal(tiltOffset(voiceControls(s, CONFIG.audio, 'harmony')), 0);
    assert.ok(ctl.transpose > 0);
});

test('evolution arc ramps from entry and resets when silent', async () => {
    const { evolution } = await import('../src/PerformanceListener/audio/Arrangement.js');
    const ch = createChannel();
    assert.equal(evolution(ch, 5, 30), 0);
    stepChannel(ch, true, 10, 8, 4);
    assert.equal(evolution(ch, 25, 30), 0.5);
    assert.equal(evolution(ch, 100, 30), 1);
});

test('humans conduct the tempo when present', () => {
    const human = { ...snap(1, 0.5), binding: 'physical' };   // wide arms -> slow
    const bot = { ...snap(0, 0.5), binding: 'virtual' };      // narrow -> fast
    const c = [human, bot].map(s => voiceControls(s, CONFIG.audio, 'tempo'));
    assert.equal(targetTempo(c, CONFIG.audio, 'tempo'), CONFIG.audio.bpmMin);
    const botsOnly = [voiceControls(bot, CONFIG.audio, 'tempo')];
    assert.equal(targetTempo(botsOnly, CONFIG.audio, 'tempo'), CONFIG.audio.bpmMax);
});
