/**
 * @fileoverview AppController / composition root. Owns DOM lookup, keyboard
 * commands, audio unlock, resize and the render loop. Runtime state that used
 * to live in mutable CONFIG (view mode, autopilot, mapping mode) lives here.
 *
 * Keys: D = cycle view mode, A = toggle autopilot, M = cycle audio mapping mode.
 */
import { CONFIG } from './core/Config.js';
import { PerformanceManager } from './PerformanceManager/index.js';
import { VisionSystem } from './PerformanceManager/systems/VisionSystem.js';
import { PerformanceVisualizer } from './PerformanceVisualizer/index.js';
import { PerformanceListener } from './PerformanceListener/index.js';

export class App {
    /** @param {Document} doc */
    constructor(doc = document) {
        this.config = CONFIG;
        this.vision = new VisionSystem(doc.getElementById('video'), CONFIG.vision);
        this.manager = new PerformanceManager(CONFIG, this.vision);
        this.visualizer = new PerformanceVisualizer(CONFIG, {
            container: doc.getElementById('canvas-container'),
            debugCanvas: doc.getElementById('debug-layer'),
            statusEl: doc.getElementById('status'),
            metricsEl: doc.getElementById('metrics'),
            hintEl: doc.getElementById('audio-hint')
        });
        this.listener = new PerformanceListener(CONFIG);

        this.viewMode = CONFIG.defaults.viewMode;
        this.visualizer.setViewMode(this.viewMode);
        this.listener.setMappingMode(CONFIG.defaults.mappingMode);

        this._bindInput();
        this._lastMs = null;
        this._init();
    }

    _bindInput() {
        const unlock = () => {
            this.listener.unlock().then(() => this.visualizer.setAudioLocked(false));
        };
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('touchstart', unlock);

        window.addEventListener('keydown', (e) => {
            unlock();
            const k = e.key.toLowerCase();
            if (k === 'd') {
                this.viewMode = (this.viewMode + 1) % 3;
                this.visualizer.setViewMode(this.viewMode);
            } else if (k === 'a') {
                this.manager.setAutopilot(!this.manager.autopilotEnabled);
            } else if (k === 'm') {
                const modes = CONFIG.audio.mappingModes;
                const next = modes[(modes.indexOf(this.listener.mappingMode) + 1) % modes.length];
                this.listener.setMappingMode(next);
            }
        });

        window.addEventListener('resize', () => this.visualizer.resize(window.innerWidth, window.innerHeight));
    }

    async _init() {
        try {
            await this.vision.init();
            this.vision.start();
        } catch (err) {
            console.error('Vision init failed:', err);
        }
        requestAnimationFrame(t => this._loop(t));
    }

    /** Render loop: never awaits inference (VisionSystem runs on its own). */
    _loop(nowMs) {
        const dt = this._lastMs === null ? 1 / 60 : Math.min(0.1, (nowMs - this._lastMs) / 1000);
        this._lastMs = nowMs;

        const frame = this.manager.tick(nowMs / 1000, dt);
        this.visualizer.update(frame, { mappingMode: this.listener.mappingMode });
        this.listener.update(frame);

        requestAnimationFrame(t => this._loop(t));
    }
}
