import { VisionSystem } from './systems/VisionSystem.js';
import { AutopilotSystem } from './systems/AutopilotSystem.js';
import { Performer } from './state/Performer.js';
import { CONFIG } from '../core/Config.js';
import { PERFORMER_COLORS } from '../core/Constants.js';
import * as THREE from 'three';

/**
 * Manages the input data and state of the performance.
 * Responsible for tracking performers (Physical and Virtual).
 */
export class PerformanceManager {
    constructor() {
        this.vision = new VisionSystem(document.getElementById('video'));

        // Map<string, Performer>
        this.performersMap = new Map();

        // Autopilot manages specific virtual IDs
        // For now, let's pre-define 3 virtual IDs for autopilot usage
        this.virtualIds = ['virtual_0', 'virtual_1', 'virtual_2'];
        this.autopilot = new AutopilotSystem(this.virtualIds);

        // Counter for generating physical IDs
        this.nextPhysicalId = 0;

        // To support "persistent tracking", we need to remember potential performers
        // If a pose disappears, we keep the performer for a bit (grace period)
        this.gracePeriod = 500; // ms
    }

    async init() {
        try {
            await this.vision.init();
        } catch (err) {
            console.error('Vision init failed:', err);
        }
    }

    /**
     * Updates the state of the performance.
     * @returns {Object} { performers: Array<Performer>, poses: Array }
     */
    async update() {
        const now = performance.now();
        const poses = await this.vision.update();
        const autoData = this.autopilot.update();

        // --- Performer Management ---

        if (CONFIG.enableAutopilot) {
            // In Autopilot mode, we override/manage performers based on AutopilotSystem
            // If we want mixed reality, we'd mix them.
            // Following previous logic: Autopilot ON -> purely virtual or augmented.
            // Let's implement the user's wish: "Autopilot system needs improvement".
            // We'll treat virtual performers as legitimate performers.

            // Ensure virtual performers exist
            this.virtualIds.forEach((id, idx) => {
                if (!this.performersMap.has(id)) {
                    // Assign color cyclically
                    const color = PERFORMER_COLORS[idx % PERFORMER_COLORS.length];
                    this.performersMap.set(id, new Performer(id, color));
                }

                const p = this.performersMap.get(id);
                const data = autoData.get(id);
                if (data) {
                    p.updateFromVirtualData(data);
                    p.lastUpdate = now; // Keep alive
                }
            });

            // Remove non-virtual performers if strict autopilot?
            // Or allow physical overlay?
            // Let's just keep virtual ones for now if enableAutopilot is true.
            // If we want to support physical + virtual simultaneously, we can.
            // But usually 'enableAutopilot' meant "No Camera" or "Demo Mode".
            // If camera is active, we might want to use it.

            // If we have poses, maybe we map them to other IDs?
            // For simplicity, if autopilot is ON, we just output virtuals.

        } else {
            // Physical Tracking Mode
            // Remove virtuals
            this.virtualIds.forEach(id => {
                if (this.performersMap.has(id)) this.performersMap.delete(id);
            });

            // 1. Match Poses to Existing Performers
            const matchedPoseIndices = new Set();
            const activePerformerIds = new Set();

            // Simple greedy matching: closest performer to pose center
            // Limit search to performers that were physical (start with 'phys_')
            const physicalPerformers = Array.from(this.performersMap.values())
                .filter(p => p.id.startsWith('phys_'));

            // Pre-calculate centers
            const poseCenters = poses.map(pose => this._getPoseCenter(pose));
            const performerCenters = physicalPerformers.map(p => ({
                 id: p.id,
                 x: p.current.x,
                 y: p.current.y
            }));

            // Match based on distance
            // A more robust system would use Hungarian algorithm or Kalman filters,
            // but simple proximity is fine for now.

            const usedPoses = new Set();

            for (const p of physicalPerformers) {
                let bestDist = 0.5; // Threshold (screen space is -1 to 1)
                let bestPoseIdx = -1;

                for (let i = 0; i < poses.length; i++) {
                    if (usedPoses.has(i)) continue;

                    const dist = Math.hypot(p.current.x - poseCenters[i].x, p.current.y - poseCenters[i].y);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestPoseIdx = i;
                    }
                }

                if (bestPoseIdx !== -1) {
                    p.updateFromPose(poses[bestPoseIdx]);
                    usedPoses.add(bestPoseIdx);
                    activePerformerIds.add(p.id);
                } else {
                    // Performer lost tracking this frame
                    p.updateFromPose(null);
                }
            }

            // 2. Create new performers for unmatched poses
            poses.forEach((pose, idx) => {
                if (!usedPoses.has(idx)) {
                    // New person!
                    const id = `phys_${this.nextPhysicalId++}`;
                    // Cycle colors
                    const color = PERFORMER_COLORS[this.performersMap.size % PERFORMER_COLORS.length] || 0xffffff;
                    const newP = new Performer(id, color);
                    newP.updateFromPose(pose);
                    this.performersMap.set(id, newP);
                    activePerformerIds.add(id);
                }
            });

            // 3. Cleanup Stale Performers
            // If a performer hasn't had a "hasPerformer=true" update for gracePeriod
            // We check p.hasPerformer inside updateFromPose.
            // But we need to track *when* they last had a performer.

            for (const [id, p] of this.performersMap) {
                if (p.hasPerformer) {
                    p._lastSeen = now;
                } else {
                    if (!p._lastSeen) p._lastSeen = now;
                    if (now - p._lastSeen > this.gracePeriod) {
                        this.performersMap.delete(id);
                    }
                }
            }
        }

        // Update Physics for all (smoothing)
        this.performersMap.forEach(p => p.updatePhysics());

        // Return as array for consumers
        // Sort by ID to keep order somewhat stable? Or creation order?
        // App.js/Visualizer expects array.
        const performersArray = Array.from(this.performersMap.values());

        return {
            performers: performersArray,
            poses: poses
        };
    }

    _getPoseCenter(pose) {
        const vW = CONFIG.camera.width;
        const vH = CONFIG.camera.height;
        const ls = pose.keypoints.find(k => k.name === 'left_shoulder');
        const rs = pose.keypoints.find(k => k.name === 'right_shoulder');
        if (ls && rs) {
            const cx = (ls.x + rs.x) / 2;
            const cy = (ls.y + rs.y) / 2;
            // Map to -1, 1
            const mapX = (val) => (val / vW) * 2 - 1;
            const mapY = (val) => -((val / vH) * 2 - 1);
            const xMult = CONFIG.mirrored ? -1 : 1;
            return { x: mapX(cx) * xMult, y: mapY(cy) };
        }
        return { x: 0, y: 0 };
    }

    /**
     * Expose performers for initial setup if needed, though mostly dynamic now.
     */
    get performers() {
        return Array.from(this.performersMap.values());
    }
}
