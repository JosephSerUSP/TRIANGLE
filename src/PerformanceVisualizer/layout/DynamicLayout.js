import * as THREE from 'three';

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
        // Calculate total presence to normalize widths
        const totalPresence = performers.reduce((sum, p) => sum + p.presence, 0);
        const safeTotal = Math.max(totalPresence, 0.001);

        const layout = [];

        // Calculate target widths first
        const widths = performers.map(p => (p.presence / safeTotal) * width);

        // Calculate separator angles
        // Line i (1 to N-1): x = sum(widths[0]...widths[i-1]). Angle = P[i-1].current.roll.

        const boundaries = [];

        // Left edge of screen
        boundaries.push({ x: 0, angle: 0 });

        let accumWidth = 0;
        for (let i = 0; i < performers.length - 1; i++) {
            accumWidth += widths[i];

            // Limit angle to avoid extreme skew
            let angle = performers[i].current.roll || 0;
            angle = THREE.MathUtils.clamp(angle, -0.5, 0.5);

            boundaries.push({ x: accumWidth, angle: angle });
        }

        // Right edge of screen
        boundaries.push({ x: width, angle: 0 });

        // Generate Viewport Geometries
        for (let i = 0; i < performers.length; i++) {
            if (performers[i].presence < 0.001) continue;

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
                index: i,
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
