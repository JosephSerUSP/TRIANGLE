import * as THREE from 'three';

export class Synthesizer {
    constructor(ctx, destination) {
        this.ctx = ctx;
        this.destination = destination;

        // Panner for spatial audio
        this.panner = ctx.createStereoPanner();

        // Output gain
        this.output = ctx.createGain();

        // Chain: Output -> Panner -> Destination
        this.output.connect(this.panner);
        this.panner.connect(destination);
    }

    setPan(value) {
        // value from -1 (left) to 1 (right)
        if (this.panner) {
            this.panner.pan.setValueAtTime(value, this.ctx.currentTime);
        }
    }

    modulate(params) {
        // To be implemented by subclasses for timbre/filter modulation
    }

    playNote(freq, time, duration, velocity = 1.0) {
        // To be implemented by subclasses
    }
}

export class KickDrum extends Synthesizer {
    constructor(ctx, destination) {
        super(ctx, destination);
        // Kick usually center panned
        this.panner.pan.value = 0;
        this.output.gain.value = 1.0;
    }

    playNote(freq, time, duration, velocity) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';

        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.output);

        // Pitch envelope (The "Thud")
        // Velocity controls the start frequency and the decay speed somewhat
        const startFreq = 150 + (velocity * 100);
        const endFreq = 40;
        const decay = 0.1 + (velocity * 0.2);

        osc.frequency.setValueAtTime(startFreq, time);
        osc.frequency.exponentialRampToValueAtTime(endFreq, time + decay);

        // Amplitude envelope
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity, time + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, time + decay + 0.1);

        osc.start(time);
        osc.stop(time + decay + 0.2);

        // Click / Beater noise (only if velocity is high)
        if (velocity > 0.6) {
             const noise = this.ctx.createBufferSource();
             const bufferSize = this.ctx.sampleRate * 0.05;
             const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
             const data = buffer.getChannelData(0);
             for (let i = 0; i < bufferSize; i++) {
                 data[i] = (Math.random() * 2 - 1) * velocity;
             }
             noise.buffer = buffer;

             const noiseFilter = this.ctx.createBiquadFilter();
             noiseFilter.type = 'bandpass';
             noiseFilter.frequency.value = 2000;

             const noiseGain = this.ctx.createGain();
             noiseGain.gain.setValueAtTime(velocity * 0.3, time);
             noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.02);

             noise.connect(noiseFilter);
             noiseFilter.connect(noiseGain);
             noiseGain.connect(this.output);

             noise.start(time);
        }
    }
}

export class PulseBass extends Synthesizer {
    constructor(ctx, destination) {
        super(ctx, destination);
        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 400;
        this.filter.Q.value = 5;
        this.filter.connect(this.output); // Connect filter to output (which goes to panner)
    }

    modulate(params) {
        if (params.timbre) {
            // Map 0..1 to filter freq 100..1000
            const freq = 100 + params.timbre * 900;
            this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        }
    }

    playNote(freq, time, duration, velocity) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        const gain = this.ctx.createGain();

        // Envelope
        const attack = 0.01;
        const decay = 0.1;
        const sustain = 0.5;
        const release = 0.1;

        osc.connect(gain);
        gain.connect(this.filter);

        osc.start(time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity, time + attack);
        gain.gain.exponentialRampToValueAtTime(velocity * sustain, time + attack + decay);
        gain.gain.setValueAtTime(velocity * sustain, time + duration);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration + release);

        osc.stop(time + duration + release + 0.1);

        // Filter envelope for "wow" effect - added to base cutoff
        // We use setTargetAtTime in modulate, so here we might want to punch it
        this.filter.frequency.setValueAtTime(200, time);
        this.filter.frequency.exponentialRampToValueAtTime(2000, time + attack);
        this.filter.frequency.exponentialRampToValueAtTime(400, time + attack + decay);
    }
}

export class StringPad extends Synthesizer {
    constructor(ctx, destination) {
        super(ctx, destination);
        // Increased gain from 0.4/0.8 to 1.5 to satisfy "too low on the mix"
        this.output.gain.value = 1.5;

        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 2000;

        // Input to this synth goes to filter first
        this.input = ctx.createGain();
        this.input.connect(this.filter);
        this.filter.connect(this.output);
    }

    modulate(params) {
        if (params.timbre) {
            // Open filter with expression
            const freq = 500 + params.timbre * 4000;
            this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.5);
        }
    }

    playNote(freq, time, duration, velocity) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';

        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 1.002; // Detune

        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.filter); // Connect to the class-wide filter

        const attack = 0.5;
        const release = 1.0;

        osc1.start(time);
        osc2.start(time);

        // Increased base velocity scaling
        const scaledVelocity = velocity * 1.2;

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(scaledVelocity, time + attack);
        gain.gain.setValueAtTime(scaledVelocity, time + duration);
        gain.gain.linearRampToValueAtTime(0, time + duration + release);

        osc1.stop(time + duration + release);
        osc2.stop(time + duration + release);
    }
}

export class PluckSynth extends Synthesizer {
    constructor(ctx, destination) {
        super(ctx, destination);

        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 800;
        this.filter.Q.value = 1;

        this.filter.connect(this.output);
    }

    modulate(params) {
         if (params.timbre) {
            const freq = 400 + params.timbre * 2000;
            this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        }
    }

    playNote(freq, time, duration, velocity) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;

        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.filter); // Use class filter

        const attack = 0.01;
        const release = 0.2;

        osc.start(time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.5, time + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, time + attack + release);

        osc.stop(time + attack + release + 0.1);
    }
}

export class ArpSynth extends Synthesizer {
    constructor(ctx, destination) {
        super(ctx, destination);
    }

    // ArpSynth doesn't strictly need a filter modulation but we can add one if we want
    // keeping it simple for now, just volume/pan

    playNote(freq, time, duration, velocity) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.output);

        const attack = 0.005;
        const decay = 0.1;

        osc.start(time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.4, time + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);

        osc.stop(time + attack + decay + 0.1);
    }
}
