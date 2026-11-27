import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DebugOverlay } from '../src/PerformanceVisualizer/ui/DebugOverlay.js';
import { PerformanceManager } from '../src/PerformanceManager/index.js';
import { CONFIG } from '../src/core/Config.js';
import { pose } from './helpers.js';

function fakeEls() {
    const calls = [];
    const ctx = new Proxy({}, {
        get: (_, k) => (k in ctx_props ? ctx_props[k] : (...a) => calls.push([k, ...a])),
        set: (_, k, v) => ((ctx_props[k] = v), true)
    });
    const ctx_props = {};
    const el = () => ({ style: {}, innerText: '' });
    return { calls, els: { debugCanvas: { width: 0, height: 0, getContext: () => ctx }, statusEl: el(), metricsEl: el(), hintEl: el() } };
}

test('debug view: metrics text and mirrored, cover-fit skeleton', () => {
    const { calls, els } = fakeEls();
    const o = new DebugOverlay(els);
    o.resize(1280, 960); // same 4:3 aspect as 640x480 -> scale 2, no offset
    const m = new PerformanceManager(CONFIG, { latestPoses: [pose({ cx: 100 })], cameraSize: { width: 640, height: 480 } });
    const frame = m.tick(0, 1 / 60);
    o.draw(frame, { viewMode: 2, audioLocked: false, mappingMode: 'sculpt' });

    assert.match(els.metricsEl.innerText, /Mapping: sculpt/);
    assert.equal(els.hintEl.style.display, 'none');
    // left_shoulder at pixel x 160 -> mirrored: 1280 - 160*2 = 960
    const xs = calls.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo').map(c => c[1]);
    assert.ok(xs.includes(960), `expected mirrored x 960 in ${xs}`);
});

test('non-debug view hides HUD text but still shows toasts', () => {
    const { calls, els } = fakeEls();
    const o = new DebugOverlay(els);
    o.resize(800, 600);
    const m = new PerformanceManager(CONFIG, { latestPoses: [], cameraSize: { width: 640, height: 480 } });
    o.draw(m.tick(0, 1 / 60), { viewMode: 0, audioLocked: true, mappingMode: 'canon', toast: 'MAPPING: CANON' });
    assert.equal(els.metricsEl.style.display, 'none');
    assert.equal(els.hintEl.style.display, 'block');
    assert.ok(calls.some(c => c[0] === 'fillText' && c[1] === 'MAPPING: CANON'));
});
