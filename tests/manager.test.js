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

test('config is immutable', () => {
    assert.throws(() => { CONFIG.defaults.viewMode = 2; });
});
