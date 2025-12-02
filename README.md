# Perfume: Lattice Performer

An interactive audio-visual performance system running entirely in the browser. It combines computer vision (MoveNet) with 3D graphics (Three.js) and generative audio to create a unique musical instrument controlled by body movement.

## Overview

**Perfume** tracks your body movements using your webcam and translates them into musical parameters and 3D visualisations.

-   **Pose Detection**: Uses TensorFlow.js and MoveNet to track key body points (shoulders, wrists, hips).
-   **3D Visuals**: Renders a dynamic lattice structure and a triangular representation of the performer's pose using Three.js.
-   **Generative Audio**: Synthesizes audio in real-time based on pose metrics (arm span, height, rotation) using the Web Audio API.
-   **Autopilot**: Includes virtual performers that can play alongside you.

## Getting Started

### Prerequisites

-   A modern web browser (Chrome, Firefox, Safari, Edge) with WebGL and Web Audio API support.
-   A webcam.

### Installation

No complex installation is required as the project is self-contained in a single HTML file using CDN links for dependencies.

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/perfume-lattice-performer.git
    ```
2.  Navigate to the project directory:
    ```bash
    cd perfume-lattice-performer
    ```

### Usage

1.  Open `index.html` in your web browser. You can do this by double-clicking the file or serving it via a local web server (recommended for camera permissions).
    -   *Using Python:* `python3 -m http.server` then go to `http://localhost:8000`
    -   *Using Node:* `npx serve`
2.  **Grant Camera Access**: The browser will ask for permission to use your camera. Allow it to enable pose tracking.
3.  **Engage System**: Click the "Click to Engage System" overlay to initialize the audio engine.
4.  **Perform**:
    -   Stand back so the camera sees your upper body (hips to head).
    -   **Tilt your shoulders** (Yaw) to rotate the view.
    -   **Move vertically** (Pitch) to look up/down.
    -   **Move closer/further** (Depth) to move through the lattice.
    -   **Raise your hands** to form a triangle.
        -   **Width** of hands controls BPM/Tempo.
        -   **Height** of hands controls musical intervals/harmony.
        -   **Rotation** of hands controls the roll of the view.

### Controls

-   **D**: Toggle Debug Overlay (shows skeleton tracking and internal metrics).

## Architecture

The application is structured into several modular classes. The source code is organized as follows:

-   `src/`: Contains the main application logic.
    -   `main.js`: The main entry point for the application.
    -   `App.js`: The main application class that orchestrates the different modules.
    -   `core/`: Core configuration and constants.
    -   `PerformanceManager/`: Manages the state of the performers.
    -   `PerformanceVisualizer/`: Manages the visual output.
    -   `PerformanceListener/`: Manages the audio output.

For a high-level overview of how these modules interact, see the [Structural Analysis](docs/StructuralAnalysis.md).

### Detailed Documentation

-   [PerformanceManager](docs/PerformanceManager.md)
-   [PerformanceVisualizer](docs/PerformanceVisualizer.md)
-   [PerformanceListener](docs/PerformanceListener.md)

## Dependencies

-   [Three.js](https://threejs.org/) (Graphics)
-   [TensorFlow.js](https://www.tensorflow.org/js) (Machine Learning)
-   [Pose Detection](https://github.com/tensorflow/tfjs-models/tree/master/pose-detection) (MoveNet)
-   [Tween.js](https://github.com/tweenjs/tween.js/) (Animation)

## License

[MIT](LICENSE)
