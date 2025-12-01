# Refactoring Plan

## 1. Project Initialization
- [ ] Create `package.json` with dependencies: `three`, `@tweenjs/tween.js`, `@tensorflow/tfjs-core`, `@tensorflow/tfjs-converter`, `@tensorflow/tfjs-backend-webgl`, `@tensorflow-models/pose-detection`, `vite`.
- [ ] Create `vite.config.js`.
- [ ] Create folder structure:
    - `src/core/`
    - `src/systems/`
    - `src/state/`
    - `src/graphics/`
    - `src/ui/`

## 2. Core Extraction
- [ ] **`src/core/Config.js`**: Extract `CONFIG` object.
- [ ] **`src/core/Constants.js`**: Extract `BEAUTIFUL_INTERVALS`, `PERFORMER_COLORS`.

## 3. Logic & State Refactoring (The Critical Boundary)
- [ ] **`src/state/Performer.js`**:
    - This will be the new home for `PerformerState` + logic.
    - Implement `constructor(color, isBass)`.
    - Implement `updateFromPose(pose, videoWidth, videoHeight, isMirrored)`:
        - Incorporate logic from `App._updatePhysicalFromPoses`.
        - Calculate `target.yaw`, `target.pitch`, `target.depth`.
        - Calculate Triangle metrics (width, height, area).
        - Update `bpmPref` and `noteRatio`.
    - Implement `updatePhysics()`: Smoothing logic.
- [ ] **`src/state/Autopilot.js`**:
    - Refactor `Autopilot` class to manipulate `Performer` instances using their public methods or directly setting target states (since it simulates input).

## 4. Systems Extraction
- [ ] **`src/systems/VisionSystem.js`**:
    - Copy `VisionSystem` class.
    - Ensure it returns raw TFJS poses.
    - Remove dependencies on global `CONFIG` where possible (pass via constructor or init).
- [ ] **`src/systems/AudioSystem.js`**:
    - Copy `AudioSystem` class.
    - Ensure `update(performers)` method consumes the new `Performer` class structure.
- [ ] **`src/graphics/LatticeViewport.js`**:
    - Copy `LatticeViewport` class.
    - Ensure `render` method consumes `Performer` state.

## 5. UI Extraction
- [ ] **`src/ui/DebugOverlay.js`**:
    - Copy `DebugOverlay`.
    - Adapt to read from new `Performer` structure.

## 6. Main Application Assembly
- [ ] **`src/App.js`**:
    - Import all modules.
    - Initialize `VisionSystem`, `AudioSystem`, `performers` list.
    - Implement the strict loop:
        1. `vision.update()` -> `poses`
        2. `performers[0].updateFromPose(dominantPose)`
        3. `autopilot.update()`
        4. `performers.forEach(p => p.updatePhysics())`
        5. `audio.update(performers)`
        6. `graphics.render(performers)`
- [ ] **`src/main.js`**:
    - Simple entry point to instantiate `App`.

## 7. Entry Point Update
- [ ] **`index.html`**:
    - Remove all inline scripts.
    - Add `<script type="module" src="/src/main.js"></script>`.
    - Keep CSS in head (or move to `style.css` if preferred, but not strictly necessary for this refactor).

## 8. Verification
- [ ] Verify `npm run dev` works.
- [ ] Verify Audio/Visuals respond to "Performer" state.
- [ ] Verify strict separation: grep for `vision` usage in Audio/Graphics (should be 0).
