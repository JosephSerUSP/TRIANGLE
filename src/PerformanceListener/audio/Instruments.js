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
 * A bass synthesizer with a low-pass filter.
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
        this.filter.Q.value = 5;
        this.filter.connect(this.output); // Connect filter to output (which goes to panner)

        // Config volume
        this.output.gain.value = CONFIG.audio.mix.bass;
    }

    modulate(params) {
        if (params.timbre) {
            // Map 0..1 to filter freq 100..1000
            const freq = 100 + params.timbre * 900;
            this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        }
    }

    playNote(freq, time, duration, velocity) {
        // Main Oscillator
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        // Sub Oscillator for richness/weight
        const subOsc = this.ctx.createOscillator();
        subOsc.type = 'triangle';
        subOsc.frequency.value = freq / 2; // Octave down

        const gain = this.ctx.createGain();
        const subGain = this.ctx.createGain();

        // Envelope
        const attack = 0.01;
        const decay = 0.2; // Slightly longer decay for fullness
        const sustain = 0.6; // Higher sustain
        const release = 0.1;

        osc.connect(gain);
        subOsc.connect(subGain);

        gain.connect(this.filter);
        subGain.connect(this.filter);

        osc.start(time);
        subOsc.start(time);

        // Main Env
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity, time + attack);
        gain.gain.exponentialRampToValueAtTime(velocity * sustain, time + attack + decay);
        gain.gain.setValueAtTime(velocity * sustain, time + duration);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration + release);

        // Sub Env (slightly louder/constant to provide foundation)
        subGain.gain.setValueAtTime(0, time);
        subGain.gain.linearRampToValueAtTime(velocity * 0.8, time + attack);
        subGain.gain.exponentialRampToValueAtTime(velocity * 0.5, time + attack + decay); // Less sustain on sub to keep it tight
        subGain.gain.setValueAtTime(velocity * 0.5, time + duration);
        subGain.gain.exponentialRampToValueAtTime(0.001, time + duration + release);

        osc.stop(time + duration + release + 0.1);
        subOsc.stop(time + duration + release + 0.1);

        // Filter envelope for "wow" effect - added to base cutoff
        // We use setTargetAtTime in modulate, so here we might want to punch it
        // Made this slightly smoother to reduce "zap" sound
        this.filter.frequency.cancelScheduledValues(time);
        this.filter.frequency.setValueAtTime(200, time);
        this.filter.frequency.exponentialRampToValueAtTime(1500, time + attack);
        this.filter.frequency.exponentialRampToValueAtTime(400, time + attack + decay);
    }
}

/**
 * A string pad synthesizer with a low-pass filter.
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
        const osc3 = this.ctx.createOscillator(); // Third osc for richness

        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc3.type = 'triangle'; // Smoother layer

        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 1.004; // Detune +
        osc3.frequency.value = freq * 0.996; // Detune -

        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        osc3.connect(gain);
        gain.connect(this.filter); // Connect to the class-wide filter

        const attack = 0.5;
        const release = 1.0;

        osc1.start(time);
        osc2.start(time);
        osc3.start(time);

        gain.gain.setValueAtTime(0, time);
        // Normalize gain since we added an oscillator (0.6 -> 0.4 approx per osc)
        const v = velocity * 0.5;
        gain.gain.linearRampToValueAtTime(v, time + attack);
        gain.gain.setValueAtTime(v, time + duration);
        gain.gain.linearRampToValueAtTime(0, time + duration + release);

        osc1.stop(time + duration + release);
        osc2.stop(time + duration + release);
        osc3.stop(time + duration + release);
    }
}

/**
 * A pluck synthesizer with a low-pass filter.
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
        // Square is very tinny/hollow. Mix of Saw/Square or just Pulse width is better.
        // WebAudio square is 50% duty cycle.
        // Let's use Triangle for a rounder pluck or Saw with filter.
        // Going with Sawtooth but heavier filter envelope.
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.filter); // Use class filter

        const attack = 0.005;
        const decay = 0.3;
        const release = 0.2;

        osc.start(time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.6, time + attack);
        gain.gain.exponentialRampToValueAtTime(velocity * 0.2, time + attack + decay); // Sustain level
        gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay + release);

        osc.stop(time + attack + decay + release + 0.1);
    }
}

/**
 * An arpeggio synthesizer.
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

    // ArpSynth doesn't strictly need a filter modulation but we can add one if we want
    // keeping it simple for now, just volume/pan

    playNote(freq, time, duration, velocity) {
        const osc = this.ctx.createOscillator();
        // Triangle is soft. Arps should cut a bit more but not be tinny.
        // Sine + heavy FM or just a filtered square?
        // Let's stick to Triangle but maybe add a secondary sine for body.
        osc.type = 'triangle';
        osc.frequency.value = freq;

        // Sub/Harmonic
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2; // Octave up for 'bell' tone

        const gain = this.ctx.createGain();

        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(this.output);

        const attack = 0.005;
        const decay = 0.15; // Slightly longer

        osc.start(time);
        osc2.start(time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(velocity * 0.4, time + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);

        osc.stop(time + attack + decay + 0.1);
        osc2.stop(time + attack + decay + 0.1);
    }
}
