/**
 * @fileoverview Pure, library-free math helpers shared by every module.
 * No Three.js here: core/ must run in Node for `node --test`.
 */

/** Clamp `v` into [min, max]. NaN collapses to `min`. */
export function clamp(v, min, max) {
    if (Number.isNaN(v)) return min;
    return Math.min(max, Math.max(min, v));
}

/** Linear interpolation. */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Map `v` from [a1, a2] to [b1, b2] (unclamped). */
export function mapLinear(v, a1, a2, b1, b2) {
    return b1 + ((v - a1) * (b2 - b1)) / (a2 - a1);
}

/**
 * Frame-rate independent exponential smoothing.
 * `rate` is in 1/seconds: after 1/rate seconds ~63% of the gap is closed,
 * no matter how the time is split into frames.
 */
export function expSmooth(current, target, rate, dt) {
    if (!Number.isFinite(target)) return current;
    if (!Number.isFinite(current)) return target;
    return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Returns `v` if finite, otherwise `fallback`. */
export function finiteOr(v, fallback) {
    return Number.isFinite(v) ? v : fallback;
}
