class AudioFilters {
    constructor() {
        this.lowMidCrossover = 250;    // Hz
        this.midHighCrossover = 4000;  // Hz
        this.filterOrder = 5;          // Butterworth order
        this.blockSize = 3.0;          // seconds
        this.stepSize = 1.0;           // seconds
    }

    async processMultiband(audioBuffer) {
        try {
            console.log('Starting multiband processing...');
            
            const numChannels = audioBuffer.numberOfChannels;
            let results = [];
            
            for (let channel = 0; channel < numChannels; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                console.log(`Processing channel ${channel + 1}/${numChannels}`);
                
                // Create buffer with channel data
                const buffer = new AudioBuffer({
                    numberOfChannels: 1,
                    length: channelData.length,
                    sampleRate: audioBuffer.sampleRate
                });
                buffer.getChannelData(0).set(channelData);
                
                // Process each band with new contexts and sources
                console.log('Processing bands...');
                
                // Low band
                const lowContext = new OfflineAudioContext(1, channelData.length, audioBuffer.sampleRate);
                const lowSource = lowContext.createBufferSource();
                lowSource.buffer = buffer;
                const lowBand = await this.processLowBand(lowContext, lowSource);
                
                // Mid band
                const midContext = new OfflineAudioContext(1, channelData.length, audioBuffer.sampleRate);
                const midSource = midContext.createBufferSource();
                midSource.buffer = buffer;
                const midBand = await this.processMidBand(midContext, midSource);
                
                // High band
                const highContext = new OfflineAudioContext(1, channelData.length, audioBuffer.sampleRate);
                const highSource = highContext.createBufferSource();
                highSource.buffer = buffer;
                const highBand = await this.processHighBand(highContext, highSource);
                
                results.push({ low: lowBand, mid: midBand, high: highBand });
            }
            
            // Take maximum values across channels
            const maxResults = {
                low: Math.max(...results.map(r => r.low)),
                mid: Math.max(...results.map(r => r.mid)),
                high: Math.max(...results.map(r => r.high))
            };
            
            console.log('Multiband processing complete:', maxResults);
            return maxResults;
            
        } catch (error) {
            console.error('Error in multiband processing:', error);
            throw error;
        }
    }

    async processLowBand(context, source) {
        // Create a single filter with higher order
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = this.lowMidCrossover;
        // Adjust Q to approximate higher order Butterworth
        filter.Q.value = Math.SQRT1_2; // 0.707 for Butterworth
        
        // Connect filter
        source.connect(filter);
        filter.connect(context.destination);
        
        // Start the source and render
        source.start(0);
        
        // Render audio
        const renderedBuffer = await context.startRendering();
        const samples = renderedBuffer.getChannelData(0);
        
        return this.calculateBlockRMS(samples, context.sampleRate);
    }

    async processHighBand(context, source) {
        // Create a single filter with higher order
        const filter = context.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = this.midHighCrossover;
        // Adjust Q to approximate higher order Butterworth
        filter.Q.value = Math.SQRT1_2; // 0.707 for Butterworth
        
        // Connect filter
        source.connect(filter);
        filter.connect(context.destination);
        
        // Start the source and render
        source.start(0);
        
        // Render audio
        const renderedBuffer = await context.startRendering();
        const samples = renderedBuffer.getChannelData(0);
        
        return this.calculateBlockRMS(samples, context.sampleRate);
    }

    async processMidBand(context, source) {
        // Create a single bandpass filter
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        // Use geometric mean of cutoff frequencies for center frequency
        filter.frequency.value = Math.sqrt(this.lowMidCrossover * this.midHighCrossover);
        // Set Q to create the desired bandwidth
        const bandwidth = this.midHighCrossover - this.lowMidCrossover;
        filter.Q.value = filter.frequency.value / bandwidth;
        
        // Connect filter
        source.connect(filter);
        filter.connect(context.destination);
        
        // Start the source and render
        source.start(0);
        
        // Render audio
        const renderedBuffer = await context.startRendering();
        const samples = renderedBuffer.getChannelData(0);
        
        return this.calculateBlockRMS(samples, context.sampleRate);
    }

    calculateBlockRMS(samples, sampleRate) {
        const blockSamples = Math.floor(this.blockSize * sampleRate);
        const stepSamples = Math.floor(this.stepSize * sampleRate);
        
        // Collect all RMS values first, like Python version
        const rmsValues = [];
        
        for (let start = 0; start < samples.length; start += stepSamples) {
            const end = start + blockSamples;
            if (end > samples.length) {
                // Handle last block exactly like Python
                let block = samples.slice(start, samples.length);
                const paddedBlock = new Float32Array(blockSamples);
                paddedBlock.set(block);
                block = paddedBlock;
                
                // Calculate RMS for padded block
                let sumSquares = 0;
                for (let i = 0; i < blockSamples; i++) {
                    sumSquares += block[i] * block[i];
                }
                const rms = Math.sqrt(sumSquares / blockSamples);
                const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
                if (isFinite(rmsDb)) {
                    rmsValues.push(rmsDb);
                }
            } else {
                // Full block
                const block = samples.slice(start, end);
                let sumSquares = 0;
                for (let i = 0; i < blockSamples; i++) {
                    sumSquares += block[i] * block[i];
                }
                const rms = Math.sqrt(sumSquares / blockSamples);
                const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
                if (isFinite(rmsDb)) {
                    rmsValues.push(rmsDb);
                }
            }
        }
        
        // Find maximum RMS value
        if (rmsValues.length === 0) {
            return -100;
        }
        
        const maxRms = Math.max(...rmsValues);
        return isFinite(maxRms) ? maxRms : -100;
    }
}

// Make it available globally
window.AudioFilters = AudioFilters; 