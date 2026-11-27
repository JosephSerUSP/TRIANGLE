import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PoseRecorder, ReplayVision, frameIndexAt } from '../src/PerformanceManager/systems/PoseRecording.js';
import { PerformanceManager } from '../src/PerformanceManager/index.js';
import { CONFIG } from '../src/core/Config.js';
import { pose } from './helpers.js';

test('frameIndexAt finds the frame active at t', () => {
    const f = [{ t: 0 }, { t: 0.5 }, { t: 1 }];
    assert.equal(frameIndexAt(f, -1), -1);
    assert.equal(frameIndexAt(f, 0.49), 0);
    assert.equal(frameIndexAt(f, 0.5), 1);
    assert.equal(frameIndexAt(f, 9), 2);
});

test('recorder skips unchanged pose arrays and round-trips through replay', async () => {
    const r = new PoseRecorder();
    r.start(10, { width: 640, height: 480 });
    const a = [pose({ cx: 200 })];
    r.capture(10, a); r.capture(10.01, a); // same array -> one frame
    r.capture(10.5, [pose({ cx: 400 })]);
    const rec = JSON.parse(JSON.stringify(r.stop()));
    assert.equal(rec.frames.length, 2);

    let now = 0;
    const v = new ReplayVision(rec, () => now);
    await v.init(); v.start();
    now = 0.52; // inside the 0.55 s loop
    assert.equal(v.latestPoses[0].keypoints[0].x, 400 + 60);
});

test('recordings keep only name/x/y/score, rounded', () => {
    const r = new PoseRecorder();
    r.start(0, { width: 640, height: 480 });
    r.capture(0.12345, [{ score: 0.9, keypoints: [{ name: 'nose', x: 100.123456, y: 50.987654, score: 0.876543, extra: 1 }] }]);
    const k = r.stop().frames[0];
    assert.equal(k.t, 0.123);
    assert.deepEqual(k.poses[0], { keypoints: [{ name: 'nose', x: 100.1, y: 51, score: 0.88 }] });
});

test('replayed poses drive the manager like a camera', async () => {
    const frames = Array.from({ length: 60 }, (_, i) => ({ t: i / 30, poses: [pose()] }));
    let now = 0;
    const v = new ReplayVision({ cameraSize: { width: 640, height: 480 }, frames }, () => now);
    await v.init(); v.start();
    const m = new PerformanceManager(CONFIG, v);
    let f;
    for (let i = 0; i < 30; i++) { now = i / 60; f = m.tick(now, 1 / 60); }
    assert.equal(f.slots[0].active, true);
    assert.equal(f.slots[0].binding, 'physical');
});
