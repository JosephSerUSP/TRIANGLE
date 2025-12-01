# Project Assessment and Refactoring Plan

## 1. Quality and Structure Assessment

### Current State
The project is currently implemented as a "single-file application" (`index.html`). It relies on CDN links for external libraries (Three.js, TensorFlow.js, Tween.js) and contains all application logic within a single `<script type="module">` block.

### Strengths
*   **Logical Separation:** Despite being in one file, the code is organized into distinct classes (`App`, `VisionSystem`, `AudioSystem`, `LatticeViewport`, etc.), showing a clear intent for modularity.
*   **Documentation:** The code includes JSDoc-style comments for classes and methods, making it relatively easy to understand.
*   **Functionality:** The core integration of Computer Vision (MoveNet), 3D Graphics (Three.js), and Audio (Web Audio API) is functional.

### Weaknesses & Deviations from Best Practices
*   **Monolithic File:** The `index.html` file is over 700 lines long. This makes navigation, maintenance, and version control difficult.
*   **Tight Coupling:** Classes are instantiated directly within the `App` class. Dependencies are global (via CDN script tags) rather than imported explicitly.
*   **Hard-coded Dependencies:** Using CDNs (e.g., `unpkg`, `jsdelivr`) introduces risks related to network availability and version changes. It also prevents offline development.
*   **No Build Process:** There is no minification, bundling, or asset management.
*   **Render/Logic Coupling:** The main loop awaits the asynchronous `vision.update()` before rendering. If pose detection is slow (which is common), the frame rate of the visual rendering will drop, leading to stuttering. Ideally, rendering should run at the monitor's refresh rate (e.g., 60fps) using the *latest available* pose data, while pose detection runs as fast as it can in parallel.
*   **Lack of Tests:** There is no automated testing infrastructure.

## 2. Deep Refactoring Plan

The goal is to transition from a prototype script to a production-ready, modular modern web application.

### Phase 1: Environment & Build System Setup
1.  **Initialize Node.js Project:** Create `package.json`.
2.  **Install Dependencies:** Replace CDNs with npm packages:
    *   `three`
    *   `@tensorflow/tfjs-core`, `@tensorflow/tfjs-converter`, `@tensorflow/tfjs-backend-webgl`
    *   `@tensorflow-models/pose-detection`
    *   `@tweenjs/tween.js`
3.  **Setup Vite:** Use Vite as the bundler and dev server. It is fast, supports ES modules natively, and handles hot module replacement (HMR).

### Phase 2: Modularization (File Splitting)
Refactor the single script into a structured directory layout under `src/`:

```
src/
├── core/
│   ├── Config.js          # Centralized configuration (CONFIG object)
│   └── Constants.js       # Constants like BEAUTIFUL_INTERVALS, COLORS
├── systems/
│   ├── AudioSystem.js     # Audio logic
│   ├── VisionSystem.js    # Webcam & TensorFlow logic
│   └── Loop.js            # Main game loop (optional, or part of App)
├── graphics/
│   ├── LatticeViewport.js # Three.js scene for a single performer
│   └── SceneManager.js    # (Optional) orchestrator for viewports
├── state/
│   ├── PerformerState.js  # State management for performers
│   └── Autopilot.js       # AI logic
├── ui/
│   └── DebugOverlay.js    # Canvas 2D overlay
├── App.js                 # Main entry class
└── main.js                # Bootstrapper
```

### Phase 3: Code improvements & Decoupling
1.  **Decouple Render & Vision Loops:**
    *   Implement a main animation loop for Three.js (Rendering) that runs on `requestAnimationFrame`.
    *   Run the Vision loop asynchronously. When a new pose is detected, update the state. The render loop simply reads the current state. This ensures smooth visuals even if tracking lags.
2.  **Configuration Injection:** Pass configuration into systems rather than relying on a global `CONFIG` variable (or import a singleton config module).
3.  **Asset Management:** Ensure assets (if any) are handled by the build system.

### Phase 4: Testing & Verification
1.  **Unit Tests:** Add a test runner (e.g., Vitest) and write basic tests for logic-heavy classes like `PerformerState` or `Autopilot`.
2.  **Linting/Formatting:** Set up ESLint and Prettier to enforce code style.
3.  **Manual Verification:** Ensure the refactored app behaves identically to the original.

### Phase 5: Cleanup
1.  Remove the original `index.html` logic and replace it with a clean entry point that references the built bundle.
2.  Update `README.md` with new build/run instructions.
