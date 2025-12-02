# Structural Analysis of the Perfume Application

## Overview

The *Perfume* application is designed with a modular architecture that cleanly separates concerns. This separation is crucial for managing the complexity of a real-time system that combines computer vision, 3D graphics, and generative audio. The architecture follows a classic **Model-View-Controller (MVC)** pattern, albeit with some adaptations for a real-time performance context.

-   **Model**: The `PerformanceManager` acts as the primary model, holding the complete state of the performance.
-   **View**: The `PerformanceVisualizer` serves as the view, responsible for all visual output.
-   **Controller**: The main `App` class acts as the controller, orchestrating the flow of data between the model and the view, as well as the audio engine.

The entire application is driven by a central `requestAnimationFrame` loop initiated in the `App` class.

## Core Modules and Interaction

The application is built around three top-level modules, each with a distinct responsibility:

1.  **`PerformanceManager` (The "Brain" / Model)**
    -   **Role**: To manage the state of the performance.
    -   **Inputs**: Receives raw data from the `VisionSystem` (camera poses) and the `AutopilotSystem` (AI-generated data).
    -   **Processing**: It interprets these raw inputs to update the state of its `Performer` objects. This involves selecting a dominant performer, sorting poses, and applying smoothing physics to the performers' movements.
    -   **Outputs**: It exposes a single, comprehensive `performanceData` object that contains the fully processed state of all performers.

2.  **`PerformanceVisualizer` (The "Eyes" / View)**
    -   **Role**: To render the visual representation of the performance state.
    -   **Inputs**: Receives the `performanceData` object from the `App` loop.
    -   **Processing**: It reads the state of each `Performer` from the data object and uses it to:
        -   Update the camera position and rotation within each `LatticeViewport`.
        -   Control the shape and visibility of the performer's triangular representation.
        -   Dynamically calculate the screen layout, adjusting the size and tilt of the viewports based on performer presence and roll.
    -   **Outputs**: Renders the final 3D scene to the HTML canvas.

3.  **`PerformanceListener` (The "Ears" / Audio Engine)**
    -   **Role**: To generate the audio representation of the performance state.
    -   **Inputs**: Receives the `performanceData` object from the `App` loop.
    -   **Processing**:
        -   The `update` method extracts high-level musical parameters (like expression, pan, and active state) from the `Performer` objects.
        -   This state is used to modulate the parameters of the internal audio sequencer. The sequencer runs on its own precise timer, separate from the animation loop, to ensure rhythmic stability.
        -   The sequencer decides which notes to play for which instruments based on the performer states and pre-defined musical logic (patterns, chord progressions).
    -   **Outputs**: Produces audio through the Web Audio API.

## The Main Loop: A Unidirectional Data Flow

The application's main loop, located in `App.js`, enforces a clear and simple unidirectional data flow. This is key to the stability and predictability of the system.

```
+---------------------+
|        App          |
| (Controller)        |
+---------------------+
          |
          | 1. Calls update()
          v
+---------------------+
| PerformanceManager  |
| (Model)             |
| - Gathers pose data |
| - Updates state     |
+---------------------+
          |
          | 2. Returns performanceData
          v
+---------------------+
|        App          |
+---------------------+
          |
          | 3. Passes performanceData to...
          |
    +----->-------------+----->
    |                   |
    v                   v
+---------------------+   +---------------------+
| PerformanceVisualizer|   | PerformanceListener |
| (View)              |   | (Audio Engine)      |
| - Renders scene     |   | - Updates sequencer |
+---------------------+   +---------------------+
```

**Step-by-step Breakdown:**

1.  The `App`'s `loop()` method calls `performanceManager.update()`.
2.  The `PerformanceManager` does its work and returns the single source of truth: the `performanceData` object.
3.  The `App` takes this data object and passes it down to the `PerformanceVisualizer` and the `PerformanceListener`.
4.  The visualizer and listener independently update themselves based on this data. They do not modify the state themselves; they only "listen" to it.

This unidirectional flow prevents complex feedback loops and makes the application easier to debug and reason about. The `PerformanceManager` is the sole owner of the performance state, while the other modules are reactive components.
