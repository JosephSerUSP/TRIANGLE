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

        this.autopilot = new AutopilotSystem([1, 2]);

        // --- 3. Initialize Outputs ---
        this.audio = new AudioSystem();

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

        this.viewports = this.performers.map(
            p => new LatticeViewport(p.color.getHex())
        );

        this.debug = new DebugOverlay('debug-layer');

        this._initAudioOnInteraction();
        this._init();
    }

    /**
     * Initializes audio on the first user interaction (click, keypress, etc.).
     * @private
     */
    _initAudioOnInteraction() {
        let initialized = false;
        const startAudio = async () => {
            if (initialized) return;
            initialized = true;

            await this.audio.init(this.performers.length);
            this.audio.resume();

            window.removeEventListener('click', startAudio);
            window.removeEventListener('keydown', startAudio);
            window.removeEventListener('touchstart', startAudio);
        };

        window.addEventListener('click', startAudio);
        window.addEventListener('keydown', startAudio);
        window.addEventListener('touchstart', startAudio);
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
        // Clear screen before rendering (since viewports will mask themselves)
        this.renderer.clear();

        // Calculate layout
        const layout = this._calculateLayout(width, height);

        layout.forEach(item => {
            const { index, rect, corners } = item;
            this.viewports[index].render(this.renderer, rect, this.performers[index], corners);
        });
    }

    /**
     * Calculates the layout for viewports based on performer presence and tilt.
     * @private
     * @param {number} width - Screen width.
     * @param {number} height - Screen height.
     * @returns {Array} Array of layout objects { index, rect, corners }.
     */
    _calculateLayout(width, height) {
        // Calculate total presence to normalize widths
        const totalPresence = this.performers.reduce((sum, p) => sum + p.presence, 0);

        // If no presence, render nothing or default?
        // We probably always want at least one viewport active or fading out.
        // But logic says P0 is always present? Performer.js logic sets presence to 0 if !hasPerformer.
        // Let's ensure at least a tiny bit of total presence to avoid divide by zero, or default to P0.
        const safeTotal = Math.max(totalPresence, 0.001);

        let currentX = 0;
        const layout = [];

        // Determine separator angles
        // Separator i is between performer i-1 and i? No, Performer i is effectively Viewport i.
        // Separators are at the boundaries.
        // Let's assume left edge of screen is vertical. Right edge of screen is vertical.
        // Only internal separators are angled.
        // Separator between VP[i] and VP[i+1].

        // Calculate target widths first
        const widths = this.performers.map(p => (p.presence / safeTotal) * width);

        // Calculate separator angles (in radians, deviation from vertical)
        // We need N-1 separators for N performers.
        // Let's say Angle[i] is the angle of the line between Performer i and i+1.
        // Driven by P[i].roll? Or P[i+1].roll?
        // The prompt says "angle of the edge of the viewport responds to the Expression Triangle".
        // Let's use P[i].current.roll for the right edge of P[i].

        // Accumulate X positions
        let startX = 0;

        // We define the shape by top-x and bottom-x coordinates.
        // Center X of the column is strictly defined by the accumulated width.
        // Tilt is applied relative to that center? Or relative to the cut line?

        // Algorithm:
        // We have N performers. We need N+1 "boundary lines".
        // Line 0: x = 0 (Left of screen)
        // Line N: x = Width (Right of screen)
        // Line i (1 to N-1): x = sum(widths[0]...widths[i-1]). Angle = P[i-1].current.roll.

        const boundaries = [];

        // Left edge of screen
        boundaries.push({ x: 0, angle: 0 });

        let accumWidth = 0;
        for (let i = 0; i < this.performers.length - 1; i++) {
            accumWidth += widths[i];

            // Influence from the performer on the left?
            // "angle of the edge of the viewport responds to the Expression Triangle of the performer"
            // Let's assume the performer controls their RIGHT edge.
            // But what about the last performer? They don't have a right edge (it's the screen edge).
            // So P0 controls Line 1. P1 controls Line 2. P2 (last) controls screen edge (fixed).

            // Limit angle to avoid extreme skew
            let angle = this.performers[i].current.roll || 0;
            // Roll is usually in radians. Hand roll can be +/- PI.
            // We should clamp it for visual sanity. +/- 30 degrees (0.5 rad) is plenty.
            angle = THREE.MathUtils.clamp(angle, -0.5, 0.5);

            // If presence is 0, this boundary collapses to the previous one?
            // Actually, if width is 0, boundaries merge.

            boundaries.push({ x: accumWidth, angle: angle });
        }

        // Right edge of screen
        boundaries.push({ x: width, angle: 0 });

        // Generate Viewport Geometries
        for (let i = 0; i < this.performers.length; i++) {
            if (this.performers[i].presence < 0.001) continue;

            const leftB = boundaries[i];
            const rightB = boundaries[i+1];

            // Calculate Top/Bottom offsets based on angle
            // tan(angle) = dx / (height/2)  => dx = (height/2) * tan(angle)
            // Top X = CenterX + dx
            // Bottom X = CenterX - dx

            // Left Boundary Top/Bottom X
            const h2 = height / 2;
            const l_dx = h2 * Math.tan(leftB.angle);
            const l_top = leftB.x + l_dx;
            const l_bot = leftB.x - l_dx;

            // Right Boundary Top/Bottom X
            const r_dx = h2 * Math.tan(rightB.angle);
            const r_top = rightB.x + r_dx;
            const r_bot = rightB.x - r_dx;

            // Bounding Box for Scissor (optimization)
            const minX = Math.min(l_top, l_bot);
            const maxX = Math.max(r_top, r_bot);
            const w = maxX - minX;

            // Ensure we don't pass negative width or off-screen rects that crash Three.js
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
        if (CONFIG.enableAutopilot) {
            // Original behavior: P0 is physical (dominant), P1 & P2 are virtual
            this.performers[0].updateFromPose(poses);

            // Virtual Performers (P1, P2) look at Autopilot Data
            autoData.forEach((data, idx) => {
                 if (this.performers[idx]) {
                     this.performers[idx].updateFromVirtualData(data);
                 }
            });
        } else {
            // Manual behavior: All performers are physical if data exists
            // Sort poses by x-coordinate to consistently assign to Left, Center, Right
            // We need to ensure we have a stable sort.
            // Poses usually contain a bounding box or keypoints. MoveNet poses have keypoints.
            // We'll estimate Center X from shoulders.

            const sortedPoses = [...poses].sort((a, b) => {
                const getX = (p) => {
                    const ls = p.keypoints.find(k => k.name === 'left_shoulder');
                    const rs = p.keypoints.find(k => k.name === 'right_shoulder');
                    if (ls && rs) return (ls.x + rs.x) / 2;
                    // Fallback to first keypoint or 0
                    return p.keypoints[0] ? p.keypoints[0].x : 0;
                };
                return getX(a) - getX(b); // Ascending X (Left to Right)
            });

            // Assign sorted poses to performers [0, 1, 2]
            for (let i = 0; i < this.performers.length; i++) {
                if (i < sortedPoses.length) {
                    this.performers[i].updateFromSinglePose(sortedPoses[i]);
                } else {
                    // No pose for this performer
                    this.performers[i].updateFromSinglePose(null);
                }
            }
        }

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
