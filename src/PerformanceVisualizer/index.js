/**
 * @fileoverview PerformanceVisualizer: pure visual projection of a
 * PerformanceFrame onto WebGL + HUD. Receives DOM elements by injection and
 * owns no global input listeners.
 */
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { LatticeViewport } from './graphics/LatticeViewport.js';
import { MaskLayer } from './graphics/MaskLayer.js';
import { DynamicLayout } from './layout/DynamicLayout.js';
import { DebugOverlay } from './ui/DebugOverlay.js';

export class PerformanceVisualizer {
    /**
     * @param {Object} config  CONFIG
     * @param {{container:HTMLElement, debugCanvas:HTMLCanvasElement,
     *          statusEl:HTMLElement, metricsEl:HTMLElement, hintEl:HTMLElement}} els
     */
    constructor(config, els) {
        this.config = config;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.autoClear = false;
        if (els.container) els.container.appendChild(this.renderer.domElement);

        this.viewports = config.slots.map(s => new LatticeViewport(s.colorHex, config.visual));
        this.maskLayer = new MaskLayer();
        this.layoutSystem = new DynamicLayout(config.layout);
        this.debug = new DebugOverlay(els);
        this.viewMode = 0;
        this.audioLocked = true;

        this.resize(window.innerWidth, window.innerHeight);
    }

    setViewMode(mode) { this.viewMode = mode; }
    setAudioLocked(locked) { this.audioLocked = locked; }

    /** Briefly shows a centered message (mode changes etc.) in every view mode. */
    notify(text, seconds = 1.5) {
        this.toast = { text, until: performance.now() / 1000 + seconds };
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.renderer.setSize(width, height);
        this.debug.resize(width, height);
    }

    /**
     * @param {import('../core/Contracts.js').PerformanceFrame} frame
     * @param {{mappingMode:string, recording:boolean, replay:boolean}} extra  HUD-only info
     */
    update(frame, extra = {}) {
        TWEEN.update();
        this._renderViewports(frame.slots);
        this.debug.draw(frame, {
            viewMode: this.viewMode,
            audioLocked: this.audioLocked,
            mappingMode: extra.mappingMode,
            audio: extra.audio || null,
            recording: !!extra.recording,
            replay: !!extra.replay,
            toast: this.toast && performance.now() / 1000 < this.toast.until ? this.toast.text : null
        });
    }

    _renderViewports(slots) {
        const { width, height } = this;
        this.renderer.clear();
        let layout = this.layoutSystem.calculate(width, height, slots);
        // Idle stage: nobody present -> a dim full-screen lattice instead of black.
        const idle = this.config.visual.idleSlot;
        if (layout.length === 0 && idle != null && slots[idle]) {
            layout = [{
                index: idle,
                rect: { x: 0, y: 0, width, height },
                corners: { tl: 0, bl: 0, tr: width, br: width }
            }];
        }
        layout.forEach(({ index, rect, corners }) => {
            this.renderer.clearStencil();
            this.renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
            this.renderer.setViewport(0, 0, width, height);
            this.renderer.setScissorTest(true);
            this.maskLayer.update(corners, width, height);
            this.maskLayer.render(this.renderer);
            this.viewports[index].render(this.renderer, rect, slots[index], this.viewMode >= 1);
        });
        this.renderer.setScissorTest(false);
    }
}
