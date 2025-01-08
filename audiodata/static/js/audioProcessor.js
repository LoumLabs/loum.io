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
            // First get the raw file specs
            const rawBuffer = await file.arrayBuffer();
            const view = new DataView(rawBuffer);
            let sampleRate, bitDepth;

            // Find fmt chunk to get original specs
            let offset = 12; // Skip RIFF and WAVE headers
            while (offset < rawBuffer.byteLength - 8) {
                const chunkId = String.fromCharCode(
                    view.getUint8(offset),
                    view.getUint8(offset + 1),
                    view.getUint8(offset + 2),
                    view.getUint8(offset + 3)
                );
                const chunkSize = view.getUint32(offset + 4, true);
                
                if (chunkId === 'fmt ') {
                    const audioFormat = view.getUint16(offset + 8, true);
                    sampleRate = view.getUint32(offset + 12, true);
                    const bitsPerSample = view.getUint16(offset + 22, true);
                    if (audioFormat === 3) { // IEEE float
                        bitDepth = `${bitsPerSample}-bit float`;
                    } else {
                        bitDepth = `${bitsPerSample}-bit`;
                    }
                    break;
                }
                
                offset += 8 + chunkSize;
                if (chunkSize % 2 !== 0) offset++; // Padding byte
            }

            // Continue with normal audio buffer loading for other properties
            const audioBuffer = await this.loadAudioFile(file);
            const duration = this.formatDuration(audioBuffer.duration);
            
            return {
                format: 'WAV',
                sample_rate: sampleRate || audioBuffer.sampleRate, // Fallback if header read fails
                bit_depth: bitDepth || '16-bit', // Fallback if header read fails
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