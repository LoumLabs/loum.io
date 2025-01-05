class SpectrumAnalyzer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.sensitivity = 50;
        this.minDb = -100;
        this.maxDb = 0;
        this.frequencyLabels = [10, 20, 50, 100, 200, 500, '1k', '2k', '5k', '10k', '20k'];
        this.sampleRate = 44100;  // Default to 44.1kHz, but will be updated when drawing
        
        // Create gradient colors for fill with deeper blue like reference
        this.gradientColors = [
            { pos: 0.0, color: 'rgba(30, 100, 255, 0.8)' },
            { pos: 1.0, color: 'rgba(30, 100, 255, 0.2)' }
        ];

        // Previous frequency data for smoothing
        this.prevFrequencyData = null;
        this.smoothingFactor = 0.3;

        // Initial resize
        this.handleResize();
        
        // Handle canvas resize
        this.resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => this.handleResize());
        });
        this.resizeObserver.observe(canvas);
    }

    handleResize() {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            requestAnimationFrame(() => this.handleResize());
            return;
        }
        
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.width = rect.width;
        this.height = rect.height;
    }

    setSensitivity(value) {
        this.sensitivity = value;
    }

    getFrequencyForBin(bin, sampleRate, totalBins) {
        return (bin * sampleRate) / (totalBins * 2);
    }

    getBinForFrequency(freq, sampleRate, totalBins) {
        return Math.round((freq * totalBins * 2) / sampleRate);
    }

    draw(frequencyData, sampleRate) {
        if (!this.ctx || !this.width || !this.height) return;
        
        // Update sample rate if provided
        if (sampleRate) {
            if (this.sampleRate !== sampleRate) {
                console.log('Sample rate changed from', this.sampleRate, 'to', sampleRate, 'Hz');
                this.sampleRate = sampleRate;
            }
        }

        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        
        // Clear the canvas
        ctx.clearRect(0, 0, width, height);
        
        // Check if we should draw anything (when stopped or no signal)
        if (frequencyData[0] <= -180) {
            this.drawGrid();
            return;
        }
        
        // Draw grid first
        this.drawGrid();
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        this.gradientColors.forEach(color => {
            gradient.addColorStop(color.pos, color.color);
        });
        
        // Initialize previous data if needed
        if (!this.prevFrequencyData || this.prevFrequencyData.length !== frequencyData.length) {
            this.prevFrequencyData = new Float32Array(frequencyData);
        }
        
        // Begin path for the continuous line
        ctx.beginPath();
        ctx.moveTo(50, height); // Start at bottom left
        
        const binCount = frequencyData.length;
        let points = [];
        let lastX = 50;

        // Calculate Nyquist frequency (half the sample rate)
        const nyquistFreq = this.sampleRate / 2;

        // First pass: collect and smooth the points
        for (let i = 0; i < binCount; i++) {
            // Get the actual frequency for this bin
            const freq = this.getFrequencyForBin(i, this.sampleRate, binCount * 2);
            
            // Skip if frequency is outside our display range
            if (freq < 10 || freq > Math.min(20000, nyquistFreq)) continue;
            
            // Convert frequency to x position (logarithmic)
            const x = 50 + ((Math.log10(freq) - Math.log10(10)) / (Math.log10(20000) - Math.log10(10))) * (width - 50);
            
            if (x >= lastX && x <= width) {
                // Smooth the frequency data
                this.prevFrequencyData[i] = this.prevFrequencyData[i] * this.smoothingFactor + 
                                          frequencyData[i] * (1 - this.smoothingFactor);
                
                // Get dB value and apply sensitivity boost
                let db = this.prevFrequencyData[i];
                db = Math.min(this.maxDb, db + this.sensitivity);
                db = Math.max(this.minDb, db);
                
                // Convert to y position with smoother scaling
                const normalizedDb = (db - this.minDb) / (this.maxDb - this.minDb);
                // Use linear scaling like reference
                const y = height - (normalizedDb * height);
                
                points.push({x, y});
                lastX = x;
            }
        }
        
        // Second pass: draw smooth curve through points
        if (points.length > 0) {
            ctx.moveTo(50, height);
            ctx.lineTo(points[0].x, points[0].y);
            
            // Draw curve through points
            for (let i = 1; i < points.length - 2; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }
            
            // Handle last two points
            if (points.length > 2) {
                const last = points[points.length - 1];
                const secondLast = points[points.length - 2];
                ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
            }
            
            // Complete the path
            ctx.lineTo(width, height);
        }
        
        // Fill with gradient
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Draw the line on top with brighter blue
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    drawGrid() {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        
        ctx.strokeStyle = '#3c3f41';
        ctx.fillStyle = '#808080';
        ctx.font = '12px monospace';
        ctx.lineWidth = 1;
        
        // Draw dB scale with 10dB steps like reference
        const dbStep = 10;
        for (let db = this.minDb; db <= this.maxDb; db += dbStep) {
            const y = height - ((db - this.minDb) / (this.maxDb - this.minDb)) * height;
            
            // Draw line
            ctx.beginPath();
            ctx.moveTo(50, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            // Draw label
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${db}`, 45, y);
        }
        
        // Draw frequency scale
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        this.frequencyLabels.forEach(freq => {
            const numericFreq = typeof freq === 'string' ? 
                parseInt(freq.replace('k', '000')) : freq;
            
            const x = 50 + ((Math.log10(numericFreq) - Math.log10(10)) / (Math.log10(20000) - Math.log10(10))) * (width - 50);
            
            if (x >= 50 && x <= width) {
                // Draw vertical grid line
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height - 25);
                ctx.stroke();
                // Draw label
                ctx.fillText(freq, x, height - 20);
            }
        });
    }
}

// Export for use in main.js
window.SpectrumAnalyzer = SpectrumAnalyzer; 