// src/ui/DebugOverlay.js
import { CONFIG } from '../../core/Config.js';

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
     * Resizes the canvas to match the window dimensions.
     */
    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    /**
     * Draws debug information to the canvas.
     * @param {Array<Object>} poses - The detected poses.
     * @param {Performer[]} performers - Array of performer states.
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
            statusEl.innerText = `ACTIVE PERFORMERS: ${performers.filter(p => p.hasPerformer).length}`;
        }

        if (metricsEl) {
            metricsEl.style.display = 'block';
            let text = '';
            performers.forEach((p, idx) => {
                text += `${p.id} ${p.hasPerformer ? 'ON ' : 'off'}\n`;
                text += `  depth: ${p.current.depth.toFixed(2)}  energy: ${p.energy.toFixed(2)}\n`;
                text += `  triA: ${p.triangle.area.toFixed(3)}  W: ${p.triangle.width.toFixed(2)}  H: ${p.triangle.height.toFixed(2)}\n`;
            });
            metricsEl.innerText = text;
        }
    }
}
