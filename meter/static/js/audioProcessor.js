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
        this.sampleRate = null;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.sampleRate = this.audioContext.sampleRate;
            
            // Configure analyser
            this.analyser.fftSize = this.fftSize;
            this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
            this.analyser.minDecibels = -100;
            this.analyser.maxDecibels = 0;
            
            this.dataArray = new Float32Array(this.analyser.frequencyBinCount);
            this.timeDataArray = new Float32Array(this.analyser.fftSize);
            
            // Get user media with high quality audio settings
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 1
                } 
            });

            // Create gain node for input level control
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 1.0;
            
            this.source = this.audioContext.createMediaStreamSource(stream);
            this.source.connect(gainNode);
            gainNode.connect(this.analyser);
            
            this.isInitialized = true;
            console.log('Audio initialized with sample rate:', this.sampleRate, 'Hz');
            console.log('FFT size:', this.fftSize, 'bins:', this.analyser.frequencyBinCount);
            console.log('Frequency resolution:', this.sampleRate / this.fftSize, 'Hz per bin');
            console.log('Maximum frequency:', this.sampleRate / 2, 'Hz');
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