# Architecture Assessment

## 1. Executive Summary

The codebase has successfully implemented the *logical* separation of concerns into three main modules:
1.  **Performance Manager** (Input & State)
2.  **Performance Visualizer** (Graphics)
3.  **Performance Listener** (Audio)

However, the file structure does **not** adhere to the "fully independent apps" criteria. The codebase currently uses a *layered* architecture (systems, graphics, state) rather than a *modular* architecture (Manager, Visualizer, Listener). This creates implicit coupling and scattered dependencies that would prevent these modules from functioning as standalone applications without significant extraction work.

**Adherence Score:**
*   **Logical Separation:** High
*   **Structural Independence:** Low

## 2. Current Architecture Overview

The current file structure groups files by technical role (horizontal slicing):

```
src/
├── modules/ (The entry points)
│   ├── PerformanceManager.js
│   ├── PerformanceVisualizer.js
│   └── PerformanceListener.js
├── systems/ (Shared logic)
│   ├── VisionSystem.js (Used by Manager)
│   ├── AutopilotSystem.js (Used by Manager)
│   └── AudioSystem.js (Used by Listener)
├── graphics/ (Shared logic)
│   └── LatticeViewport.js (Used by Visualizer)
├── state/ (Shared data)
│   └── Performer.js (Shared Data Model)
└── core/ (Shared config)
    └── Config.js
```

The desired architecture requires "vertical slicing," where each module contains all its necessary dependencies, operating like a standalone app.

## 3. Gap Analysis

| Criteria | Current State | Desired State |
| :--- | :--- | :--- |
| **Separation** | Modules exist but import from shared `src/systems` and `src/graphics`. | Each module folder contains its own systems, graphics, and helpers. |
| **Independence** | Modules rely on a shared global `Config.js` and `Performer` class definition. | Modules define their own config or receive it via DI. Data models are local or treated as plain interfaces. |
| **App-like** | Modules are just classes. | Modules are directory-based "packages" with their own internal structure. |

## 4. Detailed Module Assessment

### 2a. Performance Manager
*   **Role:** Input processing and State management.
*   **Violations:**
    *   Imports `VisionSystem` and `AutopilotSystem` from `../systems/`. These are core components of the Manager and should be internal to it.
    *   Imports `Performer` from `../state/`. As the *creator* of Performers, the Manager should ideally own the definition, or at least the logic for updating them.
    *   Depends on global `Config.js` for input-specific settings (`camera`, `mirrored`).

### 2b. Performance Visualizer
*   **Role:** Visual output.
*   **Violations:**
    *   Imports `LatticeViewport` from `../graphics/`. This is the core rendering logic and belongs inside the Visualizer.
    *   Imports `DebugOverlay` from `../ui/`.
    *   Directly consumes `Performer` class instances. Ideally, it should consume a Read-Only interface or a plain data structure to decouple it from the Manager's update logic.

### 2c. Performance Listener
*   **Role:** Audio output.
*   **Violations:**
    *   Imports `AudioSystem` from `../systems/`. The audio engine is the "App" of the Listener.
    *   Depends on global `Config.js` for audio mixing parameters.

## 5. Code Level Observations

*   **App.js**: Correctly functions as the composition root, wiring the three modules together. This part of the architecture is sound.
*   **Coupling**: The `Performer` class is a hybrid. It contains physics update logic (Manager's concern) and presentation state (Visualizer/Listener's concern). In a strict separation, the Manager should calculate state and pass simple data objects (DTOs) to the reactors.

## 6. Recommendations for Refactoring

To meet the "fully independent apps" criteria, the file structure should be reorganized as follows:

```
src/
├── PerformanceManager/
│   ├── index.js (formerly modules/PerformanceManager.js)
│   ├── systems/
│   │   ├── VisionSystem.js
│   │   └── AutopilotSystem.js
│   └── state/
│       └── Performer.js (Logic for updating performer)
├── PerformanceVisualizer/
│   ├── index.js (formerly modules/PerformanceVisualizer.js)
│   ├── graphics/
│   │   └── LatticeViewport.js
│   └── ui/
│       └── DebugOverlay.js
├── PerformanceListener/
│   ├── index.js (formerly modules/PerformanceListener.js)
│   └── audio/
│       ├── AudioSystem.js
│       └── (Audio sub-components)
└── App.js (Imports from the above directories)
```

**Steps to achieve compliance:**
1.  **Move Files:** Relocate files from `systems`, `graphics`, and `ui` into their respective Module directories.
2.  **Decouple Config:** Split `Config.js` or ensure each module accepts its configuration in its constructor, rather than importing a global singleton.
3.  **Standardize Interfaces:** Ensure `Visualizer` and `Listener` rely on the *data* structure of `Performer`, not necessarily the class methods intended for the Manager.

This structure ensures that if one folder is deleted, the others remain syntactically valid (though functionally incomplete without the missing part of the pipeline), fulfilling the requirement of being "basically, fully independent apps."
