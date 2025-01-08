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
        
        // Verify RIFF header
        const riffHeader = String.fromCharCode(
            view.getUint8(0),
            view.getUint8(1),
            view.getUint8(2),
            view.getUint8(3)
        );
        
        if (riffHeader !== 'RIFF') {
            console.warn('Not a valid RIFF file');
            return null;
        }

        // Verify WAVE format
        const waveHeader = String.fromCharCode(
            view.getUint8(8),
            view.getUint8(9),
            view.getUint8(10),
            view.getUint8(11)
        );
        
        if (waveHeader !== 'WAVE') {
            console.warn('Not a valid WAVE file');
            return null;
        }

        let offset = 12; // Skip RIFF and WAVE headers
        let format = null;
        
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
                format = {
                    audioFormat: view.getUint16(offset + 8, true),
                    numChannels: view.getUint16(offset + 10, true),
                    sampleRate: view.getUint32(offset + 12, true),
                    byteRate: view.getUint32(offset + 16, true),
                    blockAlign: view.getUint16(offset + 20, true),
                    bitsPerSample: view.getUint16(offset + 22, true)
                };
                break;
            }
            
            offset += 8 + chunkSize;
            if (chunkSize % 2 !== 0) offset++; // Padding byte
        }

        if (!format) {
            console.warn('No fmt chunk found');
            return null;
        }

        // Determine format string
        let formatString;
        switch (format.audioFormat) {
            case 1:  // PCM
                formatString = 'WAV';
                break;
            case 3:  // IEEE float
                formatString = 'WAV float';
                break;
            case 0xFFFE:  // Extensible
                formatString = 'WAV extensible';
                break;
            default:
                formatString = `WAV (type ${format.audioFormat})`;
        }

        return {
            format: formatString,
            sampleRate: format.sampleRate,
            bitDepth: format.bitsPerSample + (format.audioFormat === 3 ? '-bit float' : '-bit'),
            numChannels: format.numChannels
        };
    }

    async getFileInfo(file) {
        try {
            // First read the raw file header
            const arrayBuffer = await file.arrayBuffer();
            const wavInfo = this.parseWAVHeader(arrayBuffer);
            
            if (!wavInfo) {
                throw new Error('Could not parse WAV header');
            }

            // Now load the audio for duration calculation
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            const duration = this.formatDuration(audioBuffer.duration);
            
            return {
                format: wavInfo.format,
                sample_rate: wavInfo.sampleRate,
                bit_depth: wavInfo.bitDepth,
                channels: wavInfo.numChannels,
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