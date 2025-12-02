# PerformanceVisualizer Module

## Overview

The `PerformanceVisualizer` is responsible for all visual output in the *Perfume* application. It takes the state data from the `PerformanceManager` and translates it into a compelling 3D scene rendered with Three.js.

Its primary functions are to manage the 3D scene, handle the rendering of each performer's viewport, and display debug information.

## Core Components

### `LatticeViewport`

-   **Purpose**: This is the core graphical component, responsible for rendering the 3D world for a single performer. Each performer in the system has a dedicated `LatticeViewport`.
-   **Functionality**:
    1.  **Scene Management**: Each viewport maintains its own Three.js `Scene` and `Camera`.
    2.  **Lattice Grid**: It creates and renders the infinite lattice grid using a custom shader. The shader displaces the grid vertices based on the performer's `depth` and `yaw`/`pitch`/`roll`, creating the illusion of navigating through the space.
    3.  **Performer Representation**: It renders a triangular mesh that represents the performer's gesture (formed by their head and hands). The visibility and shape of this triangle are directly controlled by the `Performer` state.
    4.  **Stencil Masking**: A key feature is its use of the stencil buffer to render viewports with angled, shared boundaries. This allows for dynamic, non-rectangular screen layouts where the viewports can tilt and resize smoothly.

### `DebugOverlay`

-   **Purpose**: Provides a 2D canvas overlay for displaying real-time debugging information.
-   **Functionality**:
    1.  Toggled by the 'D' key.
    2.  Displays raw pose data, such as the detected skeletons.
    3.  Prints key performance metrics, such as the current BPM, depth, and triangle area for each performer.

## Rendering Process

The rendering process is executed on every frame via the `update()` method, which receives the `performanceData` object.

1.  **Calculate Layout**: The `_calculateLayout()` method is the heart of the dynamic viewport system.
    -   It determines the width of each performer's viewport based on their `presence` value. A performer with a higher presence (i.e., more actively tracked) gets a larger share of the screen.
    -   It calculates the angle of the dividing line between viewports based on the `roll` of the performer on the left. This creates the tilting effect.
    -   It generates a set of `corners` (top-left, top-right, bottom-left, bottom-right) for each active viewport. These corners define the trapezoidal shape of the viewport on the screen.

2.  **Render Viewports**: The `_renderViewports()` method iterates through the calculated layout.
    -   For each active viewport, it calls the `render()` method of the corresponding `LatticeViewport` instance.
    -   It passes the renderer, the bounding box (`rect`), the performer's state, and the calculated `corners`.

3.  **Stencil Rendering in `LatticeViewport`**:
    -   First, a 2D mask (a trapezoid matching the `corners`) is rendered into the stencil buffer. This mask doesn't draw any colors; it just marks a specific area of the screen.
    -   Next, the 3D scene (the lattice and performer triangle) is rendered. The shader is configured to only draw pixels where the stencil buffer has been marked.
    -   This process is repeated for each active viewport, with the buffer being cleared and updated for each one.

4.  **Draw Debug Overlay**: Finally, the `debug.draw()` method is called to render the 2D debug information on top of the 3D scene.
