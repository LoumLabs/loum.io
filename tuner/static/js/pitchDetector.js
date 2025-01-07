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
            this.window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (2047)));
        }
    }

    detectPitch(buffer, sampleRate) {
        if (!buffer || buffer.length === 0) return null;

        // Apply Hanning window
        const windowedBuffer = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            windowedBuffer[i] = buffer[i] * this.window[i];
        }

        // Step 1: Calculate difference function
        const yinBuffer = new Float32Array(buffer.length / 2);
        this.difference(windowedBuffer, yinBuffer);

        // Step 2: Cumulative mean normalized difference
        this.cumulativeMeanNormalizedDifference(yinBuffer);

        // Step 3: Absolute threshold
        const tau = this.absoluteThreshold(yinBuffer, sampleRate);
        if (tau === -1) return null;

        // Calculate frequency from tau
        const frequency = sampleRate / tau;
        if (frequency < this.MIN_FREQ || frequency > this.MAX_FREQ) return null;

        // Calculate clarity/confidence
        const clarity = 1 - yinBuffer[tau];
        if (clarity < this.settings.clarityThreshold) return null;

        // Calculate note information
        const noteInfo = this.getNoteInfo(frequency);

        return {
            frequency: frequency,
            note: noteInfo.note,
            octave: noteInfo.octave,
            cents: noteInfo.cents,
            clarity: clarity
        };
    }

    difference(buffer, yinBuffer) {
        const halfLength = yinBuffer.length;
        
        for (let tau = 0; tau < halfLength; tau++) {
            yinBuffer[tau] = 0;
            
            for (let i = 0; i < halfLength; i++) {
                const delta = buffer[i] - buffer[i + tau];
                yinBuffer[tau] += delta * delta;
            }
        }
    }

    cumulativeMeanNormalizedDifference(yinBuffer) {
        let runningSum = 0;
        yinBuffer[0] = 1;
        
        for (let tau = 1; tau < yinBuffer.length; tau++) {
            runningSum += yinBuffer[tau];
            yinBuffer[tau] *= tau / runningSum;
        }
    }

    absoluteThreshold(yinBuffer, sampleRate) {
        const threshold = this.settings.clarityThreshold;
        let minTau = -1;
        let minVal = Infinity;
        
        // Find the smallest value in the buffer after the first zero crossing
        let startIndex = Math.floor(sampleRate / this.MAX_FREQ);
        let endIndex = Math.ceil(sampleRate / this.MIN_FREQ);
        
        for (let tau = startIndex; tau < Math.min(endIndex, yinBuffer.length); tau++) {
            if (yinBuffer[tau] < threshold) {
                if (yinBuffer[tau] < minVal) {
                    minVal = yinBuffer[tau];
                    minTau = tau;
                }
            }
        }
        
        return minTau;
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