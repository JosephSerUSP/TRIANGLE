import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VisionSystem } from '../src/PerformanceManager/systems/VisionSystem.js';
import { CONFIG } from '../src/core/Config.js';

test('inference loop: no start before ready; then publishes poses on its own', async () => {
    const v = new VisionSystem({}, CONFIG.vision);
    v.start();
    assert.equal(v.running, false);

    const poses = [{ keypoints: [] }];
    v.detector = { estimatePoses: async () => poses };
    v.isReady = true;
    v.start(); v.start(); // idempotent
    await new Promise(r => setTimeout(r, 30));
    v.stop();
    assert.equal(v.latestPoses, poses);
    assert.ok(v.inferenceCount > 1);
    assert.deepEqual(v.cameraSize, { width: CONFIG.vision.idealWidth, height: CONFIG.vision.idealHeight });
});

test('a detector error yields no poses instead of crashing the loop', async () => {
    const v = new VisionSystem({}, CONFIG.vision);
    let n = 0;
    v.detector = { estimatePoses: async () => { if (n++ === 0) throw new Error('boom'); return [{ keypoints: [] }]; } };
    v.isReady = true;
    v.start();
    await new Promise(r => setTimeout(r, 30));
    v.stop();
    assert.ok(n > 1);
    assert.equal(v.latestPoses.length, 1);
});
