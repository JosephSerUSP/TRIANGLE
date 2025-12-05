import * as THREE from 'three';

/**
 * Handles the full-screen quad (or custom geometry) for the stencil mask.
 * Used to define the non-rectangular shape of viewports.
 */
export class MaskLayer {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.mesh = null;
        this._init();
    }

    /**
     * Initializes the geometry and material.
     * @private
     */
    _init() {
        const geometry = new THREE.BufferGeometry();
        // 4 vertices for the quad (tl, tr, bl, br)
        // Initialized to dummy values, will be updated per frame/viewport
        const vertices = new Float32Array([
            -1, 1, 0,  // TL
             1, 1, 0,  // TR
            -1, -1, 0, // BL
             1, -1, 0  // BR
        ]);
        // Index for two triangles
        const indices = [0, 2, 1, 1, 2, 3];

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(indices);

        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            colorWrite: false, // Don't write to color buffer
            depthWrite: false, // Don't write to depth buffer
            stencilWrite: true,
            stencilFunc: THREE.AlwaysStencilFunc, // Always pass stencil test
            stencilRef: 1, // Write value 1
            stencilZPass: THREE.ReplaceStencilOp // Replace stencil value on pass
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
    }

    /**
     * Updates the mask geometry based on the corners provided.
     * @param {Object} corners - { tl, tr, bl, br } x-coordinates in pixels.
     * @param {number} screenWidth - The width of the screen.
     * @param {number} screenHeight - The height of the screen.
     */
    update(corners, screenWidth, screenHeight) {
        const toNDC = (px, py) => {
            return {
                x: (px / screenWidth) * 2 - 1,
                y: -(py / screenHeight) * 2 + 1
            };
        };

        const positions = this.mesh.geometry.attributes.position.array;

        // TL (Top Left)
        let ndc = toNDC(corners.tl, 0);
        positions[0] = ndc.x;
        positions[1] = ndc.y;

        // TR (Top Right)
        ndc = toNDC(corners.tr, 0);
        positions[3] = ndc.x;
        positions[4] = ndc.y;

        // BL (Bottom Left)
        ndc = toNDC(corners.bl, screenHeight);
        positions[6] = ndc.x;
        positions[7] = ndc.y;

        // BR (Bottom Right)
        ndc = toNDC(corners.br, screenHeight);
        positions[9] = ndc.x;
        positions[10] = ndc.y;

        this.mesh.geometry.attributes.position.needsUpdate = true;
    }

    /**
     * Renders the mask to the stencil buffer.
     * @param {THREE.WebGLRenderer} renderer
     */
    render(renderer) {
        // We render the mask fullscreen (camera is -1 to 1)
        // Scissor test should already be enabled by the caller
        renderer.render(this.scene, this.camera);
    }
}
