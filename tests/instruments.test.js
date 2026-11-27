/** Instrument routing with a fake AudioContext (records node connections). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StringPad, PulseBass } from '../src/PerformanceListener/audio/Instruments.js';

function fakeCtx() {
    const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = kind => ({ kind, out: [], connect(n) { this.out.push(n); return n; }, gain: param(), pan: param(), frequency: param(), Q: param(), start() {}, stop() {} });
    return {
        currentTime: 0,
        createGain: () => node('gain'), createStereoPanner: () => node('panner'),
        createBiquadFilter: () => node('filter'), createOscillator: () => node('osc')
    };
}

test('pad: dry AND reverb both leave through the panner (old bug: dry bypassed it)', () => {
    const ctx = fakeCtx();
    const bus = { kind: 'bus' }, reverb = { kind: 'reverb' };
    const pad = new StringPad(ctx, bus, { level: 0.2, reverb, send: 0.6 });
    assert.deepEqual(pad.output.out, [pad.panner]);
    assert.ok(pad.panner.out.includes(bus));
    assert.ok(pad.panner.out.includes(pad.send));
    assert.deepEqual(pad.send.out, [reverb]);
    assert.equal(pad.send.gain.value, 0.6);
});

test('bass: each note gets its own filter into the shared output', () => {
    const ctx = fakeCtx();
    const bass = new PulseBass(ctx, { kind: 'bus' }, { level: 0.6 });
    bass.modulate({ timbre: 0 });            // timbre 0 must apply (old falsy-zero bug)
    assert.equal(bass.baseCutoff, 100);
    bass.playNote(55, 0, 0.2, 0.7);
    bass.playNote(55, 0.25, 0.2, 0.7);
    assert.equal(bass.output.gain.value, 0.6);
});
