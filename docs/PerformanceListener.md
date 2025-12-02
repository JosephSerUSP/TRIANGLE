# PerformanceListener Module

## Overview

The `PerformanceListener` module is the audio engine of the *Perfume* application. It is responsible for generating all sound in real-time based on the state of the performers, as provided by the `PerformanceManager`. It uses the Web Audio API for all synthesis and sequencing.

## Core Components

### `AudioSystem`

-   **Purpose**: This is the central class for all audio operations. It manages the audio context, master effects chain, instruments, and the musical sequencer.
-   **Key Features**:
    1.  **Audio Context**: It initializes and manages the `AudioContext`, the core of the Web Audio API.
    2.  **Master Effects Chain**: It sets up a master signal chain that includes a `DynamicsCompressor` for mastering and a `ConvolverNode` for reverb, giving the overall mix a cohesive and polished sound.
    3.  **Instruments**: It creates and holds instances of all the synthesizer instruments used in the performance.
    4.  **Sequencer**: It contains a precise, lookahead scheduler that handles the timing of all musical events.

### `Synthesizer` (Base Class) and Instruments

-   **Purpose**: A collection of classes that define the different sounds (instruments) in the performance.
-   **Hierarchy**:
    -   `Synthesizer`: A base class providing common functionality like an output gain node and a stereo panner.
    -   **Instrument Classes** (e.g., `PulseBass`, `StringPad`, `PluckSynth`, `KickDrum`): Each of these classes extends `Synthesizer` and implements its own unique sound-generating logic using Oscillators, Filters, and Envelopes.
-   **Voices**:
    -   **Performer 1**: Controls a `PulseBass` (for rhythmic basslines) and a `StringPad`.
    -   **Performer 2**: Controls a `PluckSynth` (for ostinato patterns) and a `StringPad`.
    -   **Performer 3**: Controls an `ArpSynth` (for arpeggiated patterns) and a `StringPad`.
    -   **System**: A `KickDrum` provides a global rhythmic pulse when multiple performers are active.

### `MusicTheory`

-   **Purpose**: A utility file that defines the musical constants for the performance.
-   **Contents**:
    -   `CHORD_PROGRESSION`: An array of chord objects that defines the harmonic progression of the piece.
    -   `SCALES`: Defines musical scales used for generating melodic patterns.

## Audio Generation Process

The audio generation is driven by a time-based sequencer within the `AudioSystem`.

1.  **User Interaction**: The `AudioContext` can only be started after a user gesture (e.g., a click). The `PerformanceListener` sets up event listeners to handle this initialization.
2.  **Scheduler Loop**: Once initialized, the `_scheduler()` method runs continuously. It uses a lookahead approach to schedule musical events with high precision.
    -   It checks for notes that need to be scheduled within a small future time window (e.g., the next 100ms).
    -   It calls `_scheduleNote()` for each 16th note that falls within this window.
3.  **`_scheduleNote()` Logic**: This is the core of the musical decision-making. For each 16th note:
    -   It determines the current chord from the `CHORD_PROGRESSION`.
    -   It iterates through each performer and decides whether to play a note based on:
        -   The performer's `active` state and current `expression` level.
        -   Pre-defined rhythmic patterns (e.g., `bassPattern`, `kickPattern`).
        -   The current musical context (e.g., playing a sparser pattern during an "intro" phase).
    -   When a note is triggered, it calls the `playNote()` method of the appropriate instrument, passing in the frequency, time, duration, and velocity.
4.  **Instrument Sound Generation**: The `playNote()` method within each instrument class creates the actual sound using Web Audio API nodes (`OscillatorNode`, `GainNode`, `BiquadFilterNode`, etc.) and schedules their parameters (e.g., frequency, gain envelopes) to create the desired sound at the precise scheduled time.
5.  **State Updates**: The main `update()` method of the `AudioSystem` is called on every animation frame. It receives the latest `performers` data and updates internal state variables that the sequencer uses to modulate the music, such as performer expression, panning, and channel state (intro/main/outro).
