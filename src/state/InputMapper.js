import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { BEAUTIFUL_INTERVALS } from '../data/Constants.js';

export class InputMapper {
    /**
     * Maps detected poses to the physical performer's state.
     * Calculates rotation, depth, and musical parameters from keypoints.
     * @param {PerformerState} performerState - The performer state to update.
     * @param {Array<Object>} poses - Array of detected poses from MoveNet.
     */
    static updatePerformerFromPoses(performerState, poses) {
        const p = performerState;
        const vW = CONFIG.camera.width;
        const vH = CONFIG.camera.height;

        if (!poses || poses.length === 0) {
            p.hasPerformer = false;
            p.triangle.visible = false;
            p.target.roll = 0;
            p.target.pitch = 0;
            p.target.yaw = 0;
            p.target.depth = -10;
            return;
        }

        let dominant = null;
        let maxWidth = 0;
        for (const pose of poses) {
            const ls = pose.keypoints.find(k => k.name === 'left_shoulder');
            const rs = pose.keypoints.find(k => k.name === 'right_shoulder');
            if (ls && rs && ls.score > 0.3 && rs.score > 0.3) {
                const w = Math.hypot(rs.x - ls.x, rs.y - ls.y);
                if (w > maxWidth) {
                    maxWidth = w;
                    dominant = { pose, width: w, ls, rs };
                }
            }
        }

        if (!dominant) {
            p.hasPerformer = false;
            p.triangle.visible = false;
            p.target.roll = 0;
            p.target.pitch = 0;
            p.target.yaw = 0;
            p.target.depth = -10;
            return;
        }

        p.hasPerformer = true;

        const { pose, width, ls, rs } = dominant;

        // Yaw from shoulder tilt
        const dy = rs.y - ls.y;
        let tiltSignal = -dy / width;
        if (!CONFIG.mirrored) tiltSignal *= -1;
        p.target.yaw = tiltSignal * CONFIG.interaction.maxYaw * 2.5;

        // Pitch from vertical position
        const cy = (ls.y + rs.y) / 2;
        let ny = (cy / vH) * 2 - 1;
        p.target.pitch = -ny * CONFIG.interaction.maxPitch;

        // Depth from torso box if hips are available, otherwise shoulder span
        const lHip = pose.keypoints.find(k => k.name === 'left_hip');
        const rHip = pose.keypoints.find(k => k.name === 'right_hip');
        let normMetric = 0;
        if (lHip && rHip && lHip.score > 0.3 && rHip.score > 0.3) {
            const mxS = (ls.x + rs.x) / 2;
            const myS = (ls.y + rs.y) / 2;
            const mxH = (lHip.x + rHip.x) / 2;
            const myH = (lHip.y + rHip.y) / 2;
            normMetric = Math.hypot(mxS - mxH, myS - myH) / vH;
        } else {
            normMetric = width / vW;
        }
        const safeMetric = Math.max(0.05, normMetric);
        p.target.depth = -(1.0 / safeMetric);

        // Wrists / triangle
        const lWrist = pose.keypoints.find(k => k.name === 'left_wrist');
        const rWrist = pose.keypoints.find(k => k.name === 'right_wrist');

        if (lWrist && rWrist && lWrist.score > 0.3 && rWrist.score > 0.3) {
            p.triangle.visible = true;

            const nx = (ls.x + rs.x) / 2;
            const nyNeck = (ls.y + rs.y) / 2;

            const mapX = (val) => (val / vW) * 2 - 1;
            const mapY = (val) => -((val / vH) * 2 - 1);

            const xMult = CONFIG.mirrored ? -1 : 1;

            p.triangle.v1.set(mapX(nx) * xMult, mapY(nyNeck), 0);
            p.triangle.v2.set(mapX(lWrist.x) * xMult, mapY(lWrist.y), 0);
            p.triangle.v3.set(mapX(rWrist.x) * xMult, mapY(rWrist.y), 0);

            const handDist = Math.hypot(lWrist.x - rWrist.x, lWrist.y - rWrist.y);
            p.triangle.width = handDist / vW;

            const avgHandY = (lWrist.y + rWrist.y) / 2;
            p.triangle.height = 1.0 - (avgHandY / vH);

            const tArea = 0.5 * Math.abs(
                lWrist.x * (rWrist.y - nyNeck) +
                rWrist.x * (nyNeck - lWrist.y) +
                nx * (lWrist.y - rWrist.y)
            );
            p.triangle.area = tArea / (vW * vH);

            const dx = lWrist.x - rWrist.x;
            const dyH = lWrist.y - rWrist.y;
            let handAngle = Math.atan2(dyH, dx);
            if (CONFIG.mirrored) handAngle *= -1;
            p.target.roll = handAngle;
        } else {
            p.triangle.visible = false;
            p.triangle.area = 0;
            p.triangle.width = 0.5;
            p.triangle.height = 0.5;
            p.target.roll = 0;
        }

        // Map triangle to BPM + interval
        const w = THREE.MathUtils.clamp(p.triangle.width, 0, 1);
        const h = THREE.MathUtils.clamp(p.triangle.height, 0, 1);

        const bpm = THREE.MathUtils.lerp(CONFIG.audio.bpmMax, CONFIG.audio.bpmMin, w);
        p.target.bpmPref = bpm;

        const idx = Math.floor(h * BEAUTIFUL_INTERVALS.length);
        const safeIdx = Math.min(BEAUTIFUL_INTERVALS.length - 1, Math.max(0, idx));
        p.noteRatio = BEAUTIFUL_INTERVALS[safeIdx];
    }
}
