import { PerformanceManager } from './PerformanceManager/index.js';
import { PerformanceVisualizer } from './PerformanceVisualizer/index.js';
import { PerformanceListener } from './PerformanceListener/index.js';

/**
 * Main application class.
 * Orchestrates the modular systems:
 * 1. Performance Manager (Input/State)
 * 2. Performance Visualizer (Graphics Output)
 * 3. Performance Listener (Audio Output)
 */
export class App {
    /**
     * Creates a new App instance and wires up the modules.
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
     * Initializes the manager and starts the main loop.
     * @private
     * @async
     */
    async _init() {
        await this.manager.init();
        this.loop();
    }

    /**
     * The main game loop.
     * Fetches data from the Manager and passes it to Visualizer and Listener.
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
