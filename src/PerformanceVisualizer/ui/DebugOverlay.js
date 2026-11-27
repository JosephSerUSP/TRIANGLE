/**
 * @fileoverview HUD renderer: audio-locked hint, status/metrics text and a
 * skeleton overlay (view mode 2). Pure output; owns no input listeners.
 */

const EDGES = [
    ['left_shoulder', 'right_shoulder'], ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'], ['left_shoulder', 'left_hip'],
    ['right_shoulder', 'right_hip'], ['left_hip', 'right_hip']
];

export class DebugOverlay {
    /** @param {{debugCanvas, statusEl, metricsEl, hintEl}} els */
    constructor(els) {
        this.canvas = els.debugCanvas || null;
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.statusEl = els.statusEl;
        this.metricsEl = els.metricsEl;
        this.hintEl = els.hintEl;
    }

    resize(w, h) {
        if (!this.canvas) return;
        this.canvas.width = w;
        this.canvas.height = h;
    }

    /**
     * @param {import('../../core/Contracts.js').PerformanceFrame} frame
     * @param {{viewMode:number, audioLocked:boolean, mappingMode:string, recording:boolean, replay:boolean}} hud
     */
    draw(frame, hud) {
        if (this.hintEl) this.hintEl.style.display = hud.audioLocked ? 'block' : 'none';
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Recording / replay badges are shown in every view mode.
        const badge = hud.recording ? '● REC' : hud.replay ? '▶ REPLAY' : '';
        if (badge) {
            this.ctx.font = '12px monospace';
            this.ctx.fillStyle = hud.recording ? '#ff5566' : '#88eeee';
            this.ctx.fillText(badge, this.canvas.width - 90, 20);
        }

        if (hud.toast) {
            this.ctx.font = '16px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = '#88eeee';
            this.ctx.fillText(hud.toast, this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.textAlign = 'start';
        }

        const show = hud.viewMode === 2;
        if (this.statusEl) this.statusEl.style.display = show ? 'block' : 'none';
        if (this.metricsEl) this.metricsEl.style.display = show ? 'block' : 'none';
        if (!show) return;

        const physical = frame.slots.filter(s => s.binding === 'physical' && s.active).map(s => `P${s.id}`);
        this.statusEl.innerText = physical.length
            ? `TARGET ACQUIRED  (${physical.join(', ')})`
            : 'SCANNING SECTOR...';

        const a = hud.audio;
        let text = `Autopilot: ${frame.autopilotEnabled ? 'ON' : 'OFF'}   Mapping: ${hud.mappingMode}`;
        text += a ? `   ${a.tempo.toFixed(1)} BPM  bar ${a.bar}\n` : '   audio locked\n';
        const r = hud.rates;
        if (r) text += `render ${r.fps.toFixed(0)} fps${r.pps === null ? '' : `   poses ${r.pps.toFixed(1)}/s`}\n`;
        frame.slots.forEach((s, i) => {
            const t = s.gesture.triangle;
            const ch = a ? `  ${a.channels[i] || ''}${a.transposes[i] ? ' +' + a.transposes[i] : ''}` : '';
            text += `P${s.id} ${s.role.padEnd(8)} ${s.binding.padEnd(8)} ${s.active ? 'ON ' : 'off'} pres ${s.presence.toFixed(2)}${ch}\n`;
            text += `  depth: ${s.gesture.depth.toFixed(2)}  triA: ${t.area.toFixed(3)}  W: ${t.width.toFixed(2)}  H: ${t.height.toFixed(2)}\n`;
        });
        this.metricsEl.innerText = text;

        this._drawSkeletons(frame.debug);
    }

    /** Draws raw poses, mirrored to match the canonical view, cover-fit to the screen. */
    _drawSkeletons(debug) {
        if (!debug || !debug.cameraSize || !debug.poses) return;
        const { width: cw, height: ch } = debug.cameraSize;
        const W = this.canvas.width, H = this.canvas.height;
        // Cover-fit: keep the camera's aspect ratio, centered, cropping overflow.
        const sc = Math.max(W / cw, H / ch);
        const ox = (W - cw * sc) / 2, oy = (H - ch * sc) / 2;
        const ctx = this.ctx;
        ctx.strokeStyle = '#88eeee';
        ctx.fillStyle = '#88eeee';
        ctx.lineWidth = 2;
        debug.poses.forEach(pose => {
            const by = Object.fromEntries(pose.keypoints.map(k => [k.name, k]));
            const P = k => {
                const x = ox + k.x * sc;
                return [debug.mirrored === false ? x : W - x, oy + k.y * sc];
            };
            EDGES.forEach(([a, b]) => {
                const ka = by[a], kb = by[b];
                if (!ka || !kb || ka.score < 0.3 || kb.score < 0.3) return;
                ctx.beginPath();
                ctx.moveTo(...P(ka));
                ctx.lineTo(...P(kb));
                ctx.stroke();
            });
            pose.keypoints.forEach(k => {
                if (k.score < 0.3) return;
                const [x, y] = P(k);
                ctx.fillRect(x - 2, y - 2, 4, 4);
            });
        });
    }
}
