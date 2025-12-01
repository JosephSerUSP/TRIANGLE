// src/App.js
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { CONFIG } from './core/Config.js';
import { PERFORMER_COLORS } from './core/Constants.js';
import { VisionSystem } from './systems/VisionSystem.js';
import { Performer } from './state/Performer.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { Autopilot } from './systems/Autopilot.js';
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
        this.vision = new VisionSystem(document.getElementById('video'));

        this.performers = [
            new Performer(PERFORMER_COLORS[0], true),
            new Performer(PERFORMER_COLORS[1], false),
            new Performer(PERFORMER_COLORS[2], false)
        ];

        this.audio = new AudioSystem();
        this.autopilot = new Autopilot(this.performers, [1, 2]);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
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
        overlay.addEventListener('click', async () => {
            await this.audio.init(this.performers.length);
            this.audio.resume();
            overlay.style.opacity = 0;
            setTimeout(() => overlay.style.display = 'none', 500);
        }, { once: true });
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
            indicesToRender = [0];
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
        // 1. Data Layer: Get raw poses
        const poses = await this.vision.update();

        // 2. Performer Logic: Interpret raw data
        // Find dominant pose (same logic as before, but kept in loop for selection)
        let dominant = null;
        let maxWidth = 0;

        if (poses && poses.length > 0) {
            for (const pose of poses) {
                const ls = pose.keypoints.find(k => k.name === 'left_shoulder');
                const rs = pose.keypoints.find(k => k.name === 'right_shoulder');
                if (ls && rs && ls.score > 0.3 && rs.score > 0.3) {
                    const w = Math.hypot(rs.x - ls.x, rs.y - ls.y);
                    if (w > maxWidth) {
                        maxWidth = w;
                        dominant = { pose, width: w, ls, rs };
                    }
                }
            }
        }

        // Update Physical Performer (P0) with raw data
        if (dominant) {
            this.performers[0].updateFromPose(dominant.pose, dominant.width, { ls: dominant.ls, rs: dominant.rs });
        } else {
            this.performers[0].updateFromPose(null, 0, null);
        }

        // Update Virtual Performers
        this.autopilot.update();

        // Physics Smoothing (Performer Internal State)
        this.performers.forEach(p => p.updatePhysics());

        // 3. Output Layers: Audio & Visuals
        if (this.audio.isReady) {
            this.audio.update(this.performers);
        }

        TWEEN.update();
        this._renderViewports();
        this.debug.draw(poses, this.performers);

        requestAnimationFrame(() => this.loop());
    }
}
