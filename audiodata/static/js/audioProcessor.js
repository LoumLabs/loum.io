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
        return { audioBuffer, arrayBuffer };
    }

    // Parse WAV header to get format information
    parseWAVHeader(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        let offset = 12; // Skip RIFF and WAVE headers
        
        // Find fmt chunk
        while (offset < arrayBuffer.byteLength - 8) {
            const chunkId = String.fromCharCode(
                view.getUint8(offset),
                view.getUint8(offset + 1),
                view.getUint8(offset + 2),
                view.getUint8(offset + 3)
            );
            const chunkSize = view.getUint32(offset + 4, true);
            
            if (chunkId === 'fmt ') {
                const format = {
                    audioFormat: view.getUint16(offset + 8, true),
                    numChannels: view.getUint16(offset + 10, true),
                    sampleRate: view.getUint32(offset + 12, true),
                    byteRate: view.getUint32(offset + 16, true),
                    blockAlign: view.getUint16(offset + 20, true),
                    bitsPerSample: view.getUint16(offset + 22, true)
                };
                
                // Check for float format (audioFormat = 3)
                if (format.audioFormat === 3) {
                    return {
                        sampleRate: format.sampleRate,
                        bitDepth: format.bitsPerSample + '-bit float'
                    };
                } else {
                    return {
                        sampleRate: format.sampleRate,
                        bitDepth: format.bitsPerSample + '-bit'
                    };
                }
            }
            
            offset += 8 + chunkSize;
            if (chunkSize % 2 !== 0) offset++; // Padding byte
        }
        
        return null;
    }

    async getFileInfo(file) {
        try {
            const { audioBuffer, arrayBuffer } = await this.loadAudioFile(file);
            const duration = this.formatDuration(audioBuffer.duration);
            
            // Get format info from WAV header
            const wavInfo = this.parseWAVHeader(arrayBuffer);
            
            // Use WAV header info if available, otherwise fallback to buffer analysis
            let sampleRate, bitDepth;
            
            if (wavInfo) {
                sampleRate = wavInfo.sampleRate;
                bitDepth = wavInfo.bitDepth;
            } else {
                // Fallback to buffer analysis
                sampleRate = audioBuffer.sampleRate;
                
                if (audioBuffer.length > 0) {
                    const sample = audioBuffer.getChannelData(0)[0];
                    if (Number.isInteger(sample * (2 ** 24))) {
                        bitDepth = '24-bit';
                    } else if (Number.isInteger(sample * (2 ** 16))) {
                        bitDepth = '16-bit';
                    } else {
                        bitDepth = '32-bit float';
                    }
                } else {
                    bitDepth = '16-bit'; // fallback
                }
            }
            
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