/**
 * @fileoverview Record and replay RawObservations (MoveNet poses), so the whole
 * pipeline can run without a camera: for debugging, demos, and agents whose
 * browser cannot open a webcam.
 *
 * Recording format (JSON):
 *   { _doc, version: 1, cameraSize: {width,height},
 *     frames: [ { t: seconds, poses: [ { keypoints: [{name,x,y,score}] } ] } ] }
 *
 * Use: press R to start/stop recording (downloads a .json), or open
 * `index.html?replay=recordings/<file>.json` to replay one in a loop.
 */

const round = (v, d) => Math.round(v * d) / d;

/** Trims a MoveNet pose to what PoseExtractor needs. */
function slimPose(p) {
    return {
        keypoints: p.keypoints.map(k => ({
            name: k.name, x: round(k.x, 10), y: round(k.y, 10), score: round(k.score, 100)
        }))
    };
}

export class PoseRecorder {
    constructor() {
        this.recording = false;
        this.frames = [];
        this._t0 = 0;
        this._lastPoses = null;
        this.cameraSize = null;
    }

    start(timeSec, cameraSize) {
        this.recording = true;
        this.frames = [];
        this._t0 = timeSec;
        this._lastPoses = null;
        this.cameraSize = { ...cameraSize };
    }

    /** Stores a frame only when the poses array changed (vision runs slower than render). */
    capture(timeSec, poses) {
        if (!this.recording || poses === this._lastPoses) return;
        this._lastPoses = poses;
        this.frames.push({ t: round(timeSec - this._t0, 1000), poses: (poses || []).map(slimPose) });
    }

    /** @returns {Object} the recording */
    stop() {
        this.recording = false;
        return {
            _doc: 'TRIANGLE pose recording. Replay with index.html?replay=<path>. See src/PerformanceManager/systems/PoseRecording.js.',
            version: 1,
            cameraSize: this.cameraSize,
            frames: this.frames
        };
    }
}

/** Index of the frame active at time `t` (binary search; frames sorted by t). */
export function frameIndexAt(frames, t) {
    let lo = 0, hi = frames.length - 1;
    if (hi < 0 || t < frames[0].t) return -1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (frames[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
}

/**
 * Drop-in replacement for VisionSystem: same `latestPoses` / `cameraSize` /
 * `isReady` / `init()` / `start()` surface, fed from a recording.
 */
export class ReplayVision {
    /**
     * @param {Object|string} recordingOrUrl  recording object, or URL to fetch it from
     * @param {() => number} [nowSec]
     */
    constructor(recordingOrUrl, nowSec = () => performance.now() / 1000) {
        this.source = recordingOrUrl;
        this.nowSec = nowSec;
        this.isReady = false;
        this.cameraSize = { width: 640, height: 480 };
        this._frames = [];
        this._t0 = 0;
        this._duration = 0;
    }

    async init() {
        const rec = typeof this.source === 'string'
            ? await (await fetch(this.source)).json()
            : this.source;
        this._frames = rec.frames || [];
        this.cameraSize = rec.cameraSize || this.cameraSize;
        this._duration = this._frames.length ? this._frames[this._frames.length - 1].t + 0.05 : 0;
        this.isReady = true;
    }

    start() { this._t0 = this.nowSec(); }
    stop() {}

    /** Poses for the current time, looping over the recording. */
    get latestPoses() {
        if (!this.isReady || this._duration <= 0) return [];
        const t = (this.nowSec() - this._t0) % this._duration;
        const i = frameIndexAt(this._frames, t);
        return i < 0 ? [] : this._frames[i].poses;
    }
}
