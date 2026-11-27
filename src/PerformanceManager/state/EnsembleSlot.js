/**
 * @fileoverview One stage channel: identity + control binding + debounced
 * presence + dt-smoothed SomaticGesture. No Three.js, no DOM, no audio.
 */
import { createRestGesture, cloneGesture } from '../../core/Contracts.js';
import { expSmooth } from '../../core/MathUtils.js';

export class EnsembleSlot {
    /**
     * @param {{id:number, role:string, colorHex:number}} def  from CONFIG.slots
     * @param {Object} smoothing  CONFIG.smoothing
     */
    constructor(def, smoothing) {
        this.id = def.id;
        this.role = def.role;
        this.colorHex = def.colorHex;
        this.smoothing = smoothing;
        /** @type {'physical'|'virtual'} */
        this.binding = 'physical';

        this.active = false;
        this.presence = 0;
        this.current = createRestGesture();
        this.target = createRestGesture();

        this._seen = false;
        this._seenFor = 0;   // seconds the source has been continuously present
        this._lostFor = 0;   // seconds the source has been continuously absent
    }

    /**
     * Feed this tick's raw gesture (null = nobody this tick).
     * @param {import('../../core/Contracts.js').SomaticGesture|null} gesture
     * @param {'physical'|'virtual'} binding
     */
    observe(gesture, binding) {
        this.binding = binding;
        this._seen = !!gesture;
        if (gesture) this.target = gesture;
    }

    /** Advance smoothing and hysteresis by `dt` seconds. */
    update(dt) {
        const s = this.smoothing;
        if (this._seen) { this._seenFor += dt; this._lostFor = 0; }
        else { this._lostFor += dt; this._seenFor = 0; }

        if (!this.active && this._seen && this._seenFor >= s.acquireSec) this.active = true;
        if (this.active && !this._seen && this._lostFor >= s.lossGraceSec) {
            this.active = false;
            this.target = createRestGesture();
        }

        const c = this.current, t = this.target;
        for (const k of ['roll', 'pitch', 'yaw']) {
            c.orientation[k] = expSmooth(c.orientation[k], t.orientation[k], s.orientationRate, dt);
        }
        c.depth = expSmooth(c.depth, t.depth, s.depthRate, dt);

        // Triangle: snap visibility (and vertices on first appearance), smooth the rest.
        const wasVisible = c.triangle.visible;
        c.triangle.visible = this.active && t.triangle.visible;
        for (const k of ['width', 'height', 'area']) {
            c.triangle[k] = expSmooth(c.triangle[k], t.triangle[k], s.triangleRate, dt);
        }
        c.triangle.vertices = t.triangle.vertices.map((v, i) => {
            const cv = c.triangle.vertices[i];
            if (!wasVisible) return { x: v.x, y: v.y };
            return {
                x: expSmooth(cv.x, v.x, s.triangleRate, dt),
                y: expSmooth(cv.y, v.y, s.triangleRate, dt)
            };
        });

        const p = this.active ? 1 : 0;
        this.presence = expSmooth(this.presence, p, s.presenceRate, dt);
        if (Math.abs(this.presence - p) < 1e-3) this.presence = p;
    }

    /** @returns {import('../../core/Contracts.js').SlotSnapshot} */
    snapshot() {
        return {
            id: this.id,
            role: this.role,
            colorHex: this.colorHex,
            binding: this.binding,
            active: this.active,
            presence: this.presence,
            gesture: cloneGesture(this.current)
        };
    }
}
