class Waveform {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvas = document.createElement('canvas');
        this.setupCanvas();
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        // Store loop region
        this.loopStart = null;
        this.loopEnd = null;
        this.audioBuffer = null;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.setupCanvas();
            if (this.audioBuffer) {
                this.drawWaveform(this.audioBuffer);
            }
        });
    }

    setupCanvas() {
        // Get display pixel ratio for retina support
        const dpr = window.devicePixelRatio || 1;
        const rect = this.container.getBoundingClientRect();
        
        // Set canvas size accounting for retina display
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        // Set display size
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        
        // Scale context for retina display
        this.canvas.getContext('2d').scale(dpr, dpr);
        
        // Store dimensions for calculations
        this.width = rect.width;
        this.height = rect.height;
    }

    drawWaveform(audioBuffer) {
        this.audioBuffer = audioBuffer;
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        ctx.clearRect(0, 0, width, height);

        // Draw background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, width, height);

        // Draw center line
        ctx.beginPath();
        ctx.strokeStyle = '#222';
        ctx.moveTo(0, amp);
        ctx.lineTo(width, amp);
        ctx.stroke();

        // Draw waveform
        ctx.beginPath();
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 1;

        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;

            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }

            const y1 = amp + (min * amp * 0.95);
            const y2 = amp + (max * amp * 0.95);

            ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
            ctx.fillRect(i, y1, 1, y2 - y1);
        }

        ctx.stroke();

        // Draw loop region if set
        this.drawLoopRegion();
    }

    drawLoopRegion() {
        if (this.loopStart === null) return;

        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;

        // Convert time positions to pixels
        const startX = (this.loopStart / this.audioBuffer.duration) * width;
        const endX = this.loopEnd !== null ? 
            (this.loopEnd / this.audioBuffer.duration) * width : 
            startX;

        // Draw loop start marker
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(startX - 1, 0, 2, height);

        // Draw loop end marker if set
        if (this.loopEnd !== null) {
            ctx.fillRect(endX - 1, 0, 2, height);

            // Draw loop region overlay
            ctx.fillStyle = 'rgba(76, 175, 80, 0.15)';
            ctx.fillRect(startX, 0, endX - startX, height);
        }
    }

    setLoopStart(time) {
        this.loopStart = time;
        this.loopEnd = null;
        if (this.audioBuffer) {
            this.drawWaveform(this.audioBuffer);
        }
    }

    setLoopEnd(time) {
        if (this.loopStart === null) return;
        this.loopEnd = time;
        if (this.audioBuffer) {
            this.drawWaveform(this.audioBuffer);
        }
    }

    clearLoop() {
        this.loopStart = null;
        this.loopEnd = null;
        if (this.audioBuffer) {
            this.drawWaveform(this.audioBuffer);
        }
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.audioBuffer = null;
        this.loopStart = null;
        this.loopEnd = null;
    }
} 