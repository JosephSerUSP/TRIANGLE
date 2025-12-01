// src/systems/AutopilotSystem.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { BEAUTIFUL_INTERVALS } from '../core/Constants.js';

/**
 * Controls the behavior of virtual performers (autopilot mode).
 * Simulates presence and movement for performers not controlled by a human.
 * Emits data snapshots that Performers can consume.
 */
export class AutopilotSystem {
    /**
     * Creates a new AutopilotSystem instance.
     * @param {number[]} indices - Indices of the performers this system controls.
     */
    constructor(indices) {
        this.indices = indices;

        // Map of performerIndex -> VirtualInputData
        this.data = new Map();

        // Internal state for each managed performer
        this.states = new Map();

        this.indices.forEach(idx => {
            this.states.set(idx, {
                active: false,
                nextEventTime: performance.now() + this._randomDelay(),
                params: this._generateOffParams()
            });
            this.data.set(idx, this._generateOffParams());
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

    _generateOffParams() {
        return {
            hasPerformer: false,
            roll: 0,
            pitch: 0,
            yaw: 0,
            depth: -10,
            bpmPref: 60,
            noteRatio: 1.0,
            triangle: {
                visible: false,
                width: 0.5,
                height: 0.5,
                area: 0
            }
        };
    }

    _generateOnParams() {
        const bpmPref = THREE.MathUtils.randFloat(CONFIG.audio.bpmMin, CONFIG.audio.bpmMax);
        const idx = Math.floor(Math.random() * BEAUTIFUL_INTERVALS.length);
        const noteRatio = BEAUTIFUL_INTERVALS[idx];

        const width = THREE.MathUtils.randFloat(0.25, 0.8);
        const height = THREE.MathUtils.randFloat(0.2, 0.9);
        const area = THREE.MathUtils.randFloat(0.15, 0.6);

        const roll = THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(60));
        const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(30));
        const yaw = THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(90));
        const depth = THREE.MathUtils.randFloat(-8, -2);

        return {
            hasPerformer: true,
            roll, pitch, yaw, depth,
            bpmPref, noteRatio,
            triangle: {
                visible: true,
                width, height, area
            }
        };
    }

    /**
     * Executes logic for a single performer index.
     * @param {number} idx
     */
    _step(idx) {
        const state = this.states.get(idx);
        const activeCount = Array.from(this.states.values()).filter(s => s.active).length;
        const totalManaged = this.indices.length;

        // Logic to determine if we toggle on or off
        let shouldToggle = false;

        if (activeCount === 0) {
            // If none are active, turn this one on
             if (!state.active) shouldToggle = true;
        } else if (activeCount === totalManaged) {
            // If all are active, mostly turn off, sometimes re-roll
             if (Math.random() < 0.7) {
                 if (state.active) shouldToggle = true;
             } else {
                 // Re-roll parameters but stay active
                 state.params = this._generateOnParams();
             }
        } else {
            // Mixed state
            if (state.active) {
                if (Math.random() < 0.5) shouldToggle = true;
            } else {
                shouldToggle = true;
            }
        }

        if (shouldToggle) {
            state.active = !state.active;
            state.params = state.active ? this._generateOnParams() : this._generateOffParams();
        }

        this.data.set(idx, state.params);
    }

    /**
     * Updates the autopilot state.
     * Checks if enough time has passed to trigger the next step.
     */
    update() {
        const now = performance.now();
        this.indices.forEach(idx => {
            const state = this.states.get(idx);
            if (now >= state.nextEventTime) {
                this._step(idx);
                state.nextEventTime = now + this._randomDelay();
            }
        });

        return this.data;
    }

    /**
     * Get the current data for a specific performer index.
     * @param {number} idx
     * @returns {Object|null}
     */
    getData(idx) {
        return this.data.get(idx) || null;
    }
}
