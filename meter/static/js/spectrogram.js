class Spectrogram {
    constructor(containerId) {
        this.canvas = document.getElementById(containerId);
        this.ctx = this.canvas.getContext('2d', { 
            alpha: false,
            willReadFrequently: true
        });
        
        // Initialize properties
        this.sensitivity = -20;
        this.minDb = -90;
        this.maxDb = 0;
        this.scrollSpeed = 2;
        this.width = 0;
        this.height = 0;
        this.imageData = null;
        this.lastDraw = 0;
        this.drawInterval = 1000 / 30;  // 30 FPS
        this.freqLabels = [20, 50, 100, 200, 500, '1k', '2k', '5k', '10k', '20k'];
        
        // Define margins
        this.margin = {
            left: 70,    // Space for frequency labels
            right: 20,   // Right margin
            top: 20,     // Top margin
            bottom: 30   // Space for time labels
        };
        
        // Set canvas size to match container
        this.resizeCanvas();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        // Get container dimensions
        const rect = this.canvas.getBoundingClientRect();
        
        // Set canvas dimensions with device pixel ratio
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        // Store logical dimensions
        this.width = rect.width;
        this.height = rect.height;
        
        // Initialize image data for the spectrogram area
        const spectrogramWidth = this.width - this.margin.left - this.margin.right;
        const spectrogramHeight = this.height - this.margin.top - this.margin.bottom;
        this.imageData = this.ctx.createImageData(spectrogramWidth, spectrogramHeight);
        
        // Fill with background color
        const data = this.imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 30;     // R
            data[i + 1] = 30; // G
            data[i + 2] = 30; // B
            data[i + 3] = 255;// A
        }
    }

    // Convert frequency to y-position using logarithmic scale
    freqToY(freq, height) {
        const minFreq = 20;
        const maxFreq = 20000;
        const logY = Math.log2(freq / minFreq) / Math.log2(maxFreq / minFreq);
        return height * (1 - logY);
    }

    // Convert bin index to frequency
    binToFreq(bin, binCount) {
        const minFreq = 20;
        const maxFreq = 20000;
        return minFreq * Math.pow(maxFreq / minFreq, bin / binCount);
    }

    draw(dataArray) {
        if (!this.ctx || !this.width || !this.height || !this.imageData) {
            console.log('Missing required properties:', {
                ctx: !this.ctx,
                width: !this.width,
                height: !this.height,
                imageData: !this.imageData
            });
            return;
        }

        const now = performance.now();
        if (now - this.lastDraw < this.drawInterval) return;
        this.lastDraw = now;

        // Clear the canvas first
        this.ctx.fillStyle = '#1e1e1e';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Check if we have valid frequency data
        if (!dataArray || dataArray[0] <= -180) {
            console.log('No valid frequency data');
            this.drawGrid();
            return;
        }

        const spectrogramWidth = this.width - this.margin.left - this.margin.right;
        const spectrogramHeight = this.height - this.margin.top - this.margin.bottom;
        const data = this.imageData.data;
        
        // Shift existing data to the left
        for (let y = 0; y < spectrogramHeight; y++) {
            for (let x = 0; x < spectrogramWidth - this.scrollSpeed; x++) {
                const targetIndex = (y * spectrogramWidth + x) * 4;
                const sourceIndex = (y * spectrogramWidth + x + this.scrollSpeed) * 4;
                
                data[targetIndex] = data[sourceIndex];
                data[targetIndex + 1] = data[sourceIndex + 1];
                data[targetIndex + 2] = data[sourceIndex + 2];
                data[targetIndex + 3] = data[sourceIndex + 3];
            }
        }
        
        // Draw new data on the right edge
        const binCount = dataArray.length;
        console.log('Drawing with binCount:', binCount, 'First value:', dataArray[0]);
        
        for (let i = 0; i < binCount; i++) {
            const freq = this.binToFreq(i, binCount);
            const y1 = Math.floor(this.freqToY(freq, spectrogramHeight));
            const y2 = Math.floor(this.freqToY(this.binToFreq(i + 1, binCount), spectrogramHeight));
            
            const dbValue = Math.max(this.minDb, Math.min(this.maxDb, dataArray[i]));
            const normalizedDb = (dbValue - this.minDb) / (this.maxDb - this.minDb);
            const value = Math.min(1, Math.max(0, normalizedDb * (1 + (this.sensitivity + 90) / 45)));
            
            // Color mapping
            const hue = 240 - value * 180; // Blue to Red
            const saturation = 0.8 + value * 0.2;
            const lightness = 0.3 + value * 0.4;
            const rgb = this.hslToRgb(hue / 360, saturation, lightness);
            
            // Draw vertical slice
            for (let y = y2; y < y1; y++) {
                for (let x = spectrogramWidth - this.scrollSpeed; x < spectrogramWidth; x++) {
                    const index = (y * spectrogramWidth + x) * 4;
                    if (index >= 0 && index < data.length - 3) {
                        data[index] = rgb[0];     // R
                        data[index + 1] = rgb[1]; // G
                        data[index + 2] = rgb[2]; // B
                        data[index + 3] = 255;    // A
                    }
                }
            }
        }
        
        // Draw the spectrogram
        this.ctx.putImageData(this.imageData, this.margin.left, this.margin.top);
        
        // Draw grid and labels
        this.drawGrid();
    }

    drawGrid() {
        // Draw frequency labels
        this.ctx.fillStyle = '#808080';
        this.ctx.font = '12px monospace';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        
        const spectrogramHeight = this.height - this.margin.top - this.margin.bottom;
        
        this.freqLabels.forEach(label => {
            const freq = typeof label === 'string' ? 
                parseInt(label.replace('k', '000')) : label;
            const y = this.margin.top + this.freqToY(freq, spectrogramHeight);
            this.ctx.fillText(label, this.margin.left - 5, y);
        });
        
        // Draw time labels
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        const timeLabels = ['0s', '1s', '2s', '3s', '4s'];
        const spectrogramWidth = this.width - this.margin.left - this.margin.right;
        const timeStep = spectrogramWidth / (timeLabels.length - 1);
        
        timeLabels.forEach((label, i) => {
            const x = this.margin.left + (i * timeStep);
            this.ctx.fillText(label, x, this.height - this.margin.bottom + 5);
        });
    }

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
        this.scrollSpeed = value;
    }
}

// Export for use in main.js
window.Spectrogram = Spectrogram; 