// src/state/Performer.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { BEAUTIFUL_INTERVALS } from '../core/Constants.js';

/**
 * Manages the state of a single performer (either physical or virtual).
 * Handles position, rotation, and musical properties.
 * Also encapsulates the logic for interpreting raw pose data.
 */
export class Performer {
    /**
     * Creates a new Performer instance.
     * @param {number|string} colorHex - The color of the performer in hex format.
     * @param {boolean} [isBass=false] - Whether this performer controls the bass voice.
     */
    constructor(colorHex, isBass = false) {
        this.color = new THREE.Color(colorHex);
        this.baseColor = this.color.clone();
        this.isBass = isBass;

        this.hasPerformer = false;
        this.noteRatio = 1.0;

        this.current = {
            roll: 0,
            pitch: 0,
            yaw: 0,
            depth: -5,
            phaseZ: 0,
            bpmPref: 80
        };

        this.target = {
            roll: 0,
            pitch: 0,
            yaw: 0,
            depth: -5,
            bpmPref: 80
        };

        this.triangle = {
            visible: false,
            v1: new THREE.Vector3(),
            v2: new THREE.Vector3(),
            v3: new THREE.Vector3(),
            area: 0,
            width: 0.5,
            height: 0.5
        };
    }

    /**
     * Updates the current physical state by interpolating towards target values.
     * Applies smoothing to roll, pitch, yaw, depth, and BPM.
     */
    updatePhysics() {
        const a = CONFIG.smoothing;
        this.current.roll = THREE.MathUtils.lerp(this.current.roll, this.target.roll, a);
        this.current.pitch = THREE.MathUtils.lerp(this.current.pitch, this.target.pitch, a);
        this.current.yaw = THREE.MathUtils.lerp(this.current.yaw, this.target.yaw, a);
        this.current.depth = THREE.MathUtils.lerp(this.current.depth, this.target.depth, CONFIG.depthSmoothing);
        this.current.phaseZ = this.current.depth * CONFIG.grid.phaseScale;
        this.current.bpmPref = THREE.MathUtils.lerp(this.current.bpmPref, this.target.bpmPref, 0.05);
    }

    /**
     * Updates the performer's target state based on a raw MoveNet pose.
     * Encapsulates the logic for interpreting body movement into abstract parameters.
     * @param {Object|null} pose - The raw MoveNet pose object.
     * @param {number} width - Current width of the detected torso (for normalization).
     * @param {Object} [shoulders] - Pre-extracted shoulder keypoints {ls, rs}.
     */
    updateFromPose(pose, width, shoulders) {
        if (!pose || !shoulders) {
            this.resetState();
            return;
        }

        const { ls, rs } = shoulders;
        const vW = CONFIG.camera.width;
        const vH = CONFIG.camera.height;

        this.hasPerformer = true;

        // Yaw from shoulder tilt
        const dy = rs.y - ls.y;
        let tiltSignal = -dy / width;
        if (!CONFIG.mirrored) tiltSignal *= -1;
        this.target.yaw = tiltSignal * CONFIG.interaction.maxYaw * 2.5;

        // Pitch from vertical position
        const cy = (ls.y + rs.y) / 2;
        let ny = (cy / vH) * 2 - 1;
        this.target.pitch = -ny * CONFIG.interaction.maxPitch;

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
        this.target.depth = -(1.0 / safeMetric);

        // Wrists / triangle
        const lWrist = pose.keypoints.find(k => k.name === 'left_wrist');
        const rWrist = pose.keypoints.find(k => k.name === 'right_wrist');

        if (lWrist && rWrist && lWrist.score > 0.3 && rWrist.score > 0.3) {
            this.triangle.visible = true;

            const nx = (ls.x + rs.x) / 2;
            const nyNeck = (ls.y + rs.y) / 2;

            const mapX = (val) => (val / vW) * 2 - 1;
            const mapY = (val) => -((val / vH) * 2 - 1);

            const xMult = CONFIG.mirrored ? -1 : 1;

            this.triangle.v1.set(mapX(nx) * xMult, mapY(nyNeck), 0);
            this.triangle.v2.set(mapX(lWrist.x) * xMult, mapY(lWrist.y), 0);
            this.triangle.v3.set(mapX(rWrist.x) * xMult, mapY(rWrist.y), 0);

            const handDist = Math.hypot(lWrist.x - rWrist.x, lWrist.y - rWrist.y);
            this.triangle.width = handDist / vW;

            const avgHandY = (lWrist.y + rWrist.y) / 2;
            this.triangle.height = 1.0 - (avgHandY / vH);

            const tArea = 0.5 * Math.abs(
                lWrist.x * (rWrist.y - nyNeck) +
                rWrist.x * (nyNeck - lWrist.y) +
                nx * (lWrist.y - rWrist.y)
            );
            this.triangle.area = tArea / (vW * vH);

            const dx = lWrist.x - rWrist.x;
            const dyH = lWrist.y - rWrist.y;
            let handAngle = Math.atan2(dyH, dx);
            if (CONFIG.mirrored) handAngle *= -1;
            this.target.roll = handAngle;
        } else {
            this.triangle.visible = false;
            this.triangle.area = 0;
            this.triangle.width = 0.5;
            this.triangle.height = 0.5;
            this.target.roll = 0;
        }

        // Map triangle to BPM + interval
        const w = THREE.MathUtils.clamp(this.triangle.width, 0, 1);
        const h = THREE.MathUtils.clamp(this.triangle.height, 0, 1);

        const bpm = THREE.MathUtils.lerp(CONFIG.audio.bpmMax, CONFIG.audio.bpmMin, w);
        this.target.bpmPref = bpm;

        const idx = Math.floor(h * BEAUTIFUL_INTERVALS.length);
        const safeIdx = Math.min(BEAUTIFUL_INTERVALS.length - 1, Math.max(0, idx));
        this.noteRatio = BEAUTIFUL_INTERVALS[safeIdx];
    }

    /**
     * Resets the performer state when no person is detected.
     */
    resetState() {
        this.hasPerformer = false;
        this.triangle.visible = false;
        this.target.roll = 0;
        this.target.pitch = 0;
        this.target.yaw = 0;
        this.target.depth = -10;
    }
}
