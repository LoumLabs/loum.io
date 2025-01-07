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
        
        // Drawing parameters
        this.margin = {
            left: 50,    // Space for frequency labels
            right: 20,   // Right margin
            top: 20,     // Top margin
            bottom: 30   // Space for dB labels
        };
        
        // Initialize smoothed data array
        this.smoothedData = null;
        
        // Set canvas size
        this.resizeCanvas();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
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

        // Draw spectrum
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#4a9eff';
        this.ctx.lineWidth = 2;

        let isFirstPoint = true;
        for (let i = 0; i < binCount; i++) {
            const freq = i * freqStep;
            if (freq < this.minFreq || freq > this.maxFreq) continue;

            // Smooth the data temporally
            if (this.smoothedData) {
                this.smoothedData[i] = this.smoothedData[i] * this.smoothingFactor + 
                                     dataArray[i] * (1 - this.smoothingFactor);
            } else {
                this.smoothedData = new Float32Array(dataArray);
            }

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