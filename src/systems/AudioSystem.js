// src/systems/AudioSystem.js
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { VoiceLeading } from './VoiceLeading.js';

/**
 * Manages audio synthesis for the application.
 * Refactored for a grandiose, cinematic sound with intelligent voice leading.
 */
export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.isReady = false;

        this.masterGain = null;
        this.compressor = null;
        this.reverb = null;

        this.voiceLeading = new VoiceLeading();

        this.bassVoice = null;
        this.chordVoices = []; // Map or Array indexed by performer ID
    }

    /**
     * Initializes the audio context and graph.
     * @param {number} performerCount
     */
    async init(performerCount) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        // --- Master Chain ---
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.ratio.value = 12;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;

        // Reverb (Cinematic Impulse)
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = this._createReverbImpulse(3.0); // 3 seconds tail

        // Routing:
        // Voices -> DryMix -> Compressor -> Out
        // Voices -> Reverb -> Compressor -> Out

        const reverbGain = this.ctx.createGain();
        reverbGain.gain.value = 0.4; // Wet level

        this.reverb.connect(reverbGain);
        reverbGain.connect(this.compressor);

        // We will connect voices to both Compressor (Dry) and Reverb (Wet)
        this.dryNode = this.compressor;
        this.wetNode = this.reverb;

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        // --- Voices ---
        // Bass Voice (Index 0)
        this.bassVoice = new BassVoice(this.ctx, this.dryNode, this.wetNode);

        // Chord Voices (Indices 1..N)
        this.chordVoices = [];
        // We start from index 0 to match performer array, but index 0 in chordVoices will be unused/null
        for(let i = 0; i < performerCount; i++) {
            if (i === 0) {
                this.chordVoices.push(null); // Slot 0 is Bass
            } else {
                this.chordVoices.push(new ChordVoice(this.ctx, this.dryNode, this.wetNode));
            }
        }

        this.isReady = true;
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    update(performers) {
        if (!this.isReady) return;
        const now = this.ctx.currentTime;

        // 1. Voice Leading
        const assignments = this.voiceLeading.update(performers);

        // 2. Update Bass (Performer 0)
        // Bass always plays.
        // "Oscillate from a consistent bass to a marching, kick-like pulse."
        // We drive this oscillation with a slow LFO derived from time.
        const pulsePhase = (Math.sin(now * 0.5) + 1) / 2; // 0..1 over ~12s
        this.bassVoice.update(pulsePhase, now);

        // 3. Update Chords
        performers.forEach((p, idx) => {
            if (idx === 0) return; // Handled by BassVoice

            const voice = this.chordVoices[idx];
            if (!voice) return;

            if (p.hasPerformer && assignments.has(idx)) {
                const notes = assignments.get(idx); // [freq1, freq2]

                // Volume control from Triangle
                // Use area (0..1) to drive volume
                // "Each performer should control two notes - through the expression triangle they control the volume... and the panning"
                const vol = THREE.MathUtils.clamp(p.triangle.area * 5.0, 0, 1); // Scale up area a bit

                // Panning from Roll
                // Roll is approx -0.5 to 0.5. Map to -1..1
                let pan = THREE.MathUtils.clamp(p.current.roll * 2.0, -1, 1);

                voice.setNotes(notes[0], notes[1], now);
                voice.updateParams(vol, pan, now);
            } else {
                voice.silence(now);
            }
        });
    }

    _createReverbImpulse(duration) {
        const rate = this.ctx.sampleRate;
        const length = rate * duration;
        const impulse = this.ctx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            // Exponential decay noise
            const n = i / length;
            const env = Math.pow(1 - n, 2);
            // Simple noise
            left[i] = (Math.random() * 2 - 1) * env;
            right[i] = (Math.random() * 2 - 1) * env;
        }
        return impulse;
    }
}

/**
 * The Bass Voice.
 * Always playing. Oscillates between Drone and Pulse.
 */
class BassVoice {
    constructor(ctx, destDry, destWet) {
        this.ctx = ctx;

        // Oscillators
        this.osc = ctx.createOscillator();
        this.osc.type = 'sawtooth';
        this.osc.frequency.value = 73.42; // D2

        this.subOsc = ctx.createOscillator();
        this.subOsc.type = 'sine';
        this.subOsc.frequency.value = 36.71; // D1

        // Filter (Lowpass)
        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 400;
        this.filter.Q.value = 2;

        // Gain/VCA
        this.gain = ctx.createGain();
        this.gain.gain.value = 0.5;

        // Pulse Modulation
        // We'll use a Gain node modulated by an LFO for the "Kick" effect
        this.pulseGain = ctx.createGain();
        this.pulseGain.gain.value = 1.0;

        this.pulseLFO = ctx.createOscillator();
        this.pulseLFO.type = 'square'; // Harsh on/off for kick? Or sawtooth?
        // Actually, let's just use a custom PeriodicWave or simpler LFO to modulate gain.
        // "Marching, kick-like pulse" -> 4/4 thud.
        this.pulseLFO.frequency.value = 2.0; // 120 BPM pulses

        // We need a way to blend between "Consistent" (Drone) and "Pulse".
        // Drone: pulseGain = 1.0 (constant)
        // Pulse: pulseGain = LFO output (0..1)

        // Graph: Osc -> Filter -> Gain -> PulseGain -> Out
        this.osc.connect(this.filter);
        this.subOsc.connect(this.filter);
        this.filter.connect(this.gain);
        this.gain.connect(this.pulseGain);

        this.pulseGain.connect(destDry);
        this.pulseGain.connect(destWet);

        this.osc.start();
        this.subOsc.start();
        this.pulseLFO.start();

        // Helper to mix LFO
        this.lfoAmp = ctx.createGain();
        this.lfoAmp.gain.value = 0; // Starts at Drone (0 effect)
        this.pulseLFO.connect(this.lfoAmp);

        // To modulate the PulseGain, we need to sum a DC offset so it's not bipolar.
        // Actually simpler:
        // Pulse Mode: Gain goes 1 -> 0 -> 1...
        // Drone Mode: Gain stays at 1.
        // We can't easily blend logic with nodes without a ConstantSource.
        // Let's do it in update() with AudioParams.
    }

    update(pulseAmount, now) {
        // pulseAmount: 0 (Drone) -> 1 (Heavy Pulse)

        // We simulate the kick pulse in Javascript for control, or use the LFO?
        // Using LFO is smoother.
        // Let's assume standard 120BPM marching.

        // If we want a kick-like envelope, a simple sine LFO is too smooth.
        // But for "marching", a strong tremolo might suffice.

        // Manual Pulse Logic via AudioParams is safer for "blending".
        // But LFO is cheaper.

        // Let's modulate the Filter Cutoff for the "Kick" feel (acid bass style)
        // and Amplitude.

        const baseFreq = 100;
        const kickMod = 600;

        // We'll map the LFO to gain.
        // But since we can't easily crossfade the LFO connection strength without complex graph,
        // Let's just modulate the params in JS (frame rate is 60fps, audio is faster, but for slow morph it's fine).

        // Actually, let's just set the filter.
        // Drone: Low cutoff (warm).
        // Pulse: Modulating cutoff (wah/thump).

        // Blend
        // Drone State: Cutoff ~150Hz.
        // Pulse State: Cutoff jumps to 800Hz then decays (if envelope).
        // Or LFO modulates Cutoff 100..800Hz.

        // Let's try a simple approach:
        // Use the pulseLFO to modulate the Gain.
        // LFO (Square) -> GainNode.gain
        // We control the depth of this modulation with `pulseAmount`.

        // However, WebAudio 'connect' adds.
        // We want Gain = 1 - (LFO * pulseAmount).
        // This is getting complicated for raw nodes.

        // Simpler: Just modulate volume 60Hz.
        // We will just oscillate the Bass VOLUME slowly to satisfy "Oscillate from consistent to pulse".
        // Wait, the requirement is "Oscillate from a consistent bass TO a marching pulse".
        // This implies the STYLE changes over time.

        // I will map `pulseAmount` (0..1) to the depth of an amplitude modulation.

        // LFO -> LFO_Depth_Gain -> PulseGain.gain
        // PulseGain.gain default value = 1.
        // LFO goes -1 to 1.
        // We want LFO to dip the volume.

        // Let's leave the LFO connected and change `lfoAmp.gain`.
        // If lfoAmp.gain is 0, PulseGain.gain is effectively 1 (base value).
        // If lfoAmp.gain is 0.5, PulseGain varies 0.5 +/- 0.5? No.

        // Let's rely on update() loop for the LFO Depth control.
        // Just setting gain values is easier.

        // We'll emulate the Pulse using `now` in the loop.
        const beatLen = 0.5; // 120bpm
        const phase = (now % beatLen) / beatLen; // 0..1

        // Pulse Envelope: Decay
        const env = Math.exp(-phase * 10); // Fast decay

        // Drone level: Constant 1.
        // Pulse level: env.

        // Mix based on pulseAmount
        const currentLevel = (1 - pulseAmount) * 1.0 + (pulseAmount * env);

        this.pulseGain.gain.setTargetAtTime(currentLevel, now, 0.05);

        // Filter modulation too
        const baseCutoff = 200;
        const pulseCutoff = 200 + (env * 1000);
        const targetCutoff = (1 - pulseAmount) * baseCutoff + (pulseAmount * pulseCutoff);

        this.filter.frequency.setTargetAtTime(targetCutoff, now, 0.05);
    }
}

/**
 * Chord Voice for a Performer.
 * Controls 2 Notes.
 * Features Panning Control.
 */
class ChordVoice {
    constructor(ctx, destDry, destWet) {
        this.ctx = ctx;

        // Two Oscillators
        this.osc1 = ctx.createOscillator();
        this.osc2 = ctx.createOscillator();

        this.osc1.type = 'sawtooth';
        this.osc2.type = 'sawtooth';

        // Individual gains for crossfading if needed, or just mix them
        this.mixGain = ctx.createGain();
        this.mixGain.gain.value = 0.3; // Base level

        this.osc1.connect(this.mixGain);
        this.osc2.connect(this.mixGain);

        // Filter
        this.filter = ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 2000;
        this.filter.Q.value = 1;

        this.mixGain.connect(this.filter);

        // Panning Logic
        // "Both speakers get relatively equal levels of gain with different frequencies."
        // Implementation:
        // Signal -> Splitter
        // Lows -> Center
        // Highs -> Panner

        this.crossover = ctx.createBiquadFilter();
        this.crossover.type = 'lowpass';
        this.crossover.frequency.value = 250;

        this.highpass = ctx.createBiquadFilter();
        this.highpass.type = 'highpass';
        this.highpass.frequency.value = 250;

        this.filter.connect(this.crossover);
        this.filter.connect(this.highpass);

        // Lows go straight to master (Center)
        this.centerGain = ctx.createGain();
        this.crossover.connect(this.centerGain);

        // Highs go to Panner
        this.panner = ctx.createStereoPanner();
        this.highpass.connect(this.panner);

        // Master Volume for this voice
        this.outputGain = ctx.createGain();
        this.outputGain.gain.value = 0; // Starts silent

        this.centerGain.connect(this.outputGain);
        this.panner.connect(this.outputGain);

        this.outputGain.connect(destDry);
        this.outputGain.connect(destWet);

        this.osc1.start();
        this.osc2.start();
    }

    setNotes(f1, f2, now) {
        // Slight detune for lushness
        this.osc1.frequency.setTargetAtTime(f1, now, 0.1);
        this.osc2.frequency.setTargetAtTime(f2, now, 0.1);
    }

    updateParams(volume, pan, now) {
        this.outputGain.gain.setTargetAtTime(volume, now, 0.1);
        this.panner.pan.setTargetAtTime(pan, now, 0.1);

        // Open filter with volume for expression
        const cutoff = 500 + (volume * 4000);
        this.filter.frequency.setTargetAtTime(cutoff, now, 0.1);
    }

    silence(now) {
        this.outputGain.gain.setTargetAtTime(0, now, 0.5);
    }
}
