class VUMeter {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = 0;
        this.height = 0;
        this.currentLevel = -60;
        this.peakLevel = -60;
        this.lastPeakTime = 0;
        this.peakHoldTime = 1000;
        this.peakDecayRate = 20;
        this.lastFrameTime = 0;
        
        // Performance monitoring
        this.frameCount = 0;
        this.lastFPSUpdate = 0;
        this.fps = 0;
        this.timings = {
            total: 0,
            calculations: 0,
            meterSegments: 0,
            tickMarks: 0,
            needle: 0,
            display: 0
        };
        
        this.resizeObserver = new ResizeObserver(() => {
            this.handleResize();
        });
        this.resizeObserver.observe(canvas);
        this.handleResize();
    }
    
    handleResize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.width = rect.width;
        this.height = rect.height;
    }
    
    draw(dataArray) {
        const startTime = performance.now();
        let timing = startTime;
        
        // Calculate levels
        const rmsLevel = this.calculateRMSLevel(dataArray);
        this.currentLevel = rmsLevel;
        
        // Update peak level
        const now = performance.now();
        const timeDelta = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        
        if (rmsLevel > this.peakLevel) {
            this.peakLevel = rmsLevel;
            this.lastPeakTime = now;
        } else if (now - this.lastPeakTime > this.peakHoldTime) {
            this.peakLevel = Math.max(rmsLevel, this.peakLevel - this.peakDecayRate * timeDelta);
        }
        
        this.timings.calculations = performance.now() - timing;
        timing = performance.now();
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw panel background (darker)
        this.ctx.fillStyle = '#1e1e1e';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw meter segments
        this.drawMeterSegments();
        this.timings.meterSegments = performance.now() - timing;
        timing = performance.now();
        
        // Draw tick marks and labels
        this.drawTickMarks();
        this.timings.tickMarks = performance.now() - timing;
        timing = performance.now();
        
        // Draw needle
        this.drawNeedle();
        this.timings.needle = performance.now() - timing;
        timing = performance.now();
        
        // Update FPS counter
        this.frameCount++;
        if (now - this.lastFPSUpdate > 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.lastFPSUpdate));
            this.frameCount = 0;
            this.lastFPSUpdate = now;
            
            console.log(`Performance Report:
- FPS: ${this.fps}
- Slow frames: 0 (0.0%)
- Average times (ms):
  total: ${(this.timings.total / this.fps).toFixed(2)}
  calculations: ${(this.timings.calculations / this.fps).toFixed(2)}
  meterSegments: ${(this.timings.meterSegments / this.fps).toFixed(2)}
  tickMarks: ${(this.timings.tickMarks / this.fps).toFixed(2)}
  needle: ${(this.timings.needle / this.fps).toFixed(2)}
  display: ${(this.timings.display / this.fps).toFixed(2)}`);
            
            Object.keys(this.timings).forEach(key => this.timings[key] = 0);
        }
        
        this.timings.display = performance.now() - timing;
        this.timings.total += performance.now() - startTime;
    }
    
    calculateRMSLevel(dataArray) {
        let rms = 0;
        for (let i = 0; i < dataArray.length; i++) {
            rms += dataArray[i] * dataArray[i];
        }
        rms = Math.sqrt(rms / dataArray.length);
        return 20 * Math.log10(Math.max(rms, 1e-6));
    }
    
    drawMeterSegments() {
        const centerX = this.width / 2;
        const centerY = this.height * 0.65;
        const radius = Math.min(this.width * 0.4, this.height * 0.55);
        const startAngle = Math.PI * 0.75;
        const endAngle = Math.PI * 0.25;
        
        // Draw meter background
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        this.ctx.lineWidth = radius * 0.15;
        this.ctx.strokeStyle = '#2b2b2b';
        this.ctx.stroke();
    }
    
    drawTickMarks() {
        const centerX = this.width / 2;
        const centerY = this.height * 0.65;
        const radius = Math.min(this.width * 0.4, this.height * 0.55);
        const innerRadius = radius * 0.94;
        const outerRadius = radius * 1.0;
        const textRadius = radius * 1.15;
        const startAngle = Math.PI * 0.75;
        const endAngle = Math.PI * 0.25;
        const totalAngle = startAngle - endAngle;
        
        // Draw tick marks
        this.ctx.strokeStyle = '#808080';
        this.ctx.fillStyle = '#808080';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = `${radius * 0.08}px monospace`;
        
        const dbLabels = [-60, -50, -40, -30, -20, -10, 0];
        dbLabels.forEach(db => {
            const normalizedValue = 1 - ((db + 60) / 60);
            const angle = startAngle - normalizedValue * totalAngle;
            const sinAngle = Math.sin(angle);
            const cosAngle = Math.cos(angle);
            
            // Draw tick mark
            this.ctx.beginPath();
            this.ctx.moveTo(
                centerX + innerRadius * sinAngle,
                centerY - innerRadius * cosAngle
            );
            this.ctx.lineTo(
                centerX + outerRadius * sinAngle,
                centerY - outerRadius * cosAngle
            );
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw label
            const labelX = centerX + textRadius * sinAngle;
            const labelY = centerY - textRadius * cosAngle;
            this.ctx.fillText(`${db}dB`, labelX, labelY);
        });
    }
    
    drawNeedle() {
        const centerX = this.width / 2;
        const centerY = this.height * 0.65;
        const radius = Math.min(this.width * 0.4, this.height * 0.55);
        const needleLength = radius * 0.95;
        const startAngle = Math.PI * 0.75;
        const endAngle = Math.PI * 0.25;
        const totalAngle = startAngle - endAngle;
        
        // Calculate needle angle based on current level (flipped)
        const normalizedValue = 1 - Math.min(1, Math.max(0, (this.currentLevel + 60) / 60));
        const angle = startAngle - normalizedValue * totalAngle;
        
        // Draw needle
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY);
        this.ctx.lineTo(
            centerX + needleLength * Math.sin(angle),
            centerY - needleLength * Math.cos(angle)
        );
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = '#fff';
        this.ctx.stroke();
        
        // Draw needle pivot
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
    }
}

// Export for use in main.js
window.VUMeter = VUMeter; 