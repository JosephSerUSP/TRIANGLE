// src/graphics/LatticeViewport.js
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { CONFIG } from '../core/Config.js';

/**
 * Manages the 3D scene rendering for a specific performer.
 * Handles the lattice grid and the performer's triangular representation.
 */
export class LatticeViewport {
    /**
     * Creates a new LatticeViewport instance.
     * @param {number|string} colorHex - The primary color for this viewport.
     */
    constructor(colorHex) {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x000000, 0.0004);

        this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 15000);
        this.camera.position.set(0, 0, 800);

        this.uniforms = {
            uTime: { value: 0 },
            uPhaseZ: { value: 0 },
            uGridSize: { value: CONFIG.grid.size },
            uColor: { value: new THREE.Color(colorHex) },
            uRotation: { value: new THREE.Vector3(0, 0, 0) }
        };

        this.finalPositions = [];
        this.geometry = null;
        this.mesh = null;
        this.triMesh = null;
        this.triWire = null;

        this._initLattice();
        this._initTriangle();
        this._animateInLattice(4000);
    }

    /**
     * Initializes the lattice grid geometry.
     * Creates a BufferGeometry with shader material for the 3D grid.
     * @private
     */
    _initLattice() {
        const size = CONFIG.grid.size;
        const divisions = CONFIG.grid.divisions;
        const step = size / divisions;

        this.finalPositions = [];
        const isLongitudinal = [];

        // X-direction lines
        for (let y = -size / 2; y <= size / 2; y += step) {
            for (let z = -size / 2; z <= size / 2; z += step) {
                this.finalPositions.push(-size / 2, y, z, size / 2, y, z);
                isLongitudinal.push(0, 0);
            }
        }
        // Y-direction lines
        for (let x = -size / 2; x <= size / 2; x += step) {
            for (let z = -size / 2; z <= size / 2; z += step) {
                this.finalPositions.push(x, -size / 2, z, x, size / 2, z);
                isLongitudinal.push(0, 0);
            }
        }
        // Z-direction lines
        for (let x = -size / 2; x <= size / 2; x += step) {
            for (let y = -size / 2; y <= size / 2; y += step) {
                this.finalPositions.push(x, y, -size / 2, x, y, size / 2);
                isLongitudinal.push(1, 1);
            }
        }

        const initial = new Float32Array(this.finalPositions.length).fill(0);
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(initial, 3));
        this.geometry.setAttribute('isLongitudinal', new THREE.Float32BufferAttribute(isLongitudinal, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            vertexShader: `
                attribute float isLongitudinal;
                uniform vec3 uRotation;
                uniform float uPhaseZ;
                uniform float uGridSize;
                varying float vDepth;

                mat4 rotationMatrix(vec3 axis, float angle) {
                    axis = normalize(axis);
                    float s = sin(angle);
                    float c = cos(angle);
                    float oc = 1.0 - c;
                    return mat4(
                        oc*axis.x*axis.x + c,        oc*axis.x*axis.y - axis.z*s,  oc*axis.z*axis.x + axis.y*s, 0.0,
                        oc*axis.x*axis.y + axis.z*s, oc*axis.y*axis.y + c,        oc*axis.y*axis.z - axis.x*s, 0.0,
                        oc*axis.z*axis.x - axis.y*s, oc*axis.y*axis.z + axis.x*s, oc*axis.z*axis.z + c,        0.0,
                        0.0, 0.0, 0.0, 1.0
                    );
                }

                void main() {
                    vec3 pos = position;
                    if (isLongitudinal < 0.5) {
                        float z = pos.z + uPhaseZ;
                        float halfSize = uGridSize * 0.5;
                        z = mod(z + halfSize, uGridSize) - halfSize;
                        pos.z = z;
                    }
                    mat4 rotX = rotationMatrix(vec3(1.0, 0.0, 0.0), uRotation.x);
                    mat4 rotY = rotationMatrix(vec3(0.0, 1.0, 0.0), uRotation.y);
                    mat4 rotZ = rotationMatrix(vec3(0.0, 0.0, 1.0), uRotation.z);
                    mat4 rot = rotZ * rotY * rotX;

                    vec4 mvPosition = modelViewMatrix * rot * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    vDepth = -mvPosition.z;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                varying float vDepth;
                void main() {
                    float fogFactor = exp(-0.0004 * 0.0004 * vDepth * vDepth * 1.44);
                    float alpha = clamp(fogFactor, 0.0, 1.0) * 0.9;
                    gl_FragColor = vec4(uColor, alpha);
                }
            `
        });

        this.mesh = new THREE.LineSegments(this.geometry, material);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);
    }

    /**
     * Initializes the triangle mesh used to represent the performer's pose.
     * @private
     */
    _initTriangle() {
        const triGeom = new THREE.BufferGeometry();
        const verts = new Float32Array([
            0, 0, 0,
            -100, -100, 0,
            100, -100, 0
        ]);
        triGeom.setAttribute('position', new THREE.BufferAttribute(verts, 3));

        const triMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            depthTest: false
        });

        const wireMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.6,
            depthTest: false
        });

        this.triMesh = new THREE.Mesh(triGeom, triMat);
        this.triWire = new THREE.Mesh(triGeom, wireMat);
        this.scene.add(this.triMesh);
        this.scene.add(this.triWire);
    }

    /**
     * Animates the lattice grid lines appearing using Tween.js.
     * @private
     * @param {number} [duration=4000] - Duration of the animation in milliseconds.
     */
    _animateInLattice(duration = 4000) {
        const posAttr = this.geometry.getAttribute('position');
        const vertexCount = posAttr.count;
        const finalPos = this.finalPositions;
        const lineCount = vertexCount / 2;
        const indices = Array.from({ length: lineCount }, (_, i) => i);

        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        const progress = { value: 0 };

        // Handle case where TWEEN might not be fully initialized or compatible
        if (!TWEEN || !TWEEN.Tween) {
            for (let v = 0; v < vertexCount; v++) {
                posAttr.setXYZ(v,
                    finalPos[v * 3],
                    finalPos[v * 3 + 1],
                    finalPos[v * 3 + 2]
                );
            }
            posAttr.needsUpdate = true;
            return;
        }

        new TWEEN.Tween(progress)
            .to({ value: 1 }, duration)
            .easing(TWEEN.Easing.Exponential.Out)
            .onUpdate(() => {
                const currentLines = Math.floor(indices.length * progress.value);
                for (let i = 0; i < currentLines; i++) {
                    const idx = indices[i];
                    const v1 = idx * 2;
                    const v2 = v1 + 1;
                    posAttr.setXYZ(
                        v1,
                        finalPos[v1 * 3],
                        finalPos[v1 * 3 + 1],
                        finalPos[v1 * 3 + 2]
                    );
                    posAttr.setXYZ(
                        v2,
                        finalPos[v2 * 3],
                        finalPos[v2 * 3 + 1],
                        finalPos[v2 * 3 + 2]
                    );
                }
                posAttr.needsUpdate = true;
            })
            .start();
    }

    /**
     * Renders the scene for this viewport.
     * Sets the scissor test and viewport area on the renderer.
     * Updates shader uniforms and mesh positions.
     * @param {THREE.WebGLRenderer} renderer - The Three.js renderer.
     * @param {Object} rect - The viewport rectangle {x, y, width, height}.
     * @param {Performer} performer - The state of the performer to render.
     */
    render(renderer, rect, performer) {
        const { width, height } = rect;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        const now = performance.now() * 0.001;
        this.uniforms.uTime.value = now;
        this.uniforms.uPhaseZ.value = performer.current.phaseZ;

        const rot = this.uniforms.uRotation.value;
        rot.set(
            performer.current.pitch,
            performer.current.yaw,
            performer.current.roll
        );

        // Color intensity: bright if active, dim if not
        const base = performer.baseColor;
        const intensity = performer.hasPerformer ? 1.0 : 0.18;
        this.uniforms.uColor.value.setRGB(
            base.r * intensity,
            base.g * intensity,
            base.b * intensity
        );

        const tri = performer.triangle;
        if (tri.visible && performer.hasPerformer) {
            this.triMesh.visible = true;
            this.triWire.visible = true;

            const positions = this.triMesh.geometry.attributes.position.array;
            const scale = 320;
            const zOffset = 500;

            positions[0] = tri.v1.x * scale;
            positions[1] = tri.v1.y * scale;
            positions[2] = zOffset;

            positions[3] = tri.v2.x * scale;
            positions[4] = tri.v2.y * scale;
            positions[5] = zOffset;

            positions[6] = tri.v3.x * scale;
            positions[7] = tri.v3.y * scale;
            positions[8] = zOffset;

            this.triMesh.geometry.attributes.position.needsUpdate = true;
            this.triWire.geometry.attributes.position.needsUpdate = true;
        } else {
            this.triMesh.visible = false;
            this.triWire.visible = false;
        }

        renderer.render(this.scene, this.camera);
    }
}
