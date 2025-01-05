class Spectrogram {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { 
            alpha: false,
            willReadFrequently: true
        });
        this.sensitivity = -30;
        this.minDb = -90;
        this.maxDb = 0;
        this.scrollSpeed = 3;
        this.width = 0;
        this.height = 0;
        this.imageData = null;
        this.lastDraw = 0;
        this.drawInterval = 1000 / 30;
        this.freqLabels = [20, 50, 100, 200, 500, '1k', '2k', '5k', '10k', '20k'];
        
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
        
        // Initialize image data
        this.imageData = this.ctx.createImageData(this.width - 50, this.height); // Leave space for labels
        
        // Fill with background color
        const data = this.imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 30;     // R
            data[i + 1] = 30; // G
            data[i + 2] = 30; // B
            data[i + 3] = 255;// A
        }
        this.ctx.putImageData(this.imageData, 50, 0); // Start after labels
    }

    draw(dataArray) {
        if (!this.ctx || !this.width || !this.height || !this.imageData) return;

        // Throttle drawing to maintain consistent frame rate
        const now = performance.now();
        if (now - this.lastDraw < this.drawInterval) return;
        this.lastDraw = now;

        const width = this.width - 50; // Adjust for label space
        const height = this.height;
        const data = this.imageData.data;
        
        // Shift existing data to the left
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width - this.scrollSpeed; x++) {
                const targetIndex = (y * width + x) * 4;
                const sourceIndex = (y * width + x + this.scrollSpeed) * 4;
                
                data[targetIndex] = data[sourceIndex];
                data[targetIndex + 1] = data[sourceIndex + 1];
                data[targetIndex + 2] = data[sourceIndex + 2];
                data[targetIndex + 3] = data[sourceIndex + 3];
            }
        }
        
        // Draw new data on the right edge
        const binCount = dataArray.length;
        const binHeight = height / binCount;
        
        for (let i = 0; i < binCount; i++) {
            // Normalize dB value between 0 and 1
            const dbValue = Math.max(this.minDb, Math.min(this.maxDb, dataArray[i]));
            const normalizedDb = (dbValue - this.minDb) / (this.maxDb - this.minDb);
            
            // Apply sensitivity with smoother scaling
            const value = Math.min(1, Math.max(0, normalizedDb * (1 + (this.sensitivity + 90) / 45)));
            
            // Convert HSL to RGB with improved color mapping
            const hue = 240 - value * 240; // Blue (240) to Red (0)
            const saturation = 0.8 + value * 0.2; // More saturated for higher values
            const lightness = Math.max(0.2, Math.min(0.7, 0.3 + value * 0.4)); // Brighter for higher values
            const rgb = this.hslToRgb(hue / 360, saturation, lightness);
            
            // Draw vertical line of pixels with anti-aliasing
            const yStart = Math.floor(height - (i + 1) * binHeight);
            const yEnd = Math.floor(height - i * binHeight);
            
            for (let y = yStart; y < yEnd; y++) {
                for (let x = width - this.scrollSpeed; x < width; x++) {
                    const index = (y * width + x) * 4;
                    data[index] = rgb[0];     // R
                    data[index + 1] = rgb[1]; // G
                    data[index + 2] = rgb[2]; // B
                    data[index + 3] = 255;    // A
                }
            }
        }
        
        // Clear the entire canvas
        this.ctx.fillStyle = '#2b2b2b';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw frequency labels
        this.ctx.fillStyle = '#808080';
        this.ctx.font = '12px monospace';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        
        const labelSpacing = height / (this.freqLabels.length - 1);
        this.freqLabels.forEach((freq, index) => {
            const y = height - index * labelSpacing;
            this.ctx.fillText(freq, 45, y);
        });
        
        // Draw grid lines
        this.ctx.strokeStyle = '#3c3f41';
        this.ctx.lineWidth = 1;
        this.freqLabels.forEach((_, index) => {
            const y = height - index * labelSpacing;
            this.ctx.beginPath();
            this.ctx.moveTo(50, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        });
        
        // Update canvas with new image data
        this.ctx.putImageData(this.imageData, 50, 0);
    }

    // Helper function to convert HSL to RGB
    hslToRgb(h, s, l) {
        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    setSensitivity(value) {
        this.sensitivity = value;
    }

    setScrollSpeed(value) {
        this.scrollSpeed = Math.max(1, Math.min(10, value));
    }
}

// Export for use in main.js
window.Spectrogram = Spectrogram; 