class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.fftSize = 2048;
        this.smoothingTimeConstant = 0.3;
        this.dataArray = null;
        this.timeDataArray = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            
            // Configure analyser
            this.analyser.fftSize = this.fftSize;
            this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
            this.dataArray = new Float32Array(this.analyser.frequencyBinCount);
            this.timeDataArray = new Float32Array(this.analyser.fftSize);
            
            // Get user media
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.source = this.audioContext.createMediaStreamSource(stream);
            this.source.connect(this.analyser);
            
            this.isInitialized = true;
        } catch (error) {
            console.error('Error initializing audio:', error);
            throw error;
        }
    }

    getFrequencyData() {
        if (!this.isInitialized) return null;
        this.analyser.getFloatFrequencyData(this.dataArray);
        return this.dataArray;
    }

    getTimeDomainData() {
        if (!this.isInitialized) return null;
        this.analyser.getFloatTimeDomainData(this.timeDataArray);
        return this.timeDataArray;
    }

    setFFTSize(size) {
        if (this.analyser) {
            this.fftSize = size;
            this.analyser.fftSize = size;
            this.dataArray = new Float32Array(this.analyser.frequencyBinCount);
            this.timeDataArray = new Float32Array(this.analyser.fftSize);
        }
    }

    setSmoothing(value) {
        if (this.analyser) {
            this.smoothingTimeConstant = value;
            this.analyser.smoothingTimeConstant = value;
        }
    }

    suspend() {
        if (this.audioContext) {
            this.audioContext.suspend();
        }
    }

    resume() {
        if (this.audioContext) {
            this.audioContext.resume();
        }
    }
}

// Export for use in main.js
window.AudioProcessor = AudioProcessor; 