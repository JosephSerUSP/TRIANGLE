import * as THREE from 'three';
import { CONFIG } from '../../core/Config.js';

/**
 * Calculates the layout of viewports on the screen.
 * Handles the dynamic resizing and angled dividers based on performer presence and roll.
 */
export class DynamicLayout {
    constructor() {
        // Any persistent state for layout (e.g. smoothing) could go here
    }

    /**
     * Calculates the layout for viewports based on performer presence and tilt.
     * @param {number} width - Screen width.
     * @param {number} height - Screen height.
     * @param {Performer[]} performers - Array of performers.
     * @returns {Array} List of layout items containing index, rect (scissor), and corners (mask).
     */
    calculate(width, height, performers) {
        // 1. Identify active performers (presence > threshold)
        // We need to keep track of their original index for rendering
        const activeThreshold = CONFIG.layout && CONFIG.layout.activeThreshold ? CONFIG.layout.activeThreshold : 0.001;

        const activeItems = performers
            .map((p, index) => ({ performer: p, index: index }))
            .filter(item => item.performer.presence > activeThreshold);

        // If no performers, return empty layout
        if (activeItems.length === 0) {
            return [];
        }

        // 2. Calculate total presence of ACTIVE performers only
        const totalPresence = activeItems.reduce((sum, item) => sum + item.performer.presence, 0);
        const safeTotal = Math.max(totalPresence, 0.001);

        // 3. Calculate target widths for ACTIVE performers
        const widths = activeItems.map(item => (item.performer.presence / safeTotal) * width);

        // 4. Calculate Boundaries
        // Boundaries will be N+1 for N active performers
        const boundaries = [];

        // Boundary 0: Left edge of screen
        boundaries.push({ x: 0, angle: 0 });

        let accumWidth = 0;
        for (let i = 0; i < activeItems.length - 1; i++) {
            accumWidth += widths[i];

            const leftP = activeItems[i].performer;
            const rightP = activeItems[i+1].performer;

            // Angle comes from the Left Performer's roll
            let angle = leftP.current.roll || 0;
            angle = THREE.MathUtils.clamp(angle, -0.5, 0.5);

            // Damping Logic:
            // As a performer fades out, the angled divider between them and their neighbor should straighten.
            // We use the minimum presence of the two neighbors sharing this boundary.
            // If either side is weak, the boundary becomes vertical.
            const jointPresence = Math.min(leftP.presence, rightP.presence);
            // We can map jointPresence (0..1) to an ease curve if desired, but linear is fine for now.
            // If presence is 1.0, factor is 1.0. If 0.0, factor is 0.0.
            angle *= jointPresence;

            boundaries.push({ x: accumWidth, angle: angle });
        }

        // Boundary N: Right edge of screen
        boundaries.push({ x: width, angle: 0 });

        const layout = [];

        // 5. Generate Viewport Geometries for ACTIVE performers
        for (let i = 0; i < activeItems.length; i++) {
            const item = activeItems[i];
            const leftB = boundaries[i];
            const rightB = boundaries[i+1];

            // Left Boundary Top/Bottom X
            const h2 = height / 2;
            const l_dx = h2 * Math.tan(leftB.angle);
            const l_top = leftB.x + l_dx;
            const l_bot = leftB.x - l_dx;

            // Right Boundary Top/Bottom X
            const r_dx = h2 * Math.tan(rightB.angle);
            const r_top = rightB.x + r_dx;
            const r_bot = rightB.x - r_dx;

            // Bounding Box for Scissor
            const minX = Math.min(l_top, l_bot);
            const maxX = Math.max(r_top, r_bot);
            const w = maxX - minX;

            if (w <= 0) continue;

            layout.push({
                index: item.index, // Original index for mapping
                rect: {
                    x: Math.floor(Math.max(0, minX)),
                    y: 0,
                    width: Math.ceil(Math.min(width - Math.max(0, minX), w)),
                    height: height
                },
                corners: {
                    tl: l_top,
                    tr: r_top,
                    bl: l_bot,
                    br: r_bot
                }
            });
        }

        return layout;
    }
}
