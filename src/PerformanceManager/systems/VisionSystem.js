/**
 * @fileoverview Camera + MoveNet lifecycle. Runs its own async inference loop,
 * decoupled from requestAnimationFrame: the render loop reads `latestPoses`
 * and never waits on the model. Uses the global `tf` / `poseDetection` UMDs.
 */
export class VisionSystem {
    /**
     * @param {HTMLVideoElement} videoElement
     * @param {Object} visionConfig  CONFIG.vision
     */
    constructor(videoElement, visionConfig) {
        this.video = videoElement;
        this.config = visionConfig;
        this.detector = null;
        this.isReady = false;
        this.running = false;
        /** Real camera size (CONFIG holds only the requested one). */
        this.cameraSize = { width: visionConfig.idealWidth, height: visionConfig.idealHeight };
        /** Latest RawObservation: MoveNet poses. */
        this.latestPoses = [];
        /** Completed inferences, for the HUD's poses-per-second readout. */
        this.inferenceCount = 0;
    }

    async init() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('navigator.mediaDevices.getUserMedia not available');
        }
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: this.config.idealWidth },
                    height: { ideal: this.config.idealHeight },
                    facingMode: 'user'
                },
                audio: false
            });
        } catch (err) {
            console.warn('Falling back to default video constraints', err);
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        this.video.srcObject = stream;
        await new Promise(r => {
            this.video.onloadedmetadata = () => { this.video.play(); r(); };
        });
        if (this.video.videoWidth) {
            this.cameraSize = { width: this.video.videoWidth, height: this.video.videoHeight };
        }

        if (typeof tf === 'undefined') {
            console.error('TensorFlow.js not loaded');
            return;
        }
        await tf.ready();
        this.detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            {
                modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
                enableSmoothing: true,
                minPoseScore: this.config.minPoseScore
            }
        );
        this.isReady = true;
    }

    /** Starts the background inference loop (idempotent). */
    start() {
        if (this.running || !this.isReady) return;
        this.running = true;
        const tick = async () => {
            if (!this.running) return;
            try {
                this.latestPoses = await this.detector.estimatePoses(this.video);
                this.inferenceCount++;
            } catch {
                this.latestPoses = [];
            }
            setTimeout(tick, 0);
        };
        tick();
    }

    stop() { this.running = false; }
}
