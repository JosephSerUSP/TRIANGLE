// src/systems/AutopilotSystem.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { BEAUTIFUL_INTERVALS } from '../core/Constants.js';

/**
 * Controls the behavior of virtual performers (autopilot mode).
 * Simulates presence and movement for performers not controlled by a human.
 *
 * Refactored to produce data rather than modify state directly.
 */
export class AutopilotSystem {
    /**
     * Creates a new AutopilotSystem instance.
     * @param {number[]} indices - Indices of the performers this system is responsible for.
     */
    constructor(indices) {
        this.indices = indices;

        // Internal state management for the autopilot logic
        this.internalState = {};
        this.indices.forEach(idx => {
            this.internalState[idx] = {
                nextEventTime: performance.now() + this._randomDelay(),
                active: false,
                currentData: this._generateOffData()
            };
        });
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
     * Generates "Off" state data.
     * @private
     */
    _generateOffData() {
        return {
            hasPerformer: false,
            triangle: { visible: false },
            target: {
                roll: 0,
                pitch: 0,
                yaw: 0,
                depth: -10
            }
        };
    }

    /**
     * Generates "On" state data with random parameters.
     * @private
     */
    _generateOnData() {
        const width = THREE.MathUtils.randFloat(0.25, 0.8);
        const height = THREE.MathUtils.randFloat(0.2, 0.9);
        const area = THREE.MathUtils.randFloat(0.15, 0.6);
        const scale = 0.9;

        const idx = Math.floor(Math.random() * BEAUTIFUL_INTERVALS.length);
        const noteRatio = BEAUTIFUL_INTERVALS[idx];

        return {
            hasPerformer: true,
            noteRatio: noteRatio,
            target: {
                bpmPref: THREE.MathUtils.randFloat(CONFIG.audio.bpmMin, CONFIG.audio.bpmMax),
                roll: THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(60)),
                pitch: THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(30)),
                yaw: THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(90)),
                depth: THREE.MathUtils.randFloat(-8, -2)
            },
            triangle: {
                visible: true,
                width: width,
                height: height,
                area: area,
                v1: new THREE.Vector3(0, height * scale, 0),
                v2: new THREE.Vector3(-width * scale, -height * scale, 0),
                v3: new THREE.Vector3(width * scale, -height * scale, 0)
            }
        };
    }

    /**
     * Executes a single decision step for the autopilot.
     * Randomly turns performers on or off and updates their target data.
     */
    _step() {
        const now = performance.now();

        // We iterate over all indices we control to check if it's time to update any
        // But the original logic picked *one* random index to change per "step" (based on one timer).
        // Let's stick to the original logic: one shared timer for "events".

        // Check global timer (stored in first index or separate property? Let's use a separate property)
        if (!this.nextGlobalEventTime) {
             this.nextGlobalEventTime = now + this._randomDelay();
        }

        if (now < this.nextGlobalEventTime) return;

        // Time to trigger an event
        this.nextGlobalEventTime = now + this._randomDelay();

        // Count active performers
        const activeCount = this.indices.filter(i => this.internalState[i].active).length;

        // Choose a random performer to modify
        const chosenIdx = this.indices[Math.floor(Math.random() * this.indices.length)];
        const state = this.internalState[chosenIdx];

        let shouldTurnOn = false;

        if (activeCount === 0) {
            shouldTurnOn = true;
        } else if (activeCount === this.indices.length) {
            if (Math.random() < 0.7) shouldTurnOn = false;
            else shouldTurnOn = true; // Refresh parameters
        } else {
            if (state.active) {
                if (Math.random() < 0.5) shouldTurnOn = false;
                else shouldTurnOn = true; // Refresh
            } else {
                shouldTurnOn = true;
            }
        }

        state.active = shouldTurnOn;
        state.currentData = shouldTurnOn ? this._generateOnData() : this._generateOffData();
    }

    /**
     * Updates the autopilot state and returns the current data for all controlled performers.
     * @returns {Object} Map of index -> virtual input data
     */
    update() {
        this._step();

        const result = {};
        this.indices.forEach(idx => {
            result[idx] = this.internalState[idx].currentData;
        });
        return result;
    }
}
