/**
 * @fileoverview PerformanceManager: turns raw observations (camera poses,
 * autopilot) into one PerformanceFrame per tick. Owns slot assignment and
 * smoothing; knows nothing about rendering or audio.
 */
import { EnsembleSlot } from './state/EnsembleSlot.js';
import { AutopilotSystem } from './systems/AutopilotSystem.js';
import { extractGesture, orderPoses } from './gesture/PoseExtractor.js';

export class PerformanceManager {
    /**
     * @param {Object} config  CONFIG
     * @param {{latestPoses:Array, cameraSize:{width:number,height:number}}|null} vision
     *        anything exposing the latest poses (VisionSystem, or a fake in tests)
     */
    constructor(config, vision) {
        this.config = config;
        this.vision = vision;
        this.slots = config.slots.map(def => new EnsembleSlot(def, config.smoothing));
        this.autopilotSlotIds = config.slots.filter(s => s.autopilot).map(s => s.id);
        this.autopilot = new AutopilotSystem(this.autopilotSlotIds);
        this.autopilotEnabled = config.defaults.autopilotEnabled;
    }

    setAutopilot(enabled) { this.autopilotEnabled = !!enabled; }

    _extractOpts() {
        const size = this.vision ? this.vision.cameraSize : { width: 640, height: 480 };
        const v = this.config.vision;
        return {
            width: size.width,
            height: size.height,
            mirrored: v.mirrored,
            minKeypointScore: v.minKeypointScore,
            maxPitch: this.config.interaction.maxPitch,
            maxYaw: this.config.interaction.maxYaw
        };
    }

    /**
     * Slot assignment policy.
     *  autopilot ON : non-autopilot slots take camera poses (biggest-first
     *                 for one slot, left-to-right otherwise); autopilot slots are virtual.
     *  autopilot OFF: every slot takes a camera pose, left-to-right on screen.
     */
    _assign(poses, timeSec) {
        const opts = this._extractOpts();
        const ordered = orderPoses(poses, opts);
        const virtual = this.autopilotEnabled ? this.autopilot.update(timeSec) : null;
        const physicalSlots = this.slots.filter(s => !(virtual && virtual.has(s.id)));

        let physicalPoses = ordered;
        if (virtual && physicalSlots.length < ordered.length) {
            // Keep the closest (largest) bodies, then restore screen order.
            const size = p => {
                const g = extractGesture(p, opts);
                return g ? -g.depth : 0;
            };
            const keep = new Set([...ordered].sort((a, b) => size(a) - size(b)).slice(0, physicalSlots.length));
            physicalPoses = ordered.filter(p => keep.has(p));
        }

        physicalSlots.forEach((slot, i) => {
            slot.observe(physicalPoses[i] ? extractGesture(physicalPoses[i], opts) : null, 'physical');
        });
        if (virtual) virtual.forEach((g, id) => this.slots.find(s => s.id === id).observe(g, 'virtual'));
    }

    /**
     * @param {number} timeSec
     * @param {number} dtSec
     * @returns {import('../core/Contracts.js').PerformanceFrame}
     */
    tick(timeSec, dtSec) {
        const poses = this.vision ? this.vision.latestPoses : [];
        this._assign(poses, timeSec);
        this.slots.forEach(s => s.update(dtSec));
        return {
            timeSec,
            dtSec,
            autopilotEnabled: this.autopilotEnabled,
            slots: this.slots.map(s => s.snapshot()),
            debug: {
                poses,
                cameraSize: this.vision ? this.vision.cameraSize : null
            }
        };
    }
}
