import { VisionSystem } from './systems/VisionSystem.js';
import { AutopilotSystem } from './systems/AutopilotSystem.js';
import { Performer } from './state/Performer.js';
import { CONFIG } from '../core/Config.js';
import { PERFORMER_COLORS } from '../core/Constants.js';

/**
 * Manages the input data and state of the performance.
 * Responsible for:
 * 1. Gathering input from VisionSystem and AutopilotSystem.
 * 2. Updating the state of Performers based on this input.
 * 3. Providing the current state to the Output systems.
 */
export class PerformanceManager {
    /**
     * Creates an instance of PerformanceManager.
     */
    constructor() {
        // --- 1. Initialize Inputs ---
        // Note: VisionSystem depends on the DOM element 'video'
        this.vision = new VisionSystem(document.getElementById('video'));

        // --- 2. Initialize Performers ---
        // P0: Physical (controls Bass)
        // P1, P2: Virtual
        this.performers = [
            new Performer(PERFORMER_COLORS[0], true, false),
            new Performer(PERFORMER_COLORS[1], false, true),
            new Performer(PERFORMER_COLORS[2], false, true)
        ];

        this.autopilot = new AutopilotSystem([1, 2]);
    }

    /**
     * Initializes the manager (Vision System).
     * @async
     */
    async init() {
        try {
            await this.vision.init();
        } catch (err) {
            console.error('Vision init failed:', err);
        }
    }

    /**
     * Updates the state of the performance.
     * @returns {Object} The current performance data { performers, poses }.
     */
    async update() {
        // --- 1. Gather Input Data ---
        const poses = await this.vision.update();
        const autoData = this.autopilot.update();

        // --- 2. Update Performer State ---
        if (CONFIG.enableAutopilot) {
            // Original behavior: P0 is physical (dominant), P1 & P2 are virtual
            this.performers[0].updateFromPose(poses);

            // Virtual Performers (P1, P2) look at Autopilot Data
            autoData.forEach((data, idx) => {
                 if (this.performers[idx]) {
                     this.performers[idx].updateFromVirtualData(data);
                 }
            });
        } else {
            // Manual behavior: All performers are physical if data exists
            // Sort poses by x-coordinate to consistently assign to Left, Center, Right

            const sortedPoses = [...poses].sort((a, b) => {
                const getX = (p) => {
                    const ls = p.keypoints.find(k => k.name === 'left_shoulder');
                    const rs = p.keypoints.find(k => k.name === 'right_shoulder');
                    if (ls && rs) return (ls.x + rs.x) / 2;
                    // Fallback to first keypoint or 0
                    return p.keypoints[0] ? p.keypoints[0].x : 0;
                };
                return getX(a) - getX(b); // Ascending X (Left to Right)
            });

            if (CONFIG.layout && CONFIG.layout.flipOrder) {
                sortedPoses.reverse();
            }

            // Assign sorted poses to performers [0, 1, 2]
            for (let i = 0; i < this.performers.length; i++) {
                if (i < sortedPoses.length) {
                    this.performers[i].updateFromSinglePose(sortedPoses[i]);
                } else {
                    // No pose for this performer
                    this.performers[i].updateFromSinglePose(null);
                }
            }
        }

        // Update Physics (Smoothing)
        this.performers.forEach(p => p.updatePhysics());

        return {
            performers: this.performers,
            poses: poses,
            // We could return autoData if needed for debug, but poses is what DebugOverlay uses mainly
            autoData: autoData
        };
    }
}
