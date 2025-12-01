# Architectural Assessment & Refactoring Strategy

## Executive Summary
The current application "Perfume: Lattice Performer" is a functional prototype implemented as a monolithic `index.html` file. While it successfully integrates complex systems (TensorFlow.js MoveNet, Three.js, Web Audio API), the architecture suffers from tight coupling, lack of modularity, and rigid data flow management.

To ensure scalability, maintainability, and adherence to the required strict separation of concerns, the system requires a complete overhaul. The goal is to transition from a "Controller-heavy" architecture (where `App` manages logic) to a "Performer-centric" data pipeline.

## Current Architecture Evaluation

### 1. Structural Integrity
*   **Status:** **Critical**. The entire codebase resides within a single `index.html` file.
*   **Implications:**
    *   Zero separation of concerns at the file level.
    *   No build process or dependency management (relies on fragility of global CDN links).
    *   Classes (`App`, `VisionSystem`, `AudioSystem`, etc.) are defined in the global scope (or module scope of one script block).

### 2. Separation of Concerns & Data Flow
*   **Requirement:** Data (Vision) → Performer Logic → Output (Audio/Visual).
*   **Current Reality:** Data (Vision) → **App Controller** → Performer State → Output.
*   **Violations:**
    *   **Logic Leakage:** The critical business logic that translates raw pose data (keypoints) into abstract performer state (pitch, yaw, intensity) resides in `App._updatePhysicalFromPoses()`.
    *   **Passive State:** `PerformerState` is currently a "dumb" data container. It should be an intelligent agent that consumes raw data and updates itself.
    *   **Controller Bottleneck:** The `App` class knows too much. It orchestrates the granular details of how vision data maps to physics.

### 3. Coupling Analysis
*   **VisionSystem:** Relatively decoupled, returns raw poses. Good.
*   **AudioSystem:** Depends on `PerformerState`. Good, but relies on the `App` to have correctly populated that state externally.
*   **LatticeViewport (Visual):** Same as Audio. Tightly coupled to `CONFIG` globals.
*   **Globals:** Heavy reliance on `CONFIG` and `BEAUTIFUL_INTERVALS` available in the global scope.

## Detailed Refactoring Strategy

### Phase 1: Modularization & Infrastructure
Establish a standard modern JavaScript environment to support modularity.
*   **Action:** Initialize `package.json` and `vite` for build tooling.
*   **Action:** Create a directory structure: `src/{core, systems, state, graphics, ui}`.

### Phase 2: Pipeline Restructuring (The "Performer-Centric" Model)
This is the core of the request. We will move the interpretation logic out of the main loop and into the Performer entity.

#### 1. Data Layer (`VisionSystem`)
*   **Role:** Pure Provider.
*   **Change:** No significant logic change, but will be isolated in `src/systems/VisionSystem.js`. It purely outputs raw MoveNet data.

#### 2. Performer Logic Layer (`Performer` & `PerformerState`)
*   **Role:** Interpreter & State Manager.
*   **Major Change:** Move `App._updatePhysicalFromPoses` logic into a new method `Performer.updateFromPose(pose)`.
*   **Responsibility:**
    *   Receive raw `pose` object.
    *   Calculate shoulder tilt (Yaw), verticality (Pitch), depth, and hand-triangle metrics.
    *   Update internal physics (smoothing, interpolation).
    *   Expose a clean "Read-Only" state for output layers.

#### 3. Output Layers (Audio & Visual)
*   **Role:** Pure Consumers.
*   **Constraint:** They must *never* read raw vision data. They only read the `Performer` properties (e.g., `performer.rotation.yaw`, `performer.intensity`).
*   **Audio:** Receives list of `Performer` objects. Synthesizes sound based on their state.
*   **Visual:** Receives list of `Performer` objects. Renders the lattice and avatars.

### Phase 3: The Orchestrator (`App`)
*   **Role:** Pipeline Manager.
*   **New Flow:**
    ```javascript
    loop() {
        const rawData = visionSystem.read();
        performers.forEach(p => p.process(rawData)); // Logic happens HERE
        audioSystem.render(performers);
        graphicsSystem.render(performers);
    }
    ```

## Justification for Changes
1.  **Encapsulation:** By moving pose interpretation into the `Performer`, we can change the input method (e.g., from Webcam to Mouse or VR Controller) without breaking the Audio/Visual systems, as long as the Performer outputs the same abstract state.
2.  **Testability:** We can unit test the `Performer` logic (e.g., "does a 45-degree arm tilt produce X yaw?") without needing a webcam or a browser environment.
3.  **Clarity:** The `App` loop becomes a high-level description of the system's data flow, rather than a spaghetti of math and API calls.
