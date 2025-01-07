class SpectrumAnalyzer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = 0;
        this.height = 0;
        
        // Analysis parameters
        this.minFreq = 20;    // Hz
        this.maxFreq = 20000; // Hz
        this.minDb = -90;
        this.maxDb = 0;
        this.smoothingFactor = 0.8; // Temporal smoothing
        this.freqLabels = [20, 50, 100, 200, 500, '1k', '2k', '5k', '10k', '20k'];
        
        // Peak detection parameters
        this.peakThreshold = -75;  // Lower threshold to catch more peaks
        this.minPeakDistance = 5;  // Reduced to allow closer peaks
        this.maxHarmonics = 4;     // Increased number of harmonics to show
        this.peakHoldTime = 500;   // Hold peaks for 500ms
        this.lastPeakTime = 0;
        this.lastPeaks = [];

        // Drawing parameters
        this.margin = {
            left: 50,    // Space for frequency labels
            right: 20,   // Right margin
            top: 40,     // Increased top margin for labels
            bottom: 30   // Space for dB labels
        };
        
        // Initialize smoothed data array
        this.smoothedData = null;
        
        // Set canvas size
        this.resizeCanvas();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Notes array for frequency to note conversion
        this.NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    }

    resizeCanvas() {
        // Get container dimensions
        const rect = this.canvas.getBoundingClientRect();
        
        // Set canvas dimensions with device pixel ratio
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        // Scale the context
        this.ctx.scale(dpr, dpr);
        
        // Store logical dimensions
        this.width = rect.width;
        this.height = rect.height;
        
        // Initialize smoothed data if needed
        if (!this.smoothedData) {
            this.smoothedData = new Float32Array(this.width).fill(this.minDb);
        }
    }

    // Convert frequency to x-position using logarithmic scale
    freqToX(freq) {
        const logFreq = Math.log2(freq / this.minFreq);
        const logMax = Math.log2(this.maxFreq / this.minFreq);
        return this.margin.left + (logFreq / logMax) * (this.width - this.margin.left - this.margin.right);
    }

    // Convert dB value to y-position
    dbToY(db) {
        const range = this.maxDb - this.minDb;
        const normalized = (db - this.minDb) / range;
        return this.height - this.margin.bottom - normalized * (this.height - this.margin.top - this.margin.bottom);
    }

    // Convert frequency to note name
    frequencyToNote(frequency) {
        const A4 = 440;
        const A4_NOTE_NUMBER = 69;
        
        if (frequency <= 0) return '';
        
        // Calculate MIDI note number
        const noteNumber = Math.round(12 * Math.log2(frequency / A4) + A4_NOTE_NUMBER);
        
        // Calculate octave and note
        const octave = Math.floor((noteNumber - 12) / 12);
        const noteIndex = (noteNumber + 120) % 12;
        
        return `${this.NOTES[noteIndex]}${octave}`;
    }

    // Find peaks in the spectrum
    findPeaks(dataArray, sampleRate) {
        const peaks = [];
        const binCount = dataArray.length;
        const freqStep = sampleRate / (binCount * 2);
        
        // First pass: find all significant peaks
        const allPeaks = [];
        for (let i = 2; i < binCount - 2; i++) {
            const freq = i * freqStep;
            if (freq < this.minFreq || freq > this.maxFreq) continue;
            
            // Check if this point is a peak
            if (this.smoothedData[i] > this.peakThreshold &&
                this.smoothedData[i] > this.smoothedData[i - 1] &&
                this.smoothedData[i] > this.smoothedData[i - 2] &&
                this.smoothedData[i] > this.smoothedData[i + 1] &&
                this.smoothedData[i] > this.smoothedData[i + 2]) {
                
                allPeaks.push({
                    bin: i,
                    frequency: freq,
                    amplitude: this.smoothedData[i]
                });
            }
        }
        
        // Sort peaks by amplitude
        allPeaks.sort((a, b) => b.amplitude - a.amplitude);
        
        // Find fundamental frequency by looking for harmonic relationships
        if (allPeaks.length > 0) {
            const potentialFundamentals = [];
            
            // Check each peak as a potential fundamental
            allPeaks.forEach(peak => {
                let harmonicScore = 0;
                const freq = peak.frequency;
                
                // Look for harmonics (2x, 3x, 4x frequency)
                [2, 3, 4].forEach(multiple => {
                    const harmonicFreq = freq * multiple;
                    const found = allPeaks.some(p => 
                        Math.abs(p.frequency - harmonicFreq) / harmonicFreq < 0.05  // 5% tolerance
                    );
                    if (found) harmonicScore++;
                });
                
                potentialFundamentals.push({
                    ...peak,
                    harmonicScore
                });
            });
            
            // Sort by harmonic score first, then amplitude
            potentialFundamentals.sort((a, b) => 
                b.harmonicScore - a.harmonicScore || 
                b.amplitude - a.amplitude
            );
            
            // Add the most likely fundamental first
            if (potentialFundamentals.length > 0) {
                const fundamental = potentialFundamentals[0];
                peaks.push({
                    ...fundamental,
                    note: this.frequencyToNote(fundamental.frequency)
                });
                
                // Add harmonics
                allPeaks.forEach(peak => {
                    if (peaks.length < this.maxHarmonics + 1 && 
                        peak.bin !== fundamental.bin &&
                        !peaks.some(p => Math.abs(p.bin - peak.bin) < this.minPeakDistance)) {
                        peaks.push({
                            ...peak,
                            note: this.frequencyToNote(peak.frequency)
                        });
                    }
                });
            }
        }
        
        // Update peak holding
        const now = Date.now();
        if (peaks.length > 0) {
            this.lastPeaks = peaks;
            this.lastPeakTime = now;
        } else if (now - this.lastPeakTime < this.peakHoldTime) {
            return this.lastPeaks;
        } else {
            this.lastPeaks = [];
        }
        
        return peaks;
    }

    drawPeakLabels(peaks) {
        if (!peaks.length) return;

        this.ctx.save();
        
        // Draw peak markers and labels
        this.ctx.font = 'bold 13px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        
        // Calculate label positions to avoid overlap
        const labelSpacing = 30;  // Vertical spacing between labels
        const labelPositions = [];
        
        peaks.forEach((peak, index) => {
            const x = this.freqToX(peak.frequency);
            const y = this.dbToY(peak.amplitude);
            
            // Draw dot at peak
            this.ctx.fillStyle = index === 0 ? '#4CAF50' : '#FFC107';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Calculate label position
            const label = peak.note;
            const freqLabel = `${Math.round(peak.frequency)}`;
            const labelWidth = Math.max(
                this.ctx.measureText(label).width,
                this.ctx.measureText(freqLabel).width
            ) + 16;
            
            // Start with position above peak
            let labelY = y - 25;
            
            // Adjust for overlap
            let overlap = true;
            while (overlap) {
                overlap = labelPositions.some(pos => {
                    const xOverlap = Math.abs(pos.x - x) < (labelWidth / 2 + pos.width / 2 + 5);
                    const yOverlap = Math.abs(pos.y - labelY) < labelSpacing;
                    return xOverlap && yOverlap;
                });
                if (overlap) labelY -= labelSpacing;
            }
            
            // Store label position
            labelPositions.push({
                x: x,
                y: labelY,
                width: labelWidth
            });
            
            // Draw connecting line with better visibility
            this.ctx.beginPath();
            this.ctx.strokeStyle = index === 0 ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 193, 7, 0.3)';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([4, 4]);
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x, labelY + 15);
            this.ctx.stroke();
            
            // Then draw thinner solid line
            this.ctx.beginPath();
            this.ctx.strokeStyle = index === 0 ? '#4CAF50' : '#FFC107';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([]);
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x, labelY + 15);
            this.ctx.stroke();
            
            // Draw label background with slight gradient
            const bgGradient = this.ctx.createLinearGradient(0, labelY - 15, 0, labelY + 10);
            bgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
            bgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
            this.ctx.fillStyle = bgGradient;
            
            // Center the label box
            const boxX = x - labelWidth/2;
            this.ctx.fillRect(boxX, labelY - 15, labelWidth, 25);
            
            // Draw subtle border for label box
            this.ctx.strokeStyle = index === 0 ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 193, 7, 0.3)';
            this.ctx.strokeRect(boxX, labelY - 15, labelWidth, 25);
            
            // Draw note name
            this.ctx.fillStyle = index === 0 ? '#4CAF50' : '#FFC107';
            this.ctx.fillText(label, x, labelY - 2);
            
            // Draw frequency
            this.ctx.font = '10px monospace';
            this.ctx.fillStyle = '#808080';
            this.ctx.fillText(freqLabel + 'Hz', x, labelY + 8);
        });
        
        this.ctx.restore();
    }

    draw(dataArray, sampleRate = 48000) {
        if (!this.ctx || !this.width || !this.height) return;

        // Clear the canvas
        this.ctx.fillStyle = '#1e1e1e';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw grid and labels
        this.drawGrid();

        // Check if we have valid frequency data
        if (!dataArray || dataArray[0] <= -180) {
            return;
        }

        // Calculate frequency resolution
        const binCount = dataArray.length;
        const freqStep = sampleRate / (binCount * 2);

        // Update smoothed data
        if (!this.smoothedData) {
            this.smoothedData = new Float32Array(dataArray);
        }
        for (let i = 0; i < binCount; i++) {
            this.smoothedData[i] = this.smoothedData[i] * this.smoothingFactor + 
                                 dataArray[i] * (1 - this.smoothingFactor);
        }

        // Draw spectrum
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#4a9eff';
        this.ctx.lineWidth = 2;

        let isFirstPoint = true;
        for (let i = 0; i < binCount; i++) {
            const freq = i * freqStep;
            if (freq < this.minFreq || freq > this.maxFreq) continue;

            const x = this.freqToX(freq);
            const y = this.dbToY(this.smoothedData[i]);

            if (isFirstPoint) {
                this.ctx.moveTo(x, y);
                isFirstPoint = false;
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();

        // Add gradient fill
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, 'rgba(74, 158, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(74, 158, 255, 0)');

        this.ctx.lineTo(this.freqToX(this.maxFreq), this.height - this.margin.bottom);
        this.ctx.lineTo(this.margin.left, this.height - this.margin.bottom);
        this.ctx.closePath();
        this.ctx.fillStyle = gradient;
        this.ctx.fill();

        // Find and draw peaks
        const peaks = this.findPeaks(dataArray, sampleRate);
        this.drawPeakLabels(peaks);
    }

    drawGrid() {
        // Draw frequency grid lines and labels
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.fillStyle = '#808080';
        this.ctx.font = '12px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';

        this.freqLabels.forEach(label => {
            const freq = typeof label === 'string' ? 
                parseInt(label.replace('k', '000')) : label;
            const x = this.freqToX(freq);

            // Draw vertical grid line
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.margin.top);
            this.ctx.lineTo(x, this.height - this.margin.bottom);
            this.ctx.stroke();

            // Draw frequency label
            this.ctx.fillText(label, x, this.height - this.margin.bottom + 5);
        });

        // Draw dB grid lines and labels
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        for (let db = this.minDb; db <= this.maxDb; db += 20) {
            const y = this.dbToY(db);

            // Draw horizontal grid line
            this.ctx.beginPath();
            this.ctx.moveTo(this.margin.left, y);
            this.ctx.lineTo(this.width - this.margin.right, y);
            this.ctx.stroke();

            // Draw dB label
            this.ctx.fillText(`${db} dB`, this.margin.left - 5, y);
        }
    }
}

// Export for use in main.js
window.SpectrumAnalyzer = SpectrumAnalyzer; 