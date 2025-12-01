// src/systems/VoiceLeading.js
import { CONFIG } from '../core/Config.js';

/**
 * Manages musical note assignments for performers.
 * Ensures a "wistful" harmonic structure and re-assigns notes when performers change.
 */
export class VoiceLeading {
    constructor() {
        // D Minor / Dorian flavor
        // "Wistful" pairs
        this.chordPairs = [
            [220.00, 349.23], // A3 - F4 (Dm)
            [261.63, 329.63], // C4 - E4 (Am)
            [293.66, 440.00], // D4 - A4 (Open D)
            [349.23, 523.25], // F4 - C5 (Fmaj7)
            [392.00, 659.25], // G4 - E5 (Em/Cmaj7)
            [440.00, 587.33], // A4 - D5 (Dm)
            [523.25, 698.46], // C5 - F5 (F)
        ];

        this.assignments = new Map(); // PerformerIndex -> [freq1, freq2]
        this.pairIndices = new Map();
        this.progressionCursor = 0;
    }

    /**
     * Updates note assignments based on active performers.
     * Uses presence for stability to avoid glitches from tracking noise.
     * @param {Performer[]} performers
     * @returns {Map<number, number[]>} Map of performer index to array of frequencies.
     */
    update(performers) {
        const threshold = 0.1;

        // 1. Clean up inactive performers
        performers.forEach((p, idx) => {
            if (idx === 0) return; // Skip bass

            // We use presence to debounce leaving
            if (p.presence < threshold) {
                if (this.assignments.has(idx)) {
                    this.assignments.delete(idx);
                    this.pairIndices.delete(idx);
                }
            }
        });

        // 2. Assign to new performers
        performers.forEach((p, idx) => {
            if (idx === 0) return; // Skip bass

            // If they are present enough and don't have an assignment
            if (p.presence >= threshold && !this.assignments.has(idx)) {
                const pairIndex = this.progressionCursor % this.chordPairs.length;
                const notes = this.chordPairs[pairIndex];

                this.assignments.set(idx, notes);
                this.pairIndices.set(idx, pairIndex);

                this.progressionCursor++;
            }
        });

        return this.assignments;
    }
}
