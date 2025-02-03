class AudioProcessor {
    constructor() {
        // Create AudioContext but don't initialize until user interaction
        this.audioContext = null;
        this.sources = { a: null, b: null };
        this.buffers = { a: null, b: null };
        this.startTime = { a: 0, b: 0 };
        this.playbackRate = { a: 1, b: 1 };
        this.pausePosition = { a: undefined, b: undefined };
        this.cuePoints = { a: 0, b: 0 };
        
        // Create nodes after context is initialized
        this.gainNodes = { a: null, b: null };  // Channel faders
        this.trimNodes = { a: null, b: null };
        this.trimRange = { min: -5, max: 5 }; // -5dB to +5dB range
        this.analyzers = { a: null, b: null };  // Post-fader analyzers
        this.eqNodes = { a: null, b: null };
        this.crossfaderGains = { a: null, b: null };  // Separate crossfader gains
        this.isInitialized = false;
        this.levelData = { a: null, b: null };
        this.peakLevels = { a: 0, b: 0 };
        this.peakHoldTime = 1000;
        this.lastPeakTime = { a: 0, b: 0 };
        
        this.crossfaderCurve = 'linear';
        this.crossfaderPosition = 0.5;  // Center by default

        this.masterGain = null;
        this.masterAnalyzer = null;
        this.masterLevelData = null;
        this.masterPeakLevel = 0;
        this.lastMasterPeakTime = 0;

        // Add pre-fader analyzers
        this.preFaderAnalyzers = { a: null, b: null };
        this.preFaderLevelData = { a: null, b: null };

        // Add sync properties
        this.bpm = { a: 0, b: 0 };
        this.beatLength = { a: 0, b: 0 };
        this.beatGridOffset = { a: 0, b: 0 };
        this.currentTrack = { a: null, b: null };  // Track references for each deck

        this.channelFaderValues = {
            a: 1.0,
            b: 1.0
        };
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            console.log('Initializing audio context...');
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Create master section first
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1.0; // Full volume to match UI

            this.masterAnalyzer = this.audioContext.createAnalyser();
            this.masterAnalyzer.fftSize = 2048;
            this.masterAnalyzer.smoothingTimeConstant = 0.2;  // Match channel settings
            this.masterAnalyzer.minDecibels = -60;
            this.masterAnalyzer.maxDecibels = -20;

            // Create crossfader gains (final mixing stage before master)
            this.crossfaderGains.a = this.audioContext.createGain();
            this.crossfaderGains.b = this.audioContext.createGain();

            // Connect crossfader outputs to master
            this.crossfaderGains.a.connect(this.masterGain);
            this.crossfaderGains.b.connect(this.masterGain);

            // Connect master chain
            this.masterGain.connect(this.masterAnalyzer);
            this.masterAnalyzer.connect(this.audioContext.destination);

            // Create channel-specific nodes
            ['a', 'b'].forEach(deck => {
                // Create gain nodes (channel faders)
                this.gainNodes[deck] = this.audioContext.createGain();
                this.gainNodes[deck].gain.value = 1.0; // Full volume to match UI

                // Create trim nodes
                this.trimNodes[deck] = this.audioContext.createGain();
                this.trimNodes[deck].gain.value = 1.0; // Unity gain (0dB) to match UI

                // Create post-fader analyzers (after channel fader, before crossfader)
                this.analyzers[deck] = this.audioContext.createAnalyser();
                this.analyzers[deck].fftSize = 2048;
                this.analyzers[deck].smoothingTimeConstant = 0.2;  // Faster response
                this.analyzers[deck].minDecibels = -60;
                this.analyzers[deck].maxDecibels = -20;

                // Create EQ nodes
                this.eqNodes[deck] = this.createEQNodes();
            });

            // Initialize analyzer data arrays
            this.levelData = {
                a: new Float32Array(this.analyzers.a.frequencyBinCount),
                b: new Float32Array(this.analyzers.b.frequencyBinCount)
            };

            this.masterLevelData = new Float32Array(this.masterAnalyzer.frequencyBinCount);

            this.isInitialized = true;
            console.log('Audio processor initialization complete');
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
            // Disconnect existing connections
            if (this.trimNodes[deck]) this.trimNodes[deck].disconnect();
            if (this.eqNodes[deck].low) this.eqNodes[deck].low.disconnect();
            if (this.eqNodes[deck].mid) this.eqNodes[deck].mid.disconnect();
            if (this.eqNodes[deck].high) this.eqNodes[deck].high.disconnect();
            if (this.gainNodes[deck]) this.gainNodes[deck].disconnect();
            if (this.analyzers[deck]) this.analyzers[deck].disconnect();
            if (this.crossfaderGains[deck]) this.crossfaderGains[deck].disconnect();

            // Connect the audio chain:
            // source -> trim -> EQ -> channel fader -> analyzer -> crossfader -> master
            
            // Source to trim
            this.sources[deck].connect(this.trimNodes[deck]);

            // Trim to EQ chain
            this.trimNodes[deck].connect(this.eqNodes[deck].high);
            this.eqNodes[deck].high.connect(this.eqNodes[deck].mid);
            this.eqNodes[deck].mid.connect(this.eqNodes[deck].low);

            // EQ to channel fader
            this.eqNodes[deck].low.connect(this.gainNodes[deck]);

            // Channel fader to analyzer
            this.gainNodes[deck].connect(this.analyzers[deck]);
            
            // Analyzer to crossfader
            this.analyzers[deck].connect(this.crossfaderGains[deck]);

            // Reconnect crossfader to master (in case it was disconnected)
            this.crossfaderGains[deck].connect(this.masterGain);

            // Set analyzer parameters
            this.analyzers[deck].minDecibels = -90;
            this.analyzers[deck].maxDecibels = 0;
            this.masterAnalyzer.minDecibels = -90;
            this.masterAnalyzer.maxDecibels = 0;

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

            // Get fresh ArrayBuffer from file
            const arrayBuffer = await file.arrayBuffer();

            // Decode audio data
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.buffers[deck] = audioBuffer;
            this.currentTrack[deck] = file;
            
            // Only detect BPM if we don't have a stored value
            const detectedBPM = await this.detectBPM(audioBuffer);
            this.bpm[deck] = detectedBPM || 0;  // Default to 0 if detection fails
            
            if (this.bpm[deck] > 0) {
                this.beatLength[deck] = 60 / this.bpm[deck];
            } else {
                this.beatLength[deck] = 0;
            }
            
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
        
        // Safety check for playback rate
        const rate = this.playbackRate[deck];
        if (isNaN(rate) || !isFinite(rate) || rate <= 0) {
            source.playbackRate.value = 1.0;
        } else {
            source.playbackRate.value = rate;
        }

        // Connect source to trim node (rest of chain is connected in connectEQChain)
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
        if (!this.crossfaderGains.a || !this.crossfaderGains.b) return;
        
        const position = value / 100;  // converts 0-100 to 0-1
        this.crossfaderPosition = position;
        
        let gainA, gainB;
        
        switch (this.crossfaderCurve) {
            case 'sharp':
                // Sharp curve with both channels at 100% in center
                if (position === 0.5) {
                    gainA = 1;
                    gainB = 1;
                } else if (position < 0.5) {
                    gainA = 1;
                    gainB = Math.pow((position * 2), 2);  // Quadratic for faster initial drop
                } else {
                    gainA = Math.pow((1 - position) * 2, 2);  // Quadratic for faster initial drop
                    gainB = 1;
                }
                break;
                
            case 'smooth':
            default:
                // Smooth curve with both channels at 100% in center
                if (position === 0.5) {
                    gainA = 1;
                    gainB = 1;
                } else if (position < 0.5) {
                    gainA = 1;
                    gainB = position * 2;  // Linear for smooth, consistent drop
                } else {
                    gainA = (1 - position) * 2;  // Linear for smooth, consistent drop
                    gainB = 1;
                }
                break;
        }
        
        // Apply crossfader gains with smoothing
        this.crossfaderGains.a.gain.setTargetAtTime(gainA, this.audioContext.currentTime, 0.01);
        this.crossfaderGains.b.gain.setTargetAtTime(gainB, this.audioContext.currentTime, 0.01);
    }

    setTempo(deck, value) {
        // Safety check for valid tempo value
        if (isNaN(value) || !isFinite(value) || value < 50 || value > 150) {
            console.log('Invalid tempo value:', value);
            return;
        }
        
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
        if (this.bpm[deck] && !isNaN(this.bpm[deck])) {
            // Calculate the original BPM without any tempo adjustments
            const originalBPM = this.bpm[deck] / (this.playbackRate[deck] || 1);
            // Apply the new tempo adjustment
            this.bpm[deck] = originalBPM * (tempoPercentage / 100);
        }
    }

    getCurrentTime(deck) {
        if (!this.buffers[deck]) return 0;
        
        if (this.sources[deck]) {
            // If playing, calculate current time with playback rate adjustment
            const elapsedTime = this.audioContext.currentTime - this.startTime[deck];
            return elapsedTime * this.playbackRate[deck];
        } else {
            // If paused, return stored pause position
            return this.pausePosition[deck];
        }
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

            ['a', 'b'].forEach(deck => {
                const levelData = new Float32Array(this.analyzers[deck].frequencyBinCount);
                this.analyzers[deck].getFloatTimeDomainData(levelData);
                let sum = 0;
                let peak = 0;
                
                for (let i = 0; i < levelData.length; i++) {
                    const sample = Math.abs(levelData[i]);
                    sum += sample * sample;
                    peak = Math.max(peak, sample);
                }
                
                // Simple RMS and peak calculation with aggressive scaling
                const rms = Math.sqrt(sum / levelData.length);
                const rmsLevel = rms * 40; // Scale down significantly
                const peakLevel = peak * 40; // Scale down significantly
                
                // Blend RMS and peak with much more emphasis on peak for faster response
                const level = Math.min((rmsLevel * 0.05) + (peakLevel * 0.95), 100);
                
                // Update peak levels with faster decay
                if (level > this.peakLevels[deck]) {
                    this.peakLevels[deck] = level;
                    this.lastPeakTime[deck] = Date.now();
                } else if (Date.now() - this.lastPeakTime[deck] > this.peakHoldTime) {
                    // Faster decay rate
                    this.peakLevels[deck] = Math.max(level, this.peakLevels[deck] * 0.85);
                }
            });

            // Master levels
            const masterLevelData = new Float32Array(this.masterAnalyzer.frequencyBinCount);
            this.masterAnalyzer.getFloatTimeDomainData(masterLevelData);
            let masterSum = 0;
            let masterPeak = 0;
            
            for (let i = 0; i < masterLevelData.length; i++) {
                const sample = Math.abs(masterLevelData[i]);
                masterSum += sample * sample;
                masterPeak = Math.max(masterPeak, sample);
            }
            
            const masterRms = Math.sqrt(masterSum / masterLevelData.length);
            // Use same scaling as channel meters
            const masterRmsLevel = masterRms * 40;
            const masterPeakLevel = masterPeak * 40;
            
            // Use same blend ratio and clamping as channel meters
            const masterLevel = Math.min((masterRmsLevel * 0.05) + (masterPeakLevel * 0.95), 100);

            if (masterLevel > this.masterPeakLevel) {
                this.masterPeakLevel = masterLevel;
                this.lastMasterPeakTime = Date.now();
            } else if (Date.now() - this.lastMasterPeakTime > this.peakHoldTime) {
                // Use same decay rate as channel meters
                this.masterPeakLevel = Math.max(masterLevel, this.masterPeakLevel * 0.85);
            }

            requestAnimationFrame(updateLevels);
        };

        updateLevels();
    }

    async detectBPM(audioBuffer) {
        try {
            console.log('Starting BPM detection...');
            // Only analyze first 30 seconds for performance
            const maxDuration = 30;
            const sampleRate = audioBuffer.sampleRate;
            const maxSamples = Math.min(audioBuffer.length, sampleRate * maxDuration);
            const data = audioBuffer.getChannelData(0).slice(0, maxSamples);
            
            console.log('Creating offline context for BPM detection...');
            // Create offline context for processing
            const offlineCtx = new OfflineAudioContext(1, data.length, sampleRate);
            const source = offlineCtx.createBufferSource();
            const tempBuffer = offlineCtx.createBuffer(1, data.length, sampleRate);
            tempBuffer.getChannelData(0).set(data);
            source.buffer = tempBuffer;
            
            // Enhanced multi-stage filtering
            // Stage 1: High-pass to remove DC offset and sub-bass rumble
            const highPassFilter = offlineCtx.createBiquadFilter();
            highPassFilter.type = 'highpass';
            highPassFilter.frequency.value = 20;
            highPassFilter.Q.value = 1.0;

            // Stage 2: Low-pass for kick drum focus
            const lowPassFilter = offlineCtx.createBiquadFilter();
            lowPassFilter.type = 'lowpass';
            lowPassFilter.frequency.value = 180;
            lowPassFilter.Q.value = 1.0;

            // Stage 3: Compressor to even out dynamics
            const compressor = offlineCtx.createDynamicsCompressor();
            compressor.threshold.value = -24;
            compressor.knee.value = 6;
            compressor.ratio.value = 10;
            compressor.attack.value = 0.001;
            compressor.release.value = 0.1;
            
            // Connect filter chain
            source.connect(highPassFilter);
            highPassFilter.connect(lowPassFilter);
            lowPassFilter.connect(compressor);
            compressor.connect(offlineCtx.destination);
            source.start();
            
            return offlineCtx.startRendering().then(filteredBuffer => {
                const filteredData = filteredBuffer.getChannelData(0);
                const dataLength = filteredData.length;
                
                // Calculate energy envelope with smaller window for better precision
                const windowSize = Math.floor(sampleRate * 0.004); // 4ms window
                const hopSize = Math.floor(windowSize * 0.25); // 25% hop size
                const numFrames = Math.floor((dataLength - windowSize) / hopSize);
                const envelope = new Float32Array(numFrames);
                
                // Calculate energy envelope using RMS with Hanning window
                for (let i = 0; i < numFrames; i++) {
                    let sum = 0;
                    const start = i * hopSize;
                    const end = start + windowSize;
                    
                    for (let j = start; j < end; j++) {
                        const windowPos = (j - start) / windowSize;
                        const window = 0.5 * (1 - Math.cos(2 * Math.PI * windowPos));
                        const sample = filteredData[j] * window;
                        sum += sample * sample;
                    }
                    
                    envelope[i] = Math.sqrt(sum / windowSize);
                }
                
                // Normalize envelope
                const maxEnergy = Math.max(...envelope);
                for (let i = 0; i < envelope.length; i++) {
                    envelope[i] /= maxEnergy;
                }
                
                // Calculate onset detection function
                const onsets = new Float32Array(envelope.length);
                const medianWindow = Math.floor(0.4 * sampleRate / hopSize); // 400ms window
                
                for (let i = 1; i < envelope.length - 1; i++) {
                    // Calculate local median for adaptive thresholding
                    const start = Math.max(0, i - medianWindow);
                    const end = Math.min(envelope.length, i + medianWindow);
                    const localValues = envelope.slice(start, end);
                    localValues.sort();
                    const median = localValues[Math.floor(localValues.length / 2)];
                    
                    // Spectral flux with adaptive thresholding
                    const diff = envelope[i] - envelope[i - 1];
                    onsets[i] = diff > median * 1.5 ? diff : 0;
                }
                
                // Find peaks in onset detection function
                const peaks = [];
                const minPeakDistance = Math.floor(0.35 * sampleRate / hopSize); // Minimum 350ms between peaks
                
                for (let i = 2; i < onsets.length - 2; i++) {
                    if (onsets[i] > onsets[i - 1] && onsets[i] > onsets[i + 1] && onsets[i] > 0.1) {
                        if (peaks.length === 0 || (i - peaks[peaks.length - 1]) >= minPeakDistance) {
                            peaks.push(i);
                        }
                    }
                }
                
                // Calculate inter-onset intervals
                const intervals = [];
                for (let i = 1; i < peaks.length; i++) {
                    intervals.push((peaks[i] - peaks[i - 1]) * hopSize / sampleRate);
                }
                
                // Calculate tempo histogram
                const bpmBins = new Float32Array(300); // 0-300 BPM range
                const bpmRange = { min: 60, max: 200 };
                
                for (let i = 0; i < intervals.length - 1; i++) {
                    const interval = intervals[i];
                    const nextInterval = intervals[i + 1];
                    const bpm = 60 / interval;
                    
                    if (bpm >= bpmRange.min && bpm <= bpmRange.max) {
                        // Weight by consistency with next interval
                        const nextBpm = 60 / nextInterval;
                        const consistency = 1 - Math.min(Math.abs(bpm - nextBpm) / bpm, 1);
                        const weight = Math.pow(consistency, 2);
                        
                        // Add weighted vote to histogram
                        const roundedBpm = Math.round(bpm);
                        bpmBins[roundedBpm] += weight;
                        
                        // Add smaller weights to nearby bins for continuity
                        for (let offset = -2; offset <= 2; offset++) {
                            const nearbyBpm = roundedBpm + offset;
                            if (nearbyBpm > 0 && nearbyBpm < bpmBins.length) {
                                bpmBins[nearbyBpm] += weight * Math.exp(-offset * offset / 2);
                            }
                        }
                    }
                }
                
                // Find highest peak in histogram
                let maxBin = 0;
                let maxValue = 0;
                for (let i = bpmRange.min; i <= bpmRange.max; i++) {
                    if (bpmBins[i] > maxValue) {
                        maxValue = bpmBins[i];
                        maxBin = i;
                    }
                }
                
                // Refine tempo estimate using quadratic interpolation
                const alpha = bpmBins[maxBin - 1];
                const beta = bpmBins[maxBin];
                const gamma = bpmBins[maxBin + 1];
                const p = 0.5 * (alpha - gamma) / (alpha - 2*beta + gamma);
                let refinedBPM = maxBin + p;
                
                // Always double the tempo if it's below 80 BPM
                if (refinedBPM < 80) {
                    refinedBPM *= 2;
                }
                // For higher tempos, still check if we should double
                else if (refinedBPM < 100) {
                    const doubleBPM = refinedBPM * 2;
                    if (doubleBPM <= bpmRange.max && bpmBins[Math.round(doubleBPM)] > maxValue * 0.4) {
                        refinedBPM = doubleBPM;
                    }
                }
                // Check for half tempo only for very high BPMs
                else if (refinedBPM > 200) {
                    refinedBPM /= 2;
                }
                
                const detectedBPM = Math.round(refinedBPM);
                console.log(`Detected BPM: ${detectedBPM} with confidence: ${maxValue}`);
                return detectedBPM;
            });
        } catch (error) {
            console.error('Error in BPM detection:', error);
            return 0;  // Return 0 if BPM detection fails
        }
    }

    setTrimGain(deck, value) {
        if (!this.trimNodes[deck]) return;
        // Convert 0-100 UI value to dB range (-20 to +5)
        const db = this.trimRange.min + (value / 100) * (this.trimRange.max - this.trimRange.min);
        // Convert dB to gain value
        const gain = Math.pow(10, db / 20);
        this.trimNodes[deck].gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01);
        return db;  // Return dB value for UI display
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
        
        // Convert 0-127 range to gain (0-1)
        // value of 127 = full volume (1.0)
        // value of 0 = silence (0.0)
        const gain = value / 127;
        
        // Store the fader value for metering
        this.channelFaderValues[deck] = gain;
        
        // Apply gain with smoothing
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
                // Account for playback rate when calculating start time
                this.startTime[deck] = this.audioContext.currentTime - (startOffset / this.playbackRate[deck]);
                this.sources[deck].start(0, startOffset);
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