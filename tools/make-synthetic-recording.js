/**
 * Generates recordings/synthetic-duo.json: two procedural bodies that sway,
 * raise and spread their arms, and step in and out of frame. Lets anyone
 * exercise the full camera pipeline without a webcam:
 *
 *   node tools/make-synthetic-recording.js
 *   open http://localhost:8000/?replay=recordings/synthetic-duo.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 640, H = 480, FPS = 15, SECONDS = 24; // 15 fps ~ MoveNet rate on modest machines

function body(cx, t, phase) {
    const sway = Math.sin(t * 0.7 + phase) * 30;
    const tilt = Math.sin(t * 0.9 + phase) * 18;
    const lift = (Math.sin(t * 0.5 + phase) + 1) / 2;         // 0..1 hand height
    const spread = 80 + ((Math.sin(t * 0.35 + phase) + 1) / 2) * 140;
    const x = cx + sway, sy = 190, hy = 340;
    const wy = hy - lift * 260;
    const k = (name, px, py, score = 0.9) => ({ name, x: +px.toFixed(1), y: +py.toFixed(1), score });
    return {
        keypoints: [
            k('left_shoulder', x - 55, sy - tilt), k('right_shoulder', x + 55, sy + tilt),
            k('left_elbow', x - 90, (sy + wy) / 2 + 20), k('right_elbow', x + 90, (sy + wy) / 2 + 20),
            k('left_wrist', x - spread, wy), k('right_wrist', x + spread, wy + Math.sin(t + phase) * 25),
            k('left_hip', x - 45, hy), k('right_hip', x + 45, hy)
        ]
    };
}

const frames = [];
for (let i = 0; i < SECONDS * FPS; i++) {
    const t = i / FPS;
    const poses = [body(200, t, 0)];
    // Second performer is present for the middle 12 seconds only.
    if (t > 6 && t < 18) poses.push(body(450, t, 2.1));
    // A brief dropout to exercise the presence debounce.
    if (i % 75 === 37) poses.length = 0;
    frames.push({ t: +t.toFixed(3), poses });
}

mkdirSync('recordings', { recursive: true });
writeFileSync('recordings/synthetic-duo.json', JSON.stringify({
    _doc: 'Synthetic TRIANGLE recording made by tools/make-synthetic-recording.js. Replay with index.html?replay=recordings/synthetic-duo.json',
    version: 1,
    cameraSize: { width: W, height: H },
    frames
}));
console.log(`wrote recordings/synthetic-duo.json (${frames.length} frames)`);
