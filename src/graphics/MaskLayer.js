// src/graphics/MaskLayer.js
import * as THREE from 'three';

/**
 * Manages the stencil mask rendering for viewports.
 * Uses a single Orthographic camera and a dynamic mesh to draw trapezoidal masks.
 */
export class MaskLayer {
    constructor() {
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.scene = new THREE.Scene();

        // 4 vertices: TopLeft, BottomLeft, TopRight, BottomRight
        // We will update these manually.
        // Screen space: -1 to 1.
        const vertices = new Float32Array([
            -1, 1, 0,  // TL
             1, 1, 0,  // TR
            -1, -1, 0, // BL
             1, -1, 0  // BR
        ]);

        // Two triangles: TL, BL, BR and TL, BR, TR
        // Indices: 0, 2, 3 and 0, 3, 1
        const indices = [
            0, 2, 3,
            0, 3, 1
        ];

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        this.geometry.setIndex(indices);

        // Basic material, no color write (we only care about stencil)
        // But for stencil writing, we usually need to draw *something*.
        // We set colorWrite: false, depthWrite: false.
        this.material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            colorWrite: false,
            depthWrite: false
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);
    }

    /**
     * Updates the geometry of the mask and renders it to the stencil buffer.
     * @param {THREE.WebGLRenderer} renderer - The renderer.
     * @param {Object} coords - Normalized coordinates (0..1) { xTL, xTR, xBL, xBR }
     */
    render(renderer, coords) {
        // Map 0..1 to -1..1
        const map = (val) => val * 2 - 1;

        const pos = this.geometry.attributes.position.array;

        // TL (0)
        pos[0] = map(coords.xTL);
        pos[1] = 1;

        // TR (1)
        pos[3] = map(coords.xTR);
        pos[4] = 1;

        // BL (2)
        pos[6] = map(coords.xBL);
        pos[7] = -1;

        // BR (3)
        pos[9] = map(coords.xBR);
        pos[10] = -1;

        this.geometry.attributes.position.needsUpdate = true;

        renderer.render(this.scene, this.camera);
    }
}
