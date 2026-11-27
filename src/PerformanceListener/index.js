/**
 * @fileoverview PerformanceListener: pure sonic projection of PerformanceFrame.
 * Audio starts only via an explicit unlock() from App (browser gesture rule).
 */
import { AudioSystem } from './audio/AudioSystem.js';
import { tiltOffset, harmonyStep } from './audio/Arrangement.js';

export class PerformanceListener {
    /** @param {Object} config CONFIG */
    constructor(config) {
        this.config = config;
        this.audio = new AudioSystem(config.audio);
        this.mappingMode = config.defaults.mappingMode;
        this._unlocking = null;
    }

    /** Idempotent; call from a user gesture. */
    unlock() {
        if (!this._unlocking) {
            this._unlocking = (async () => {
                await this.audio.init(this.config.slots.map(s => s.role));
                this.audio.mappingMode = this.mappingMode;
                this.audio.resume();
            })();
        }
        return this._unlocking;
    }

    setMappingMode(mode) {
        this.mappingMode = mode;
        this.audio.mappingMode = mode;
    }

    /** Read-only snapshot for the HUD (null until audio is unlocked). */
    getStatus() {
        const a = this.audio;
        if (!a.isReady) return null;
        return {
            tempo: a.tempo,
            bar: a.bar,
            channels: a.channels.map(c => c.status),
            /** Chord tones each voice is lifted by hand height (harmony/sculpt). */
            lifts: a.controls.map(c => (c ? harmonyStep(c, this.config.audio) : 0)),
            walks: a.controls.map(c => (c ? tiltOffset(c) : 0))
        };
    }

    /** @param {import('../core/Contracts.js').PerformanceFrame} frame */
    update(frame) {
        if (this.audio.isReady) this.audio.update(frame);
    }
}
