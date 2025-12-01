// src/systems/AudioSystem.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

/**
 * Manages audio synthesis for the application.
 * Uses the Web Audio API to create specific instruments for "Shibuya Kei" aesthetic.
 */
export class AudioSystem {
    /**
     * Creates a new AudioSystem instance.
     */
    constructor() {
        this.ctx = null;
        this.isReady = false;

        this.masterGain = null;
        this.compressor = null;

        // Effects Bus
        this.reverb = null;
        this.delay = null;

        // Instruments: Array of instrument objects
        this.instruments = [];
    }

    /**
     * Initializes the AudioContext, master effects, and instruments.
     * @param {number} [voiceCount] - Unused, but kept for signature compatibility.
     * @async
     * @returns {Promise<void>}
     */
    async init(voiceCount) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        // --- Master Chain ---
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -20;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.005;
        this.compressor.release.value = 0.1;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.7;

        this.compressor.connect(this.ctx.destination);
        this.masterGain.connect(this.compressor);

        // --- Effects ---
        // Simple Convolution Reverb (impulse response generation would be better, but we'll use a long release generic approach or a simple delay for now to save bandwidth)
        // Let's make a simple Delay instead for the "City Pop" vibe.
        this.delay = this.ctx.createDelay();
        this.delay.delayTime.value = 0.3; // 300ms
        const delayFeedback = this.ctx.createGain();
        delayFeedback.gain.value = 0.3;
        const delayFilter = this.ctx.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.value = 2000;

        this.delay.connect(delayFeedback);
        delayFeedback.connect(delayFilter);
        delayFilter.connect(this.delay);
        this.delay.connect(this.masterGain);


        // --- Create Instruments (2 per performer -> 3 performers -> 6 instruments) ---
        // P0 (Bass + Organ)
        this.instruments.push(this._createInstrument('bass'));
        this.instruments.push(this._createInstrument('organ'));

        // P1 (EPiano + Pad)
        this.instruments.push(this._createInstrument('epiano'));
        this.instruments.push(this._createInstrument('pad'));

        // P2 (Lead + Pluck)
        this.instruments.push(this._createInstrument('lead'));
        this.instruments.push(this._createInstrument('pluck'));

        this.isReady = true;
    }

    /**
     * Creates a specific instrument voice based on type.
     * @private
     * @param {string} type - 'bass', 'organ', 'epiano', 'pad', 'lead', 'pluck'.
     * @returns {Object} The instrument node graph.
     */
    _createInstrument(type) {
        const inst = { type, gain: this.ctx.createGain() };
        inst.gain.gain.value = 0; // Start silent

        // Route to Master
        inst.gain.connect(this.masterGain);

        // Also route to Delay for some instruments
        if (type === 'epiano' || type === 'lead' || type === 'pluck') {
            const send = this.ctx.createGain();
            send.gain.value = 0.2;
            inst.gain.connect(send);
            send.connect(this.delay);
        }

        const now = this.ctx.currentTime;

        switch (type) {
            case 'bass': {
                // Punchy Triangle/Saw Mix
                inst.osc1 = this.ctx.createOscillator();
                inst.osc1.type = 'triangle';
                inst.osc2 = this.ctx.createOscillator();
                inst.osc2.type = 'sawtooth';

                inst.filter = this.ctx.createBiquadFilter();
                inst.filter.type = 'lowpass';
                inst.filter.Q.value = 2;
                inst.filter.frequency.value = 400;

                inst.osc1.connect(inst.filter);
                inst.osc2.connect(inst.filter);
                inst.filter.connect(inst.gain);

                inst.osc1.start();
                inst.osc2.start();
                break;
            }
            case 'organ': {
                // Triangle with Tremolo
                inst.osc1 = this.ctx.createOscillator();
                inst.osc1.type = 'triangle';

                // Tremolo
                inst.tremolo = this.ctx.createOscillator();
                inst.tremolo.frequency.value = 6.0; // Hz
                inst.tremoloGain = this.ctx.createGain();
                inst.tremoloGain.gain.value = 200; // Depth

                inst.tremolo.connect(inst.tremoloGain);
                // We want tremolo to affect volume or pitch?
                // Leslie speaker affects both. Let's modulate gain slightly.
                // Actually WebAudio AudioParam modulation is easiest on Gain.
                // But let's modulate a secondary gain node.
                inst.amp = this.ctx.createGain();
                inst.amp.gain.value = 1.0;

                inst.osc1.connect(inst.amp);
                inst.amp.connect(inst.gain);

                // Connect LFO to Amp Gain
                // Need to center it: gain = 1 + sin(t)*depth
                // Standard WebAudio: connect to .gain adds to the base value.
                inst.tremoloGain.connect(inst.amp.gain);
                inst.tremoloGain.gain.value = 0.3;

                inst.osc1.start();
                inst.tremolo.start();
                break;
            }
            case 'epiano': {
                // FM Synthesis: Modulator -> Carrier
                inst.carrier = this.ctx.createOscillator();
                inst.carrier.type = 'sine';

                inst.modulator = this.ctx.createOscillator();
                inst.modulator.type = 'sine';

                inst.modGain = this.ctx.createGain();
                inst.modGain.gain.value = 300; // Modulation Index

                inst.modulator.connect(inst.modGain);
                inst.modGain.connect(inst.carrier.frequency);

                inst.carrier.connect(inst.gain);

                inst.carrier.start();
                inst.modulator.start();
                break;
            }
            case 'pad': {
                // Detuned Sawtooths
                inst.osc1 = this.ctx.createOscillator();
                inst.osc1.type = 'sawtooth';
                inst.osc2 = this.ctx.createOscillator();
                inst.osc2.type = 'sawtooth';

                inst.osc2.detune.value = 15; // Cents

                inst.filter = this.ctx.createBiquadFilter();
                inst.filter.type = 'lowpass';
                inst.filter.frequency.value = 800;
                inst.filter.Q.value = 0.5;

                inst.osc1.connect(inst.filter);
                inst.osc2.connect(inst.filter);
                inst.filter.connect(inst.gain);

                inst.osc1.start();
                inst.osc2.start();
                break;
            }
            case 'lead': {
                // Square with Vibrato
                inst.osc1 = this.ctx.createOscillator();
                inst.osc1.type = 'square';

                inst.vibrato = this.ctx.createOscillator();
                inst.vibrato.frequency.value = 5.0;
                inst.vibGain = this.ctx.createGain();
                inst.vibGain.gain.value = 10; // Pitch modulation depth

                inst.vibrato.connect(inst.vibGain);
                inst.vibGain.connect(inst.osc1.frequency);

                inst.filter = this.ctx.createBiquadFilter();
                inst.filter.type = 'lowpass';
                inst.filter.frequency.value = 2000;

                inst.osc1.connect(inst.filter);
                inst.filter.connect(inst.gain);

                inst.osc1.start();
                inst.vibrato.start();
                break;
            }
            case 'pluck': {
                // High Sine/Tri
                inst.osc1 = this.ctx.createOscillator();
                inst.osc1.type = 'triangle';

                inst.osc1.connect(inst.gain);
                inst.osc1.start();
                break;
            }
        }
        return inst;
    }

    /**
     * Resumes the AudioContext if it is suspended.
     */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Updates audio parameters based on the state of all performers.
     * @param {Performer[]} performers - Array of performer states.
     */
    update(performers) {
        if (!this.isReady) return;
        const now = this.ctx.currentTime;

        // Performers: 0 (Bass/Organ), 1 (EPiano/Pad), 2 (Lead/Pluck)
        // Instruments: 0,1 (P0) | 2,3 (P1) | 4,5 (P2)

        performers.forEach((p, pIdx) => {
            const isActive = p.hasPerformer;
            const presence = p.presence; // 0 to 1
            const ratio = p.noteRatio || 1.0;
            const root = CONFIG.audio.rootFreq;

            // Map performer data to params
            // Roll: -PI/2 to PI/2
            // Yaw: -PI/2 to PI/2 (Rotation)
            // Height: 0 to 1

            // Get the two instruments for this performer
            const instA = this.instruments[pIdx * 2];
            const instB = this.instruments[pIdx * 2 + 1];

            if (!instA || !instB) return;

            if (!isActive) {
                instA.gain.gain.setTargetAtTime(0, now, 0.5);
                instB.gain.gain.setTargetAtTime(0, now, 0.5);
                return;
            }

            // --- Common Pitch Logic ---
            // Calculate base frequency based on ratio
            // Quantize pitch changes to avoid sliding (unless desired)
            // But we use setTargetAtTime which smooths.

            // Performer 0: Bass (Inst 0) + Organ (Inst 1)
            if (pIdx === 0) {
                // Bass Frequency: Root * Ratio (Keep low)
                // If ratio is > 2, maybe drop octave
                const bassFreq = (root * ratio) > 150 ? (root * ratio) * 0.5 : (root * ratio);
                instA.osc1.frequency.setTargetAtTime(bassFreq, now, 0.05);
                instA.osc2.frequency.setTargetAtTime(bassFreq * 1.005, now, 0.05); // Detune

                // Bass Filter: Open with height
                const bassCutoff = THREE.MathUtils.lerp(200, 1500, p.triangle.height);
                instA.filter.frequency.setTargetAtTime(bassCutoff, now, 0.1);

                // Bass Volume
                instA.gain.gain.setTargetAtTime(0.6 * presence, now, 0.1);


                // Organ Frequency: Root * Ratio * 2 or 4
                const organFreq = root * ratio * 4.0;
                instB.osc1.frequency.setTargetAtTime(organFreq, now, 0.05);

                // Organ Tremolo Rate: Controlled by Roll
                // Roll is approx -1 to 1. Map to 3Hz - 10Hz
                const rollNorm = (p.current.roll + 1) / 2; // 0 to 1
                const tremRate = THREE.MathUtils.lerp(3, 10, rollNorm);
                instB.tremolo.frequency.setTargetAtTime(tremRate, now, 0.2);

                // Organ Volume
                instB.gain.gain.setTargetAtTime(0.4 * presence, now, 0.1);
            }

            // Performer 1: EPiano (Inst 2) + Pad (Inst 3)
            else if (pIdx === 1) {
                // EPiano Frequency
                const epFreq = root * ratio * 4.0;
                instA.carrier.frequency.setTargetAtTime(epFreq, now, 0.05);
                // FM Ratio 1:2 is bell-like
                instA.modulator.frequency.setTargetAtTime(epFreq * 2.0, now, 0.05);
                // FM Index: Controlled by Height (Brightness)
                const fmIdx = THREE.MathUtils.lerp(100, 1000, p.triangle.height);
                instA.modGain.gain.setTargetAtTime(fmIdx, now, 0.1);

                instA.gain.gain.setTargetAtTime(0.5 * presence, now, 0.1);


                // Pad Frequency
                const padFreq = root * ratio * 2.0;
                instB.osc1.frequency.setTargetAtTime(padFreq, now, 0.1);
                instB.osc2.frequency.setTargetAtTime(padFreq * 1.002, now, 0.1);

                // Pad Filter: Controlled by Yaw
                // Yaw approx -1 to 1
                const yawNorm = (THREE.MathUtils.clamp(p.current.yaw, -1, 1) + 1) / 2;
                const padCutoff = THREE.MathUtils.lerp(400, 4000, yawNorm);
                instB.filter.frequency.setTargetAtTime(padCutoff, now, 0.5); // Slow sweep

                instB.gain.gain.setTargetAtTime(0.3 * presence, now, 0.5);
            }

            // Performer 2: Lead (Inst 4) + Pluck (Inst 5)
            else if (pIdx === 2) {
                // Lead Frequency
                const leadFreq = root * ratio * 8.0; // High
                instA.osc1.frequency.setTargetAtTime(leadFreq, now, 0.05);

                // Lead Vibrato: Depth controlled by Roll
                const vibDepth = Math.abs(p.current.roll) * 20;
                instA.vibGain.gain.setTargetAtTime(vibDepth, now, 0.1);

                // Lead Filter
                instA.filter.frequency.setTargetAtTime(THREE.MathUtils.lerp(1000, 8000, p.triangle.height), now, 0.1);

                instA.gain.gain.setTargetAtTime(0.3 * presence, now, 0.1);


                // Pluck Frequency (Arp-ish behavior could go here, but using LFO for pulse)
                // Let's make it sparkle at very high freq
                const pluckFreq = root * ratio * 16.0;
                instB.osc1.frequency.setTargetAtTime(pluckFreq, now, 0.05);

                // Pulse the volume with an internal LFO concept?
                // Or just use Yaw to gate it.
                // Let's use BPM Pref to pulse it?
                // Creating a pulse in the update loop is hard without a clock.
                // We'll just map volume to a mix of presence and Yaw.
                const yawAbs = Math.abs(p.current.yaw); // 0 to 1ish
                instB.gain.gain.setTargetAtTime(0.2 * presence * yawAbs, now, 0.1);
            }
        });
    }
}
