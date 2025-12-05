import { CONFIG } from '../../core/Config.js';

/**
 * Base class for all synthesizers.
 * Provides common functionality like panning and an output gain node.
 */
export class Synthesizer {
    /**
     * Creates an instance of Synthesizer.
     * @param {AudioContext} ctx - The Web Audio API AudioContext.
     * @param {AudioNode} destination - The destination node to connect to.
     */
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

    /**
     * Sets the stereo pan of the synthesizer.
     * @param {number} value - The pan value, from -1 (left) to 1 (right).
     */
    setPan(value) {
        // value from -1 (left) to 1 (right)
        if (this.panner) {
            this.panner.pan.setValueAtTime(value, this.ctx.currentTime);
        }
    }

    /**
     * Modulates the synthesizer's parameters, such as filter cutoff.
     * To be implemented by subclasses.
     * @param {object} params - The modulation parameters.
     */
    modulate(params) {
        // To be implemented by subclasses for timbre/filter modulation
    }

    /**
     * Plays a note on the synthesizer.
     * To be implemented by subclasses.
     * @param {number} freq - The frequency of the note to play.
     * @param {number} time - The AudioContext time at which to play the note.
     * @param {number} duration - The duration of the note in seconds.
     * @param {number} [velocity=1.0] - The velocity of the note (0-1).
     */
    playNote(freq, time, duration, velocity = 1.0) {
        // To be implemented by subclasses
    }
}

/**
 * A simple kick drum synthesizer.
 * @extends Synthesizer
 */
export class KickDrum extends Synthesizer {
    /**
     * Creates an instance of KickDrum.
     * @param {AudioContext} ctx - The Web Audio API AudioContext.
     * @param {AudioNode} destination - The destination node to connect to.
     */
    constructor(ctx, destination) {
        super(ctx, destination);
        // Kick gain from config
        this.output.gain.value = CONFIG.audio.mix.kick;
    }

    /**
     * Plays a kick drum sound.
     * @param {number} time - The AudioContext time at which to play the sound.
     * @param {number} [velocity=1.0] - The velocity of the kick (0-1).
     */
    playNote(time, velocity = 1.0) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';

        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.output);

        // Pitch Envelope (Drop)
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);

        // Gain Envelope
        gain.gain.setValueAtTime(velocity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

        osc.start(time);
        osc.stop(time + 0.5);
    }
}

/**
 * A bass synthesizer with a sub-oscillator and low-pass filter.
 * Refactored for deeper, richer sound.
 * @extends Synthesizer
 */
export class PulseBass extends Synthesizer {
    /**
     * Creates an instance of PulseBass.
     * @param {AudioContext} ctx - The Web Audio API AudioContext.
     * @param {AudioNode} destination - The destination node to connect to.
     */
    constructor(ctx, destination) {
        super(ctx, destination);
        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 400;
        this.filter.Q.value = 2; // Reduced Q for fatter sound
        this.filter.connect(this.output);

        // Config volume
        this.output.gain.value = CONFIG.audio.mix.bass;
    }

    modulate(params) {
        if (params.timbre) {
            // Map 0..1 to filter freq 80..800
            const freq = 80 + params.timbre * 720;
            this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        }
    }

    playNote(freq, time, duration, velocity) {
        // Main Oscillator
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        // Sub Oscillator
        const sub = this.ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = freq * 0.5; // Octave down

        const gain = this.ctx.createGain();

        // Envelope
        const attack = 0.02;
        const decay = 0.2;
        const sustain = 0.6;
        const release = 0.2;

        osc.connect(gain);
        sub.connect(gain); // Mix in sub
        gain.connect(this.filter);

        osc.start(time);
        sub.start(time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity, time + attack);
        gain.gain.exponentialRampToValueAtTime(velocity * sustain, time + attack + decay);
        gain.gain.setValueAtTime(velocity * sustain, time + duration);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration + release);

        osc.stop(time + duration + release + 0.1);
        sub.stop(time + duration + release + 0.1);

        // Filter envelope
        this.filter.frequency.setValueAtTime(200, time);
        this.filter.frequency.exponentialRampToValueAtTime(1000, time + attack);
        this.filter.frequency.exponentialRampToValueAtTime(400, time + attack + decay);
    }
}

/**
 * A string pad synthesizer with 3 oscillators for a lush, rich texture.
 * Refactored for "Fuller, Richer" sound.
 * @extends Synthesizer
 */
export class StringPad extends Synthesizer {
    /**
     * Creates an instance of StringPad.
     * @param {AudioContext} ctx - The Web Audio API AudioContext.
     * @param {AudioNode} destination - The destination node to connect to.
     */
    constructor(ctx, destination) {
        super(ctx, destination);
        // Config volume
        this.output.gain.value = CONFIG.audio.mix.pad;

        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 1500;
        this.filter.Q.value = 0.5;

        // Input to this synth goes to filter first
        this.input = ctx.createGain();
        this.input.connect(this.filter);
        this.filter.connect(this.output);
    }

    modulate(params) {
        if (params.timbre) {
            // Open filter with expression
            const freq = 400 + params.timbre * 5000;
            this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.5);
        }
    }

    playNote(freq, time, duration, velocity) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const osc3 = this.ctx.createOscillator();

        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc3.type = 'triangle'; // Body

        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 1.003; // Detune +
        osc3.frequency.value = freq * 0.997; // Detune -

        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        osc3.connect(gain);
        gain.connect(this.filter);

        const attack = 0.8;
        const release = 1.5;

        osc1.start(time);
        osc2.start(time);
        osc3.start(time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.5, time + attack); // Lower gain per osc to prevent clipping
        gain.gain.setValueAtTime(velocity * 0.5, time + duration);
        gain.gain.linearRampToValueAtTime(0, time + duration + release);

        osc1.stop(time + duration + release);
        osc2.stop(time + duration + release);
        osc3.stop(time + duration + release);
    }
}

/**
 * A pluck synthesizer with dual detuned oscillators.
 * Refactored for less harshness and more body.
 * @extends Synthesizer
 */
export class PluckSynth extends Synthesizer {
    /**
     * Creates an instance of PluckSynth.
     * @param {AudioContext} ctx - The Web Audio API AudioContext.
     * @param {AudioNode} destination - The destination node to connect to.
     */
    constructor(ctx, destination) {
        super(ctx, destination);

        // Config volume
        this.output.gain.value = CONFIG.audio.mix.ostinato;

        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 1200;
        this.filter.Q.value = 1;

        this.filter.connect(this.output);
    }

    modulate(params) {
         if (params.timbre) {
            const freq = 600 + params.timbre * 2500;
            this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        }
    }

    playNote(freq, time, duration, velocity) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();

        osc1.type = 'square';
        osc2.type = 'sawtooth'; // Blend square and saw for bite + body

        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 1.002;

        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.filter);

        const attack = 0.01;
        const release = 0.3;

        osc1.start(time);
        osc2.start(time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.3, time + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, time + attack + release);

        osc1.stop(time + attack + release + 0.1);
        osc2.stop(time + attack + release + 0.1);
    }
}

/**
 * An arpeggio synthesizer with a pure bell-like tone.
 * Refactored to use Sine + Triangle mix.
 * @extends Synthesizer
 */
export class ArpSynth extends Synthesizer {
    /**
     * Creates an instance of ArpSynth.
     * @param {AudioContext} ctx - The Web Audio API AudioContext.
     * @param {AudioNode} destination - The destination node to connect to.
     */
    constructor(ctx, destination) {
        super(ctx, destination);
        // Config volume
        this.output.gain.value = CONFIG.audio.mix.arp;
    }

    playNote(freq, time, duration, velocity) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();

        osc1.type = 'sine';
        osc2.type = 'triangle';

        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 2; // Octave up harmonic

        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.output);

        const attack = 0.005;
        const decay = 0.2;

        osc1.start(time);
        osc2.start(time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.3, time + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);

        osc1.stop(time + attack + decay + 0.1);
        osc2.stop(time + attack + decay + 0.1);
    }
}
