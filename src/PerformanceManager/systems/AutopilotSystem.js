// src/PerformanceManager/systems/AutopilotSystem.js
import * as THREE from 'three';
import { CONFIG } from '../../core/Config.js';

/**
 * Controls the behavior of virtual performers (autopilot mode).
 * Simulates presence and movement for performers not controlled by a human.
 * Emits data snapshots that Performers can consume.
 */
export class AutopilotSystem {
    /**
     * Creates a new AutopilotSystem instance.
     * @param {Array<string|number>} ids - IDs of the performers this system controls.
     */
    constructor(ids) {
        this.ids = ids;

        // Map of performerID -> VirtualInputData
        this.data = new Map();

        // Internal state for each managed performer
        this.states = new Map();

        // Initialize noise offsets
        this.ids.forEach(id => {
            this.states.set(id, {
                active: true,
                nextEventTime: performance.now() + this._randomDelay(),
                offsets: {
                    roll: Math.random() * 1000,
                    pitch: Math.random() * 1000,
                    yaw: Math.random() * 1000,
                    depth: Math.random() * 1000,
                    x: Math.random() * 1000,
                    y: Math.random() * 1000,
                    width: Math.random() * 1000,
                    height: Math.random() * 1000
                },
                current: this._generateBaseParams()
            });
            this.data.set(id, this._generateBaseParams());
        });
    }

    /**
     * Generates a random delay for the next state toggle event.
     * @private
     * @returns {number} Delay in milliseconds.
     */
    _randomDelay() {
        return 10000 + Math.random() * 10000;
    }

    /**
     * Simple multi-octave sine noise function.
     * @param {number} t - Time in seconds.
     * @param {number} offset - Random offset.
     * @returns {number} Normalized noise value roughly between -1 and 1.
     */
    _noise(t, offset) {
        return Math.sin(t + offset) * 0.5 +
               Math.sin(t * 2.1 + offset + 10) * 0.25 +
               Math.sin(t * 4.3 + offset + 20) * 0.125;
    }

    /**
     * Generates a base parameter object representing an inactive performer.
     * @private
     * @returns {object} A data object with default values.
     */
    _generateBaseParams() {
        return {
            hasPerformer: false,
            roll: 0,
            pitch: 0,
            yaw: 0,
            depth: -10,
            x: 0,
            y: 0,
            triangle: {
                visible: false,
                width: 0.5,
                height: 0.5,
                area: 0
            }
        };
    }

    /**
     * Updates the movement for a single performer based on noise.
     * @param {string|number} id - Performer ID.
     * @param {number} time - Current time in seconds.
     */
    _updateMovement(id, time) {
        const state = this.states.get(id);
        const offsets = state.offsets;

        // Generate smooth noise values
        const nRoll = this._noise(time * 0.5, offsets.roll);
        const nPitch = this._noise(time * 0.3, offsets.pitch);
        const nYaw = this._noise(time * 0.4, offsets.yaw);
        const nDepth = this._noise(time * 0.2, offsets.depth);
        const nX = this._noise(time * 0.15, offsets.x);
        const nY = this._noise(time * 0.15, offsets.y);

        const nWidth = (this._noise(time * 0.6, offsets.width) + 1) / 2;
        const nHeight = (this._noise(time * 0.7, offsets.height) + 1) / 2;

        // Map noise to valid ranges
        const roll = nRoll * (Math.PI / 4);
        const pitch = nPitch * (Math.PI / 9);
        const yaw = nYaw * (Math.PI / 3);
        const depth = THREE.MathUtils.mapLinear(nDepth, -1, 1, -8, -2);

        // Position on screen (-1 to 1)
        // Spread them out a bit based on ID if possible, or just random wander
        // Let's assume purely random wander around center
        const x = nX * 0.8;
        const y = nY * 0.5;

        // Triangle Dimensions
        const width = THREE.MathUtils.mapLinear(nWidth, 0, 1, 0.3, 0.9);
        const height = THREE.MathUtils.mapLinear(nHeight, 0, 1, 0.2, 0.8);
        const area = width * height * 0.5;

        // Update the data packet
        const data = {
            hasPerformer: true,
            roll,
            pitch,
            yaw,
            depth,
            x,
            y,
            triangle: {
                visible: true,
                width,
                height,
                area
            }
        };

        this.data.set(id, data);
    }

    /**
     * Updates the activity state (presence) of performers.
     * @param {number} time - Current time in seconds.
     */
    _updateActivity(time) {
        const nowMs = time * 1000;
        let activeCount = 0;
        this.states.forEach(s => { if (s.active) activeCount++; });
        const total = this.ids.length;

        this.ids.forEach(id => {
            const state = this.states.get(id);

            if (nowMs >= state.nextEventTime) {
                let probStayActive = 0.8;
                if (activeCount === 0) probStayActive = 1.0;
                if (activeCount === total) probStayActive = 0.6;

                if (state.active) {
                    if (Math.random() > probStayActive) {
                        state.active = false;
                        this.data.set(id, this._generateBaseParams());
                    }
                } else {
                    if (Math.random() < 0.7) {
                        state.active = true;
                    }
                }
                state.nextEventTime = nowMs + this._randomDelay();
            }
        });
    }

    /**
     * Updates the autopilot system.
     * @returns {Map} The latest data map.
     */
    update() {
        const time = performance.now() * 0.001;
        this._updateActivity(time);
        this.ids.forEach(id => {
            const state = this.states.get(id);
            if (state.active) {
                this._updateMovement(id, time);
            }
        });
        return this.data;
    }

    getData(id) {
        return this.data.get(id) || null;
    }
}
