import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceManager } from '../src/PerformanceManager/index.js';
import { CONFIG } from '../src/core/Config.js';
import { pose } from './helpers.js';

const fakeVision = poses => ({ latestPoses: poses, cameraSize: { width: 640, height: 480 } });

test('frame is plain data with one snapshot per configured slot', () => {
    const m = new PerformanceManager(CONFIG, fakeVision([pose()]));
    const f = m.tick(0, 1 / 60);
    assert.equal(f.slots.length, CONFIG.slots.length);
    assert.doesNotThrow(() => JSON.stringify(f));
});

test('autopilot off: ghost pose cannot steal slot 0', () => {
    const m = new PerformanceManager(CONFIG, fakeVision([pose({ cx: 300, score: 0.1 }), pose({ cx: 500 })]));
    m.setAutopilot(false);
    let f;
    for (let i = 0; i < 30; i++) f = m.tick(i / 60, 1 / 60);
    assert.equal(f.slots[0].active, true);
    assert.equal(f.slots[1].active, false);
});

test('autopilot on: a second human takes over an autopilot slot', () => {
    const v = fakeVision([pose({ cx: 150 }), pose({ cx: 480 })]);
    const m = new PerformanceManager(CONFIG, v);
    let f;
    for (let i = 0; i < 30; i++) f = m.tick(i / 60, 1 / 60);
    assert.deepEqual(f.slots.map(s => s.binding), ['physical', 'physical', 'virtual']);
    assert.equal(f.slots[1].active, true);
});

test('takeover survives a one-frame dropout, then hands back after the grace period', () => {
    const two = [pose({ cx: 150 }), pose({ cx: 480 })];
    const v = fakeVision(two);
    const m = new PerformanceManager(CONFIG, v);
    let t = 0, f;
    const step = () => { t += 1 / 60; f = m.tick(t, 1 / 60); };
    for (let i = 0; i < 30; i++) step();
    v.latestPoses = [two[0]];
    step();
    assert.equal(f.slots[1].binding, 'physical');
    for (let i = 0; i < 60; i++) step();
    assert.equal(f.slots[1].binding, 'virtual');
});

test('config is immutable', () => {
    assert.throws(() => { CONFIG.defaults.viewMode = 2; });
});
