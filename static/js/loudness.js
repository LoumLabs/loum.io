class LoudnessAnalyzer {
    constructor() {
        // Constants for ITU-R BS.1770-4
        this.preFilterB = [1.53512485958697, -2.69169618940638, 1.19839281085285];
        this.preFilterA = [1, -1.69065929318241, 0.73248077421585];
        this.highShelfB = [1.0, -2.0, 1.0];
        this.highShelfA = [1.0, -1.99004745483398, 0.99007225036621];
        this.blockSize = 3.0;  // 3 seconds for short-term
        this.stepSize = 1.0;   // 1 second step
    }

    async analyzeLoudness(audioBuffer) {
        console.log('Starting loudness analysis...');
        try {
            // Calculate true peak (with 4x oversampling)
            const truePeak = await this.calculateTruePeak(audioBuffer);
            console.log('True peak calculated:', truePeak);

            // Calculate sample peak (direct measurement)
            const samplePeak = this.calculateSamplePeak(audioBuffer);
            console.log('Sample peak calculated:', samplePeak);

            // Calculate short-term loudness values
            const shortTermValues = await this.calculateShortTermLoudness(audioBuffer);
            console.log('Short-term values calculated:', shortTermValues.length, 'blocks');

            // Calculate integrated loudness
            const integratedLoudness = await this.calculateIntegratedLoudness(audioBuffer);
            console.log('Integrated loudness calculated:', integratedLoudness);

            // Calculate loudness range from short-term values
            const loudnessRange = this.calculateLoudnessRange(shortTermValues);
            console.log('Loudness range calculated:', loudnessRange);

            // Find maximum short-term value (LUFS-S Max)
            // Apply absolute gating at -40 LUFS before finding max (EBU R128)
            const gatedShortTerm = shortTermValues.filter(value => value >= -40);
            const shortTermMax = Math.max(...gatedShortTerm);
            console.log('Short-term maximum calculated:', shortTermMax);

            return {
                truePeak,
                samplePeak,
                shortTermMax,
                integratedLoudness,
                loudnessRange
            };
        } catch (error) {
            console.error('Error in loudness analysis:', error);
            throw error;
        }
    }

    async calculateTruePeak(audioBuffer) {
        const channels = audioBuffer.numberOfChannels;
        let maxPeak = -Infinity;
        
        // 4x oversampling for true peak detection
        const oversamplingFactor = 4;
        const oversampledLength = audioBuffer.length * oversamplingFactor;
        
        for (let channel = 0; channel < channels; channel++) {
            const samples = audioBuffer.getChannelData(channel);
            
            // Create offline context for oversampling with high-quality interpolation
            const context = new OfflineAudioContext(1, oversampledLength, audioBuffer.sampleRate * oversamplingFactor);
            
            // Create source
            const source = context.createBufferSource();
            source.buffer = audioBuffer;
            
            // Create a high-quality interpolation filter
            const interpolator = context.createBiquadFilter();
            interpolator.type = 'lowpass';
            interpolator.frequency.value = audioBuffer.sampleRate * 0.45; // Nyquist * 0.9
            interpolator.Q.value = 0.54;
            
            // Connect with interpolation filter
            source.connect(interpolator);
            interpolator.connect(context.destination);
            source.start();
            
            const oversampledBuffer = await context.startRendering();
            const oversampledData = oversampledBuffer.getChannelData(0);
            
            // Process data in chunks to avoid stack overflow
            const CHUNK_SIZE = 1000000; // Process 1M samples at a time
            let channelPeak = -Infinity;
            
            for (let i = 0; i < oversampledData.length; i += CHUNK_SIZE) {
                const end = Math.min(i + CHUNK_SIZE, oversampledData.length);
                for (let j = i; j < end; j++) {
                    const absValue = Math.abs(oversampledData[j]);
                    if (absValue > channelPeak) {
                        channelPeak = absValue;
                    }
                }
            }
            
            maxPeak = Math.max(maxPeak, channelPeak);
        }
        
        return 20 * Math.log10(maxPeak);
    }

    calculateSamplePeak(audioBuffer) {
        const channels = audioBuffer.numberOfChannels;
        let maxPeak = -Infinity;
        
        // Process data in chunks to avoid stack overflow
        const CHUNK_SIZE = 1000000; // Process 1M samples at a time
        
        for (let channel = 0; channel < channels; channel++) {
            const samples = audioBuffer.getChannelData(channel);
            let channelPeak = -Infinity;
            
            for (let i = 0; i < samples.length; i += CHUNK_SIZE) {
                const end = Math.min(i + CHUNK_SIZE, samples.length);
                for (let j = i; j < end; j++) {
                    const absValue = Math.abs(samples[j]);
                    if (absValue > channelPeak) {
                        channelPeak = absValue;
                    }
                }
            }
            
            maxPeak = Math.max(maxPeak, channelPeak);
        }
        
        return 20 * Math.log10(maxPeak);
    }

    async calculateShortTermLoudness(audioBuffer) {
        const sampleRate = audioBuffer.sampleRate;
        const blockSamples = Math.floor(this.blockSize * sampleRate);
        const overlap = Math.floor(blockSamples * 0.75); // 75% overlap
        const hopSize = blockSamples - overlap;
        const shortTermValues = [];

        // Channel weights according to ITU-R BS.1770-4
        const channelWeights = new Array(audioBuffer.numberOfChannels).fill(1.0);
        if (audioBuffer.numberOfChannels > 2) {
            channelWeights[4] = 1.41; // Left surround
            channelWeights[5] = 1.41; // Right surround
        }

        // First, apply K-weighting to all channels
        const kWeightedChannels = [];
        let weightedChannelCount = 0;

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            // Skip LFE channel in 5.1 layout
            if (audioBuffer.numberOfChannels > 2 && channel === 3) continue;

            const samples = audioBuffer.getChannelData(channel);
            const weight = channelWeights[channel];
            weightedChannelCount += weight > 0 ? 1 : 0;

            // Create buffer for this channel
            const channelBuffer = new AudioBuffer({
                numberOfChannels: 1,
                length: samples.length,
                sampleRate: sampleRate
            });
            channelBuffer.copyToChannel(samples, 0);

            // Apply K-weighting
            const filteredSamples = await this.applyKWeighting(channelBuffer);
            kWeightedChannels.push({
                samples: filteredSamples,
                weight: weight
            });
        }

        // Process blocks with overlap
        for (let start = 0; start + blockSamples <= audioBuffer.length; start += hopSize) {
            let sumSquared = 0;
            
            // Sum the weighted, K-weighted samples for all channels
            for (const channel of kWeightedChannels) {
                const samples = channel.samples;
                const weight = channel.weight;
                let channelSum = 0;
                
                // Calculate mean square value for this channel's block
                for (let i = start; i < start + blockSamples; i++) {
                    channelSum += samples[i] * samples[i];
                }
                
                // Apply channel weight to mean square value
                sumSquared += (channelSum / blockSamples) * weight;
            }
            
            // Calculate LUFS
            const blockLoudness = 10 * Math.log10(sumSquared);
            
            if (isFinite(blockLoudness) && !isNaN(blockLoudness)) {
                shortTermValues.push(blockLoudness);
            }
        }

        return shortTermValues;
    }

    async applyKWeighting(buffer) {
        const context = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
        const source = context.createBufferSource();
        source.buffer = buffer;

        // Stage 1: Pre-filter (high-pass) using exact ITU coefficients
        const preFilter = context.createIIRFilter(this.preFilterB, this.preFilterA);

        // Stage 2: High-shelf filter using exact ITU coefficients
        const highShelf = context.createIIRFilter(this.highShelfB, this.highShelfA);

        // Connect the filters
        source.connect(preFilter);
        preFilter.connect(highShelf);
        highShelf.connect(context.destination);
        source.start();

        // Render and return the filtered samples
        const filteredBuffer = await context.startRendering();
        return filteredBuffer.getChannelData(0);
    }

    async calculateIntegratedLoudness(audioBuffer) {
        const sampleRate = audioBuffer.sampleRate;
        const channels = audioBuffer.numberOfChannels;
        const gatingBlock = Math.floor(0.4 * sampleRate); // 400ms blocks
        const gatingOverlap = Math.floor(gatingBlock * 0.75); // 75% overlap
        const gatingHop = gatingBlock - gatingOverlap;
        const gatingValues = [];

        // Channel weights according to ITU-R BS.1770-4
        const channelWeights = new Array(channels).fill(1.0);
        if (channels > 2) {
            channelWeights[4] = 1.41; // Left surround
            channelWeights[5] = 1.41; // Right surround
        }

        // First, apply K-weighting to all channels
        const kWeightedChannels = [];
        let weightedChannelCount = 0;

        for (let channel = 0; channel < channels; channel++) {
            // Skip LFE channel in 5.1 layout
            if (channels > 2 && channel === 3) continue;

            const samples = audioBuffer.getChannelData(channel);
            const weight = channelWeights[channel];
            weightedChannelCount += weight > 0 ? 1 : 0;

            // Create buffer for this channel
            const channelBuffer = new AudioBuffer({
                numberOfChannels: 1,
                length: samples.length,
                sampleRate: sampleRate
            });
            channelBuffer.copyToChannel(samples, 0);

            // Apply K-weighting
            const filteredSamples = await this.applyKWeighting(channelBuffer);
            kWeightedChannels.push({
                samples: filteredSamples,
                weight: weight
            });
        }

        // Calculate gating block values with 75% overlap
        for (let start = 0; start + gatingBlock <= audioBuffer.length; start += gatingHop) {
            let sumSquared = 0;
            
            // Sum the weighted, K-weighted samples for all channels
            for (const channel of kWeightedChannels) {
                const samples = channel.samples;
                const weight = channel.weight;
                let channelSum = 0;
                
                for (let i = start; i < start + gatingBlock; i++) {
                    channelSum += samples[i] * samples[i];
                }
                
                // Apply channel weight to mean square value
                sumSquared += (channelSum / gatingBlock) * weight;
            }
            
            // Calculate LUFS
            const blockLoudness = 10 * Math.log10(sumSquared);
            
            if (isFinite(blockLoudness) && !isNaN(blockLoudness)) {
                gatingValues.push(blockLoudness);
            }
        }

        // Apply -70 LUFS absolute gate
        const absoluteGated = gatingValues.filter(v => v >= -70);
        if (absoluteGated.length === 0) return -70;

        // Calculate relative threshold
        const absoluteMean = absoluteGated.reduce((sum, v) => sum + v, 0) / absoluteGated.length;
        const relativeThreshold = absoluteMean - 10;

        // Apply relative gate and calculate final loudness
        const relativeGated = absoluteGated.filter(v => v >= relativeThreshold);
        if (relativeGated.length === 0) return absoluteMean;

        // Calculate mean of gated values
        return relativeGated.reduce((sum, v) => sum + v, 0) / relativeGated.length;
    }

    calculateLoudnessRange(shortTermValues) {
        if (shortTermValues.length < 2) return 0;

        // Apply absolute gating at -40 LUFS for short-term measurements (EBU R128)
        let gatedValues = shortTermValues.filter(value => value >= -40);
        if (gatedValues.length < 2) return 0;

        // Calculate mean of absolute-gated values
        const absoluteGatedMean = gatedValues.reduce((sum, value) => sum + value, 0) / gatedValues.length;

        // Apply relative gating at -20 LU below absolute-gated mean (EBU R128)
        const relativeThreshold = absoluteGatedMean - 20;
        gatedValues = gatedValues.filter(value => value >= relativeThreshold);
        if (gatedValues.length < 2) return 0;

        // Sort values for percentile calculation
        gatedValues.sort((a, b) => a - b);
        
        // Calculate 10th and 95th percentiles
        const lowIndex = Math.max(0, Math.floor(gatedValues.length * 0.1));
        const highIndex = Math.min(gatedValues.length - 1, Math.floor(gatedValues.length * 0.95));
        
        const lowPercentile = gatedValues[lowIndex];
        const highPercentile = gatedValues[highIndex];
        
        return highPercentile - lowPercentile;
    }
}

// Make it available globally
window.LoudnessAnalyzer = LoudnessAnalyzer; 