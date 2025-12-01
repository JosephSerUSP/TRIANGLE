export class Synthesizer {
    constructor(ctx, destination) {
        this.ctx = ctx;
        this.destination = destination;
        this.output = ctx.createGain();
        this.output.connect(destination);
    }

    playNote(freq, time, duration, velocity = 1.0) {
        // To be implemented by subclasses
    }
}

export class PulseBass extends Synthesizer {
    constructor(ctx, destination) {
        super(ctx, destination);
        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 400;
        this.filter.Q.value = 5;
        this.filter.connect(this.output);
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

        // Filter envelope for "wow" effect
        this.filter.frequency.setValueAtTime(200, time);
        this.filter.frequency.exponentialRampToValueAtTime(2000, time + attack);
        this.filter.frequency.exponentialRampToValueAtTime(400, time + attack + decay);
    }
}

export class StringPad extends Synthesizer {
    constructor(ctx, destination) {
        super(ctx, destination);
        this.output.gain.value = 0.4;
    }

    playNote(freq, time, duration, velocity) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';

        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 1.002; // Detune

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;

        const gain = this.ctx.createGain();

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.output);

        const attack = 0.5;
        const release = 1.0;

        osc1.start(time);
        osc2.start(time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.3, time + attack);
        gain.gain.setValueAtTime(velocity * 0.3, time + duration);
        gain.gain.linearRampToValueAtTime(0, time + duration + release);

        osc1.stop(time + duration + release);
        osc2.stop(time + duration + release);
    }
}

export class PluckSynth extends Synthesizer {
    constructor(ctx, destination) {
        super(ctx, destination);
    }

    playNote(freq, time, duration, velocity) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        filter.Q.value = 1;

        const gain = this.ctx.createGain();

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.output);

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
