/**
 * @fileoverview Procedural virtual performers. Emits a SomaticGesture (or null
 * when that virtual performer is "asleep") per controlled slot. Pure JS; time
 * is passed in so it is testable.
 */
import { createRestGesture } from '../../core/Contracts.js';
import { mapLinear } from '../../core/MathUtils.js';

export class AutopilotSystem {
    /**
     * @param {number[]} slotIds  slots this system drives
     * @param {() => number} [random]
     */
    constructor(slotIds, random = Math.random) {
        this.slotIds = slotIds;
        this.random = random;
        this.states = new Map();
        slotIds.forEach(id => {
            const o = () => random() * 1000;
            this.states.set(id, {
                active: true,
                nextEventSec: null,
                offsets: { roll: o(), pitch: o(), yaw: o(), depth: o(), width: o(), height: o() }
            });
        });
    }

    _randomDelaySec() { return 10 + this.random() * 10; }

    _noise(t, offset) {
        return Math.sin(t + offset) * 0.5 +
               Math.sin(t * 2.1 + offset + 10) * 0.25 +
               Math.sin(t * 4.3 + offset + 20) * 0.125;
    }

    _gesture(id, t) {
        const o = this.states.get(id).offsets;
        const g = createRestGesture();
        g.orientation.roll = this._noise(t * 0.5, o.roll) * (Math.PI / 4);
        g.orientation.pitch = this._noise(t * 0.3, o.pitch) * (Math.PI / 9);
        g.orientation.yaw = this._noise(t * 0.4, o.yaw) * (Math.PI / 3);
        g.depth = mapLinear(this._noise(t * 0.2, o.depth), -1, 1, -8, -2);

        const width = mapLinear((this._noise(t * 0.6, o.width) + 1) / 2, 0, 1, 0.3, 0.9);
        const height = mapLinear((this._noise(t * 0.7, o.height) + 1) / 2, 0, 1, 0.2, 0.8);
        // Same canonical convention as PoseExtractor: neck above, wrists at ±width, y = height*2-1.
        const handY = height * 2 - 1;
        Object.assign(g.triangle, {
            visible: true,
            width,
            height,
            area: width * height * 0.5,
            vertices: [{ x: 0, y: 0.3 }, { x: -width, y: handY }, { x: width, y: handY }]
        });
        return g;
    }

    _updateActivity(t) {
        let activeCount = 0;
        this.states.forEach(s => { if (s.active) activeCount++; });
        const total = this.slotIds.length;
        this.states.forEach(s => {
            if (s.nextEventSec === null) s.nextEventSec = t + this._randomDelaySec();
            if (t < s.nextEventSec) return;
            let stay = 0.8;
            if (activeCount === 0) stay = 1.0;
            if (activeCount === total) stay = 0.6;
            if (s.active) { if (this.random() > stay) s.active = false; }
            else if (this.random() < 0.7) s.active = true;
            s.nextEventSec = t + this._randomDelaySec();
        });
    }

    /**
     * @param {number} timeSec
     * @returns {Map<number, import('../../core/Contracts.js').SomaticGesture|null>}
     */
    update(timeSec) {
        this._updateActivity(timeSec);
        const out = new Map();
        this.slotIds.forEach(id => {
            out.set(id, this.states.get(id).active ? this._gesture(id, timeSec) : null);
        });
        return out;
    }
}
