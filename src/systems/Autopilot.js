// src/systems/Autopilot.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { BEAUTIFUL_INTERVALS } from '../core/Constants.js';

/**
 * Controls the behavior of virtual performers (autopilot mode).
 * Simulates presence and movement for performers not controlled by a human.
 */
export class Autopilot {
    /**
     * Creates a new Autopilot instance.
     * @param {Performer[]} performers - Array of all performer states.
     * @param {number[]} indices - Indices of the performers to control.
     */
    constructor(performers, indices) {
        this.performers = performers;
        this.indices = indices;
        this.nextEventTime = performance.now() + this._randomDelay();
    }

    /**
     * Generates a random delay for the next event.
     * @private
     * @returns {number} Delay in milliseconds.
     */
    _randomDelay() {
        return 3000 + Math.random() * 5000;
    }

    /**
     * Activates a virtual performer with random parameters.
     * @private
     * @param {Performer} state - The performer state to modify.
     */
    _turnOn(state) {
        state.hasPerformer = true;
        state.target.bpmPref = THREE.MathUtils.randFloat(CONFIG.audio.bpmMin, CONFIG.audio.bpmMax);

        const idx = Math.floor(Math.random() * BEAUTIFUL_INTERVALS.length);
        state.noteRatio = BEAUTIFUL_INTERVALS[idx];

        const width = THREE.MathUtils.randFloat(0.25, 0.8);
        const height = THREE.MathUtils.randFloat(0.2, 0.9);
        const area = THREE.MathUtils.randFloat(0.15, 0.6);

        state.triangle.width = width;
        state.triangle.height = height;
        state.triangle.area = area;
        state.triangle.visible = true;

        const scale = 0.9;
        state.triangle.v1.set(0, height * scale, 0);
        state.triangle.v2.set(-width * scale, -height * scale, 0);
        state.triangle.v3.set(width * scale, -height * scale, 0);

        state.target.roll = THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(60));
        state.target.pitch = THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(30));
        state.target.yaw = THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(90));
        state.target.depth = THREE.MathUtils.randFloat(-8, -2);
    }

    /**
     * Deactivates a virtual performer.
     * @private
     * @param {Performer} state - The performer state to modify.
     */
    _turnOff(state) {
        state.resetState();
    }

    /**
     * Executes a single decision step for the autopilot.
     * Randomly turns performers on or off.
     */
    step() {
        const items = this.indices.map(i => ({ idx: i, state: this.performers[i] }));
        const active = items.filter(o => o.state.hasPerformer);
        const activeCount = active.length;

        const chosenIdx = this.indices[Math.floor(Math.random() * this.indices.length)];
        const st = this.performers[chosenIdx];

        if (activeCount === 0) {
            this._turnOn(st);
        } else if (activeCount === this.indices.length) {
            if (Math.random() < 0.7) this._turnOff(st);
            else this._turnOn(st);
        } else {
            if (st.hasPerformer) {
                if (Math.random() < 0.5) this._turnOff(st);
            } else {
                this._turnOn(st);
            }
        }
    }

    /**
     * Updates the autopilot state.
     * Checks if enough time has passed to trigger the next step.
     */
    update() {
        const now = performance.now();
        if (now >= this.nextEventTime) {
            this.step();
            this.nextEventTime = now + this._randomDelay();
        }
    }
}
