class Waveform {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        // Initialize drag state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartScrollLeft = 0;
        
        // Create wrapper for canvases
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'waveform-wrapper';
        this.container.appendChild(this.wrapper);

        // Create overview section
        this.overviewSection = document.createElement('div');
        this.overviewSection.className = 'overview-section';
        this.wrapper.appendChild(this.overviewSection);

        this.overviewCanvas = document.createElement('canvas');
        this.overviewCanvas.className = 'main-canvas';
        this.overviewSection.appendChild(this.overviewCanvas);
        this.overviewCtx = this.overviewCanvas.getContext('2d');

        // Create overview playhead and section indicator
        this.overviewPlayhead = document.createElement('div');
        this.overviewPlayhead.className = 'overview-playhead';
        this.overviewSection.appendChild(this.overviewPlayhead);

        this.sectionIndicator = document.createElement('div');
        this.sectionIndicator.className = 'overview-section-indicator';
        this.overviewSection.appendChild(this.sectionIndicator);

        // Create seek indicator specifically for overview section
        this.seekIndicator = document.createElement('div');
        this.seekIndicator.className = 'seek-indicator';
        this.overviewSection.appendChild(this.seekIndicator);

        // Create detail section
        this.detailSection = document.createElement('div');
        this.detailSection.className = 'detail-section';
        this.wrapper.appendChild(this.detailSection);

        // Add center playhead line
        this.centerPlayhead = document.createElement('div');
        this.centerPlayhead.className = 'center-playhead';
        this.detailSection.appendChild(this.centerPlayhead);

        // Create detail scroll container
        this.detailScrollContainer = document.createElement('div');
        this.detailScrollContainer.className = 'detail-scroll-container';
        this.detailSection.appendChild(this.detailScrollContainer);

        this.detailCanvas = document.createElement('canvas');
        this.detailCanvas.className = 'detail-canvas';
        this.detailScrollContainer.appendChild(this.detailCanvas);
        this.detailCtx = this.detailCanvas.getContext('2d');

        // Add hover handlers for overview section only
        this.overviewSection.addEventListener('mousemove', this.handleOverviewHover.bind(this));
        this.overviewSection.addEventListener('mouseleave', () => {
            this.seekIndicator.style.display = 'none';
        });

        // Add click handler for overview section
        this.overviewSection.addEventListener('click', this.handleOverviewClick.bind(this));

        // Add drag handlers for detail section only
        this.detailSection.addEventListener('mousedown', this.handleDragStart.bind(this));
        window.addEventListener('mousemove', this.handleDragMove.bind(this));
        window.addEventListener('mouseup', this.handleDragEnd.bind(this));
        
        // Touch events for mobile
        this.detailSection.addEventListener('touchstart', this.handleDragStart.bind(this));
        window.addEventListener('touchmove', this.handleDragMove.bind(this));
        window.addEventListener('touchend', this.handleDragEnd.bind(this));

        // Handle window resize
        window.addEventListener('resize', () => {
            this.setupCanvas();
            if (this.audioBuffer) {
                this.drawWaveform(this.audioBuffer);
            }
        });

        // Initial setup
        setTimeout(() => {
            this.setupCanvas();
        }, 0);

        // Add click handler for detail section to prevent seeking
        this.detailSection.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    handleOverviewClick(e) {
        if (!this.audioBuffer) return;
        
        const rect = this.overviewCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const position = x / rect.width;
        
        // Dispatch seek event with isPlayback = false for immediate update
        const seekEvent = new CustomEvent('seek', { 
            detail: { 
                position: Math.max(0, Math.min(1, position)),
                isPlayback: false
            }
        });
        this.container.dispatchEvent(seekEvent);
    }

    handleOverviewHover(e) {
        if (!this.audioBuffer) return;
        
        const rect = this.overviewCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        this.seekIndicator.style.left = `${x}px`;
        this.seekIndicator.style.display = 'block';
    }

    handleDragStart(e) {
        if (!this.audioBuffer) return;
        
        // Prevent click events from propagating to overview section
        e.preventDefault();
        e.stopPropagation();
        
        const touch = e.touches ? e.touches[0] : e;
        this.isDragging = true;
        this.lastX = touch.clientX;
        this.detailSection.classList.add('dragging');
    }

    handleDragMove(e) {
        if (!this.isDragging) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const touch = e.touches ? e.touches[0] : e;
        const deltaX = this.lastX - touch.clientX;
        this.lastX = touch.clientX;
        
        // Get current position and calculate new position
        const currentX = this.getCurrentScrollPosition();
        const newX = currentX + deltaX;
        
        // Calculate bounds
        const detailWidth = this.detailCanvas.width / (window.devicePixelRatio || 1);
        const maxScroll = detailWidth - this.width;
        const boundedX = Math.max(0, Math.min(newX, maxScroll));
        
        // Update transform
        this.detailScrollContainer.style.transform = `translate3d(${-boundedX}px, 0, 0)`;
        
        // Calculate and update overview position
        const position = boundedX / maxScroll;
        this.overviewPlayhead.style.left = `${position * 100}%`;
        
        // Update section indicator
        const sectionWidth = (this.width / detailWidth) * 100;
        const sectionPosition = (position * 100) - (sectionWidth / 2);
        this.sectionIndicator.style.width = `${sectionWidth}%`;
        this.sectionIndicator.style.left = `${sectionPosition}%`;
        
        // Dispatch seek event
        const seekEvent = new CustomEvent('seek', { 
            detail: { position }
        });
        this.container.dispatchEvent(seekEvent);
    }

    handleDragEnd(e) {
        if (!this.isDragging) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        this.isDragging = false;
        this.detailSection.classList.remove('dragging');
    }

    getCurrentScrollPosition() {
        const transform = this.detailScrollContainer.style.transform;
        const match = transform.match(/translate3d\(([-\d.]+)px/);
        return match ? -parseFloat(match[1]) : 0;
    }

    getCurrentPosition() {
        const transform = this.detailScrollContainer.style.transform;
        const match = transform.match(/translate3d\(([-\d.]+)px/);
        if (!match) return 0;
        
        const scrollPosition = -parseFloat(match[1]);
        const detailWidth = this.detailCanvas.width / (window.devicePixelRatio || 1);
        const visibleWidth = this.width;
        const startOffset = visibleWidth / 2;
        
        return (scrollPosition + startOffset) / detailWidth;
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.container.getBoundingClientRect();
        
        // Store dimensions for calculations first
        this.width = rect.width;
        this.height = rect.height;
        
        // Set overview canvas size
        this.overviewCanvas.width = this.width * dpr;
        this.overviewCanvas.height = (this.height * 0.25) * dpr;
        this.overviewCanvas.style.width = `${this.width}px`;
        this.overviewCanvas.style.height = `${this.height * 0.25}px`;
        this.overviewCtx.scale(dpr, dpr);
        
        // Set initial detail canvas size (will be adjusted based on audio duration)
        const initialDetailWidth = this.width * 6;
        this.detailCanvas.width = initialDetailWidth * dpr;
        this.detailCanvas.height = (this.height * 0.75) * dpr;
        this.detailCanvas.style.width = `${initialDetailWidth}px`;
        this.detailCanvas.style.height = `${this.height * 0.75}px`;
        this.detailCtx.scale(dpr, dpr);
    }

    drawWaveform(audioBuffer) {
        if (!audioBuffer) return;  // Guard against null audioBuffer
        
        this.audioBuffer = audioBuffer;
        
        // Pre-calculate waveform data for both views
        this.preCalculateWaveformData();
        
        // Draw both waveforms
        this.drawOverviewWaveform();
        this.drawDetailWaveform();
        
        // Initialize position to align with center playhead
        this.updateDetailPosition(0);
        
        // Make sure the waveforms are visible
        this.overviewCanvas.style.display = 'block';
        this.detailCanvas.style.display = 'block';
    }

    preCalculateWaveformData() {
        const data = this.audioBuffer.getChannelData(0);
        const overviewWidth = this.overviewCanvas.width / (window.devicePixelRatio || 1);
        const detailWidth = this.detailCanvas.width / (window.devicePixelRatio || 1);
        const duration = this.audioBuffer.duration;
        const sampleRate = this.audioBuffer.sampleRate;
        const totalSamples = data.length;

        // Calculate samples per pixel to ensure we cover the entire duration
        const overviewSamplesPerPixel = Math.floor(totalSamples / overviewWidth);
        const detailSamplesPerPixel = Math.floor(totalSamples / detailWidth);

        // Calculate overview data
        this.overviewData = new Array(Math.ceil(overviewWidth));
        
        for (let i = 0; i < overviewWidth; i++) {
            let min = 1.0;
            let max = -1.0;
            const startSample = Math.floor(i * overviewSamplesPerPixel);
            const endSample = Math.min(startSample + overviewSamplesPerPixel, totalSamples);
            
            if (startSample < totalSamples) {
                for (let j = startSample; j < endSample; j++) {
                    const datum = data[j];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
            }
            
            this.overviewData[i] = { min, max };
        }

        // Calculate detail data
        // Ensure we have enough pixels to represent the entire duration
        const requiredDetailWidth = Math.ceil(detailWidth * (duration / 60)); // Scale based on duration
        this.detailData = new Array(requiredDetailWidth);
        const adjustedDetailSamplesPerPixel = Math.floor(totalSamples / requiredDetailWidth);
        
        for (let i = 0; i < requiredDetailWidth; i++) {
            let min = 1.0;
            let max = -1.0;
            const startSample = Math.floor(i * adjustedDetailSamplesPerPixel);
            const endSample = Math.min(startSample + adjustedDetailSamplesPerPixel, totalSamples);
            
            if (startSample < totalSamples) {
                for (let j = startSample; j < endSample; j++) {
                    const datum = data[j];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
            }
            
            this.detailData[i] = { min, max };
        }

        // Update detail canvas width to match the required width
        const dpr = window.devicePixelRatio || 1;
        this.detailCanvas.width = requiredDetailWidth * dpr;
        this.detailCanvas.style.width = `${requiredDetailWidth}px`;
        this.detailCtx.scale(dpr, dpr);
    }

    drawOverviewWaveform() {
        if (!this.overviewData) return;

        const ctx = this.overviewCtx;
        const width = this.overviewCanvas.width / (window.devicePixelRatio || 1);
        const height = this.overviewCanvas.height / (window.devicePixelRatio || 1);
        const amp = height / 2;

        ctx.clearRect(0, 0, width, height);
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
        ctx.strokeStyle = '#484CBD';
        ctx.lineWidth = 1;

        for (let i = 0; i < this.overviewData.length; i++) {
            const { min, max } = this.overviewData[i];
            const y1 = amp + (min * amp * 0.95);
            const y2 = amp + (max * amp * 0.95);
            ctx.fillStyle = 'rgba(72, 76, 189, 0.6)';
            ctx.fillRect(i, y1, 1, y2 - y1);
        }

        ctx.stroke();
    }

    drawDetailWaveform() {
        if (!this.detailData) return;

        const ctx = this.detailCtx;
        const width = this.detailCanvas.width / (window.devicePixelRatio || 1);
        const height = this.detailCanvas.height / (window.devicePixelRatio || 1);
        const amp = height / 2;

        ctx.clearRect(0, 0, width, height);
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
        ctx.strokeStyle = '#484CBD';
        ctx.lineWidth = 1;

        for (let i = 0; i < this.detailData.length; i++) {
            const { min, max } = this.detailData[i];
            const y1 = amp + (min * amp * 0.95);
            const y2 = amp + (max * amp * 0.95);
            ctx.fillStyle = 'rgba(72, 76, 189, 1.0)';
            ctx.fillRect(i, y1, 1, y2 - y1);
        }

        ctx.stroke();
    }

    updateDetailPosition(position, isPlayback = false) {
        if (!this.audioBuffer) return;
        
        if (isPlayback) {
            // Use requestAnimationFrame only for playback updates
            requestAnimationFrame(() => {
                this.updatePositions(position);
            });
        } else {
            // Direct update for click-based changes
            this.updatePositions(position);
        }
    }

    updatePositions(position) {
        // Update overview playhead position
        this.overviewPlayhead.style.left = `${position * 100}%`;
        
        // Calculate detail scroll position
        const detailWidth = this.detailCanvas.width / (window.devicePixelRatio || 1);
        const visibleWidth = this.width;
        const startOffset = visibleWidth / 2;
        const scrollPosition = (position * detailWidth) - startOffset;
        
        // Update section indicator in overview
        const sectionWidth = (visibleWidth / detailWidth) * 100;
        const sectionPosition = (position * 100) - (sectionWidth / 2);
        this.sectionIndicator.style.width = `${sectionWidth}%`;
        this.sectionIndicator.style.left = `${sectionPosition}%`;
        
        // Apply transform with hardware acceleration
        this.detailScrollContainer.style.transform = `translate3d(${-scrollPosition}px, 0, 0)`;
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
        ctx.fillStyle = '#484CBD';
        ctx.fillRect(startX - 1, 0, 2, height);

        // Draw loop end marker if set
        if (this.loopEnd !== null) {
            ctx.fillRect(endX - 1, 0, 2, height);

            // Draw loop region overlay
            ctx.fillStyle = 'rgba(72, 76, 189, 0.15)';
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
        this.overviewCtx.clearRect(0, 0, this.overviewCanvas.width, this.overviewCanvas.height);
        this.detailCtx.clearRect(0, 0, this.detailCanvas.width, this.detailCanvas.height);
        this.audioBuffer = null;
        this.loopStart = null;
        this.loopEnd = null;
        this.detailScrollContainer.style.transform = 'translate3d(0, 0, 0)';
        this.overviewPlayhead.style.left = '0';
        this.sectionIndicator.style.left = '0';
    }
} 