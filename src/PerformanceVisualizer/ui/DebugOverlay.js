// src/ui/DebugOverlay.js
import { CONFIG } from '../../core/Config.js';

/**
 * @class DebugOverlay
 * @description Manages the 2D debug overlay canvas.
 * It displays performance metrics, internal state, and pose skeletons when enabled.
 */
export class DebugOverlay {
    /**
     * Creates a new DebugOverlay instance.
     * @param {string} canvasId - The ID of the HTML canvas element to be used for the overlay.
     */
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`DebugOverlay: Canvas with id '${canvasId}' not found.`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.resize();

        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => {
            if (e.key === 'd' || e.key === 'D') {
                CONFIG.viewMode = (CONFIG.viewMode + 1) % 3;
                CONFIG.debug = (CONFIG.viewMode === 2);
            }
        });
    }

    /**
     * Resizes the canvas to match the current window dimensions.
     */
    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    /**
     * Draws debug information to the canvas.
     * This method is called on every frame by the `PerformanceVisualizer`.
     * @param {Array<object>} poses - The array of detected poses from the `VisionSystem`.
     * @param {import('../../PerformanceManager/state/Performer.js').Performer[]} performers - The array of performer state objects.
     */
    draw(poses, performers) {
        if (!this.ctx) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const statusEl = document.getElementById('status');
        const metricsEl = document.getElementById('metrics');

        if (!CONFIG.debug) {
            if (statusEl) statusEl.style.display = 'none';
            if (metricsEl) metricsEl.style.display = 'none';
            return;
        }

        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.innerText = performers[0].hasPerformer
                ? 'TARGET ACQUIRED  (P0: Physical)'
                : 'SCANNING SECTOR...';
        }

        if (metricsEl) {
            metricsEl.style.display = 'block';
            let text = '';
            performers.forEach((p, idx) => {
                text += `P${idx} ${p.hasPerformer ? 'ON ' : 'off'}\n`;
                text += `  depth: ${p.current.depth.toFixed(2)}  bpm: ${p.current.bpmPref.toFixed(1)}\n`;
                text += `  triA: ${p.triangle.area.toFixed(3)}  W: ${p.triangle.width.toFixed(2)}  H: ${p.triangle.height.toFixed(2)}\n`;
            });
            metricsEl.innerText = text;
        }

        // Optionally draw keypoints
        if (poses && poses.length > 0) {
             this.ctx.save();
             this.ctx.scale(1, 1);
             // Note: Mapping keypoints to screen space strictly requires knowing the video scaling,
             // but for simple debug we can assume full screen or just skip drawing dots for now.
             this.ctx.restore();
        }
    }
}
