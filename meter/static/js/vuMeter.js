class VUMeter {
    constructor(canvas) {
        this.canvas = canvas;
        this.currentLevel = 30;  // Start at ambient room level
        
        // Reference SPL levels for common sounds
        this.REFERENCE_LEVELS = {
            BREATHING: 10,         // 10 dB - Breathing
            WHISPER: 30,          // 30 dB - Whisper
            QUIET_ROOM: 40,       // 40 dB - Quiet room
            NORMAL_SPEECH: 60,    // 60 dB - Normal conversation at 1m
            LOUD_SPEECH: 70,      // 70 dB - Loud speech
            SHOUT: 85,           // 85 dB - Shouting
            THRESHOLD_OF_PAIN: 120 // 120 dB - Threshold of pain
        };
        
        // Constants for SPL calculation
        this.REF_PRESSURE = 2e-5;    // 20 µPa reference pressure for SPL
        this.REF_DISTANCE = 1.0;     // Reference distance in meters
        this.TYPICAL_DISTANCE = 0.5;  // Typical distance to mic (50cm)
        
        // Microphone calibration with much stronger attenuation
        this.MIC_SENSITIVITY = -38;   // dBV/Pa at 1kHz (typical MEMS mic)
        this.MIC_GAIN = -45;         // Significantly increased attenuation
        this.SYSTEM_OFFSET = -25;    // Increased system-level adjustment
        
        // Initialize averaging system with shorter buffer for faster response
        this.averagingBuffer = new Float32Array(12);
        this.averagingIndex = 0;
        
        // Peak tracking
        this.peakHoldTime = 1000;
        this.lastPeak = 30;
        this.lastPeakTime = 0;
        
        // Additional calibration factor
        this.CALIBRATION_FACTOR = 0.6; // Reduce overall levels
    }
    
    draw(dataArray) {
        // Calculate RMS of the audio samples
        let rms = 0;
        for (let i = 0; i < dataArray.length; i++) {
            rms += dataArray[i] * dataArray[i];
        }
        rms = Math.sqrt(rms / dataArray.length);
        
        // Convert normalized audio samples to voltage (dBV)
        const dBV = 20 * Math.log10(Math.max(rms, 1e-9));
        
        // Convert to Pascal using mic sensitivity and gain
        const micVoltagePerPascal = Math.pow(10, (this.MIC_SENSITIVITY + this.MIC_GAIN) / 20);
        const pascals = Math.pow(10, dBV / 20) / micVoltagePerPascal;
        
        // Apply distance compensation (inverse square law)
        const distanceCompensation = 20 * Math.log10(this.TYPICAL_DISTANCE / this.REF_DISTANCE);
        
        // Calculate SPL with additional attenuation
        let spl = 20 * Math.log10(Math.max(pascals, this.REF_PRESSURE) / this.REF_PRESSURE);
        spl = (spl + distanceCompensation + this.SYSTEM_OFFSET) * this.CALIBRATION_FACTOR;
        
        // Apply averaging for stability
        this.averagingBuffer[this.averagingIndex] = spl;
        this.averagingIndex = (this.averagingIndex + 1) % this.averagingBuffer.length;
        
        // Calculate weighted average (more weight to recent samples)
        let avgSPL = 0;
        let totalWeight = 0;
        for (let i = 0; i < this.averagingBuffer.length; i++) {
            const weight = 1 + (i / this.averagingBuffer.length);
            avgSPL += (this.averagingBuffer[i] || spl) * weight;
            totalWeight += weight;
        }
        avgSPL /= totalWeight;
        
        // Update peak tracking
        const now = performance.now();
        if (avgSPL > this.lastPeak) {
            this.lastPeak = avgSPL;
            this.lastPeakTime = now;
        } else if (now - this.lastPeakTime > this.peakHoldTime) {
            this.lastPeak = Math.max(avgSPL, this.lastPeak - 0.5);
        }
        
        // Use peak-influenced value with more emphasis on current value
        const smoothedSPL = (avgSPL * 0.85) + (this.lastPeak * 0.15);
        
        // Ensure reasonable range and calibrate against reference levels
        const calibratedSPL = Math.min(
            this.REFERENCE_LEVELS.THRESHOLD_OF_PAIN,
            Math.max(this.REFERENCE_LEVELS.BREATHING, smoothedSPL)
        );
        
        this.currentLevel = calibratedSPL;
        return this.currentLevel;
    }
    
    getReferenceLevel(soundType) {
        return this.REFERENCE_LEVELS[soundType];
    }
}

// Export for use in main.js
window.VUMeter = VUMeter; 