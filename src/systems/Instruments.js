import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

export class BaseInstrument {
    constructor(ctx, destination) {
        this.ctx = ctx;
        this.output = this.ctx.createGain();
        this.output.connect(destination);
        this.output.gain.value = 0;
    }

    setVolume(val, time = 0.1) {
        // Clamp volume
        val = Math.max(0, Math.min(1, val));
        this.output.gain.setTargetAtTime(val, this.ctx.currentTime, time);
    }
}

export class BassInstrument extends BaseInstrument {
    constructor(ctx, destination) {
        super(ctx, destination);

        this.osc = ctx.createOscillator();
        this.osc.type = 'triangle';

        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 400;

        this.osc.connect(this.filter);
        this.filter.connect(this.output);
        this.osc.start();
    }

    playNote(freq, time) {
        this.osc.frequency.setTargetAtTime(freq, time, 0.05);
    }

    // Plucky envelope
    triggerAttack(time, velocity = 1.0) {
        this.output.gain.cancelScheduledValues(time);
        this.output.gain.setValueAtTime(0, time);
        this.output.gain.linearRampToValueAtTime(velocity * 0.8, time + 0.05);
        this.output.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    }
}

export class ChordInstrument extends BaseInstrument {
    constructor(ctx, destination) {
        super(ctx, destination);
        this.oscillators = [];
        this.oscs = 4; // 4 voice polyphony (approximated for chords)

        this.subGain = ctx.createGain();
        this.subGain.gain.value = 0.2; // Mix down

        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.Q.value = 0.5;
        this.filter.frequency.value = 2000;

        this.subGain.connect(this.filter);
        this.filter.connect(this.output);

        for (let i = 0; i < this.oscs; i++) {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.start();
            osc.connect(this.subGain);
            this.oscillators.push(osc);
        }
    }

    setChord(frequencies, time) {
        this.oscillators.forEach((osc, i) => {
            if (frequencies[i]) {
                osc.frequency.setTargetAtTime(frequencies[i], time, 0.1);
            }
        });
    }

    setFilter(val) {
        const freq = THREE.MathUtils.lerp(500, 5000, val);
        this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    }

    triggerAttack(time, velocity = 1.0) {
        // Guitar strum feel
        this.output.gain.cancelScheduledValues(time);
        this.output.gain.setValueAtTime(0, time);
        this.output.gain.linearRampToValueAtTime(velocity * 0.5, time + 0.05);
        this.output.gain.exponentialRampToValueAtTime(0.01, time + 1.0); // Longer sustain
    }
}

export class LeadInstrument extends BaseInstrument {
    constructor(ctx, destination) {
        super(ctx, destination);

        this.osc = ctx.createOscillator();
        this.osc.type = 'sine'; // Flute-like

        this.vibrato = ctx.createOscillator();
        this.vibrato.frequency.value = 5; // 5Hz vibrato
        this.vibratoGain = ctx.createGain();
        this.vibratoGain.gain.value = 5; // Depth

        this.vibrato.connect(this.vibratoGain);
        this.vibratoGain.connect(this.osc.frequency);
        this.vibrato.start();

        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 1500;

        this.osc.connect(this.filter);
        this.filter.connect(this.output);
        this.osc.start();
    }

    playNote(freq, time) {
        this.osc.frequency.setTargetAtTime(freq, time, 0.2); // Smooth portamento
    }
}

export class PercussionInstrument extends BaseInstrument {
    constructor(ctx, destination, type = 'shaker') {
        super(ctx, destination);
        this.type = type;

        // Noise buffer for shaker
        const bufferSize = ctx.sampleRate * 2; // 2 seconds
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;

        this.filter = ctx.createBiquadFilter();

        if (type === 'shaker') {
            this.filter.type = 'highpass';
            this.filter.frequency.value = 5000;
        } else {
            // Rimshot / Clave - use bandpass
            this.filter.type = 'bandpass';
            this.filter.frequency.value = 2000;
            this.filter.Q.value = 5;
        }

        this.filter.connect(this.output);
    }

    trigger(time, velocity = 1.0) {
        const source = this.ctx.createBufferSource();
        source.buffer = this.noiseBuffer;
        source.loop = true;
        source.connect(this.filter);
        source.start(time);
        source.stop(time + 0.2);

        // Envelope
        this.output.gain.cancelScheduledValues(time);
        this.output.gain.setValueAtTime(0, time);

        if (this.type === 'shaker') {
             this.output.gain.linearRampToValueAtTime(velocity * 0.3, time + 0.02);
             this.output.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        } else {
             // Clave click
             this.output.gain.setValueAtTime(velocity * 0.8, time);
             this.output.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        }
    }
}
