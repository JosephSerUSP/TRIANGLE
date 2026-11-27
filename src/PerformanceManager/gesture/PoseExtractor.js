/**
 * @fileoverview Pure MoveNet pose -> SomaticGesture. The ONLY place that knows
 * about keypoint names, camera pixels and mirroring. NaN-safe, no Three.js.
 */
import { createRestGesture } from '../../core/Contracts.js';
import { clamp } from '../../core/MathUtils.js';

const kp = (pose, name) => pose.keypoints.find(k => k.name === name);
const ok = (k, minScore) => !!k && k.score > minScore && Number.isFinite(k.x) && Number.isFinite(k.y);

/** True if the pose has both shoulders confidently and a non-degenerate shoulder span. */
export function isUsablePose(pose, opts) {
    if (!pose || !pose.keypoints) return false;
    const ls = kp(pose, 'left_shoulder');
    const rs = kp(pose, 'right_shoulder');
    if (!ok(ls, opts.minKeypointScore) || !ok(rs, opts.minKeypointScore)) return false;
    return Math.hypot(rs.x - ls.x, rs.y - ls.y) > 1e-3;
}

/** Canonical (mirrored) horizontal center of the shoulders, in [-1,1]. */
export function poseCenterX(pose, opts) {
    const ls = kp(pose, 'left_shoulder');
    const rs = kp(pose, 'right_shoulder');
    const x = ((ls.x + rs.x) / 2 / opts.width) * 2 - 1;
    return opts.mirrored ? -x : x;
}

/**
 * Keeps usable poses and orders them left-to-right as seen on screen.
 * @returns {Array} filtered, sorted poses
 */
export function orderPoses(poses, opts) {
    return (poses || [])
        .filter(p => isUsablePose(p, opts))
        .sort((a, b) => poseCenterX(a, opts) - poseCenterX(b, opts));
}

/**
 * @param {Object} pose  MoveNet pose
 * @param {{width:number,height:number,mirrored:boolean,minKeypointScore:number,
 *          maxPitch:number,maxYaw:number}} opts
 * @returns {import('../../core/Contracts.js').SomaticGesture|null} null when unusable
 */
export function extractGesture(pose, opts) {
    if (!isUsablePose(pose, opts)) return null;
    const { width: vW, height: vH, mirrored, minKeypointScore: min } = opts;
    const xSign = mirrored ? -1 : 1;
    const g = createRestGesture();

    const ls = kp(pose, 'left_shoulder');
    const rs = kp(pose, 'right_shoulder');
    const shoulderW = Math.hypot(rs.x - ls.x, rs.y - ls.y);

    // Yaw from shoulder tilt (guarded: isUsablePose ensures shoulderW > 0).
    const tilt = (-(rs.y - ls.y) / shoulderW) * (mirrored ? 1 : -1);
    g.orientation.yaw = clamp(tilt * opts.maxYaw * 2.5, -Math.PI, Math.PI);

    // Pitch from vertical position.
    const cy = (ls.y + rs.y) / 2;
    g.orientation.pitch = -((cy / vH) * 2 - 1) * opts.maxPitch;

    // Depth from torso length (or shoulder width).
    const lh = kp(pose, 'left_hip');
    const rh = kp(pose, 'right_hip');
    let metric;
    if (ok(lh, min) && ok(rh, min)) {
        metric = Math.hypot((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2, cy - (lh.y + rh.y) / 2) / vH;
    } else {
        metric = shoulderW / vW;
    }
    g.depth = -(1.0 / Math.max(0.05, metric));

    // Triangle: neck + both wrists.
    const lw = kp(pose, 'left_wrist');
    const rw = kp(pose, 'right_wrist');
    if (ok(lw, min) && ok(rw, min)) {
        const nx = (ls.x + rs.x) / 2;
        const toV = (x, y) => ({ x: ((x / vW) * 2 - 1) * xSign, y: -((y / vH) * 2 - 1) });
        const t = g.triangle;
        t.visible = true;
        t.vertices = [toV(nx, cy), toV(lw.x, lw.y), toV(rw.x, rw.y)];
        t.width = clamp(Math.hypot(lw.x - rw.x, lw.y - rw.y) / vW, 0, 1);
        t.height = clamp(1 - (lw.y + rw.y) / 2 / vH, 0, 1);
        t.area = 0.5 * Math.abs(
            lw.x * (rw.y - cy) + rw.x * (cy - lw.y) + nx * (lw.y - rw.y)
        ) / (vW * vH);
        g.orientation.roll = Math.atan2(lw.y - rw.y, lw.x - rw.x) * (mirrored ? -1 : 1);
    }
    return g;
}
