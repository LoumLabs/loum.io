class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.maxFileSize = 100 * 1024 * 1024; // 100MB limit
        this.supportedFormats = ['audio/wav', 'audio/mpeg'];
        this.loudnessAnalyzer = new LoudnessAnalyzer();
        this.filters = new AudioFilters();
    }

    async loadAudioFile(file) {
        try {
            // Initialize AudioContext if needed
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            
            // Decode audio data
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            return audioBuffer;
        } catch (error) {
            console.error('Error loading audio file:', error);
            throw error;
        }
    }

    async processFile(file) {
        try {
            // Check file size and format
            if (file.size > this.maxFileSize) {
                throw new Error('File size exceeds 100MB limit');
            }
            if (!this.supportedFormats.includes(file.type)) {
                throw new Error('Unsupported file format. Please use WAV or MP3');
            }

            // Get initial file info first
            const fileInfo = await this.getFileInfo(file);
            
            // Load and process audio
            const audioBuffer = await this.loadAudioFile(file);
            
            // Process loudness
            const loudnessResults = await this.loudnessAnalyzer.analyzeLoudness(audioBuffer);
            
            // Process multiband
            const multibandResults = await this.filters.processMultiband(audioBuffer);
            
            return {
                filename: file.name,
                file_info: fileInfo,  // Use the original file info
                // Format loudness values
                lufs_i: loudnessResults.integratedLoudness.toFixed(1),
                lufs_s_max: loudnessResults.shortTermMax.toFixed(1),
                lra: loudnessResults.loudnessRange.toFixed(1),
                sample_peak: loudnessResults.samplePeak.toFixed(1),
                true_peak: loudnessResults.truePeak.toFixed(1),
                // Multiband results
                ...multibandResults
            };
        } catch (error) {
            console.error('Error processing audio:', error);
            throw error;
        }
    }

    async getFileInfo(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const view = new DataView(arrayBuffer);
                    
                    // Get original format info before any processing
                    const format = this.getAudioFormat(view);
                    
                    // Create temporary context for basic info
                    const tempContext = new (window.AudioContext || window.webkitAudioContext)();
                    const audioBuffer = await tempContext.decodeAudioData(arrayBuffer.slice(0));
                    tempContext.close();
                    
                    resolve({
                        name: file.name,
                        format: format.container || this.getFormatFromMime(file.type),
                        sample_rate: `${audioBuffer.sampleRate.toLocaleString()} Hz`,
                        bit_depth: format.bitDepth || 'Unknown',  // Keep original bit depth
                        duration: this.formatDuration(audioBuffer.duration),
                        file_size: this.formatFileSize(file.size)
                    });
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    getAudioFormat(view) {
        // Check for WAV format
        if (this.getString(view, 0, 4) === 'RIFF') {
            const format = { container: 'WAV' };
            
            // Find format chunk
            let offset = 12; // Skip RIFF header
            while (offset < view.byteLength - 8) {
                const chunkId = this.getString(view, offset, 4);
                const chunkSize = view.getUint32(offset + 4, true);
                
                if (chunkId === 'fmt ') {
                    const formatTag = view.getUint16(offset + 8, true);
                    const bitsPerSample = view.getUint16(offset + 22, true);
                    
                    if (formatTag === 1) { // PCM
                        format.bitDepth = bitsPerSample + ' bit';
                    } else if (formatTag === 3) { // IEEE Float
                        format.bitDepth = bitsPerSample + ' bit float';
                    } else {
                        format.bitDepth = bitsPerSample + ' bit (format: ' + formatTag + ')';
                    }
                    break;
                }
                offset += 8 + chunkSize;
            }
            return format;
        }
        
        return { container: 'Unknown', bitDepth: 'Unknown' };
    }

    getString(view, offset, length) {
        return Array.from(new Uint8Array(view.buffer, offset, length))
            .map(x => String.fromCharCode(x))
            .join('');
    }

    getFormatFromMime(mimeType) {
        const formats = {
            'audio/wav': 'WAV',
            'audio/x-wav': 'WAV',
            'audio/mpeg': 'MP3',
            'audio/mp4': 'AAC',
            'audio/aac': 'AAC',
            'audio/ogg': 'OGG',
            'audio/flac': 'FLAC'
        };
        return formats[mimeType] || 'Unknown';
    }

    formatFileSize(bytes) {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)} MB`;
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

// Make it available globally
window.AudioProcessor = AudioProcessor; 