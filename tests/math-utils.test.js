import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, lerp, mapLinear, expSmooth, seededRandom } from '../src/core/MathUtils.js';

test('clamp collapses NaN instead of propagating it', () => {
    assert.equal(clamp(NaN, -1, 1), -1);
    assert.equal(clamp(5, -1, 1), 1);
});

test('expSmooth never gets poisoned by NaN (the old Performer bug)', () => {
    assert.equal(expSmooth(0.5, NaN, 6, 1 / 60), 0.5);     // bad target: hold
    assert.equal(expSmooth(NaN, 0.25, 6, 1 / 60), 0.25);   // bad state: recover at once
    const v = expSmooth(0, 1, 6, 1 / 60);
    assert.ok(v > 0 && v < 1);
});

test('lerp / mapLinear basics', () => {
    assert.equal(lerp(2, 4, 0.5), 3);
    assert.equal(mapLinear(0, -1, 1, 10, 20), 15);
});

test('seededRandom is deterministic and in [0,1)', () => {
    const a = seededRandom(7), b = seededRandom(7);
    for (let i = 0; i < 1000; i++) {
        const x = a();
        assert.equal(x, b());
        assert.ok(x >= 0 && x < 1);
    }
});
