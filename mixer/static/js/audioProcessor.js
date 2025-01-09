class AudioProcessor {
    constructor() {
        // Create AudioContext but don't initialize until user interaction
        this.audioContext = null;
        this.sources = { a: null, b: null };
        this.buffers = { a: null, b: null };
        this.startTime = { a: 0, b: 0 };
        this.playbackRate = { a: 1, b: 1 };
        this.isLooping = { a: false, b: false };
        this.pausePosition = { a: undefined, b: undefined };
        this.cuePoints = { a: 0, b: 0 }; // Add cue points storage
        
        // Create nodes after context is initialized
        this.gainNodes = { a: null, b: null };
        this.trimNodes = { a: null, b: null };
        this.analyzers = { a: null, b: null };
        this.eqNodes = { a: null, b: null };
        this.isInitialized = false;
        this.levelData = { a: null, b: null };
        this.peakLevels = { a: 0, b: 0 };
        this.peakHoldTime = 1000; // Hold peak for 1 second
        this.lastPeakTime = { a: 0, b: 0 };
        
        // Add crossfader curve settings
        this.crossfaderCurve = 'linear'; // Options: 'linear', 'slow', 'fast', 'cut'

        this.masterAnalyzer = null;
        this.masterLevelData = null;
        this.masterPeakLevel = 0;
        this.lastMasterPeakTime = 0;

        // Add pre-fader analyzers
        this.preFaderAnalyzers = { a: null, b: null };
        this.preFaderLevelData = { a: null, b: null };

        // Add loop points
        this.loopPoints = { 
            a: { start: null, end: null },
            b: { start: null, end: null }
        };

        // Add sync properties
        this.bpm = { a: 0, b: 0 };
        this.beatGridOffset = { a: 0, b: 0 };
        this.beatLength = { a: 0, b: 0 };
        this.currentTrack = { a: null, b: null };

        this.channelFaderValues = {
            a: 1.0,
            b: 1.0
        };
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            // Create and resume AudioContext
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Create master gain node first
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1.0; // Full volume at master

            // Create master analyzer
            this.masterAnalyzer = this.audioContext.createAnalyser();
            this.masterAnalyzer.fftSize = 1024;
            this.masterAnalyzer.smoothingTimeConstant = 0.5;

            // Connect master chain
            this.masterGain.connect(this.masterAnalyzer);
            this.masterAnalyzer.connect(this.audioContext.destination);

            // Create nodes for each channel
            ['a', 'b'].forEach(deck => {
                // Create gain nodes (channel faders)
                this.gainNodes[deck] = this.audioContext.createGain();
                this.gainNodes[deck].gain.value = 1.0; // Start at full volume

                // Create trim nodes
                this.trimNodes[deck] = this.audioContext.createGain();
                this.trimNodes[deck].gain.value = 0.7; // Slight headroom on trim

                // Create analyzers
                this.analyzers[deck] = this.audioContext.createAnalyser();
                this.analyzers[deck].fftSize = 1024;
                this.analyzers[deck].smoothingTimeConstant = 0.5;

                // Create pre-fader analyzers
                this.preFaderAnalyzers[deck] = this.audioContext.createAnalyser();
                this.preFaderAnalyzers[deck].fftSize = 1024;
                this.preFaderAnalyzers[deck].smoothingTimeConstant = 0.5;

                // Create EQ nodes
                this.eqNodes[deck] = this.createEQNodes();
            });

            // Connect audio chains
            this.connectEQChain('a');
            this.connectEQChain('b');

            // Initialize analyzer data arrays
            this.levelData = {
                a: new Uint8Array(this.analyzers.a.frequencyBinCount),
                b: new Uint8Array(this.analyzers.b.frequencyBinCount)
            };

            this.preFaderLevelData = {
                a: new Uint8Array(this.preFaderAnalyzers.a.frequencyBinCount),
                b: new Uint8Array(this.preFaderAnalyzers.b.frequencyBinCount)
            };

            this.masterLevelData = new Uint8Array(this.masterAnalyzer.frequencyBinCount);

            this.isInitialized = true;
            this.monitorLevels();
        } catch (error) {
            console.error('Error initializing audio processor:', error);
            throw error;
        }
    }

    createEQNodes() {
        return {
            low: this.createFilter(200, 'lowshelf'),
            mid: this.createFilter(2000, 'peaking'),
            high: this.createFilter(4000, 'highshelf')
        };
    }

    createFilter(frequency, type) {
        const filter = this.audioContext.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.gain.value = 0;
        return filter;
    }

    connectEQChain(deck) {
        if (!this.sources[deck]) return;

        try {
            // Disconnect any existing connections
            if (this.trimNodes[deck]) this.trimNodes[deck].disconnect();
            if (this.eqNodes[deck].low) this.eqNodes[deck].low.disconnect();
            if (this.eqNodes[deck].mid) this.eqNodes[deck].mid.disconnect();
            if (this.eqNodes[deck].high) this.eqNodes[deck].high.disconnect();
            if (this.gainNodes[deck]) this.gainNodes[deck].disconnect();
            if (this.preFaderAnalyzers[deck]) this.preFaderAnalyzers[deck].disconnect();
            if (this.analyzers[deck]) this.analyzers[deck].disconnect();

            // Connect source to trim
            this.sources[deck].connect(this.trimNodes[deck]);

            // Connect trim to pre-fader analyzer (for channel meters)
            this.trimNodes[deck].connect(this.preFaderAnalyzers[deck]);

            // Connect trim to EQ chain
            this.trimNodes[deck].connect(this.eqNodes[deck].high);
            this.eqNodes[deck].high.connect(this.eqNodes[deck].mid);
            this.eqNodes[deck].mid.connect(this.eqNodes[deck].low);

            // Connect EQ to gain node
            this.eqNodes[deck].low.connect(this.gainNodes[deck]);

            // Connect gain to post-fader analyzer
            this.gainNodes[deck].connect(this.analyzers[deck]);

            // Connect gain to master
            this.gainNodes[deck].connect(this.masterGain);
        } catch (error) {
            console.error(`Failed to connect audio chain for deck ${deck}:`, error);
        }
    }

    async loadAudio(deck, file) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Stop only the target deck if it's playing
            if (this.sources[deck]) {
                this.sources[deck].stop();
                this.sources[deck] = null;
            }

            // Reset deck state when loading new track
            this.startTime[deck] = 0;
            this.pausePosition[deck] = 0;
            this.cuePoints[deck] = 0;
            this.playbackRate[deck] = 1;
            this.isLooping[deck] = false;
            this.loopPoints[deck] = { start: null, end: null };

            // Get fresh ArrayBuffer from file
            const arrayBuffer = await file.arrayBuffer();

            // Decode audio data
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.buffers[deck] = audioBuffer;
            this.currentTrack[deck] = file;
            
            // Analyze BPM and beat grid when loading track
            const bpm = await this.detectBPM(audioBuffer);
            this.bpm[deck] = bpm;
            this.beatLength[deck] = 60 / bpm;
            
            return audioBuffer;
        } catch (error) {
            if (error.name === 'EncodingError') {
                throw new Error('Unable to decode audio file. Please ensure it\'s a valid audio format.');
            }
            throw error;
        }
    }

    analyzeBeatGrid(deck, audioBuffer) {
        const bpm = this.detectBPM(audioBuffer);
        this.bpm[deck] = bpm;
        
        // Calculate beat length in seconds
        this.beatLength[deck] = 60 / bpm;
        
        // Find first strong beat (approximate)
        const data = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        let maxEnergy = 0;
        let firstBeat = 0;
        
        // Look in first few seconds for strongest beat
        const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
        for (let i = 0; i < sampleRate * 4; i += windowSize) {
            let energy = 0;
            for (let j = 0; j < windowSize; j++) {
                energy += Math.abs(data[i + j]);
            }
            if (energy > maxEnergy) {
                maxEnergy = energy;
                firstBeat = i;
            }
        }
        
        this.beatGridOffset[deck] = firstBeat / sampleRate;
    }

    createSource(deck) {
        if (!this.buffers[deck]) return null;

        const source = this.audioContext.createBufferSource();
        source.buffer = this.buffers[deck];
        source.playbackRate.value = this.playbackRate[deck];

        // Only set loop points if isLooping is true AND we have valid points
        if (this.isLooping[deck] && 
            this.loopPoints[deck].start !== null && 
            this.loopPoints[deck].end !== null) {
            source.loop = true;
            source.loopStart = this.loopPoints[deck].start;
            source.loopEnd = this.loopPoints[deck].end;
        } else {
            source.loop = false;
        }

        source.connect(this.trimNodes[deck]);
        return source;
    }

    play(deck) {
        if (!this.buffers[deck]) return;

        // Ensure we have valid state
        if (this.startTime[deck] === undefined) this.startTime[deck] = 0;
        if (this.pausePosition[deck] === undefined) this.pausePosition[deck] = 0;
        if (this.cuePoints[deck] === undefined) this.cuePoints[deck] = 0;
        if (this.playbackRate[deck] === undefined) this.playbackRate[deck] = 1;

        // Determine start position based on context
        let startPosition;
        if (this.sources[deck]?._isCuePreview) {
            // If coming from cue preview, use cue point
            startPosition = this.cuePoints[deck];
        } else if (this.isLooping[deck] && this.loopPoints[deck].start !== null) {
            // If we have an active loop, use loop start point
            startPosition = this.loopPoints[deck].start;
        } else if (this.pausePosition[deck] !== 0) {
            // If paused, use pause position
            startPosition = this.pausePosition[deck];
        } else {
            // Otherwise use cue point or 0
            startPosition = this.cuePoints[deck] || 0;
        }

        // Ensure position is within valid range
        const safePosition = Math.min(startPosition, this.buffers[deck].duration);

        // Stop current playback if exists
        if (this.sources[deck]) {
            try {
                this.sources[deck].stop();
            } catch (e) {}
            this.sources[deck] = null;
        }

        // Create new source
        this.sources[deck] = this.createSource(deck);
        if (!this.sources[deck]) return;

        // Connect the audio chain
        this.connectEQChain(deck);

        // Start playback from determined position
        this.startTime[deck] = this.audioContext.currentTime - (safePosition / this.playbackRate[deck]);
        this.sources[deck].start(0, safePosition);
        
        // Store the current position for future retriggering
        this.pausePosition[deck] = safePosition;

        // If we have both loop points and looping is active, start monitoring
        if (this.isLooping[deck] && this.loopPoints[deck].start !== null && this.loopPoints[deck].end !== null) {
            this.monitorLoop(deck);
        }
    }

    pause(deck) {
        if (!this.sources[deck]) return;
        
        // Store current position before stopping
        const currentPosition = this.getCurrentTime(deck);
        const safePosition = Math.min(currentPosition, this.buffers[deck].duration);
        
        // Stop playback
        try {
            this.sources[deck].stop();
        } catch (e) {}
        this.sources[deck] = null;
        
        // Store position for resume
        this.pausePosition[deck] = safePosition;
    }

    stop(deck) {
        // Stop current playback
        if (this.sources[deck]) {
            try {
                this.sources[deck].stop();
            } catch (e) {}
            this.sources[deck] = null;
        }

        // Reset all state to beginning
        this.startTime[deck] = 0;
        this.pausePosition[deck] = 0;
        this.cuePoints[deck] = 0;  // Reset cue point to start
        
        // Clear any loop state
        this.isLooping[deck] = false;
        this.loopPoints[deck] = { start: null, end: null };
    }

    cue(deck) {
        if (!this.buffers[deck]) return;

        // If currently playing, jump back to last cue point
        if (this.sources[deck] && !this.sources[deck]._isCuePreview) {
            try {
                this.sources[deck].stop();
            } catch (e) {}
            this.sources[deck] = null;
            this.startTime[deck] = null;
            
            // Jump back to last cue point
            this.pausePosition[deck] = this.cuePoints[deck];
            
            // Start preview from cue point
            this.sources[deck] = this.createSource(deck);
            if (this.sources[deck]) {
                // Connect the audio chain for preview
                this.connectEQChain(deck);
                this.startTime[deck] = this.audioContext.currentTime - this.cuePoints[deck];
                this.sources[deck].start(0, this.cuePoints[deck]);
                this.sources[deck]._isCuePreview = true;
            }
        } else if (!this.sources[deck]) {
            // If paused/stopped (no active source), set new cue point at current position
            this.cuePoints[deck] = this.pausePosition[deck];
            
            // Start preview from the new cue point
            this.sources[deck] = this.createSource(deck);
            if (this.sources[deck]) {
                // Connect the audio chain for preview
                this.connectEQChain(deck);
                this.startTime[deck] = this.audioContext.currentTime - this.cuePoints[deck];
                this.sources[deck].start(0, this.cuePoints[deck]);
                this.sources[deck]._isCuePreview = true;
            }
        }
    }

    releaseCue(deck) {
        if (!this.sources[deck] || !this.sources[deck]._isCuePreview) return;

        try {
            this.sources[deck].stop();
        } catch (e) {}
        this.sources[deck] = null;
        this.startTime[deck] = null;
        // Return to cue point when released
        this.pausePosition[deck] = this.cuePoints[deck];
    }

    // Add method to set cue point manually
    setCuePoint(deck) {
        if (!this.buffers[deck]) return;
        this.cuePoints[deck] = this.getCurrentTime(deck);
        return this.cuePoints[deck];
    }

    // Add method to jump to cue point
    jumpToCuePoint(deck) {
        if (!this.buffers[deck] || this.cuePoints[deck] === undefined) return;
        this.seekTo(deck, this.cuePoints[deck] / this.buffers[deck].duration, false);
        this.pausePosition[deck] = this.cuePoints[deck];
    }

    setEQ(deck, type, value) {
        if (!this.eqNodes[deck]) return;
        const gain = value;
        this.eqNodes[deck][type].gain.value = gain;
    }

    setCrossfader(value) {
        if (!this.gainNodes.a || !this.gainNodes.b) return;
        
        const position = value / 100;
        this.crossfaderPosition = position;
        
        let gainA, gainB;
        
        switch (this.crossfaderCurve) {
            case 'slow':
                // Smooth logarithmic curve for gradual blending
                gainA = Math.pow(Math.cos(position * Math.PI / 2), 2);
                gainB = Math.pow(Math.cos((1 - position) * Math.PI / 2), 2);
                break;
                
            case 'fast':
                // Exponential curve for quick transitions
                gainA = Math.pow(Math.cos(position * Math.PI / 2), 0.5);
                gainB = Math.pow(Math.cos((1 - position) * Math.PI / 2), 0.5);
                break;
                
            case 'cut':
                // Sharp cut curve for scratching
                gainA = position <= 0.5 ? 1 : 0;
                gainB = position >= 0.5 ? 1 : 0;
                break;
                
            case 'linear':
            default:
                // Linear curve (original behavior)
                gainA = Math.cos(position * Math.PI / 2);
                gainB = Math.cos((1 - position) * Math.PI / 2);
                break;
        }
        
        this.gainNodes.a.gain.setTargetAtTime(gainA, this.audioContext.currentTime, 0.01);
        this.gainNodes.b.gain.setTargetAtTime(gainB, this.audioContext.currentTime, 0.01);
    }

    setTempo(deck, value) {
        // Store the tempo percentage
        const tempoPercentage = value;
        this.playbackRate[deck] = tempoPercentage / 100;

        // Update the source if it exists
        if (this.sources[deck]) {
            // Use exponential ramp for smoother tempo changes
            const currentTime = this.audioContext.currentTime;
            this.sources[deck].playbackRate.setTargetAtTime(this.playbackRate[deck], currentTime, 0.003);
        }

        // Update the BPM based on the tempo change
        if (this.bpm[deck]) {
            const originalBPM = this.detectBPM(this.buffers[deck]);
            this.bpm[deck] = (originalBPM * tempoPercentage) / 100;
        }
    }

    toggleLoop(deck) {
        if (!this.loopPoints[deck].start || !this.loopPoints[deck].end) return 'in';
        
        // Toggle loop state
        this.isLooping[deck] = !this.isLooping[deck];
        
        // If we're disabling the loop
        if (!this.isLooping[deck]) {
            // Clear loop points first
            const currentTime = this.getCurrentTime(deck);
            this.loopPoints[deck] = { start: null, end: null };

            // If currently playing, recreate source without loop
            if (this.sources[deck]) {
                try {
                    this.sources[deck].stop();
                } catch (e) {}
                this.sources[deck] = null;

                // Create new source without loop
                this.sources[deck] = this.createSource(deck);
                if (this.sources[deck]) {
                    this.startTime[deck] = this.audioContext.currentTime - (currentTime / this.playbackRate[deck]);
                    this.sources[deck].start(0, currentTime);
                }
            }
            return 'in';
        }
        
        // If we're enabling the loop
        if (this.sources[deck]) {
            const currentTime = this.getCurrentTime(deck);
            try {
                this.sources[deck].stop();
            } catch (e) {}
            this.sources[deck] = null;

            // Create new source with loop enabled
            this.sources[deck] = this.createSource(deck);
            if (this.sources[deck]) {
                this.startTime[deck] = this.audioContext.currentTime - (currentTime / this.playbackRate[deck]);
                this.sources[deck].start(0, currentTime);
                this.monitorLoop(deck);
            }
        }
        return 'active';
    }

    getCurrentTime(deck) {
        // Ensure we have valid state
        if (this.startTime[deck] === undefined) this.startTime[deck] = 0;
        if (this.pausePosition[deck] === undefined) this.pausePosition[deck] = 0;
        if (this.playbackRate[deck] === undefined) this.playbackRate[deck] = 1;

        // If we have an active source and startTime, calculate current position
        if (this.sources[deck] && this.startTime[deck] !== null) {
            const elapsed = this.audioContext.currentTime - this.startTime[deck];
            const position = elapsed * this.playbackRate[deck];
            // Ensure we don't return a position beyond the track duration
            return Math.min(position, this.buffers[deck]?.duration || 0);
        }
        
        // If paused, return pause position
        if (this.pausePosition[deck] !== undefined) {
            return this.pausePosition[deck];
        }
        
        // If stopped or no state, return 0
        return 0;
    }

    getDuration(deck) {
        return this.buffers[deck] ? this.buffers[deck].duration : 0;
    }

    getLevelData(deck) {
        if (deck === 'master') {
            return {
                level: this.masterPeakLevel || 0,
                peak: this.masterPeakLevel || 0
            };
        }
        return {
            level: this.peakLevels[deck] || 0,
            peak: this.peakLevels[deck] || 0
        };
    }

    monitorLevels() {
        const updateLevels = () => {
            if (!this.isInitialized) return;

            // Update channel levels from pre-fader analyzers
            ['a', 'b'].forEach(deck => {
                this.preFaderAnalyzers[deck].getByteTimeDomainData(this.preFaderLevelData[deck]);
                let sum = 0;
                let peak = 0;
                for (let i = 0; i < this.preFaderLevelData[deck].length; i++) {
                    const sample = Math.abs((this.preFaderLevelData[deck][i] - 128) / 128);
                    sum += sample * sample;
                    peak = Math.max(peak, sample);
                }
                const rms = Math.sqrt(sum / this.preFaderLevelData[deck].length);
                const db = 20 * Math.log10(Math.max(rms, 0.00001));
                const level = Math.max(0, Math.min(100, (db + 50) * (100/50)));

                if (level > this.peakLevels[deck]) {
                    this.peakLevels[deck] = level;
                    this.lastPeakTime[deck] = Date.now();
                } else if (Date.now() - this.lastPeakTime[deck] > this.peakHoldTime) {
                    this.peakLevels[deck] *= 0.85;
                }
            });

            // Update master levels from master analyzer (post-fader)
            this.masterAnalyzer.getByteTimeDomainData(this.masterLevelData);
            let masterSum = 0;
            let masterPeak = 0;
            for (let i = 0; i < this.masterLevelData.length; i++) {
                const sample = Math.abs((this.masterLevelData[i] - 128) / 128);
                masterSum += sample * sample;
                masterPeak = Math.max(masterPeak, sample);
            }
            const masterRms = Math.sqrt(masterSum / this.masterLevelData.length);
            const masterDb = 20 * Math.log10(Math.max(masterRms, 0.00001));
            const masterLevel = Math.max(0, Math.min(100, (masterDb + 50) * (100/50)));

            if (masterLevel > this.masterPeakLevel) {
                this.masterPeakLevel = masterLevel;
                this.lastMasterPeakTime = Date.now();
            } else if (Date.now() - this.lastMasterPeakTime > this.peakHoldTime) {
                this.masterPeakLevel *= 0.85;
            }

            requestAnimationFrame(updateLevels);
        };

        updateLevels();
    }

    detectBPM(audioBuffer) {
        const data = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        
        // Create offline context for bass frequency analysis
        const offlineCtx = new OfflineAudioContext(1, data.length, sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        
        // Create low-pass filter for bass frequencies
        const lowpass = offlineCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 150; // Focus on bass frequencies
        lowpass.Q.value = 1;
        
        source.connect(lowpass);
        lowpass.connect(offlineCtx.destination);
        source.start();
        
        // Process audio and analyze
        return offlineCtx.startRendering().then(filteredBuffer => {
            const filteredData = filteredBuffer.getChannelData(0);
            
            // Use smaller chunks for better beat detection (23.2ms)
            const chunkSize = Math.floor(sampleRate * 0.0232);
            const energies = [];
            
            // Calculate RMS energy with 75% overlap
            const overlap = Math.floor(chunkSize * 0.75);
            for (let i = 0; i < filteredData.length - chunkSize; i += overlap) {
                let sum = 0;
                for (let j = 0; j < chunkSize; j++) {
                    sum += filteredData[i + j] * filteredData[i + j];
                }
                energies.push(Math.sqrt(sum / chunkSize));
            }
            
            // Normalize and apply enhanced low-pass filter
            const maxEnergy = Math.max(...energies);
            let normalizedEnergies = energies.map(e => e / maxEnergy);
            
            // Apply 5-point moving average filter
            for (let i = 2; i < normalizedEnergies.length - 2; i++) {
                normalizedEnergies[i] = (
                    normalizedEnergies[i - 2] * 0.1 +
                    normalizedEnergies[i - 1] * 0.2 +
                    normalizedEnergies[i] * 0.4 +
                    normalizedEnergies[i + 1] * 0.2 +
                    normalizedEnergies[i + 2] * 0.1
                );
            }
            
            // Find peaks with dynamic thresholding
            const peaks = [];
            const windowSize = 12;
            const minPeakDistance = Math.floor(sampleRate * 0.15 / overlap);
            
            for (let i = windowSize; i < normalizedEnergies.length - windowSize; i++) {
                const windowEnergies = normalizedEnergies.slice(i - windowSize, i + windowSize);
                const avgEnergy = windowEnergies.reduce((a, b) => a + b) / (windowSize * 2);
                const threshold = avgEnergy * 1.8;
                
                if (normalizedEnergies[i] > threshold &&
                    normalizedEnergies[i] > normalizedEnergies[i-1] &&
                    normalizedEnergies[i] > normalizedEnergies[i+1]) {
                    
                    if (peaks.length === 0 || (i - peaks[peaks.length - 1]) > minPeakDistance) {
                        peaks.push(i);
                    }
                }
            }
            
            // Calculate intervals between peaks
            const intervals = [];
            for (let i = 1; i < peaks.length; i++) {
                intervals.push(peaks[i] - peaks[i-1]);
            }
            
            // Analyze possible octaves
            const possibleBPMs = new Map();
            const timePerChunk = overlap / sampleRate;
            
            intervals.forEach(interval => {
                const secondsPerBeat = interval * timePerChunk;
                let bpm = 60 / secondsPerBeat;
                
                // Check different octaves (half and double time)
                [bpm/2, bpm, bpm*2].forEach(possibleBpm => {
                    // Expand range to better handle higher BPMs (70-180)
                    if (possibleBpm >= 70 && possibleBpm <= 180) {
                        // Weight the BPM ranges differently
                        let weight = 1;
                        // Prefer BPMs in the common range of 120-150
                        if (possibleBpm >= 120 && possibleBpm <= 150) {
                            weight = 1.5;
                        }
                        // Extra weight for common BPMs (140, 128, 120)
                        if (Math.abs(possibleBpm - 140) <= 1 || 
                            Math.abs(possibleBpm - 128) <= 1 || 
                            Math.abs(possibleBpm - 120) <= 1) {
                            weight = 2;
                        }
                        
                        const roundedBpm = Math.round(possibleBpm);
                        possibleBPMs.set(roundedBpm, 
                            (possibleBPMs.get(roundedBpm) || 0) + weight);
                    }
                });
            });
            
            // Find most common BPM
            let maxCount = 0;
            let detectedBPM = 120; // Default fallback
            
            for (const [bpm, count] of possibleBPMs.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    detectedBPM = bpm;
                }
            }
            
            return detectedBPM;
        });
    }

    setTrimGain(deck, value) {
        if (!this.trimNodes[deck]) return;
        this.trimNodes[deck].gain.setTargetAtTime(value, this.audioContext.currentTime, 0.01);
    }

    setCrossfaderCurve(curve) {
        this.crossfaderCurve = curve;
        // Update crossfader with current position to apply new curve
        if (this.crossfaderPosition !== undefined) {
            this.setCrossfader(this.crossfaderPosition * 100);
        }
    }

    setVolume(deck, value) {
        if (!this.gainNodes[deck]) return;
        
        // Invert the value so top position is full volume
        // value of 0 = silence, value of 127 = full volume
        const gain = 1 - (value / 127);
        
        // Store the fader value for metering
        this.channelFaderValues[deck] = gain;
        
        // Apply with a small amount of smoothing
        this.gainNodes[deck].gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.005);
    }

    setMasterGain(value) {
        if (!this.masterGain) return;
        // Apply with a small amount of smoothing
        this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.005);
    }

    seekTo(deck, position, shouldPlay = false) {
        if (!this.buffers[deck]) return;
        
        // Calculate the actual time position
        const startOffset = position * this.buffers[deck].duration;
        
        // Stop current playback
        if (this.sources[deck]) {
            try {
                this.sources[deck].stop();
            } catch (e) {}
            this.sources[deck] = null;
        }
        
        if (shouldPlay) {
            // Create new source and start playback
            this.sources[deck] = this.createSource(deck);
            if (this.sources[deck]) {
                this.startTime[deck] = this.audioContext.currentTime - 
                    (startOffset / this.playbackRate[deck]);
                this.sources[deck].start(0, startOffset);
                
                // Restore loop handler if needed
                if (this.isLooping[deck]) {
                    this.sources[deck].onended = () => {
                        if (this.isLooping[deck]) {
                            this.startLoop(deck);
                        }
                    };
                }
            }
        } else {
            // Just update the pause position without starting playback
            this.startTime[deck] = 0;
            this.pausePosition[deck] = startOffset;
        }
    }

    // Temporary pitch control with easing
    setPitch(deck, targetMultiplier) {
        if (!this.sources[deck]) return;
        
        // Store original rate before temporary change
        if (!this.sources[deck]._originalRate) {
            this.sources[deck]._originalRate = this.playbackRate[deck];
        }
        
        // Cancel any existing transition
        if (this.sources[deck]._rampTimeout) {
            clearTimeout(this.sources[deck]._rampTimeout);
        }
        
        const startRate = this.sources[deck].playbackRate.value;
        const targetRate = this.playbackRate[deck] * targetMultiplier;
        const duration = 0.1; // Duration in seconds
        
        // Exponential ramp for smoother transition
        this.sources[deck].playbackRate.setTargetAtTime(
            targetRate,
            this.audioContext.currentTime,
            duration / 3
        );
    }

    // Reset pitch to original rate with easing
    resetPitch(deck) {
        if (!this.sources[deck] || !this.sources[deck]._originalRate) return;
        
        const startRate = this.sources[deck].playbackRate.value;
        const targetRate = this.sources[deck]._originalRate;
        const duration = 0.1; // Duration in seconds
        
        // Exponential ramp back to original rate
        this.sources[deck].playbackRate.setTargetAtTime(
            targetRate,
            this.audioContext.currentTime,
            duration / 3
        );
        
        // Clean up after transition
        this.sources[deck]._rampTimeout = setTimeout(() => {
            delete this.sources[deck]._originalRate;
            delete this.sources[deck]._rampTimeout;
        }, duration * 1000);
    }

    setLoopIn(deck) {
        const currentTime = this.getCurrentTime(deck);
        this.loopPoints[deck].start = currentTime;
        this.loopPoints[deck].end = null;
        this.isLooping[deck] = false;
    }

    setLoopOut(deck) {
        if (this.loopPoints[deck].start === null) return;
        const currentTime = this.getCurrentTime(deck);
        this.loopPoints[deck].end = currentTime;
        this.isLooping[deck] = true;

        // If currently playing, restart playback with loop enabled
        if (this.sources[deck]) {
            try {
                this.sources[deck].stop();
            } catch (e) {}
            this.sources[deck] = null;

            // Create new source with loop enabled
            this.sources[deck] = this.createSource(deck);
            if (this.sources[deck]) {
                this.startTime[deck] = this.audioContext.currentTime - (currentTime / this.playbackRate[deck]);
                this.sources[deck].start(0, currentTime);
                this.monitorLoop(deck);
            }
        } else {
            // If not playing, just set the pause position to loop start
            this.pausePosition[deck] = this.loopPoints[deck].start;
        }
    }

    monitorLoop(deck) {
        if (!this.isLooping[deck] || !this.sources[deck]) return;

        const currentTime = this.getCurrentTime(deck);
        if (currentTime >= this.loopPoints[deck].end) {
            // Jump back to loop start
            const startOffset = this.loopPoints[deck].start;
            
            // Stop current source
            try {
                this.sources[deck].stop();
            } catch (e) {}
            this.sources[deck] = null;

            // Create and start new source from loop start
            this.sources[deck] = this.createSource(deck);
            if (this.sources[deck]) {
                this.startTime[deck] = this.audioContext.currentTime - (startOffset / this.playbackRate[deck]);
                this.sources[deck].start(0, startOffset);
            }
        }

        // Continue monitoring if still looping
        if (this.isLooping[deck]) {
            requestAnimationFrame(() => this.monitorLoop(deck));
        }
    }

    startLoop(deck) {
        if (!this.sources[deck] || !this.loopPoints[deck].start || !this.loopPoints[deck].end) return;
        
        const currentTime = this.getCurrentTime(deck);
        
        // Check if we need to loop back
        if (currentTime >= this.loopPoints[deck].end) {
            const startOffset = this.loopPoints[deck].start;
            const loopDuration = this.loopPoints[deck].end - this.loopPoints[deck].start;
            
            // Stop current playback
            if (this.sources[deck]) {
                this.sources[deck].stop();
                this.sources[deck] = null;
            }
            
            // Create new source at loop start
            this.sources[deck] = this.createSource(deck);
            if (this.sources[deck]) {
                // Calculate new startTime to maintain visual position
                const elapsedInLoop = currentTime - this.loopPoints[deck].end;
                this.startTime[deck] = this.audioContext.currentTime - 
                    ((startOffset + elapsedInLoop) / this.playbackRate[deck]);
                this.sources[deck].start(0, startOffset);
            }
        }
        
        // Continue monitoring if looping is active
        if (this.isLooping[deck]) {
            requestAnimationFrame(() => this.startLoop(deck));
        }
    }

    clearLoop(deck) {
        this.isLooping[deck] = false;
        this.loopPoints[deck].start = null;
        this.loopPoints[deck].end = null;
    }

    syncToDeck(deck) {
        const otherDeck = deck === 'a' ? 'b' : 'a';
        
        if (!this.buffers[otherDeck] || !this.buffers[deck]) {
            return { success: false };
        }

        // Get target BPM and current BPM from original detected values
        const targetBPM = this.detectBPM(this.buffers[otherDeck]);
        const currentBPM = this.detectBPM(this.buffers[deck]);
        
        if (!targetBPM || !currentBPM) {
            return { success: false };
        }
        
        // Calculate tempo adjustment needed (as a percentage)
        const tempoAdjustment = Math.round((targetBPM / currentBPM) * 100);
        
        // Apply tempo change with phase alignment
        this.setTempo(deck, tempoAdjustment);

        // Try to align the beats
        const currentBeat = this.getCurrentBeat(deck);
        const targetBeat = this.getCurrentBeat(otherDeck);
        
        if (currentBeat && targetBeat) {
            const beatDiff = (targetBeat.phase - currentBeat.phase) * currentBeat.beatLength;
            const currentTime = this.getCurrentTime(deck);
            this.seekTo(deck, (currentTime + beatDiff) / this.buffers[deck].duration, true);
        }

        return {
            success: true,
            tempoAdjustment,
            targetBPM,
            currentBPM
        };
    }

    // Helper method to get current beat position
    getCurrentBeat(deck) {
        if (!this.buffers[deck]) return 0;
        
        const currentTime = this.getCurrentTime(deck);
        const beatLength = this.beatLength[deck];
        const beatPosition = (currentTime - this.beatGridOffset[deck]) / beatLength;
        
        return {
            number: Math.floor(beatPosition),
            phase: beatPosition % 1,
            beatLength
        };
    }

    resetTempo(deck) {
        // Reset to original BPM
        const track = this.currentTrack[deck];
        if (track) {
            this.setTempo(deck, 100);
            return true;
        }
        return false;
    }
} 