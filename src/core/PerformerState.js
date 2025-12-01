import * as THREE from 'three';
import { CONFIG } from '../config.js';

// ============================================================================
// PERFORMER STATE
// ============================================================================
/**
 * Manages the state of a single performer (either physical or virtual).
 * Handles position, rotation, and musical properties.
 */
export class PerformerState {
    /**
     * Creates a new PerformerState instance.
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
}
