import { AudioSystem } from './audio/AudioSystem.js';

/**
 * Manages the audio output of the performance.
 * Responsible for:
 * 1. Managing the AudioSystem.
 * 2. Initializing audio on user interaction.
 * 3. Updating the audio system based on performer state.
 */
export class PerformanceListener {
    constructor() {
        this.audio = new AudioSystem();
        this._initAudioOnInteraction();
    }

    /**
     * Updates the audio output.
     * @param {object} performanceData - The performance data.
     * @param {import('../PerformanceManager/state/Performer.js').Performer[]} performanceData.performers - An array of performer states.
     */
    update({ performers }) {
        if (this.audio.isReady) {
            this.audio.update(performers);
        }
    }

    /**
     * Initializes audio on the first user interaction (click, keypress, etc.).
     * @private
     */
    _initAudioOnInteraction() {
        let initialized = false;
        const startAudio = async () => {
            if (initialized) return;
            initialized = true;

            // Initialize with a default number of voices (e.g., 3 performers)
            // Ideally we would know this from the manager, but 3 is standard config.
            await this.audio.init(3);
            this.audio.resume();

            window.removeEventListener('click', startAudio);
            window.removeEventListener('keydown', startAudio);
            window.removeEventListener('touchstart', startAudio);
        };

        window.addEventListener('click', startAudio);
        window.addEventListener('keydown', startAudio);
        window.addEventListener('touchstart', startAudio);
    }
}
