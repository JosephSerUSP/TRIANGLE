import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DynamicLayout } from '../src/PerformanceVisualizer/layout/DynamicLayout.js';
import { CONFIG } from '../src/core/Config.js';
import { createRestGesture } from '../src/core/Contracts.js';

const slot = (presence, roll = 0) => { const g = createRestGesture(); g.orientation.roll = roll; return { presence, gesture: g }; };

test('empty stage -> empty layout', () => {
    assert.deepEqual(new DynamicLayout(CONFIG.layout).calculate(1000, 500, [slot(0), slot(0)]), []);
});

test('divider leans with roll, clamps, and straightens as a neighbour fades', () => {
    const L = new DynamicLayout(CONFIG.layout);
    const lean = s => { const c = L.calculate(1000, 500, s)[0].corners; return c.tr - c.br; };
    const full = lean([slot(1, 0.3), slot(1)]);
    assert.ok(Math.abs(full - 500 * Math.tan(0.3)) < 1e-6);
    // Damped by the weaker neighbour's presence: angle * 0.5.
    assert.ok(Math.abs(lean([slot(1, 0.3), slot(0.5)]) - 500 * Math.tan(0.15)) < 1e-6);
    assert.equal(lean([slot(1, 5), slot(1)]), lean([slot(1, CONFIG.layout.maxDividerAngle), slot(1)])); // clamped
});

test('rects stay on screen; outer edges are the screen edges', () => {
    const out = new DynamicLayout(CONFIG.layout).calculate(1200, 600, [slot(1, 0.4), slot(1, -2), slot(0.5)]);
    assert.equal(out.length, 3);
    out.forEach(({ rect }) => { assert.ok(rect.x >= 0); assert.ok(rect.x + rect.width <= 1200); });
    assert.equal(out[0].corners.bl, 0);
    assert.equal(out[2].corners.tr, 1200);
});
