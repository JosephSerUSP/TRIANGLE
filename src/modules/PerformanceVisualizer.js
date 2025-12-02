import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { LatticeViewport } from '../graphics/LatticeViewport.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
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
     * @param {Performer[]} initialPerformers - Used to initialize viewports with correct colors.
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

        // Initialize viewports corresponding to performers
        this.viewports = initialPerformers.map(
            p => new LatticeViewport(p.color.getHex())
        );

        this.debug = new DebugOverlay('debug-layer');
    }

    /**
     * Updates the visual output.
     * @param {Object} performanceData - { performers, poses }
     */
    update({ performers, poses }) {
        // Update Tweens
        TWEEN.update();

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
            this.viewports[index].render(this.renderer, rect, performers[index], corners);
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
        // Line i (1 to N-1): x = sum(widths[0]...widths[i-1]). Angle = P[i-1].current.roll.

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
