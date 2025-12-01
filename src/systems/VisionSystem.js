import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

/**
 * Handles video input and pose detection using TensorFlow.js MoveNet model.
 */
export class VisionSystem {
    /**
     * Creates a new VisionSystem instance.
     * @param {HTMLVideoElement} videoElement - The HTML video element to use for input.
     * @param {Object} config - The application configuration object.
     */
    constructor(videoElement, config) {
        this.video = videoElement;
        this.config = config;
        this.detector = null;
        this.isReady = false;
    }

    /**
     * Initializes the camera and loads the MoveNet model.
     * Requests user media access.
     * @async
     * @returns {Promise<void>}
     * @throws {Error} If getUserMedia is not available.
     */
    async init() {
        let stream;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("navigator.mediaDevices.getUserMedia not available");
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: this.config.camera.width },
                    height: { ideal: this.config.camera.height },
                    facingMode: 'user'
                },
                audio: false
            });
        } catch (err) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        this.video.srcObject = stream;
        await new Promise(r => {
            this.video.onloadedmetadata = () => { this.video.play(); r(); };
        });

        if (this.video.videoWidth) {
            this.config.camera.width = this.video.videoWidth;
            this.config.camera.height = this.video.videoHeight;
        }

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
    }

    /**
     * Estimates poses from the current video frame.
     * @async
     * @returns {Promise<Array<Object>>} An array of detected poses.
     */
    async update() {
        if (!this.isReady) return [];
        try {
            return await this.detector.estimatePoses(this.video);
        } catch (e) {
            return [];
        }
    }
}
