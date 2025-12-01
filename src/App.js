// src/App.js
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';

import { CONFIG } from './core/Config.js';
import { PERFORMER_COLORS } from './core/Constants.js';

import { VisionSystem } from './systems/VisionSystem.js';
import { AutopilotSystem } from './systems/AutopilotSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';

import { Performer } from './state/Performer.js';

import { LatticeViewport } from './graphics/LatticeViewport.js';
import { MaskLayer } from './graphics/MaskLayer.js';
import { DebugOverlay } from './ui/DebugOverlay.js';

/**
 * Main application class.
 * Orchestrates the Vision, Audio, and Rendering systems.
 */
export class App {
    /**
     * Creates a new App instance and initializes the scene.
     */
    constructor() {
        // --- 1. Initialize Inputs ---
        this.vision = new VisionSystem(document.getElementById('video'));

        // --- 2. Initialize Performers ---
        // P0: Physical (controls Bass)
        // P1, P2: Virtual
        this.performers = [
            new Performer(PERFORMER_COLORS[0], true, false),
            new Performer(PERFORMER_COLORS[1], false, true),
            new Performer(PERFORMER_COLORS[2], false, true)
        ];

        // Track visual weight (0..1) for animation
        this.performerWeights = [0, 0, 0];

        this.autopilot = new AutopilotSystem([1, 2]);

        // --- 3. Initialize Outputs ---
        this.audio = new AudioSystem();

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.autoClear = false; // We handle clearing manually

        const container = document.getElementById('canvas-container');
        if (container) {
            container.appendChild(this.renderer.domElement);
        }

        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        this.viewports = this.performers.map(
            p => new LatticeViewport(p.color.getHex())
        );

        this.maskLayer = new MaskLayer();

        this.debug = new DebugOverlay('debug-layer');

        this._wireAudioStartOverlay();
        this._init();
    }

    /**
     * Sets up the start overlay to initialize audio on user interaction.
     * @private
     */
    _wireAudioStartOverlay() {
        const overlay = document.getElementById('start-overlay');
        if (overlay) {
            overlay.addEventListener('click', async () => {
                await this.audio.init(this.performers.length);
                this.audio.resume();
                overlay.style.opacity = 0;
                setTimeout(() => overlay.style.display = 'none', 500);
            }, { once: true });
        }
    }

    /**
     * Initializes the vision system and starts the main loop.
     * @private
     * @async
     */
    async _init() {
        try {
            await this.vision.init();
        } catch (err) {
            console.error('Vision init failed:', err);
        }
        this.loop();
    }

    /**
     * Updates the weights of the performers for animation.
     * @private
     */
    _updateWeights() {
        const targetWeights = this.performers.map(p => p.hasPerformer ? 1.0 : 0.0);

        // Always ensure at least one placeholder if all are empty?
        // Original logic: if activeIndices is empty, render [0] as placeholder.
        // We will mimic this by forcing P0 target to 1 if all are 0.
        const allInactive = targetWeights.every(w => w === 0);
        if (allInactive) {
            targetWeights[0] = 1.0;
        }

        const lerpSpeed = 0.05;
        for (let i = 0; i < this.performerWeights.length; i++) {
            // Smoothly interpolate current weight to target
            this.performerWeights[i] += (targetWeights[i] - this.performerWeights[i]) * lerpSpeed;
            // Snap to 0 if very small
            if (this.performerWeights[i] < 0.001) this.performerWeights[i] = 0;
            // Snap to 1 if very close
            if (this.performerWeights[i] > 0.999) this.performerWeights[i] = 1;
        }
    }

    /**
     * Renders all active viewports to the screen using Stencil Buffer for masking.
     * @private
     */
    _renderViewports() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Ensure size is correct
        this.renderer.setSize(width, height);

        // Clear everything (Color, Depth, Stencil)
        this.renderer.clear(true, true, true);

        // We don't use scissor test for the main composition anymore,
        // but we might use it for optimization if needed.
        // For now, disable it to ensure full screen drawing capability for masks.
        this.renderer.setScissorTest(false);

        // Calculate total weight to normalize widths
        const totalWeight = this.performerWeights.reduce((a, b) => a + b, 0);
        if (totalWeight <= 0.001) return; // Should not happen due to fallback

        // Calculate base cuts (vertical lines)
        // If weights are w0, w1, w2...
        // Cut 0 is at 0.
        // Cut 1 is at w0/total.
        // Cut 2 is at (w0+w1)/total.
        // Cut 3 is at 1.
        let currentX = 0;
        const cuts = [0];
        for (let i = 0; i < this.performerWeights.length; i++) {
            currentX += this.performerWeights[i] / totalWeight;
            cuts.push(currentX);
        }

        // Apply angles to cuts
        // Internal cuts are 1 to N-1.
        // Angle depends on performer roll.
        // We want the cut to be angled.
        // xTop = xBase + tan(angle) * (height/2) / width (normalized)
        // xBottom = xBase - tan(angle) * (height/2) / width
        // Wait, aspect ratio matters.
        // Let's define offset as fractional width.
        const aspect = width / height;

        // Calculate Top and Bottom X coordinates for each cut line
        const cutLines = [];
        for (let i = 0; i < cuts.length; i++) {
            const base = cuts[i];
            if (i === 0 || i === cuts.length - 1) {
                // Screen edges: strictly vertical
                cutLines.push({ top: base, bottom: base });
            } else {
                // Internal cut between Performer i-1 and Performer i.
                // We said "Angle of the edge ... responds to the Expression Triangle".
                // Let's use Performer i-1's roll to influence the edge to their right.
                // Roll is in radians. Positive roll = clockwise.
                const roll = this.performers[i-1].current.roll;

                // Map roll to x-offset.
                // Max roll ~ PI/2.
                // Let's limit the skew.
                const skewStrength = 0.3; // max deviation as fraction of screen width
                const offsetX = Math.sin(roll) * skewStrength / aspect;

                cutLines.push({
                    top: base + offsetX,
                    bottom: base - offsetX
                });
            }
        }

        // Render Loop
        for (let i = 0; i < this.performers.length; i++) {
            if (this.performerWeights[i] <= 0.001) continue;

            const xTL = cutLines[i].top;
            const xBL = cutLines[i].bottom;
            const xTR = cutLines[i+1].top;
            const xBR = cutLines[i+1].bottom;

            // --- Pass 1: Draw Mask to Stencil ---
            this.renderer.state.buffers.stencil.setTest(true);
            this.renderer.state.buffers.stencil.setFunc(THREE.AlwaysStencilFunc, 1, 0xFF);
            this.renderer.state.buffers.stencil.setOp(THREE.ReplaceStencilOp, THREE.ReplaceStencilOp, THREE.ReplaceStencilOp);

            // Disable Color/Depth
            this.renderer.state.buffers.color.setMask(false);
            this.renderer.state.buffers.depth.setMask(false);

            // Render Mask
            this.maskLayer.render(this.renderer, { xTL, xBL, xTR, xBR });

            // --- Pass 2: Draw Scene masked by Stencil ---
            this.renderer.state.buffers.stencil.setFunc(THREE.EqualStencilFunc, 1, 0xFF);
            this.renderer.state.buffers.stencil.setOp(THREE.KeepStencilOp, THREE.KeepStencilOp, THREE.KeepStencilOp);

            // Enable Color/Depth
            this.renderer.state.buffers.color.setMask(true);
            this.renderer.state.buffers.depth.setMask(true);

            // Determine Viewport Rect
            // We want the content to be roughly centered in the trapezoid.
            // A simple approximation is the bounding box of the trapezoid.
            // minX = min(xTL, xBL) * width
            // maxX = max(xTR, xBR) * width
            const minXnorm = Math.min(xTL, xBL);
            const maxXnorm = Math.max(xTR, xBR);

            // Clamp to screen
            const x = Math.floor(Math.max(0, minXnorm) * width);
            const w = Math.ceil(Math.min(1, maxXnorm) * width) - x;

            if (w > 0) {
                const rect = { x, y: 0, width: w, height };

                // We must use setViewport so projection matrix is correct for this strip
                this.renderer.setViewport(x, 0, w, height);
                // We rely on Stencil for clipping, so no Scissor needed
                // But we must clear depth buffer for this layer so it draws over anything properly?
                // Actually, since we draw distinct regions (mostly), we share the depth buffer.
                // But viewports shouldn't occlusion-cull each other.
                // However, since we mask them, pixels from Viewport A won't be drawn in Mask B area.
                // So single Depth Buffer is fine.
                // Wait, if we share the depth buffer, we must ensure we clear depth *inside the mask*
                // OR we clear depth before each viewport render.
                // Memory says: "renderer.clearDepth() is called between viewport layers".
                this.renderer.clearDepth();

                this.viewports[i].render(this.renderer, rect, this.performers[i]);
            }

            // Cleanup Stencil for next pass
            // We need to clear the stencil buffer to 0 where we just drew, OR just clear the whole thing.
            // Clearing whole stencil is easiest.
            this.renderer.clearStencil();
        }

        // Restore state
        this.renderer.state.buffers.stencil.setTest(false);
    }

    /**
     * The main game loop.
     * Follows the strictly decoupled flow:
     * INPUT (Vision, Autopilot) -> STATE (Performers) -> OUTPUT (Audio, Graphics)
     * @async
     */
    async loop() {
        // --- 1. Gather Input Data ---
        const poses = await this.vision.update();
        const autoData = this.autopilot.update();

        // --- 2. Update Performer State ---
        // Physical Performer (P0) looks at Vision Data
        this.performers[0].updateFromPose(poses);

        // Virtual Performers (P1, P2) look at Autopilot Data
        // autoData is a Map<index, data>
        autoData.forEach((data, idx) => {
             if (this.performers[idx]) {
                 this.performers[idx].updateFromVirtualData(data);
             }
        });

        // Update Physics (Smoothing)
        this.performers.forEach(p => p.updatePhysics());

        // Update Layout Weights
        this._updateWeights();

        // --- 3. Update Outputs ---
        // Audio looks at Performers
        if (this.audio.isReady) {
            this.audio.update(this.performers);
        }

        // Graphics look at Performers
        TWEEN.update();
        this._renderViewports();

        // Debug UI looks at both (for verification)
        this.debug.draw(poses, this.performers);

        requestAnimationFrame(() => this.loop());
    }
}
