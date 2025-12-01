# Refactoring Report for TRIANGLE Project

## 1. Codebase Quality and Structure Assessment

### Monolithic Structure Analysis
The current `index.html` file is a monolithic entity that violates the Single Responsibility Principle (SRP). It acts as:
1.  **Document Structure**: Defines the HTML DOM.
2.  **Styler**: Contains CSS in `<style>` blocks.
3.  **Dependency Manager**: Imports scripts via both UMD tags and an Import Map.
4.  **Application Logic**: Defines all classes (`App`, `VisionSystem`, `AudioSystem`, etc.) and global state.
5.  **Bootstrapper**: Initializes the application on `window.onload`.

This tight coupling makes the application difficult to navigate, test, and maintain. A change in the rendering logic requires editing the same file as the CSS or the computer vision logic.

### Modularity and Dependency Audit

**Custom Classes:**
*   **`PerformerState`**: encapsulations state well but is tightly coupled to the global `CONFIG` object for smoothing factors and grid scaling.
*   **`VisionSystem`**: Encapsulates TensorFlow.js logic but reads `CONFIG.camera` global to update settings.
*   **`LatticeViewport`**: Tightly coupled to `CONFIG.grid`. Handles both Three.js scene setup and rendering.
*   **`AudioSystem`**: Directly reads `CONFIG.audio`.
*   **`Autopilot`**: Directly manipulates `PerformerState` properties.
*   **`App`**: The "God Object" that orchestrates everything. It contains complex logic for mapping vision data to performer state (`_updatePhysicalFromPoses`), which violates SRP.

**Dependencies:**
*   **Mixed Module Systems**: The file uses UMD scripts for TensorFlow.js and Tween.js (global scope pollution) while using ESM for Three.js (via Import Map). This is inconsistent and brittle.
*   **Hardcoded CDNs**: Dependencies are loaded from `cdn.jsdelivr.net`, requiring an internet connection and lacking version pinning guarantees provided by `package.json`.

**Global State:**
*   `CONFIG`, `BEAUTIFUL_INTERVALS`, and `PERFORMER_COLORS` are global variables. This makes unit testing impossible without mocking the global scope and prevents running multiple instances of the systems with different configurations.

### Adherence to Principles

*   **DRY (Don't Repeat Yourself)**:
    *   Grid generation logic in `_initLattice` uses three very similar loops.
    *   Coordinate mapping logic is repeated or hardcoded in `_updatePhysicalFromPoses`.
*   **KISS (Keep It Simple, Stupid)**:
    *   `_updatePhysicalFromPoses` is overly complex. It parses raw keypoints, calculates geometry, and updates state in one large function.
*   **DIP (Dependency Inversion Principle)**:
    *   High-level `App` directly depends on low-level implementations (`VisionSystem`, `AudioSystem`).
    *   Classes depend on the concrete global `CONFIG` object rather than an injected configuration interface.

### Performance and Browser-Specific Concerns
*   **Rendering Loop**: `_renderViewports` allocates new objects (scissor rectangles) every frame, which triggers garbage collection.
*   **Vision Updates**: `VisionSystem.update()` runs on every animation frame. If pose estimation takes longer than ~16ms, it will degrade the frame rate.
*   **DOM Manipulation**: `DebugOverlay` updates DOM elements (`innerText`) every frame, which can cause layout thrashing.

## 2. Deep Refactoring Plan Proposal

### Stage 1: File Separation and Basic Module Conversion (High Priority)

**File Separation:**
*   `src/config.js`: Exports `CONFIG`, `BEAUTIFUL_INTERVALS`, `PERFORMER_COLORS`.
*   `src/core/PerformerState.js`: `PerformerState` class.
*   `src/systems/VisionSystem.js`: `VisionSystem` class.
*   `src/systems/AudioSystem.js`: `AudioSystem` class.
*   `src/rendering/LatticeViewport.js`: `LatticeViewport` class.
*   `src/logic/Autopilot.js`: `Autopilot` class.
*   `src/ui/DebugOverlay.js`: `DebugOverlay` class.
*   `src/App.js`: Main `App` class.
*   `src/main.js`: Entry point.
*   `src/style.css`: Extracted CSS.

**Module System Conversion:**
*   Initialize `package.json`.
*   Install `three`, `@tweenjs/tween.js`, `@tensorflow/tfjs`, `@tensorflow-models/pose-detection` via npm.
*   Replace all CDN imports with standard ESM imports (e.g., `import * as THREE from 'three'`).

**Global State Elimination:**
*   Refactor all class constructors to accept a `config` object.
*   Pass `CONFIG` from `main.js` -> `App.js` -> Systems.

### Stage 2: Architectural Decoupling and Abstraction (Medium Priority)

**Core Class Refinement:**
*   **Decouple Rendering**: `LatticeViewport` should ideally accept a plain data object for rendering, not the full `PerformerState` instance.
*   **Logic Extraction**: Extract the complex pose-to-state mapping logic from `App._updatePhysicalFromPoses` into a `PoseMapper` utility or service.

**Interface/Service Layer:**
*   Create a `InputSystem` abstraction that could potentially handle other inputs (mouse, keyboard) alongside `VisionSystem`.

**Error Handling:**
*   Improve `VisionSystem` initialization to handle camera failures gracefully (fallback to autopilot or demo mode).

### Stage 3: Tooling and Deployment Modernization (Low Priority)

**Build System:**
*   Use **Vite**. It is fast, supports ESM natively during dev, and bundles efficiently for production.

**Linting and Formatting:**
*   Setup **ESLint** and **Prettier** to enforce code style.

**Test Strategy:**
*   Unit Test 1: `PerformerState.updatePhysics()` verifies smoothing logic.
*   Unit Test 2: `Autopilot.step()` verifies switching logic.
*   Unit Test 3: `AudioSystem` frequency calculation logic (refactored to be pure).

## Prioritized Action Checklist

1.  **Initialize Project**: Create `package.json` and install dependencies (`three`, `vite`, etc.).
2.  **Extract Config & Styles**: Move globals and CSS to `src/config.js` and `src/style.css`.
3.  **Modularize Classes**: Split `index.html` scripts into separate files in `src/`, injecting `config` via constructors.
4.  **Setup Vite**: Configure `vite.config.js` and update `index.html` to use the module entry point.
5.  **Refactor App**: Clean up `App.js` to import and coordinate these modules properly.
