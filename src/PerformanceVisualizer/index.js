import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { LatticeViewport } from './graphics/LatticeViewport.js';
import { DebugOverlay } from './ui/DebugOverlay.js';
import { CONFIG } from '../core/Config.js';

/**
 * Manages the visual output of the performance.
 * Responsible for:
 * 1. Rendering the 3D scene (LatticeViewports).
 * 2. Managing the layout of viewports based on performer state.
 * 3. Drawing the Debug Overlay.
 */
export class PerformanceVisualizer {
    /**
     * Creates an instance of PerformanceVisualizer.
     * @param {import('../PerformanceManager/state/Performer.js').Performer[]} initialPerformers - An array of performers used to initialize the viewports.
     */
    constructor(initialPerformers) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        const container = document.getElementById('canvas-container');
        if (container) {
            container.appendChild(this.renderer.domElement);
        }

        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Map<string, LatticeViewport>
        this.viewports = new Map();

        // Initialize viewports corresponding to initial performers
        if (initialPerformers) {
            initialPerformers.forEach(p => {
                this.viewports.set(p.id, new LatticeViewport(p.color.getHex()));
            });
        }

        this.debug = new DebugOverlay('debug-layer');
    }

    /**
     * Updates the visual output.
     * @param {Object} performanceData - { performers, poses }
     */
    update({ performers, poses }) {
        // Update Tweens
        TWEEN.update();

        // Sync Viewports with Performers
        // 1. Create new viewports
        performers.forEach(p => {
            if (!this.viewports.has(p.id)) {
                this.viewports.set(p.id, new LatticeViewport(p.color.getHex()));
            }
        });

        // 2. Remove stale viewports (if performer removed from list)
        const currentIds = new Set(performers.map(p => p.id));
        for (const [id, vp] of this.viewports) {
            if (!currentIds.has(id)) {
                // Perform cleanup on viewport if necessary (dispose geometries)
                // vp.dispose();
                this.viewports.delete(id);
            }
        }

        // Render Graphics
        this._renderViewports(performers);

        // Draw Debug Overlay
        this.debug.draw(poses, performers);
    }

    /**
     * Renders all active viewports to the screen.
     * @private
     * @param {Performer[]} performers
     */
    _renderViewports(performers) {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.renderer.setSize(width, height);
        // Clear screen before rendering (since viewports will mask themselves)
        this.renderer.clear();

        // Calculate layout
        const layout = this._calculateLayout(width, height, performers);

        layout.forEach(item => {
            const { index, rect, corners } = item;
            // Get performer by index in the array passed
            const p = performers[index];
            const vp = this.viewports.get(p.id);

            if (vp) {
                vp.render(this.renderer, rect, p, corners);
            }
        });
    }

    /**
     * Calculates the layout for viewports based on performer presence and tilt.
     * @private
     * @param {number} width
     * @param {number} height
     * @param {Performer[]} performers
     * @returns {Array}
     */
    _calculateLayout(width, height, performers) {
        // Calculate total presence to normalize widths
        const totalPresence = performers.reduce((sum, p) => sum + p.presence, 0);
        const safeTotal = Math.max(totalPresence, 0.001);

        const layout = [];

        // Calculate target widths first
        const widths = performers.map(p => (p.presence / safeTotal) * width);

        // Calculate separator angles
        const boundaries = [];

        // Left edge of screen
        boundaries.push({ x: 0, angle: 0 });

        let accumWidth = 0;
        for (let i = 0; i < performers.length - 1; i++) {
            accumWidth += widths[i];

            // Limit angle to avoid extreme skew
            let angle = performers[i].current.roll || 0;
            angle = THREE.MathUtils.clamp(angle, -0.5, 0.5);

            boundaries.push({ x: accumWidth, angle: angle });
        }

        // Right edge of screen
        boundaries.push({ x: width, angle: 0 });

        // Generate Viewport Geometries
        for (let i = 0; i < performers.length; i++) {
            if (performers[i].presence < 0.001) continue;

            const leftB = boundaries[i];
            const rightB = boundaries[i+1];

            // Left Boundary Top/Bottom X
            const h2 = height / 2;
            const l_dx = h2 * Math.tan(leftB.angle);
            const l_top = leftB.x + l_dx;
            const l_bot = leftB.x - l_dx;

            // Right Boundary Top/Bottom X
            const r_dx = h2 * Math.tan(rightB.angle);
            const r_top = rightB.x + r_dx;
            const r_bot = rightB.x - r_dx;

            // Bounding Box for Scissor
            const minX = Math.min(l_top, l_bot);
            const maxX = Math.max(r_top, r_bot);
            const w = maxX - minX;

            if (w <= 0) continue;

            layout.push({
                index: i,
                rect: {
                    x: Math.floor(Math.max(0, minX)),
                    y: 0,
                    width: Math.ceil(Math.min(width - Math.max(0, minX), w)),
                    height: height
                },
                corners: {
                    tl: l_top,
                    tr: r_top,
                    bl: l_bot,
                    br: r_bot
                }
            });
        }

        return layout;
    }
}
