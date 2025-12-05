import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { LatticeViewport } from './graphics/LatticeViewport.js';
import { MaskLayer } from './graphics/MaskLayer.js';
import { DynamicLayout } from './layout/DynamicLayout.js';
import { DebugOverlay } from './ui/DebugOverlay.js';

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

        // Disable autoClear to allow manual management of render passes (Mask -> Content)
        this.renderer.autoClear = false;

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

        // Initialize components
        this.maskLayer = new MaskLayer();
        this.layoutSystem = new DynamicLayout();
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
        // Clear screen before rendering (Color, Depth, Stencil)
        this.renderer.clear();

        // Calculate layout
        const layout = this.layoutSystem.calculate(width, height, performers);

        layout.forEach(item => {
            const { index, rect, corners } = item;

            // 1. Prepare Stencil Mask
            this.renderer.clearStencil(); // Clear stencil for this viewport

            this.renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
            this.renderer.setViewport(0, 0, width, height); // Viewport for mask is full screen (NDC)
            this.renderer.setScissorTest(true);

            // Update and render the mask
            this.maskLayer.update(corners, width, height);
            this.maskLayer.render(this.renderer);

            // 2. Render Content
            // Render the viewport, which will test against the stencil buffer
            this.viewports[index].render(this.renderer, rect, performers[index]);
        });

        // Disable scissor test after rendering
        this.renderer.setScissorTest(false);
    }
}
