import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractGesture, orderPoses, isUsablePose } from '../src/PerformanceManager/gesture/PoseExtractor.js';
import { OPTS, pose } from './helpers.js';

test('zero shoulder width is rejected instead of producing NaN', () => {
    const p = pose({ shoulderW: 0 });
    assert.equal(isUsablePose(p, OPTS), false);
    assert.equal(extractGesture(p, OPTS), null);
});

test('low-confidence poses are rejected', () => {
    assert.equal(extractGesture(pose({ score: 0.1 }), OPTS), null);
});

test('gesture is finite and triangle mirrored into canonical space', () => {
    const g = extractGesture(pose(), OPTS);
    const all = [g.depth, ...Object.values(g.orientation), g.triangle.width, g.triangle.height, g.triangle.area,
        ...g.triangle.vertices.flatMap(v => [v.x, v.y])];
    all.forEach(v => assert.ok(Number.isFinite(v)));
    assert.equal(g.triangle.visible, true);
    // left_wrist sits at low pixel x; mirrored it lands screen-right (+x).
    assert.ok(g.triangle.vertices[1].x > 0);
    assert.ok(g.triangle.height > 0.5);
});

test('no wrists -> invisible triangle, roll 0', () => {
    const g = extractGesture(pose({ wrists: false }), OPTS);
    assert.equal(g.triangle.visible, false);
    assert.equal(g.orientation.roll, 0);
});

test('orderPoses drops ghosts before ordering left-to-right on screen', () => {
    const a = pose({ cx: 100 }), b = pose({ cx: 500 }), ghost = pose({ cx: 300, score: 0.1 });
    const out = orderPoses([a, ghost, b], OPTS);
    assert.equal(out.length, 2);
    assert.equal(out[0], b); // mirrored: pixel x 500 is screen-left
});
