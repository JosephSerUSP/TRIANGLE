# TRIANGLE Codebase Assessment and Refactoring Plan

## 1. Codebase Quality and Structure Assessment

### Monolithic Structure Analysis
The `index.html` file is a classic monolithic implementation where HTML structure, CSS styling, vendor script imports, and complex JavaScript application logic coexist.

-   **Single Responsibility Principle (SRP)**: The file violates SRP. It defines the DOM structure, styles it, configures global settings, defines domain entities (`PerformerState`), implements core systems (`VisionSystem`, `AudioSystem`, `LatticeViewport`), and acts as the application controller (`App`).
-   **Separation of Concerns**: There is no physical separation of concerns.
    -   **HTML/CSS**: Embedded directly in the file.
    -   **Dependencies**: Imported via `<script>` tags (UMD) and an import map (ESM) in the head.
    -   **Logic**: All classes are defined in a single `<script type="module">` block.

### Modularity and Dependency Audit

-   **Custom Classes**:
    -   `PerformerState`: Encapsulates data well but exposes internal state (`current`, `target`, `triangle`) directly.
    -   `LatticeViewport`: Tightly coupled to `CONFIG` global. Mixes initialization logic with rendering logic.
    -   `VisionSystem`: Hardcoded to use specific `CONFIG` values.
    -   `AudioSystem`: Good encapsulation of the AudioContext but depends on global `CONFIG`.
    -   `Autopilot`: Directly modifies `PerformerState` objects.
-   **External Dependencies**:
    -   **Three.js**: ESM via CDN.
    -   **Tween.js**: ESM via CDN and UMD via CDN (Redundant).
    -   **TensorFlow.js & Models**: UMD via CDN (Global pollution).
    -   **Rationale**: The mix of UMD and ESM is likely due to legacy TFJS integration or ease of prototyping, but it creates a fragile loading order and namespace pollution.
-   **Global State**:
    -   `CONFIG`, `BEAUTIFUL_INTERVALS`, `PERFORMER_COLORS` are globals.
    -   **Impact**: Makes unit testing impossible without mocking the global scope. Classes are not reusable or configurable without modifying the global object.

### Adherence to Principles

-   **DRY (Don't Repeat Yourself)**:
    -   Initialization of `PerformerState` and `LatticeViewport` is done in loops, which is good.
    -   Shader code is embedded in strings, making reuse or syntax highlighting difficult.
-   **KISS (Keep It Simple, Stupid)**:
    -   The `_updatePhysicalFromPoses` method in `App` is complex and does too much (parsing poses, mapping to physical parameters, geometry calculations).
-   **DIP (Dependency Inversion Principle)**:
    -   Violated. `App` directly instantiates `VisionSystem`, `AudioSystem`, etc. There is no injection of dependencies, making components hard to swap or test.

### Performance and Browser-Specific Concerns

-   **Main Thread Blocking**: `await this.detector.estimatePoses(this.video)` in the main loop (`loop()`) can cause frame drops if inference is slow.
-   **Memory Allocation**: `_renderViewports` creates new objects (`rect`) and array closures on every frame, which could lead to garbage collection stutter.
-   **WebGL Context**: The application is robust in creating a single WebGLRenderer, but multiple scenes/cameras in `LatticeViewport` (via `render` method) is a good approach for split-screen.

## 2. Deep Refactoring Plan Proposal

### Stage 1: File Separation and Basic Module Conversion (High Priority)

**Goal**: Physically separate concerns and establish a modern module system.

1.  **File Separation**:
    -   `src/config.js`: `CONFIG`, `BEAUTIFUL_INTERVALS`, `PERFORMER_COLORS`.
    -   `src/core/PerformerState.js`: `PerformerState` class.
    -   `src/systems/VisionSystem.js`: `VisionSystem` class.
    -   `src/systems/AudioSystem.js`: `AudioSystem` class.
    -   `src/rendering/LatticeViewport.js`: `LatticeViewport` class.
    -   `src/logic/Autopilot.js`: `Autopilot` class.
    -   `src/utils/DebugOverlay.js`: `DebugOverlay` class.
    -   `src/App.js`: `App` class.
    -   `src/style.css`: Extracted CSS.
    -   `src/main.js`: Entry point.

2.  **Module System Conversion**:
    -   Migrate to a build tool (Vite) to handle NPM dependencies.
    -   Replace CDN links with `npm install`:
        -   `three`
        -   `@tweenjs/tween.js`
        -   `@tensorflow/tfjs`
        -   `@tensorflow-models/pose-detection`
    -   Rewrite all imports to standard ESM syntax.

3.  **Global State Elimination**:
    -   Export `CONFIG` from `src/config.js`.
    -   Update classes to accept `config` as a constructor argument or import it directly (though injection is preferred for testing).

### Stage 2: Architectural Decoupling and Abstraction (Medium Priority)

**Goal**: Improve testability and flexibility.

1.  **Core Class Refinement**:
    -   Refactor `PerformerState` to have clear mutation methods rather than direct property access.
    -   `App` should delegate the "pose to parameter" mapping logic to a specialized `PoseMapper` or `InputHandler`.

2.  **Interface/Service Layer**:
    -   **Input Layer**: Abstract `VisionSystem` behind a generic event emitter or state provider so other inputs (mouse, MIDI) could drive performers.
    -   **Audio Layer**: `AudioSystem` should expose high-level methods like `setPerformerState(id, state)` instead of reading raw arrays in `update()`.

3.  **Error Handling**:
    -   Wrap `VisionSystem.init` in robust try/catch blocks with fallbacks (e.g., if camera fails, enable Autopilot for all).

### Stage 3: Tooling and Deployment Modernization (Low Priority)

**Goal**: Ensure code quality and ease of deployment.

1.  **Build System**: Use Vite for fast development and optimized production builds.
2.  **Linting/Formatting**: Setup ESLint and Prettier.
3.  **Testing**: Add Vitest.
    -   Test `PerformerState` physics interpolation.
    -   Test `Autopilot` logic.

## Prioritized Action Checklist

1.  [ ] **Initialize Vite Project**: Create `package.json`, install dependencies (`three`, `tfjs`, etc.), and setup `vite.config.js`.
2.  [ ] **Extract Config and Styles**: Move constants to `src/config.js` and CSS to `src/style.css`.
3.  [ ] **Modularize Classes**: Split `index.html` classes into individual files in `src/` directory.
4.  [ ] **Fix Imports & Globals**: Replace CDN imports with NPM package imports and ensure `CONFIG` is imported/injected.
5.  [ ] **Reassemble Entry Point**: Create `src/main.js` and update `index.html` to load the module.
