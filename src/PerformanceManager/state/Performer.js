// src/PerformanceManager/state/Performer.js
import * as THREE from 'three';
import { CONFIG } from '../../core/Config.js';

/**
 * Manages the state of a single performer.
 * Represents the physical reality of a tracked person or virtual agent.
 * Decoupled from musical/visual interpretation.
 */
export class Performer {
    /**
     * Creates a new Performer instance.
     * @param {string} id - Unique identifier for the performer.
     * @param {number|string} colorHex - The color of the performer in hex format.
     */
    constructor(id, colorHex) {
        this.id = id;
        this.color = new THREE.Color(colorHex);
        this.baseColor = this.color.clone();

        this.hasPerformer = false;
        this.presence = 0.0;
        this.lastUpdate = performance.now();

        // --- Physical State (Smoothed/Current) ---
        // Position and Orientation in normalized 3D space
        // x, y: -1 to 1 (screen space)
        // depth: meters or relative units (negative = far)
        this.current = {
            roll: 0,
            pitch: 0,
            yaw: 0,
            depth: -5,
            x: 0,
            y: 0,
            phaseZ: 0
        };

        // Target state (from input)
        this.target = {
            roll: 0,
            pitch: 0,
            yaw: 0,
            depth: -5,
            x: 0,
            y: 0
        };

        // --- Rich Motion Data ---
        this.velocity = new THREE.Vector3();     // Rate of change of position/depth
        this.acceleration = new THREE.Vector3(); // Rate of change of velocity
        this.energy = 0.0;                       // Scalar energy metric (0-1)
        this.centerOfMass = new THREE.Vector3(); // Normalized Center of Mass
        this.size = 0.5;                         // Bounding box approximate size (0-1)

        // Previous frame state for derivative calculations
        this._prevPos = new THREE.Vector3(0, 0, -5);
        this._prevVel = new THREE.Vector3();

        // --- Gesture Data ---
        // "Triangle" represents the relationship between hands and head/neck
        this.triangle = {
            visible: false,
            v1: new THREE.Vector3(), // Head/Neck
            v2: new THREE.Vector3(), // Left Hand
            v3: new THREE.Vector3(), // Right Hand
            area: 0,
            width: 0.5,
            height: 0.5
        };

        // Raw Keypoints (optional storage)
        this.keypoints = [];
    }

    /**
     * Updates the performer state based on virtual input data.
     * @param {object} data - The virtual performance data.
     */
    updateFromVirtualData(data) {
        this.hasPerformer = data.hasPerformer;

        if (!data.hasPerformer) {
             this._resetTarget();
             return;
        }

        this.target.roll = data.roll;
        this.target.pitch = data.pitch;
        this.target.yaw = data.yaw;
        this.target.depth = data.depth;

        // Virtual data might not provide x/y position explicitly if it was just rotating
        // We'll assume center if not provided
        this.target.x = data.x !== undefined ? data.x : 0;
        this.target.y = data.y !== undefined ? data.y : 0;

        this.triangle.visible = data.triangle.visible;
        this.triangle.width = data.triangle.width;
        this.triangle.height = data.triangle.height;
        this.triangle.area = data.triangle.area;
        this.size = Math.sqrt(this.triangle.area); // Approx size

        // Reconstruct vertices for visualization
        if (this.triangle.visible) {
             const scale = 0.9;
             // v1 top, v2 left, v3 right
             this.triangle.v1.set(0, this.triangle.height * scale, 0);
             this.triangle.v2.set(-this.triangle.width * scale, -this.triangle.height * scale, 0);
             this.triangle.v3.set(this.triangle.width * scale, -this.triangle.height * scale, 0);
        }
    }

    /**
     * Updates the performer state based on a single Physical Input Pose.
     * @param {Object} pose - A single pose object from VisionSystem.
     */
    updateFromPose(pose) {
        const vW = CONFIG.camera.width;
        const vH = CONFIG.camera.height;

        if (!pose) {
            this.hasPerformer = false;
            this._resetTarget();
            return;
        }

        const ls = pose.keypoints.find(k => k.name === 'left_shoulder');
        const rs = pose.keypoints.find(k => k.name === 'right_shoulder');

        // Basic validation
        if (!ls || !rs || ls.score <= 0.3 || rs.score <= 0.3) {
             this.hasPerformer = false;
             this._resetTarget();
             return;
        }

        this.hasPerformer = true;
        this.keypoints = pose.keypoints;

        // --- Calculate Physics Targets ---

        const width = Math.hypot(rs.x - ls.x, rs.y - ls.y);

        // Yaw from shoulder tilt
        const dy = rs.y - ls.y;
        let tiltSignal = -dy / width;
        if (!CONFIG.mirrored) tiltSignal *= -1;
        this.target.yaw = tiltSignal * CONFIG.interaction.maxYaw * 2.5;

        // Pitch from vertical position (Head/Shoulder height)
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

        // Position (Center of Mass approx)
        // Map to -1 to 1
        const mapX = (val) => (val / vW) * 2 - 1;
        const mapY = (val) => -((val / vH) * 2 - 1);
        const xMult = CONFIG.mirrored ? -1 : 1;

        const cx = (ls.x + rs.x) / 2;
        this.target.x = mapX(cx) * xMult;
        this.target.y = mapY(cy); // approximate Y with shoulder height

        // Center of Mass (stored normalized)
        this.centerOfMass.set(this.target.x, this.target.y, this.target.depth);

        // --- Calculate Triangle ---
        const lWrist = pose.keypoints.find(k => k.name === 'left_wrist');
        const rWrist = pose.keypoints.find(k => k.name === 'right_wrist');

        if (lWrist && rWrist && lWrist.score > 0.3 && rWrist.score > 0.3) {
            this.triangle.visible = true;

            const nx = (ls.x + rs.x) / 2;
            const nyNeck = (ls.y + rs.y) / 2;

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
            this.size = Math.sqrt(this.triangle.area);

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
            this.size = 0.2; // default
        }
    }

    /**
     * Resets the target physics values to a default state.
     * @private
     */
    _resetTarget() {
        this.triangle.visible = false;
        // Drift back to center/neutral
        this.target.roll = 0;
        this.target.pitch = 0;
        this.target.yaw = 0;
        this.target.depth = -10;
        this.target.x = 0;
        this.target.y = 0;
    }

    /**
     * Updates the current physical state by interpolating towards target values.
     * Calculates velocity, acceleration, and energy.
     */
    updatePhysics() {
        const now = performance.now();
        const dt = (now - this.lastUpdate) / 1000;
        this.lastUpdate = now;

        if (dt <= 0) return;

        const a = CONFIG.smoothing;

        // Position/Orientation Smoothing
        this.current.roll = THREE.MathUtils.lerp(this.current.roll, this.target.roll, a);
        this.current.pitch = THREE.MathUtils.lerp(this.current.pitch, this.target.pitch, a);
        this.current.yaw = THREE.MathUtils.lerp(this.current.yaw, this.target.yaw, a);
        this.current.depth = THREE.MathUtils.lerp(this.current.depth, this.target.depth, CONFIG.depthSmoothing);
        this.current.phaseZ = this.current.depth * CONFIG.grid.phaseScale;

        this.current.x = THREE.MathUtils.lerp(this.current.x, this.target.x, a);
        this.current.y = THREE.MathUtils.lerp(this.current.y, this.target.y, a);

        // Presence logic
        const targetPresence = this.hasPerformer ? 1.0 : 0.0;
        this.presence = THREE.MathUtils.lerp(this.presence, targetPresence, 0.05);
        if (Math.abs(this.presence - targetPresence) < 0.001) {
            this.presence = targetPresence;
        }

        // --- Calculate Derivatives (Rich Data) ---
        // Current position vector
        const currentPos = new THREE.Vector3(this.current.x, this.current.y, this.current.depth);

        // Velocity = (CurrentPos - PrevPos) / dt
        const vel = currentPos.clone().sub(this._prevPos).divideScalar(dt);

        // Acceleration = (Velocity - PrevVel) / dt
        const accel = vel.clone().sub(this._prevVel).divideScalar(dt);

        // Smooth velocity/accel slightly to reduce jitter
        this.velocity.lerp(vel, 0.5);
        this.acceleration.lerp(accel, 0.5);

        // Energy: Combination of speed and size (activity level)
        const speed = this.velocity.length();
        // Normalize speed approx (0 to 5 units/sec?)
        const normSpeed = Math.min(speed / 5.0, 1.0);

        this.energy = THREE.MathUtils.lerp(this.energy, normSpeed, 0.1);

        // Store history
        this._prevPos.copy(currentPos);
        this._prevVel.copy(this.velocity);
    }
}
