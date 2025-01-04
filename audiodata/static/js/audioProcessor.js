class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.filters = null;
        this.loudnessAnalyzer = null;
        this.metadataAnalyzer = null;
    }

    initializeAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.filters = new FilterAnalyzer(this.audioContext);
            this.loudnessAnalyzer = new LoudnessAnalyzer(this.audioContext);
            this.metadataAnalyzer = new MetadataAnalyzer();
        }
        return this.audioContext;
    }

    async loadAudioFile(file) {
        // Initialize context if needed
        this.initializeAudioContext();
        
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        return audioBuffer;
    }

    async getFileInfo(file) {
        try {
            const audioBuffer = await this.loadAudioFile(file);
            const duration = this.formatDuration(audioBuffer.duration);
            const sampleRate = audioBuffer.sampleRate;
            const bitDepth = 16; // WAV files are typically 16-bit
            
            return {
                format: 'WAV',
                sample_rate: sampleRate,
                bit_depth: bitDepth,
                duration: duration,
                file_size: this.formatFileSize(file.size)
            };
        } catch (error) {
            console.error('Error getting file info:', error);
            throw error;
        }
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    formatFileSize(bytes) {
        const mb = bytes / (1024 * 1024);
        return mb < 1 ? `${(mb * 1000).toFixed(0)} KB` : `${mb.toFixed(1)} MB`;
    }
}

// Make it available globally
window.AudioProcessor = AudioProcessor; 