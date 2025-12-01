import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { VisionSystem } from './systems/VisionSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { LatticeViewport } from './systems/LatticeViewport.js';
import { PerformerState } from './core/PerformerState.js';
import { Autopilot } from './logic/Autopilot.js';
import { DebugOverlay } from './ui/DebugOverlay.js';
import { CONFIG, PERFORMER_COLORS, BEAUTIFUL_INTERVALS } from './config.js';

/**
 * Main application class.
 * Orchestrates the Vision, Audio, and Rendering systems.
 */
export class App {
    /**
     * Creates a new App instance and initializes the scene.
     */
    constructor() {
        this.vision = new VisionSystem(document.getElementById('video'), CONFIG);

        this.performers = [
            new PerformerState(PERFORMER_COLORS[0], true, CONFIG),
            new PerformerState(PERFORMER_COLORS[1], false, CONFIG),
            new PerformerState(PERFORMER_COLORS[2], false, CONFIG)
        ];

        this.audio = new AudioSystem(CONFIG);
        this.autopilot = new Autopilot(this.performers, [1, 2], CONFIG);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        this.viewports = this.performers.map(
            p => new LatticeViewport(p.color.getHex(), CONFIG)
        );

        this.debug = new DebugOverlay('debug-layer', CONFIG);

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
     * Maps detected poses to the physical performer's state.
     * Calculates rotation, depth, and musical parameters from keypoints.
     * @private
     * @param {Array<Object>} poses - Array of detected poses from MoveNet.
     */
    _updatePhysicalFromPoses(poses) {
        const p = this.performers[0];
        const vW = CONFIG.camera.width;
        const vH = CONFIG.camera.height;

        if (!poses || poses.length === 0) {
            p.hasPerformer = false;
            p.triangle.visible = false;
            p.target.roll = 0;
            p.target.pitch = 0;
            p.target.yaw = 0;
            p.target.depth = -10;
            return;
        }

        let dominant = null;
        let maxWidth = 0;
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

        if (!dominant) {
            p.hasPerformer = false;
            p.triangle.visible = false;
            p.target.roll = 0;
            p.target.pitch = 0;
            p.target.yaw = 0;
            p.target.depth = -10;
            return;
        }

        p.hasPerformer = true;

        const { pose, width, ls, rs } = dominant;

        // Yaw from shoulder tilt
        const dy = rs.y - ls.y;
        let tiltSignal = -dy / width;
        if (!CONFIG.mirrored) tiltSignal *= -1;
        p.target.yaw = tiltSignal * CONFIG.interaction.maxYaw * 2.5;

        // Pitch from vertical position
        const cy = (ls.y + rs.y) / 2;
        let ny = (cy / vH) * 2 - 1;
        p.target.pitch = -ny * CONFIG.interaction.maxPitch;

        // Depth from torso box if hips are available, otherwise shoulder span
        const lHip = pose.keypoints.find(k => k.name === 'left_hip');
        const rHip = pose.keypoints.find(k => k.name === 'right_hip');
        let normMetric = 0;
        if (lHip && rHip && lHip.score > 0.3 && rHip.score > 0.3) {
            const mxS = (ls.x + rs.x) / 2;
            const myS = (ls.y + rs.y) / 2;
            const mxH = (lHip.x + rHip.x) / 2;
            const myH = (lHip.y + rHip.y) / 2;
            normMetric = Math.hypot(mxS - mxH, myS - myH) / vH;
        } else {
            normMetric = width / vW;
        }
        const safeMetric = Math.max(0.05, normMetric);
        p.target.depth = -(1.0 / safeMetric);

        // Wrists / triangle
        const lWrist = pose.keypoints.find(k => k.name === 'left_wrist');
        const rWrist = pose.keypoints.find(k => k.name === 'right_wrist');

        if (lWrist && rWrist && lWrist.score > 0.3 && rWrist.score > 0.3) {
            p.triangle.visible = true;

            const nx = (ls.x + rs.x) / 2;
            const nyNeck = (ls.y + rs.y) / 2;

            const mapX = (val) => (val / vW) * 2 - 1;
            const mapY = (val) => -((val / vH) * 2 - 1);

            const xMult = CONFIG.mirrored ? -1 : 1;

            p.triangle.v1.set(mapX(nx) * xMult, mapY(nyNeck), 0);
            p.triangle.v2.set(mapX(lWrist.x) * xMult, mapY(lWrist.y), 0);
            p.triangle.v3.set(mapX(rWrist.x) * xMult, mapY(rWrist.y), 0);

            const handDist = Math.hypot(lWrist.x - rWrist.x, lWrist.y - rWrist.y);
            p.triangle.width = handDist / vW;

            const avgHandY = (lWrist.y + rWrist.y) / 2;
            p.triangle.height = 1.0 - (avgHandY / vH);

            const tArea = 0.5 * Math.abs(
                lWrist.x * (rWrist.y - nyNeck) +
                rWrist.x * (nyNeck - lWrist.y) +
                nx * (lWrist.y - rWrist.y)
            );
            p.triangle.area = tArea / (vW * vH);

            const dx = lWrist.x - rWrist.x;
            const dyH = lWrist.y - rWrist.y;
            let handAngle = Math.atan2(dyH, dx);
            if (CONFIG.mirrored) handAngle *= -1;
            p.target.roll = handAngle;
        } else {
            p.triangle.visible = false;
            p.triangle.area = 0;
            p.triangle.width = 0.5;
            p.triangle.height = 0.5;
            p.target.roll = 0;
        }

        // Map triangle to BPM + interval
        const w = THREE.MathUtils.clamp(p.triangle.width, 0, 1);
        const h = THREE.MathUtils.clamp(p.triangle.height, 0, 1);

        const bpm = THREE.MathUtils.lerp(CONFIG.audio.bpmMax, CONFIG.audio.bpmMin, w);
        p.target.bpmPref = bpm;

        const idx = Math.floor(h * BEAUTIFUL_INTERVALS.length);
        const safeIdx = Math.min(BEAUTIFUL_INTERVALS.length - 1, Math.max(0, idx));
        p.noteRatio = BEAUTIFUL_INTERVALS[safeIdx];
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
        const poses = await this.vision.update();

        this._updatePhysicalFromPoses(poses);
        this.autopilot.update();

        this.performers.forEach(p => p.updatePhysics());

        if (this.audio.isReady) {
            this.audio.update(this.performers);
        }

        TWEEN.update();
        this._renderViewports();
        this.debug.draw(poses, this.performers);

        requestAnimationFrame(() => this.loop());
    }
}
