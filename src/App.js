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

        // Track layout state for animations
        this.layoutStates = this.performers.map(() => ({
            centerNDC: 0,
            widthNDC: 0, // Starts closed
            opacity: 0,
            angle: 0
        }));

        this.autopilot = new AutopilotSystem([1, 2]);

        // --- 3. Initialize Outputs ---
        this.audio = new AudioSystem();

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.autoClear = false; // Important for compositing viewports

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
     * Updates and renders the viewports with smooth transitions.
     * @private
     */
    _renderViewports() {
        // 1. Determine active performers
        const activeIndices = [];
        this.performers.forEach((p, idx) => {
            if (p.hasPerformer) activeIndices.push(idx);
        });

        // If no one is active, maybe show P0 as default (or none)?
        // Original logic showed P0 if empty. Let's stick to that for "base state".
        if (activeIndices.length === 0) {
            activeIndices.push(0);
        }

        const count = activeIndices.length;
        const widthNDC = 2.0 / count; // Total width in NDC is 2.0 (-1 to 1)

        // 2. Update Layout Targets & Tween
        this.performers.forEach((p, idx) => {
            const state = this.layoutStates[idx];
            const isActive = activeIndices.includes(idx);

            // Calculate target geometric properties
            let targetCenterNDC = 0;
            let targetWidthNDC = 0;
            let targetOpacity = 0;

            if (isActive) {
                const order = activeIndices.indexOf(idx);
                // Map order (0..count-1) to NDC center
                // Start X = -1. Step = 2/count. Center = Start + Step/2 + order*Step
                // Center = -1 + (1/count) + order * (2/count)
                //        = -1 + (2*order + 1)/count
                targetCenterNDC = -1.0 + (2.0 * order + 1.0) / count;
                targetWidthNDC = widthNDC; // Slight overlap? maybe not needed with masking
                targetOpacity = 1.0;
            } else {
                // If inactive, shrink to current center (or stay there and fade out)
                targetCenterNDC = state.centerNDC;
                targetWidthNDC = 0.0;
                targetOpacity = 0.0;
            }

            // "Angle of the edge of the viewport responds to the Expression Triangle"
            // Use performer's roll.
            // We animate this too, but maybe directly from performer state is fine.
            // But let's smooth it here or use smoothed performer value.
            // Performer.current.roll is already smoothed.
            const targetAngle = p.current.roll; // Use roll for the mask angle

            // Tweening logic
            // Simple lerp for frame-by-frame smoothness
            const smoothing = 0.1;
            state.centerNDC += (targetCenterNDC - state.centerNDC) * smoothing;
            state.widthNDC += (targetWidthNDC - state.widthNDC) * smoothing;
            state.opacity += (targetOpacity - state.opacity) * smoothing;
            state.angle = targetAngle; // Direct update or smoothed? Performer state is smoothed.
        });

        // 3. Render
        this.renderer.clear(); // Clear once

        // Disable Scissor Test because we use full-screen compositing with shaders
        this.renderer.setScissorTest(false);

        this.viewports.forEach((vp, idx) => {
            const state = this.layoutStates[idx];
            // Only render if visible (optimization)
            if (state.opacity > 0.001 && state.widthNDC > 0.001) {
                // Clear depth buffer between layers to ensure each viewport draws on top of previous ones
                // (or rather, they layer cleanly without Z-fighting)
                this.renderer.clearDepth();
                vp.render(this.renderer, this.performers[idx], state);
            }
        });
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
