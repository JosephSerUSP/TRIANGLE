import { PerformanceManager } from './PerformanceManager/index.js';
import { PerformanceVisualizer } from './PerformanceVisualizer/index.js';
import { PerformanceListener } from './PerformanceListener/index.js';

/**
 * @class App
 * @description The main application class. It orchestrates the three core modules:
 * 1.  `PerformanceManager`: Handles input and state.
 * 2.  `PerformanceVisualizer`: Handles graphics output.
 * 3.  `PerformanceListener`: Handles audio output.
 */
export class App {
    /**
     * Creates a new App instance.
     * This constructor initializes and wires up all the core modules of the application.
     */
    constructor() {
        // --- 1. Initialize Modules ---
        this.manager = new PerformanceManager();
        this.visualizer = new PerformanceVisualizer(this.manager.performers);
        this.listener = new PerformanceListener();

        // Start initialization
        this._init();
    }

    /**
     * Initializes the PerformanceManager and starts the main application loop.
     * @private
     * @async
     */
    async _init() {
        await this.manager.init();
        this.loop();
    }

    /**
     * The main application loop.
     * This method is called recursively via `requestAnimationFrame` to create a continuous update cycle.
     * It fetches the latest performance data from the Manager and passes it to the Visualizer and Listener.
     * @async
     */
    async loop() {
        // --- 1. Get Performance Data (State) ---
        const performanceData = await this.manager.update();

        // --- 2. Update Outputs ---
        this.visualizer.update(performanceData);
        this.listener.update(performanceData);

        requestAnimationFrame(() => this.loop());
    }
}
