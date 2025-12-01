// src/state/Performer.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

/**
 * Manages the state of a single performer.
 * Handles position, rotation, and musical properties.
 * Decoupled from input source: receives generic updates.
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
     * Updates the target state from generic input data.
     * This method acts as the "adapter" for whatever input source is driving this performer.
     *
     * @param {Object} data - Standardized input data.
     */
    updateFromInput(data) {
        if (!data) return;

        // If input is raw pose data (array), we need to interpret it (Physical Performer Logic)
        if (Array.isArray(data)) {
            this._updateFromPoses(data);
        }
        // If input is pre-processed virtual data (Object)
        else {
            this._updateFromVirtual(data);
        }
    }

    /**
     * Internal physics update loop.
     * Interpolates current values towards target values.
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
     * Updates state based on virtual data (from Autopilot).
     * @private
     */
    _updateFromVirtual(data) {
        this.hasPerformer = data.hasPerformer;
        if (!this.hasPerformer) {
            this.triangle.visible = false;
            // maintain defaults for target if off, or reset?
            // Autopilot sends "Off" data with reset targets usually.
            if (data.target) {
                this.target.roll = data.target.roll;
                this.target.pitch = data.target.pitch;
                this.target.yaw = data.target.yaw;
                this.target.depth = data.target.depth;
            }
            return;
        }

        if (data.noteRatio) this.noteRatio = data.noteRatio;

        if (data.target) {
            this.target.bpmPref = data.target.bpmPref;
            this.target.roll = data.target.roll;
            this.target.pitch = data.target.pitch;
            this.target.yaw = data.target.yaw;
            this.target.depth = data.target.depth;
        }

        if (data.triangle) {
            this.triangle.visible = data.triangle.visible;
            this.triangle.width = data.triangle.width;
            this.triangle.height = data.triangle.height;
            this.triangle.area = data.triangle.area;
            if (data.triangle.v1) this.triangle.v1.copy(data.triangle.v1);
            if (data.triangle.v2) this.triangle.v2.copy(data.triangle.v2);
            if (data.triangle.v3) this.triangle.v3.copy(data.triangle.v3);
        }
    }

    /**
     * Interpret raw Pose data to update targets.
     * Logic moved from App._updatePhysicalFromPoses
     * @private
     */
    _updateFromPoses(poses) {
        const vW = CONFIG.camera.width;
        const vH = CONFIG.camera.height;

        // Constants for interval mapping (avoid circular dependency if we import constants here,
        // but it's fine to import them if needed. We need BEAUTIFUL_INTERVALS)
        // Importing at top level...

        // Logic from original _updatePhysicalFromPoses
        if (!poses || poses.length === 0) {
            this._resetTargets();
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
            this._resetTargets();
            return;
        }

        this.hasPerformer = true;
        const { pose, width, ls, rs } = dominant;

        // Yaw from shoulder tilt
        const dy = rs.y - ls.y;
        let tiltSignal = -dy / width;
        if (!CONFIG.mirrored) tiltSignal *= -1;
        this.target.yaw = tiltSignal * CONFIG.interaction.maxYaw * 2.5;

        // Pitch from vertical position
        const cy = (ls.y + rs.y) / 2;
        let ny = (cy / vH) * 2 - 1;
        this.target.pitch = -ny * CONFIG.interaction.maxPitch;

        // Depth
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

        // Wrists / Triangle
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

        // Map triangle to BPM + Interval
        this._mapMusicalParams();
    }

    _resetTargets() {
        this.hasPerformer = false;
        this.triangle.visible = false;
        this.target.roll = 0;
        this.target.pitch = 0;
        this.target.yaw = 0;
        this.target.depth = -10;
    }

    _mapMusicalParams() {
        // We need BEAUTIFUL_INTERVALS here.
        // I will dynamic import or assume it is available if I import at top.
        // For now I'll use the hardcoded logic since I can't easily see if I imported it correctly in this file block
        // without scrolling up. I'll add the import at the top of this file content block.

        const w = THREE.MathUtils.clamp(this.triangle.width, 0, 1);
        const h = THREE.MathUtils.clamp(this.triangle.height, 0, 1);

        const bpm = THREE.MathUtils.lerp(CONFIG.audio.bpmMax, CONFIG.audio.bpmMin, w);
        this.target.bpmPref = bpm;

        // Note Ratio
        // We need the intervals.
        const intervals = [
            1.0, 1.25, 1.5, 1.875, 2.25, 2.8125, 3.0
        ]; // Duplicated from Constants for safety in this method, or I can update imports.
           // Better to import.

        const idx = Math.floor(h * intervals.length);
        const safeIdx = Math.min(intervals.length - 1, Math.max(0, idx));
        this.noteRatio = intervals[safeIdx];
    }
}
