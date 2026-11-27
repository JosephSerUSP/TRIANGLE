import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnsembleSlot } from '../src/PerformanceManager/state/EnsembleSlot.js';
import { CONFIG } from '../src/core/Config.js';
import { createRestGesture } from '../src/core/Contracts.js';

const def = CONFIG.slots[0];
const g = () => { const x = createRestGesture(); x.orientation.yaw = 1; x.depth = -3; return x; };

function run(slot, seconds, dt, gesture) {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) { slot.observe(gesture, 'physical'); slot.update(dt); }
}

test('smoothing is frame-rate independent', () => {
    const a = new EnsembleSlot(def, CONFIG.smoothing), b = new EnsembleSlot(def, CONFIG.smoothing);
    run(a, 1, 1 / 30, g()); run(b, 1, 1 / 120, g());
    assert.ok(Math.abs(a.current.orientation.yaw - b.current.orientation.yaw) < 0.02);
});

test('one-frame dropout does not deactivate the slot', () => {
    const s = new EnsembleSlot(def, CONFIG.smoothing);
    run(s, 1, 1 / 60, g());
    assert.equal(s.active, true);
    run(s, 1 / 60, 1 / 60, null);
    assert.equal(s.active, true);
    run(s, 1, 1 / 60, null);
    assert.equal(s.active, false);
});

test('triangle snaps to the body when it first appears, then smooths', () => {
    const s = new EnsembleSlot(def, CONFIG.smoothing);
    const withTri = (x) => {
        const t = g();
        Object.assign(t.triangle, { visible: true, vertices: [{ x, y: 0.3 }, { x: x - 0.4, y: -0.2 }, { x: x + 0.4, y: -0.2 }] });
        return t;
    };
    run(s, 0.2, 1 / 60, withTri(0.5));                 // becomes active; first visible frame snaps
    assert.equal(s.current.triangle.visible, true);
    assert.ok(Math.abs(s.current.triangle.vertices[0].x - 0.5) < 1e-9);
    run(s, 1 / 60, 1 / 60, withTri(-0.5));              // big jump while visible -> smoothed, not snapped
    const x = s.current.triangle.vertices[0].x;
    assert.ok(x < 0.5 && x > -0.5);
});

test('snapshot does not alias internal state', () => {
    const s = new EnsembleSlot(def, CONFIG.smoothing);
    run(s, 0.5, 1 / 60, g());
    const snap = s.snapshot();
    snap.gesture.orientation.yaw = 99;
    assert.notEqual(s.current.orientation.yaw, 99);
});
