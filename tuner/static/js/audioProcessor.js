class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.gainNode = null;
        this.source = null;
        this.isInitialized = false;
        this.frequencyData = null;
        this.timeDomainData = null;
        
        // FFT size for frequency analysis
        this.FFT_SIZE = 2048;
        
        // Buffer sizes for analysis
        this.FREQ_BUF_SIZE = this.FFT_SIZE / 2;
        this.TIME_BUF_SIZE = this.FFT_SIZE;
    }

    async initialize() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive',
                sampleRate: 44100
            });
            
            // Create audio nodes
            this.analyser = this.audioContext.createAnalyser();
            this.gainNode = this.audioContext.createGain();
            
            // Configure analyser
            this.analyser.fftSize = this.FFT_SIZE;
            this.analyser.smoothingTimeConstant = 0.5;
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -10;
            
            // Initialize data arrays
            this.frequencyData = new Float32Array(this.FREQ_BUF_SIZE);
            this.timeDomainData = new Float32Array(this.TIME_BUF_SIZE);
            
            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    latency: 0,
                    channelCount: 1
                } 
            });
            
            // Create and connect source
            this.source = this.audioContext.createMediaStreamSource(stream);
            
            // Simple signal chain: source -> gain -> analyser
            this.source.connect(this.gainNode);
            this.gainNode.connect(this.analyser);
            
            // Set initial gain
            this.gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime);
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Error initializing audio:', error);
            throw error;
        }
    }

    getFrequencyData() {
        if (!this.isInitialized) return null;
        this.analyser.getFloatFrequencyData(this.frequencyData);
        return this.frequencyData;
    }

    getTimeDomainData() {
        if (!this.isInitialized) return null;
        this.analyser.getFloatTimeDomainData(this.timeDomainData);
        return this.timeDomainData;
    }

    getSampleRate() {
        return this.audioContext?.sampleRate || 44100;
    }

    suspend() {
        if (this.audioContext) {
            this.audioContext.close();
            this.isInitialized = false;
            this.source = null;
            this.audioContext = null;
        }
    }

    setVoiceMode(enabled) {
        if (!this.isInitialized) return;
        
        // Adjust analyzer settings for voice mode
        if (enabled) {
            this.analyser.smoothingTimeConstant = 0.8;
            this.analyser.minDecibels = -80;
            this.analyser.maxDecibels = -10;
        } else {
            this.analyser.smoothingTimeConstant = 0.5;
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -10;
        }
    }
}

// Export for use in main.js
window.AudioProcessor = AudioProcessor; 