// src/systems/AutopilotSystem.js
import * as THREE from 'three';
import { CONFIG } from '../../core/Config.js';
import { BEAUTIFUL_INTERVALS } from '../../core/Constants.js';

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

        // Initialize noise offsets so performers don't move identically
        this.indices.forEach(idx => {
            this.states.set(idx, {
                active: true, // Start active for immediate movement
                nextEventTime: performance.now() + this._randomDelay(),
                // Unique offsets for noise functions
                offsets: {
                    roll: Math.random() * 1000,
                    pitch: Math.random() * 1000,
                    yaw: Math.random() * 1000,
                    depth: Math.random() * 1000,
                    width: Math.random() * 1000,
                    height: Math.random() * 1000
                },
                // Current smooth values
                current: this._generateBaseParams()
            });
            this.data.set(idx, this._generateBaseParams());
        });
    }

    /**
     * Generates a random delay for the next state toggle event.
     * @private
     * @returns {number} Delay in milliseconds.
     */
    _randomDelay() {
        // Toggle state less frequently, stay in state for 10-20 seconds
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
     * Generates a base parameter object.
     * @returns {Object}
     */
    _generateBaseParams() {
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

    /**
     * Updates the movement for a single performer based on noise.
     * @param {number} idx - Performer index.
     * @param {number} time - Current time in seconds.
     */
    _updateMovement(idx, time) {
        const state = this.states.get(idx);
        const offsets = state.offsets;

        // Generate smooth noise values
        const nRoll = this._noise(time * 0.5, offsets.roll);   // Slow sway
        const nPitch = this._noise(time * 0.3, offsets.pitch); // Slow nod
        const nYaw = this._noise(time * 0.4, offsets.yaw);     // Slow turn
        const nDepth = this._noise(time * 0.2, offsets.depth); // Slow approach/retreat

        const nWidth = (this._noise(time * 0.6, offsets.width) + 1) / 2; // 0 to 1
        const nHeight = (this._noise(time * 0.7, offsets.height) + 1) / 2; // 0 to 1

        // Map noise to valid ranges
        // Roll: +/- 45 degrees
        const roll = nRoll * (Math.PI / 4);

        // Pitch: +/- 20 degrees
        const pitch = nPitch * (Math.PI / 9);

        // Yaw: +/- 60 degrees
        const yaw = nYaw * (Math.PI / 3);

        // Depth: -8 to -2
        const depth = THREE.MathUtils.mapLinear(nDepth, -1, 1, -8, -2);

        // Triangle Dimensions (Hand positions)
        const width = THREE.MathUtils.mapLinear(nWidth, 0, 1, 0.3, 0.9); // Hands not touching but not too wide
        const height = THREE.MathUtils.mapLinear(nHeight, 0, 1, 0.2, 0.8); // Vertical range
        const area = width * height * 0.5; // Approx area

        // Map width/height to music params
        const bpmPref = THREE.MathUtils.lerp(CONFIG.audio.bpmMax, CONFIG.audio.bpmMin, width);

        // Quantize height to intervals
        const noteIdx = Math.floor(height * BEAUTIFUL_INTERVALS.length);
        const safeIdx = Math.min(BEAUTIFUL_INTERVALS.length - 1, Math.max(0, noteIdx));
        const noteRatio = BEAUTIFUL_INTERVALS[safeIdx];

        // Update the data packet
        const data = {
            hasPerformer: true,
            roll,
            pitch,
            yaw,
            depth,
            bpmPref,
            noteRatio,
            triangle: {
                visible: true,
                width,
                height,
                area
            }
        };

        this.data.set(idx, data);
    }

    /**
     * Updates the activity state (presence) of performers.
     * @param {number} time - Current time in seconds.
     */
    _updateActivity(time) {
        const nowMs = time * 1000;

        // Count active performers
        let activeCount = 0;
        this.states.forEach(s => { if (s.active) activeCount++; });
        const total = this.indices.length;

        this.indices.forEach(idx => {
            const state = this.states.get(idx);

            if (nowMs >= state.nextEventTime) {
                // Time to toggle or refresh state

                // Bias towards staying active if few are active
                let probStayActive = 0.8;
                if (activeCount === 0) probStayActive = 1.0; // Force at least one to wake up if all asleep?
                if (activeCount === total) probStayActive = 0.6; // Maybe let one sleep

                if (state.active) {
                    if (Math.random() > probStayActive) {
                        state.active = false;
                        // When going inactive, send one "off" packet
                        this.data.set(idx, this._generateBaseParams());
                    }
                } else {
                    // If inactive, high chance to wake up
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
     * Called every frame.
     * @returns {Map} The latest data map.
     */
    update() {
        const time = performance.now() * 0.001; // seconds

        // 1. Check if we need to wake up or put to sleep performers
        this._updateActivity(time);

        // 2. For every active performer, calculate new smooth movement
        this.indices.forEach(idx => {
            const state = this.states.get(idx);
            if (state.active) {
                this._updateMovement(idx, time);
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
