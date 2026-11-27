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
     * @param {{random?: () => number}} [opts]  seeded PRNG for reproducible autopilot
     */
    constructor(config, vision, { random = Math.random } = {}) {
        this.config = config;
        this.vision = vision;
        this.slots = config.slots.map(def => new EnsembleSlot(def, config.smoothing));
        this.autopilotSlotIds = config.slots.filter(s => s.autopilot).map(s => s.id);
        this.autopilot = new AutopilotSystem(this.autopilotSlotIds, random);
        this.autopilotEnabled = config.defaults.autopilotEnabled;
        this._humanCount = 0;
        this._humanCountSince = 0;
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
     * How many slots humans hold. Grows at once; shrinks only after the extra
     * body has been gone for `lossGraceSec`, so a one-frame dropout does not
     * hand a slot back to autopilot and make it flicker.
     */
    _humanSlotCount(seen, timeSec) {
        const grace = this.config.smoothing.lossGraceSec;
        if (seen >= this._humanCount || timeSec - this._humanCountSince > grace) {
            if (seen !== this._humanCount) this._humanCountSince = timeSec;
            this._humanCount = seen;
        }
        if (seen >= this._humanCount) this._humanCountSince = timeSec;
        return this._humanCount;
    }

    /**
     * Slot assignment policy. Humans always come first:
     *  - Non-autopilot slots are reserved for humans.
     *  - With autopilot ON, extra humans take over autopilot slots (lowest id
     *    first); autopilot only plays the slots no human needs.
     *  - With autopilot OFF, every slot is a human slot.
     * Humans are placed left-to-right on screen. If there are more bodies than
     * slots, the closest ones win.
     */
    _assign(poses, timeSec) {
        const opts = this._extractOpts();
        let ordered = orderPoses(poses, opts);
        if (ordered.length > this.slots.length) {
            const near = p => -extractGesture(p, opts).depth; // smaller = closer
            const keep = new Set([...ordered].sort((a, b) => near(a) - near(b)).slice(0, this.slots.length));
            ordered = ordered.filter(p => keep.has(p));
        }

        const reserved = this.slots.filter(s => !this.autopilotSlotIds.includes(s.id));
        const takeable = this.slots.filter(s => this.autopilotSlotIds.includes(s.id));
        let humanSlots;
        if (this.autopilotEnabled) {
            const extra = Math.max(0, this._humanSlotCount(ordered.length, timeSec) - reserved.length);
            humanSlots = [...reserved, ...takeable.slice(0, extra)].sort((a, b) => a.id - b.id);
        } else {
            humanSlots = this.slots;
        }

        humanSlots.forEach((slot, i) => {
            slot.observe(ordered[i] ? extractGesture(ordered[i], opts) : null, 'physical');
        });

        if (this.autopilotEnabled) {
            const virtual = this.autopilot.update(timeSec);
            this.slots
                .filter(s => !humanSlots.includes(s) && virtual.has(s.id))
                .forEach(s => s.observe(virtual.get(s.id), 'virtual'));
        }
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
                cameraSize: this.vision ? this.vision.cameraSize : null,
                mirrored: this.config.vision.mirrored
            }
        };
    }
}
