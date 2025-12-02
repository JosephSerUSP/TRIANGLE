// src/systems/VisionSystem.js
import { CONFIG } from '../../core/Config.js';

/**
 * @class VisionSystem
 * @description Handles all video input and pose detection using the TensorFlow.js MoveNet model.
 * It is responsible for acquiring the webcam stream and running the pose estimation model.
 */
export class VisionSystem {
    /**
     * Creates a new VisionSystem instance.
     * @param {HTMLVideoElement} videoElement - The HTML video element that will be used for input and to display the camera feed.
     */
    constructor(videoElement) {
        this.video = videoElement;
        this.detector = null;
        this.isReady = false;
    }

    /**
     * Initializes the camera and loads the MoveNet pose detection model.
     * This method requests user media access for the webcam.
     * @async
     * @returns {Promise<void>} A promise that resolves when the camera is ready and the model is loaded.
     * @throws {Error} Throws an error if `getUserMedia` is not supported by the browser.
     */
    async init() {
        let stream;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("navigator.mediaDevices.getUserMedia not available");
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: CONFIG.camera.width },
                    height: { ideal: CONFIG.camera.height },
                    facingMode: 'user'
                },
                audio: false
            });
        } catch (err) {
            console.warn("Falling back to default video constraints", err);
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        this.video.srcObject = stream;
        await new Promise(r => {
            this.video.onloadedmetadata = () => { this.video.play(); r(); };
        });

        if (this.video.videoWidth) {
            CONFIG.camera.width = this.video.videoWidth;
            CONFIG.camera.height = this.video.videoHeight;
        }

        // Wait for TFJS to be ready (assuming loaded via script tags as globals)
        // In a pure build step we might import these, but the index.html loads them as globals.
        // We access them via window or global scope.
        if (typeof tf !== 'undefined') {
            await tf.ready();
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                {
                    modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
                    enableSmoothing: true,
                    minPoseScore: 0.25
                }
            );
            this.isReady = true;
        } else {
            console.error("TensorFlow.js not loaded");
        }
    }

    /**
     * Estimates poses from the current video frame.
     * @async
     * @returns {Promise<Array<object>>} An array of detected pose objects. Each pose object contains keypoints and a confidence score. Returns an empty array if the system is not ready or an error occurs.
     */
    async update() {
        if (!this.isReady) return [];
        try {
            return await this.detector.estimatePoses(this.video);
        } catch (e) {
            // console.error(e);
            return [];
        }
    }
}
