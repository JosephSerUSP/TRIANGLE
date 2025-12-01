// src/state/Performer.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { BEAUTIFUL_INTERVALS } from '../core/Constants.js';

/**
 * Manages the state of a single performer (either physical or virtual).
 * Handles position, rotation, and musical properties.
 * Decoupled from input source: receives data via update methods.
 */
export class Performer {
    /**
     * Creates a new Performer instance.
     * @param {number|string} colorHex - The color of the performer in hex format.
     * @param {boolean} [isBass=false] - Whether this performer controls the bass voice.
     * @param {boolean} [isVirtual=false] - Whether this is a virtual performer.
     */
    constructor(colorHex, isBass = false, isVirtual = false) {
        this.color = new THREE.Color(colorHex);
        this.baseColor = this.color.clone();
        this.isBass = isBass;
        this.isVirtual = isVirtual;

        this.hasPerformer = false;
        this.presence = 0.0;
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
     * Updates the performer state based on Virtual Input Data.
     * @param {Object} data - The data object from AutopilotSystem.
     */
    updateFromVirtualData(data) {
        if (!this.isVirtual) return;

        this.hasPerformer = data.hasPerformer;

        if (!data.hasPerformer) {
             this._resetTarget();
             return;
        }

        this.target.roll = data.roll;
        this.target.pitch = data.pitch;
        this.target.yaw = data.yaw;
        this.target.depth = data.depth;
        this.target.bpmPref = data.bpmPref;
        this.noteRatio = data.noteRatio;

        this.triangle.visible = data.triangle.visible;
        this.triangle.width = data.triangle.width;
        this.triangle.height = data.triangle.height;
        this.triangle.area = data.triangle.area;

        // Reconstruct vertices for visualization if needed (simplified)
        // Note: The original code calculated vertices in Autopilot.
        // We can reconstruct them here or pass them.
        // For simplicity, we'll reconstruct based on width/height since Autopilot passed those.
        if (this.triangle.visible) {
             const scale = 0.9;
             // We can just use the generic shape derived from width/height
             // v1 top, v2 left, v3 right
             this.triangle.v1.set(0, this.triangle.height * scale, 0);
             this.triangle.v2.set(-this.triangle.width * scale, -this.triangle.height * scale, 0);
             this.triangle.v3.set(this.triangle.width * scale, -this.triangle.height * scale, 0);
        }
    }

    /**
     * Updates the performer state based on Physical Input Data (Vision Poses).
     * @param {Array} poses - The array of poses from VisionSystem.
     */
    updateFromPose(poses) {
        // If we are virtual but acting as physical (e.g. Autopilot disabled), we allow this.
        // Ideally we should update isVirtual flag or ignore it.
        // For now, let's respect isVirtual strictly, but the App might call this on virtual performers if we change App logic.
        // Actually, App logic changes performers[1] to be "physical-capable" if autopilot is off?
        // Or we just allow updateFromPose to run regardless, but usually it wasn't called.
        // The original code had: if (this.isVirtual) return;
        // If we want P1/P2 to be physical when autopilot is off, we must allow this method to run.

        // But wait, the Performer constructor sets isVirtual.
        // If we want dynamic behavior, we should check a passed flag or rely on App to call the right method.
        // I will remove the strict isVirtual check here and rely on the caller.

        const vW = CONFIG.camera.width;
        const vH = CONFIG.camera.height;

        if (!poses || poses.length === 0) {
            this.hasPerformer = false;
            this._resetTarget();
            return;
        }

        // Logic moved from App._updatePhysicalFromPoses
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
            this.hasPerformer = false;
            this._resetTarget();
            return;
        }

        // Use the new single pose method
        this.updateFromSinglePose(dominant.pose);
    }

    /**
     * Updates the performer state based on a single Physical Input Pose.
     * @param {Object} pose - A single pose object from VisionSystem.
     */
    updateFromSinglePose(pose) {
        const vW = CONFIG.camera.width;
        const vH = CONFIG.camera.height;

        if (!pose) {
            this.hasPerformer = false;
            this._resetTarget();
            return;
        }

        const ls = pose.keypoints.find(k => k.name === 'left_shoulder');
        const rs = pose.keypoints.find(k => k.name === 'right_shoulder');

        // Basic validation again just in case, though usually pre-filtered
        if (!ls || !rs || ls.score <= 0.3 || rs.score <= 0.3) {
             this.hasPerformer = false;
             this._resetTarget();
             return;
        }

        const width = Math.hypot(rs.x - ls.x, rs.y - ls.y);

        this.hasPerformer = true;

        // --- Calculate Physics ---

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

        // --- Calculate Triangle ---
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

        // --- Calculate Music Params ---
        const w = THREE.MathUtils.clamp(this.triangle.width, 0, 1);
        const h = THREE.MathUtils.clamp(this.triangle.height, 0, 1);

        this.target.bpmPref = THREE.MathUtils.lerp(CONFIG.audio.bpmMax, CONFIG.audio.bpmMin, w);

        const idx = Math.floor(h * BEAUTIFUL_INTERVALS.length);
        const safeIdx = Math.min(BEAUTIFUL_INTERVALS.length - 1, Math.max(0, idx));
        this.noteRatio = BEAUTIFUL_INTERVALS[safeIdx];
    }

    _resetTarget() {
        this.triangle.visible = false;
        this.target.roll = 0;
        this.target.pitch = 0;
        this.target.yaw = 0;
        this.target.depth = -10;
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

        // Presence logic for smooth transitions
        const targetPresence = this.hasPerformer ? 1.0 : 0.0;
        this.presence = THREE.MathUtils.lerp(this.presence, targetPresence, 0.05);
        if (Math.abs(this.presence - targetPresence) < 0.001) {
            this.presence = targetPresence;
        }
    }
}
