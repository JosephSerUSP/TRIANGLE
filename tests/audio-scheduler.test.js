/**
 * Drives the real AudioSystem scheduler with stub voices (no Web Audio) and
 * checks every scheduled note is a tone of the chord sounding at that bar,
 * in every mapping mode. Catches wiring mistakes the pure helpers can't.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioSystem } from '../src/PerformanceListener/audio/AudioSystem.js';
import { chordIndexForBar, voiceControls } from '../src/PerformanceListener/audio/Arrangement.js';
import { CHORD_PROGRESSION } from '../src/PerformanceListener/audio/MusicTheory.js';
import { CONFIG } from '../src/core/Config.js';
import { createRestGesture } from '../src/core/Contracts.js';

const stubVoice = log => ({
    setPan() {}, modulate() {},
    playNote(freq) { log.push(freq); }
});

function slot(role, h, roll, binding = 'physical') {
    const g = createRestGesture();
    Object.assign(g.triangle, { visible: true, width: 0.5, height: h });
    g.orientation.roll = roll;
    return { role, active: true, binding, gesture: g };
}

const pc = semis => ((Math.round(semis) % 12) + 12) % 12;
const semisFromFreq = f => {
    const s = 12 * Math.log2(f / CONFIG.audio.rootFreq);
    assert.ok(Math.abs(s - Math.round(s)) < 1e-6, `off-grid frequency ${f}`);
    return s;
};

for (const mode of CONFIG.audio.mappingModes) {
    test(`every note is a chord tone (${mode})`, () => {
        const a = new AudioSystem(CONFIG.audio);
        a.ctx = { currentTime: 0 };
        a.kickDrum = { playNote() {} };
        const logs = CONFIG.slots.map(() => []);
        a.voices = CONFIG.slots.map((s, i) => ({ role: s.role, primary: stubVoice(logs[i]), pad: stubVoice(logs[i]) }));
        a.channels = CONFIG.slots.map(() => ({ status: 'MAIN', startTime: -100, leaveTime: 0, wasMain: true }));
        const slots = [slot('bass', 0.9, 0.6), slot('ostinato', 0.5, -0.6), slot('arp', 0.95, 0.2)];
        a.controls = slots.map(s => voiceControls(s, CONFIG.audio, mode));

        let total = 0;
        for (let bar = 0; bar < 16; bar++) {
            a.bar = bar;
            const chord = CHORD_PROGRESSION[chordIndexForBar(bar, CHORD_PROGRESSION.length)];
            const allowed = new Set([...chord.notes, chord.bass, chord.bass + 7, 0].map(pc));
            logs.forEach(l => (l.length = 0));
            for (let beat = 0; beat < 16; beat++) a._scheduleStep(beat, bar * 2 + beat * 0.125);
            for (const l of logs) for (const f of l) {
                total++;
                assert.ok(allowed.has(pc(semisFromFreq(f))), `${mode}: bar ${bar} ${chord.name} got pc ${pc(semisFromFreq(f))}`);
            }
        }
        assert.ok(total > 50, `only ${total} notes scheduled`);
    });
}
