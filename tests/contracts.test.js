import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRestGesture, cloneGesture } from '../src/core/Contracts.js';

test('createRestGesture returns independent objects', () => {
    const a = createRestGesture(), b = createRestGesture();
    a.orientation.yaw = 1; a.triangle.vertices[0].x = 9;
    assert.equal(b.orientation.yaw, 0);
    assert.equal(b.triangle.vertices[0].x, 0);
});

test('cloneGesture is deep and JSON-safe', () => {
    const a = createRestGesture();
    const c = cloneGesture(a);
    c.triangle.vertices[1].y = 5;
    assert.equal(a.triangle.vertices[1].y, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});
