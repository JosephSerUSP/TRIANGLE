# PerformanceManager Module

## Overview

The `PerformanceManager` is the central module responsible for managing all input and state within the *Perfume* application. Its primary role is to act as the bridge between raw input systems (like camera-based pose detection) and the output systems (visuals and audio).

It gathers data from various sources, processes it, and updates the state of each "performer" in the system. A performer can be either a human player tracked via the webcam or a virtual, AI-driven entity.

## Core Components

The `PerformanceManager` orchestrates several key sub-components:

### `VisionSystem`

-   **Purpose**: Handles all interactions with the webcam and the TensorFlow.js MoveNet model.
-   **Functionality**:
    1.  Initializes and requests access to the user's webcam.
    2.  Loads the pre-trained MoveNet model for multi-pose detection.
    3.  On each frame, it estimates the poses of all individuals in the video feed.
    4.  Returns an array of `pose` objects, which contain keypoints (e.g., `left_shoulder`, `right_wrist`) with their coordinates and confidence scores.

### `AutopilotSystem`

-   **Purpose**: Manages the behavior of virtual (AI) performers.
-   **Functionality**:
    1.  Generates continuous, smooth, and musically interesting data streams using noise functions (Perlin/Simplex noise).
    2.  Simulates performer presence, movement, and musical intent.
    3.  Outputs data in a format that mimics the data derived from a human performer, allowing it to be seamlessly consumed by a `Performer` object.

### `Performer` State Object

-   **Purpose**: A stateful object that represents a single performer. It is designed to be agnostic to its data source (it can be updated from `VisionSystem` or `AutopilotSystem`).
-   **Key State Properties**:
    -   `hasPerformer`: A boolean indicating if the performer is currently active.
    -   `presence`: A smoothed value (0.0 to 1.0) representing the performer's active state, used for smooth visual and audio transitions.
    -   `current`: The current, smoothed physical state (roll, pitch, yaw, depth).
    -   `target`: The raw, unsmoothed target state derived from the latest input data.
    -   `triangle`: An object storing the state of the performer's "triangle" gesture, formed by their head and hands, which controls musical parameters.

## Data Flow

The data flow is managed by the main `update()` method, which is called on every animation frame by the main `App` loop.

1.  **Gather Input**: The `update()` method first asynchronously calls `vision.update()` to get the latest array of human poses from the camera.
2.  **Update Performer State**: It then processes this data to update the array of `Performer` objects. The logic depends on whether autopilot is enabled:
    -   **Autopilot ON**: The first performer (`performers[0]`) is updated using the dominant human pose from the `VisionSystem`. The other performers are updated using data from the `AutopilotSystem`.
    -   **Autopilot OFF**: The system sorts the detected human poses by their horizontal position on the screen. It then assigns each sorted pose to a `Performer` object, allowing for multiple human performers.
3.  **Apply Physics**: After updating the `target` state of each performer, the `updatePhysics()` method is called on each one. This method uses linear interpolation (`lerp`) to smoothly transition the `current` state towards the `target` state, preventing jerky movements.
4.  **Return Data**: Finally, the `update()` method returns a comprehensive `performanceData` object containing the updated array of `performers` and the raw `poses`. This object is then passed to the `PerformanceVisualizer` and `PerformanceListener` modules.
