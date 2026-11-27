/**
 * Generates recordings/synthetic-duo.json and recordings/solo-sweep.json (below).
 * synthetic-duo: two procedural bodies that sway,
 * raise and spread their arms, and step in and out of frame. Lets anyone
 * exercise the full camera pipeline without a webcam:
 *
 *   node tools/make-synthetic-recording.js
 *   open http://localhost:8000/?replay=recordings/synthetic-duo.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';

// Camera geometry: MoveNet's left_* is the PERSON's left, which a front-facing
// camera images at the HIGHER pixel x. Keep fixtures anatomically real.

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
            k('left_shoulder', x + 55, sy - tilt), k('right_shoulder', x - 55, sy + tilt),
            k('left_elbow', x + 90, (sy + wy) / 2 + 20), k('right_elbow', x - 90, (sy + wy) / 2 + 20),
            k('left_wrist', x + spread, wy), k('right_wrist', x - spread, wy + Math.sin(t + phase) * 25),
            k('left_hip', x + 45, hy), k('right_hip', x - 45, hy)
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

/**
 * recordings/solo-sweep.json: one body, three 10 s phases, one control each:
 *  0-10 s  hand height low -> high   (expression; harmony/sculpt transpose)
 * 10-20 s  hand line tilts left -> right (roll; sculpt chord walk)
 * 20-30 s  arms narrow -> wide        (span; tempo/harmony/sculpt BPM)
 * Use: ?replay=recordings/solo-sweep.json&autopilot=0&view=2
 */
function sweepBody(t) {
    const cx = 320, sy = 190, hy = 340;
    const ph = Math.floor(t / 10), u = (t % 10) / 10;           // phase, 0..1 within it
    const lift = ph === 0 ? u : 0.5;
    const tilt = ph === 1 ? (u - 0.5) * 2 : 0;                   // -1..1
    const spread = ph === 2 ? 60 + u * 220 : 150;
    const wy = hy - lift * 260;
    const k = (name, x, y) => ({ name, x: +x.toFixed(1), y: +y.toFixed(1), score: 0.9 });
    return {
        keypoints: [
            k('left_shoulder', cx + 55, sy), k('right_shoulder', cx - 55, sy),
            k('left_wrist', cx + spread, wy - tilt * 120), k('right_wrist', cx - spread, wy + tilt * 120),
            k('left_hip', cx + 45, hy), k('right_hip', cx - 45, hy)
        ]
    };
}
const sweep = [];
for (let i = 0; i < 30 * FPS; i++) sweep.push({ t: +(i / FPS).toFixed(3), poses: [sweepBody(i / FPS)] });
writeFileSync('recordings/solo-sweep.json', JSON.stringify({
    _doc: 'Synthetic TRIANGLE recording (tools/make-synthetic-recording.js): one body sweeping height, then tilt, then span, 10 s each. Replay with ?replay=recordings/solo-sweep.json&autopilot=0&view=2',
    version: 1,
    cameraSize: { width: W, height: H },
    frames: sweep
}));
console.log(`wrote recordings/solo-sweep.json (${sweep.length} frames)`);
