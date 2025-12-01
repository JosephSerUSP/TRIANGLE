# Project Assessment & Refactoring Plan

## Current State Assessment

### Structure
The project currently resides in a single monolithic `index.html` file containing HTML, CSS, and ~600 lines of JavaScript. The JavaScript is organized into classes (`App`, `VisionSystem`, `AudioSystem`, `LatticeViewport`, `PerformerState`, `Autopilot`, `DebugOverlay`), but they are all tightly coupled within the global scope or the `App` class.

### Quality & Principles
1.  **Coupling**: High.
    *   `App` knows the internal details of `PerformerState` and directly manipulates it based on raw data from `VisionSystem`.
    *   `Autopilot` holds direct references to `PerformerState` objects and modifies them, acting as a "god controller" for virtual performers.
    *   `VisionSystem` is relatively decoupled, but its data is consumed by a hardcoded method in `App`.
2.  **Single Responsibility**: Violated.
    *   `App` handles initialization, the game loop, data transformation (`_updatePhysicalFromPoses`), and UI wiring.
    *   `PerformerState` is a passive data holder, but the logic to update it is scattered across `App` and `Autopilot`.
3.  **Modularity**: Non-existent.
    *   Everything is in one file. No ES module imports/exports are used for internal code.

## Refactoring Plan: Data -> Performer -> Output

The goal is to strictly decouple the data flow into three distinct layers.

### Target Architecture

#### 1. Data Layer (Input)
Sources that produce raw information about "presence" or "intention".
*   **VisionSystem**: Produces `Pose` data from the webcam.
*   **AutopilotSystem**: Produces `VirtualData` (simulated poses or signals) for AI performers.

#### 2. Performer Layer (State/Logic)
The core domain entities. They "look at" the data.
*   **Performer**: A class that consumes input data and updates its internal state (physics, musical attributes).
    *   It should have a method like `update(inputData)`.
    *   It encapsulates the logic previously found in `App._updatePhysicalFromPoses`.
    *   It maintains state: `roll`, `pitch`, `yaw`, `depth`, `bpm`, `noteRatio`.

#### 3. Output Layer (Presentation)
Systems that observe the Performer layer and render it.
*   **AudioSystem**: "Looks at" the Performers to generate sound. It does not know about Vision or Autopilot.
*   **LatticeViewport** (Visual): "Looks at" a Performer to render the 3D graphics.

### Implementation Steps

1.  **Extract Modules**: Move classes to `src/`.
2.  **Standardize Input**: Create a common interface or data structure for "Input Data" (whether from Vision or Autopilot) so the `Performer` can consume it uniformly.
3.  **Decouple Logic**:
    *   Move `_updatePhysicalFromPoses` logic into the `Performer` class (or a `PhysicalPerformer` subclass).
    *   Make `Autopilot` generate data, not side-effects.
4.  **Wire up in App**:
    *   `App` initializes inputs, performers, and outputs.
    *   Loop: `Inputs.update()` -> `Performers.update(InputData)` -> `Outputs.render(Performers)`.

This structure ensures that adding a new input method (e.g., MIDI) or a new output method (e.g., DMX lights) requires no changes to the core `Performer` logic or other systems.
