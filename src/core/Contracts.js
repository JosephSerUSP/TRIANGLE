/**
 * @fileoverview The cross-module data contract of TRIANGLE. Plain objects only
 * (no classes, no Three.js), so frames are serializable, testable and replayable.
 *
 * Flow: RawObservation -> SomaticGesture -> EnsembleSlot (smoothed state)
 *       -> PerformanceFrame -> { PerformanceVisualizer, PerformanceListener }
 */

/**
 * @typedef {{x:number, y:number}} Vec2  Canonical coords: x,y in [-1,1], +y up, already mirrored.
 *
 * @typedef {Object} SomaticGesture  Kinematics of one body, source-agnostic.
 * @property {{roll:number, pitch:number, yaw:number}} orientation  radians
 * @property {number} depth   negative distance (closer = less negative)
 * @property {{visible:boolean, vertices:Vec2[], width:number, height:number, area:number}} triangle
 *           width = hand span / frame width (0..1); height = hand elevation (0 bottom .. 1 top).
 *
 * @typedef {Object} SlotSnapshot
 * @property {number} id
 * @property {string} role       'bass' | 'ostinato' | 'arp'
 * @property {number} colorHex
 * @property {'physical'|'virtual'} binding
 * @property {boolean} active    debounced presence flag
 * @property {number} presence   smoothed 0..1
 * @property {SomaticGesture} gesture  smoothed
 *
 * @typedef {Object} PerformanceFrame
 * @property {number} timeSec
 * @property {number} dtSec
 * @property {boolean} autopilotEnabled
 * @property {ReadonlyArray<SlotSnapshot>} slots
 * @property {{poses:Array, cameraSize:{width:number,height:number}, mirrored:boolean}} [debug]
 */

/** Neutral gesture: nobody there. */
export function createRestGesture() {
    return {
        orientation: { roll: 0, pitch: 0, yaw: 0 },
        depth: -10,
        triangle: {
            visible: false,
            vertices: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
            width: 0.5,
            height: 0.5,
            area: 0
        }
    };
}

/** Deep copy of a gesture (frames must not alias mutable slot state). */
export function cloneGesture(g) {
    return {
        orientation: { ...g.orientation },
        depth: g.depth,
        triangle: {
            ...g.triangle,
            vertices: g.triangle.vertices.map(v => ({ x: v.x, y: v.y }))
        }
    };
}
