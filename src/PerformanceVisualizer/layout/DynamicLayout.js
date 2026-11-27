/**
 * @fileoverview Pure viewport polygon solver (no Three.js): splits the screen
 * among present slots, with angled dividers following the left slot's roll.
 */
import { clamp } from '../../core/MathUtils.js';

export class DynamicLayout {
    /** @param {{activeThreshold:number, maxDividerAngle:number}} layoutConfig */
    constructor(layoutConfig) {
        this.config = layoutConfig;
    }

    /**
     * @param {number} width
     * @param {number} height
     * @param {ReadonlyArray<import('../../core/Contracts.js').SlotSnapshot>} slots
     * @returns {Array<{index:number, rect:Object, corners:{tl,tr,bl,br}}>}
     */
    calculate(width, height, slots) {
        const items = slots
            .map((slot, index) => ({ slot, index }))
            .filter(it => it.slot.presence > this.config.activeThreshold);
        if (items.length === 0) return [];

        const total = Math.max(items.reduce((s, it) => s + it.slot.presence, 0), 0.001);
        const widths = items.map(it => (it.slot.presence / total) * width);

        const boundaries = [{ x: 0, angle: 0 }];
        let acc = 0;
        for (let i = 0; i < items.length - 1; i++) {
            acc += widths[i];
            const L = items[i].slot, R = items[i + 1].slot;
            const max = this.config.maxDividerAngle;
            // Divider straightens as either neighbour fades out.
            const angle = clamp(L.gesture.orientation.roll || 0, -max, max) * Math.min(L.presence, R.presence);
            boundaries.push({ x: acc, angle });
        }
        boundaries.push({ x: width, angle: 0 });

        const h2 = height / 2;
        const out = [];
        items.forEach((it, i) => {
            const lB = boundaries[i], rB = boundaries[i + 1];
            const ldx = h2 * Math.tan(lB.angle), rdx = h2 * Math.tan(rB.angle);
            const tl = lB.x + ldx, bl = lB.x - ldx, tr = rB.x + rdx, br = rB.x - rdx;
            const minX = Math.min(tl, bl), maxX = Math.max(tr, br);
            const w = maxX - minX;
            if (w <= 0) return;
            const x = Math.floor(Math.max(0, minX));
            out.push({
                index: it.index,
                rect: { x, y: 0, width: Math.ceil(Math.min(width - x, w)), height },
                corners: { tl, tr, bl, br }
            });
        });
        return out;
    }
}
