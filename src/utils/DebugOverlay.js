import { CONFIG } from '../config.js';

// ============================================================================
// DEBUG OVERLAY (Press "D" to toggle)
// ============================================================================
/**
 * Manages the debug overlay canvas.
 * Displays performance metrics and internal state when enabled.
 */
export class DebugOverlay {
    /**
     * Creates a new DebugOverlay instance.
     * @param {string} canvasId - The ID of the canvas element.
     */
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.resize();

        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => {
            if (e.key === 'd' || e.key === 'D') {
                CONFIG.debug = !CONFIG.debug;
            }
        });
    }

    /**
     * Resizes the canvas to match the window dimensions.
     */
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    /**
     * Draws debug information to the canvas.
     * @param {Array<Object>} poses - The detected poses.
     * @param {PerformerState[]} performers - Array of performer states.
     */
    draw(poses, performers) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const statusEl = document.getElementById('status');
        const metricsEl = document.getElementById('metrics');

        if (!CONFIG.debug) {
            statusEl.style.display = 'none';
            metricsEl.style.display = 'none';
            return;
        }

        statusEl.style.display = 'block';
        metricsEl.style.display = 'block';

        statusEl.innerText = performers[0].hasPerformer
            ? 'TARGET ACQUIRED  (P0: Physical)'
            : 'SCANNING SECTOR...';

        let text = '';
        performers.forEach((p, idx) => {
            text += `P${idx} ${p.hasPerformer ? 'ON ' : 'off'}\n`;
            text += `  depth: ${p.current.depth.toFixed(2)}  bpm: ${p.current.bpmPref.toFixed(1)}\n`;
            text += `  triA: ${p.triangle.area.toFixed(3)}  W: ${p.triangle.width.toFixed(2)}  H: ${p.triangle.height.toFixed(2)}\n`;
        });
        metricsEl.innerText = text;
    }
}
