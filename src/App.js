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
        // --- 1. DATA/INPUT LAYER ---
        this.vision = new VisionSystem(document.getElementById('video'));
        // Autopilot controls performers 1 and 2
        this.autopilot = new AutopilotSystem([1, 2]);

        // --- 2. PERFORMER LAYER ---
        this.performers = [
            new Performer(PERFORMER_COLORS[0], true),  // Performer 0: Physical (Bass)
            new Performer(PERFORMER_COLORS[1], false), // Performer 1: Virtual A
            new Performer(PERFORMER_COLORS[2], false)  // Performer 2: Virtual B
        ];

        // --- 3. OUTPUT LAYER ---
        this.audio = new AudioSystem();

        // Graphics Setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        const container = document.getElementById('canvas-container');
        if (container) {
             container.appendChild(this.renderer.domElement);
        } else {
            console.error("Canvas container not found!");
        }

        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Viewports "look at" specific performers
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
     * Renders all active viewports to the screen.
     * Divides the screen into vertical strips for each performer.
     * @private
     */
    _renderViewports() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.renderer.setSize(width, height);
        this.renderer.setScissorTest(true);

        const activeIndices = this.performers
            .map((p, idx) => ({ p, idx }))
            .filter(o => o.p.hasPerformer);

        let indicesToRender;
        if (activeIndices.length === 0) {
            indicesToRender = [0]; // Default to first viewport if no one active
        } else {
            indicesToRender = activeIndices.map(o => o.idx);
        }

        const count = indicesToRender.length;
        const viewportWidth = width / count;

        indicesToRender.forEach((idx, order) => {
            const rect = {
                x: order * viewportWidth,
                y: 0,
                width: viewportWidth,
                height
            };
            this.viewports[idx].render(this.renderer, rect, this.performers[idx]);
        });
    }

    /**
     * The main game loop.
     * Updates vision, physics, audio, and renders the scene.
     * Requests the next animation frame.
     * @async
     */
    async loop() {
        // --- 1. GATHER DATA ---
        const visionData = await this.vision.update(); // Returns Pose[]
        const virtualData = this.autopilot.update();   // Returns { 1: data, 2: data }

        // --- 2. UPDATE PERFORMERS ---

        // Performer 0 "looks at" Vision Data
        this.performers[0].updateFromInput(visionData);

        // Performer 1 & 2 "look at" Virtual Data
        this.performers[1].updateFromInput(virtualData[1]);
        this.performers[2].updateFromInput(virtualData[2]);

        // Run internal physics/smoothing
        this.performers.forEach(p => p.updatePhysics());

        // --- 3. OUTPUT ---

        // Audio "looks at" Performers
        if (this.audio.isReady) {
            this.audio.update(this.performers);
        }

        // Graphics "look at" Performers
        TWEEN.update();
        this._renderViewports();

        // UI
        this.debug.draw(visionData, this.performers);

        requestAnimationFrame(() => this.loop());
    }
}
