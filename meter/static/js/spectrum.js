class SpectrumAnalyzer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.sensitivity = -30;
        this.minDb = -90;
        this.maxDb = 0;
        this.barSpacing = 2;
        this.frequencyLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
        
        // Colors for gradient
        this.gradientColors = [
            { pos: 0.0, color: '#0d47a1' },  // Deep blue
            { pos: 0.5, color: '#4a9eff' },  // Light blue
            { pos: 0.8, color: '#ffaa00' },  // Orange
            { pos: 1.0, color: '#ff5555' }   // Red
        ];

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

    draw(dataArray) {
        if (!this.ctx || !this.width || !this.height) return;

        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        
        // Clear canvas with background
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid lines and labels
        this.drawGrid();
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        this.gradientColors.forEach(({ pos, color }) => {
            gradient.addColorStop(pos, color);
        });
        
        // Calculate bar width and spacing
        const binCount = dataArray.length;
        const effectiveWidth = width - 50; // Leave space for labels
        const barWidth = (effectiveWidth / binCount) - this.barSpacing;
        
        // Draw frequency bars
        ctx.save();
        ctx.translate(50, 0); // Move right to make space for dB scale

        for (let i = 0; i < binCount; i++) {
            // Always use logarithmic scale
            const x = (Math.log10(1 + i) / Math.log10(1 + binCount)) * effectiveWidth;
            
            // Normalize dB value between 0 and 1
            const dbValue = Math.max(this.minDb, Math.min(this.maxDb, dataArray[i]));
            const normalizedDb = (dbValue - this.minDb) / (this.maxDb - this.minDb);
            
            // Apply sensitivity
            const adjustedHeight = normalizedDb * height * (1 + (this.sensitivity + 60) / 60);
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, height - adjustedHeight, barWidth, adjustedHeight);
        }
        
        ctx.restore();
    }

    drawGrid() {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        
        ctx.strokeStyle = '#3c3f41';
        ctx.fillStyle = '#808080';
        ctx.font = '12px monospace';
        ctx.lineWidth = 1;
        
        // Draw dB scale
        const dbStep = 20;
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
            ctx.fillText(`${db}dB`, 45, y);
        }
        
        // Draw frequency scale
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        this.frequencyLabels.forEach(freq => {
            // Always use logarithmic scale for labels
            const x = 50 + ((Math.log10(freq) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) * (width - 50);
            
            if (x >= 50 && x <= width) {
                const label = freq >= 1000 ? `${freq/1000}k` : freq;
                ctx.fillText(label, x, height - 20);
            }
        });
    }
}

// Export for use in main.js
window.SpectrumAnalyzer = SpectrumAnalyzer; 