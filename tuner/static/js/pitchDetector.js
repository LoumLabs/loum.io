class PitchDetector {
    constructor() {
        // Musical note data
        this.NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
        this.A4_FREQ = 440;  // Standard tuning frequency for A4
        this.A4_INDEX = 69;  // MIDI note number for A4
        
        // Detection parameters
        this.MIN_FREQ = 20;    // Hz
        this.MAX_FREQ = 2000;  // Hz
        
        // Configurable settings
        this.settings = {
            bufferSize: 2048,
            temporalWindow: 2,
            clarityThreshold: 0.93,
            noiseFloor: -70
        };

        // Initialize Hanning window
        this.window = new Float32Array(2048);
        for (let i = 0; i < 2048; i++) {
            this.window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (2048 - 1)));
        }

        // Previous valid readings for smoothing
        this.previousReadings = [];
        this.MAX_READINGS = 3;
    }

    detectPitch(buffer, sampleRate) {
        if (!buffer || buffer.length === 0) return null;

        // Apply Hanning window
        const windowedBuffer = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            windowedBuffer[i] = buffer[i] * this.window[i];
        }

        // Use normalized square difference function for better pitch detection
        const nsdf = new Float32Array(buffer.length);
        let sum = 0;
        
        // Calculate normalized square difference
        for (let lag = 0; lag < buffer.length; lag++) {
            let correlation = 0;
            let norm = 0;
            for (let i = 0; i < buffer.length - lag; i++) {
                correlation += windowedBuffer[i] * windowedBuffer[i + lag];
                norm += windowedBuffer[i] * windowedBuffer[i] + windowedBuffer[i + lag] * windowedBuffer[i + lag];
            }
            nsdf[lag] = 2 * correlation / (norm + Number.EPSILON);
        }

        // Find peaks in NSDF
        const peaks = this.findPeaks(nsdf);
        if (peaks.length === 0) return null;

        // Find the highest peak in the valid frequency range
        const minPeriod = Math.floor(sampleRate / this.MAX_FREQ);
        const maxPeriod = Math.floor(sampleRate / this.MIN_FREQ);
        
        let bestPeak = null;
        let bestScore = -1;

        for (const peak of peaks) {
            if (peak.lag >= minPeriod && peak.lag <= maxPeriod) {
                const score = peak.value * (1 - 0.001 * peak.lag); // Slight bias towards lower lags
                if (score > bestScore) {
                    bestScore = score;
                    bestPeak = peak;
                }
            }
        }

        if (!bestPeak || bestPeak.value < this.settings.clarityThreshold) {
            return null;
        }

        // Calculate frequency from lag
        const frequency = sampleRate / bestPeak.lag;
        
        // Apply temporal smoothing
        const smoothedFreq = this.smoothFrequency(frequency);
        
        // Calculate note information
        const noteInfo = this.getNoteInfo(smoothedFreq);
        
        // Calculate clarity/confidence
        const clarity = bestPeak.value;

        return {
            frequency: smoothedFreq,
            note: noteInfo.note,
            octave: noteInfo.octave,
            cents: noteInfo.cents,
            clarity: clarity
        };
    }

    findPeaks(array) {
        const peaks = [];
        const PEAK_THRESHOLD = 0.3;
        let positiveZeroCrossing = -1;

        for (let i = 1; i < array.length - 1; i++) {
            // Find positive zero crossing
            if (array[i - 1] <= 0 && array[i] > 0) {
                positiveZeroCrossing = i;
            }

            // Find peaks after positive zero crossing
            if (positiveZeroCrossing !== -1 && 
                array[i] > PEAK_THRESHOLD &&
                array[i] > array[i - 1] && 
                array[i] >= array[i + 1]) {
                peaks.push({
                    lag: i,
                    value: array[i]
                });
            }
        }

        return peaks;
    }

    smoothFrequency(frequency) {
        this.previousReadings.push(frequency);
        if (this.previousReadings.length > this.MAX_READINGS) {
            this.previousReadings.shift();
        }

        // Calculate weighted average, giving more weight to recent readings
        let weightedSum = 0;
        let weightSum = 0;
        const weights = [0.5, 0.3, 0.2]; // Most recent reading has highest weight

        for (let i = 0; i < this.previousReadings.length; i++) {
            const weight = weights[this.previousReadings.length - 1 - i];
            weightedSum += this.previousReadings[i] * weight;
            weightSum += weight;
        }

        return weightedSum / weightSum;
    }

    getNoteInfo(frequency) {
        // Calculate MIDI note number
        const midiNote = 12 * Math.log2(frequency / this.A4_FREQ) + this.A4_INDEX;
        const roundedMidiNote = Math.round(midiNote);
        
        // Calculate note properties
        const octave = Math.floor((roundedMidiNote - 12) / 12);
        const noteIndex = ((roundedMidiNote % 12) + 12) % 12;  // Ensure positive index
        const noteName = this.NOTES[noteIndex];
        
        // Calculate cents deviation
        const cents = Math.round((midiNote - roundedMidiNote) * 100);
        
        return {
            note: noteName,
            octave: octave,
            cents: cents
        };
    }

    isPeak(array, index) {
        if (index <= 0 || index >= array.length - 1) return false;
        return array[index] > array[index - 1] && array[index] > array[index + 1];
    }

    setA4(frequency) {
        this.A4_FREQ = frequency;
    }

    getA4() {
        return this.A4_FREQ;
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        
        // Update frequency range if provided
        if (newSettings.minFreq) this.MIN_FREQ = newSettings.minFreq;
        if (newSettings.maxFreq) this.MAX_FREQ = newSettings.maxFreq;
    }
}

// Export for use in main.js
window.PitchDetector = PitchDetector; 