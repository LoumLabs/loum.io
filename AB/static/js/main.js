document.addEventListener('DOMContentLoaded', () => {
    // Audio Context and Nodes
    let audioContext;
    let trackA = null;
    let trackB = null;
    let sourceA = null;
    let sourceB = null;
    let masterGain = null;
    let startTime = 0;
    let pauseTime = 0;
    let isPlaying = false;
    let currentTrack = 'A';
    let blindTestMode = false;
    const FADE_TIME = 0.05; // Reduced from 0.5s to 0.05s for faster switching

    // Waveform Variables
    const CANVAS_HEIGHT = 100;
    const WAVE_COLOR_A = '#4a9eff';
    const WAVE_COLOR_B = '#66b3ff';
    const WAVE_BG = '#1e1e1e';
    let canvasA, canvasB, ctxA, ctxB;

    // DOM Elements
    const uploadZoneA = document.getElementById('upload-zone-a');
    const uploadZoneB = document.getElementById('upload-zone-b');
    const fileInputs = document.querySelectorAll('.file-input');
    const uploadButtons = document.querySelectorAll('.upload-button');
    const playPauseButton = document.getElementById('play-pause');
    const stopButton = document.getElementById('stop');
    const abToggle = document.getElementById('ab-toggle');
    const blindTestToggle = document.getElementById('blind-test-toggle');
    const volumeControl = document.getElementById('volume');
    const matchLoudnessButton = document.getElementById('match-loudness');
    const progressBar = document.querySelector('.progress-bar');
    const progressFill = document.querySelector('.progress-fill');
    const currentTimeDisplay = document.getElementById('current-time');
    const totalTimeDisplay = document.getElementById('total-time');

    // Initialize canvases
    function initWaveforms() {
        const waveformA = document.getElementById('waveform-a');
        const waveformB = document.getElementById('waveform-b');

        // Create and setup canvas A
        canvasA = document.createElement('canvas');
        canvasA.height = CANVAS_HEIGHT;
        waveformA.appendChild(canvasA);
        ctxA = canvasA.getContext('2d');

        // Create and setup canvas B
        canvasB = document.createElement('canvas');
        canvasB.height = CANVAS_HEIGHT;
        waveformB.appendChild(canvasB);
        ctxB = canvasB.getContext('2d');

        // Set initial canvas sizes
        resizeCanvases();

        // Add resize listener
        window.addEventListener('resize', resizeCanvases);

        // Add click/touch handlers for seeking
        [canvasA, canvasB].forEach(canvas => {
            canvas.addEventListener('click', handleWaveformClick);
            canvas.addEventListener('touchstart', handleWaveformTouch);
        });

        // Update styles after canvas creation
        updateWaveformStyles();
    }

    function resizeCanvases() {
        if (canvasA && canvasB) {
            const width = document.querySelector('.waveform').offsetWidth;
            canvasA.width = width;
            canvasB.width = width;
            
            // Only redraw if we have buffers
            if (trackA?.buffer || trackB?.buffer) {
                // Draw waveforms with time alignment
                if (trackA?.buffer) drawWaveform(trackA.buffer, ctxA, WAVE_COLOR_A);
                if (trackB?.buffer) drawWaveform(trackB.buffer, ctxB, WAVE_COLOR_B);
            }
        }
    }

    function drawWaveform(audioBuffer, ctx, color) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        
        // Find the longest duration between tracks
        const maxDuration = Math.max(
            trackA?.buffer?.duration || 0,
            trackB?.buffer?.duration || 0
        );
        
        // Calculate pixels per second based on longest duration
        const pixelsPerSecond = width / maxDuration;
        
        // Calculate the width needed for this buffer
        const bufferWidth = Math.floor(audioBuffer.duration * pixelsPerSecond);
        
        const data = audioBuffer.getChannelData(0); // Use first channel
        const step = Math.ceil(data.length / bufferWidth);
        const amp = height / 2;

        ctx.fillStyle = WAVE_BG;
        ctx.fillRect(0, 0, width, height);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;

        for (let i = 0; i < bufferWidth; i++) {
            let min = 1.0;
            let max = -1.0;
            
            // Find min/max values in the current step
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }

            // Draw vertical line from min to max
            ctx.moveTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }

        ctx.stroke();

        // Draw center line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
    }

    // Add playhead to waveform
    function drawPlayhead() {
        if (!trackA || !trackB) return;

        const currentTime = isPlaying ? audioContext.currentTime - startTime : pauseTime;
        const duration = trackA.buffer.duration;
        const position = (currentTime / duration) * canvasA.width;

        // Redraw waveforms
        if (trackA?.buffer) drawWaveform(trackA.buffer, ctxA, WAVE_COLOR_A);
        if (trackB?.buffer) drawWaveform(trackB.buffer, ctxB, WAVE_COLOR_B);

        // Draw playhead lines
        drawPlayheadLine(ctxA, position);
        drawPlayheadLine(ctxB, position);

        if (isPlaying) {
            requestAnimationFrame(drawPlayhead);
        }
    }

    function clearPlayhead(ctx) {
        ctx.fillStyle = WAVE_BG;
        ctx.fillRect(0, 0, 2, ctx.canvas.height); // Clear left edge
        ctx.fillRect(ctx.canvas.width - 2, 0, 2, ctx.canvas.height); // Clear right edge
    }

    function drawPlayheadLine(ctx, position) {
        ctx.beginPath();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.moveTo(position, 0);
        ctx.lineTo(position, ctx.canvas.height);
        ctx.stroke();
    }

    // Initialize Audio Context on user interaction
    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioContext.createGain();
            masterGain.connect(audioContext.destination);
            initWaveforms();
        }
    }

    function cleanupAudioNodes() {
        if (sourceA) {
            sourceA.disconnect();
            sourceA = null;
        }
        if (sourceB) {
            sourceB.disconnect();
            sourceB = null;
        }
    }

    // File Upload Processing with improved cleanup
    async function handleFileUpload(file, isTrackA) {
        initAudioContext();
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Clean up existing track if it exists
            if (isTrackA && trackA?.gainNode) {
                trackA.gainNode.disconnect();
            } else if (!isTrackA && trackB?.gainNode) {
                trackB.gainNode.disconnect();
            }

            // Create new track object
            const newTrack = {
                buffer: audioBuffer,
                name: file.name,
                gainNode: audioContext.createGain(),      // For level adjustments
                switchNode: audioContext.createGain(),     // For A/B switching
                delayNode: audioContext.createDelay(2),    // Max 2 seconds delay
                delayTime: 0                              // Store delay time in ms
            };
            // Connect nodes in series: source -> delayNode -> gainNode -> switchNode -> masterGain
            newTrack.delayNode.connect(newTrack.gainNode);
            newTrack.gainNode.connect(newTrack.switchNode);
            newTrack.switchNode.connect(masterGain);

            // Assign to appropriate track
            if (isTrackA) {
                trackA = newTrack;
                updateTrackDisplay('A', file.name);
                drawWaveform(audioBuffer, ctxA, WAVE_COLOR_A);
                document.getElementById('upload-zone-a').classList.add('has-file');
            } else {
                trackB = newTrack;
                updateTrackDisplay('B', file.name);
                drawWaveform(audioBuffer, ctxB, WAVE_COLOR_B);
                document.getElementById('upload-zone-b').classList.add('has-file');
            }

            updateControlsState();
            analyzeLoudness(isTrackA ? trackA : trackB, isTrackA);
            updateTotalTime();
        } catch (error) {
            console.error('Error loading audio file:', error);
            alert('Error loading audio file. Please try another file.');
        }
    }

    // Modify startPlayback to include proper cleanup
    function startPlayback() {
        if (!trackA || !trackB) return;
        
        cleanupAudioNodes();
        
        const offset = pauseTime;
        startTime = audioContext.currentTime - offset;

        sourceA = audioContext.createBufferSource();
        sourceB = audioContext.createBufferSource();
        
        sourceA.buffer = trackA.buffer;
        sourceB.buffer = trackB.buffer;

        // Connect nodes in series
        sourceA.connect(trackA.delayNode);
        sourceB.connect(trackB.delayNode);

        // Set initial gain values based on stored gain adjustments
        const trackAGain = Math.pow(10, (trackA.gainAdjustment || 0) / 20);
        const trackBGain = Math.pow(10, (trackB.gainAdjustment || 0) / 20);

        // Set level adjustments
        trackA.gainNode.gain.setValueAtTime(trackAGain, audioContext.currentTime);
        trackB.gainNode.gain.setValueAtTime(trackBGain, audioContext.currentTime);

        // Set switch states
        trackA.switchNode.gain.setValueAtTime(
            currentTrack === 'A' ? 1 : 0, 
            audioContext.currentTime
        );
        trackB.switchNode.gain.setValueAtTime(
            currentTrack === 'B' ? 1 : 0, 
            audioContext.currentTime
        );

        sourceA.start(0, offset);
        sourceB.start(0, offset);

        isPlaying = true;
        playPauseButton.textContent = 'Pause';

        requestAnimationFrame(updateProgress);
        requestAnimationFrame(drawPlayhead);
    }

    function pausePlayback() {
        if (!isPlaying) return;

        pauseTime = audioContext.currentTime - startTime;
        cleanupAudioNodes();
        isPlaying = false;
        playPauseButton.textContent = 'Play';
    }

    function stopPlayback() {
        pausePlayback();
        pauseTime = 0;
        updateProgress();
    }

    function switchTrack() {
        if (!trackA || !trackB) return;

        const nextTrack = currentTrack === 'A' ? 'B' : 'A';
        const trackDisplay = document.getElementById('current-track-display');
        
        if (isPlaying) {
            const currentTime = audioContext.currentTime;
            
            // Get the stored gain adjustments
            const trackAGain = Math.pow(10, (trackA.gainAdjustment || 0) / 20);
            const trackBGain = Math.pow(10, (trackB.gainAdjustment || 0) / 20);
            
            // Cancel any scheduled values for switch nodes
            trackA.switchNode.gain.cancelScheduledValues(currentTime);
            trackB.switchNode.gain.cancelScheduledValues(currentTime);
            
            // Update track state and visual feedback
            currentTrack = nextTrack;
            updateActiveTrack();
            
            // Update display - flash only in blind test mode
            if (blindTestMode) {
                trackDisplay.classList.remove('flash');
                void trackDisplay.offsetWidth; // Force reflow
                trackDisplay.classList.add('flash');
            }
            trackDisplay.textContent = blindTestMode ? '-' : nextTrack;
            
            // Quick crossfade between tracks using switch nodes, maintaining gain adjustments
            if (nextTrack === 'B') {
                trackA.switchNode.gain.setValueAtTime(trackA.switchNode.gain.value, currentTime);
                trackB.switchNode.gain.setValueAtTime(trackB.switchNode.gain.value, currentTime);
                trackA.switchNode.gain.linearRampToValueAtTime(0, currentTime + FADE_TIME);
                trackB.switchNode.gain.linearRampToValueAtTime(1, currentTime + FADE_TIME);
            } else {
                trackA.switchNode.gain.setValueAtTime(trackA.switchNode.gain.value, currentTime);
                trackB.switchNode.gain.setValueAtTime(trackB.switchNode.gain.value, currentTime);
                trackB.switchNode.gain.linearRampToValueAtTime(0, currentTime + FADE_TIME);
                trackA.switchNode.gain.linearRampToValueAtTime(1, currentTime + FADE_TIME);
            }

            // Ensure gain nodes maintain their adjusted values
            trackA.gainNode.gain.setValueAtTime(trackAGain, currentTime);
            trackB.gainNode.gain.setValueAtTime(trackBGain, currentTime);
        } else {
            // If not playing, instant switch using switch nodes
            const trackAGain = Math.pow(10, (trackA.gainAdjustment || 0) / 20);
            const trackBGain = Math.pow(10, (trackB.gainAdjustment || 0) / 20);
            
            trackA.gainNode.gain.setValueAtTime(trackAGain, audioContext.currentTime);
            trackB.gainNode.gain.setValueAtTime(trackBGain, audioContext.currentTime);
            trackA.switchNode.gain.setValueAtTime(nextTrack === 'A' ? 1 : 0, audioContext.currentTime);
            trackB.switchNode.gain.setValueAtTime(nextTrack === 'B' ? 1 : 0, audioContext.currentTime);
            
            currentTrack = nextTrack;
            updateActiveTrack();
            
            // Update display - flash only in blind test mode
            if (blindTestMode) {
                trackDisplay.classList.remove('flash');
                void trackDisplay.offsetWidth; // Force reflow
                trackDisplay.classList.add('flash');
            }
            trackDisplay.textContent = blindTestMode ? '-' : nextTrack;
        }
    }

    // Progress and Time Display
    function updateProgress() {
        if (!trackA || !trackB) return;

        const currentTime = isPlaying ? audioContext.currentTime - startTime : pauseTime;
        const duration = trackA.buffer.duration;
        
        // Update progress bar
        const progress = (currentTime / duration) * 100;
        progressFill.style.width = `${Math.min(100, progress)}%`;

        // Update time display
        currentTimeDisplay.textContent = formatTime(currentTime);
        
        if (isPlaying) {
            requestAnimationFrame(updateProgress);
        }
    }

    function updateTotalTime() {
        if (!trackA || !trackB) return;
        totalTimeDisplay.textContent = formatTime(trackA.buffer.duration);
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        seconds = Math.floor(seconds % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    function seek(position) {
        if (!trackA?.buffer || !trackB?.buffer) return;
        
        // Ensure position is between 0 and 1
        position = Math.max(0, Math.min(1, position));
        
        const wasPlaying = isPlaying;
        if (isPlaying) {
            pausePlayback();
        }

        pauseTime = position * trackA.buffer.duration;
        
        if (wasPlaying) {
            startPlayback();
        } else {
            updateProgress();
            drawPlayhead();
        }
    }

    // Volume Control
    function updateVolume(value) {
        if (!masterGain) return;
        masterGain.gain.setValueAtTime(value, audioContext.currentTime);
    }

    // Event Listeners
    uploadZoneA.addEventListener('dragover', handleDragOver);
    uploadZoneA.addEventListener('dragleave', handleDragLeave);
    uploadZoneA.addEventListener('drop', handleDrop);
    uploadZoneA.addEventListener('click', () => fileInputs[0].click());
    
    uploadZoneB.addEventListener('dragover', handleDragOver);
    uploadZoneB.addEventListener('dragleave', handleDragLeave);
    uploadZoneB.addEventListener('drop', handleDrop);
    uploadZoneB.addEventListener('click', () => fileInputs[1].click());

    fileInputs.forEach((input, index) => {
        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0], index === 0);
            }
        });
    });

    uploadButtons.forEach((button, index) => {
        button.addEventListener('click', () => {
            fileInputs[index].click();
        });
    });

    playPauseButton.addEventListener('click', () => {
        if (!isPlaying) {
            startPlayback();
        } else {
            pausePlayback();
        }
    });

    stopButton.addEventListener('click', stopPlayback);
    abToggle.addEventListener('click', switchTrack);
    
    blindTestToggle.addEventListener('change', (e) => {
        blindTestMode = e.target.checked;
        document.body.classList.toggle('blind-test-mode', blindTestMode);
        // Update the track display when toggling blind test mode
        document.getElementById('current-track-display').textContent = blindTestMode ? '-' : currentTrack;
    });

    volumeControl.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        updateVolume(volume);
    });

    progressBar.addEventListener('click', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        seek(position);
    });

    // File Upload Handlers (unchanged)
    function handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    function handleDragLeave(e) {
        e.currentTarget.classList.remove('dragover');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            const isTrackA = e.currentTarget.id === 'upload-zone-a';
            handleFileUpload(file, isTrackA);
        }
    }

    // UI Updates (unchanged)
    function updateTrackDisplay(track, name) {
        const uploadZone = document.getElementById(`upload-zone-${track.toLowerCase()}`);
        const content = uploadZone.querySelector('.upload-content');
        content.innerHTML = `<p>${name}</p>`;
    }

    function updateControlsState() {
        const bothTracksLoaded = trackA && trackB;
        playPauseButton.disabled = !bothTracksLoaded;
        stopButton.disabled = !bothTracksLoaded;
        abToggle.disabled = !bothTracksLoaded;
        matchLoudnessButton.disabled = !bothTracksLoaded;
        autoAlignButton.disabled = !bothTracksLoaded;
        document.getElementById('reset-loudness').disabled = !bothTracksLoaded;
        
        if (bothTracksLoaded) {
            updateActiveTrack();
            document.getElementById('current-track-display').textContent = currentTrack;
        }
    }

    // Loudness Analysis
    class LoudnessAnalyzer {
        constructor() {
            // Constants for ITU-R BS.1770-4
            this.preFilterB = [1.53512485958697, -2.69169618940638, 1.19839281085285];
            this.preFilterA = [1, -1.69065929318241, 0.73248077421585];
            this.highShelfB = [1.0, -2.0, 1.0];
            this.highShelfA = [1.0, -1.99004745483398, 0.99007225036621];
            this.blockSize = 3.0;  // 3 seconds for short-term
            this.stepSize = 1.0;   // 1 second step
        }

        async analyzeLoudness(audioBuffer) {
            try {
                // Calculate short-term loudness values
                const shortTermValues = await this.calculateShortTermLoudness(audioBuffer);
                
                // Find maximum short-term value (LUFS-S Max)
                // Apply absolute gating at -40 LUFS before finding max (EBU R128)
                const gatedShortTerm = shortTermValues.filter(value => value >= -40);
                const shortTermMax = Math.max(...gatedShortTerm);
                
                return shortTermMax;
            } catch (error) {
                console.error('Error in loudness analysis:', error);
                throw error;
            }
        }

        async calculateShortTermLoudness(audioBuffer) {
            const sampleRate = audioBuffer.sampleRate;
            const blockSamples = Math.floor(this.blockSize * sampleRate);
            const overlap = Math.floor(blockSamples * 0.75); // 75% overlap
            const hopSize = blockSamples - overlap;
            const shortTermValues = [];

            // Channel weights according to ITU-R BS.1770-4
            const channelWeights = new Array(audioBuffer.numberOfChannels).fill(1.0);
            if (audioBuffer.numberOfChannels > 2) {
                channelWeights[4] = 1.41; // Left surround
                channelWeights[5] = 1.41; // Right surround
            }

            // First, apply K-weighting to all channels
            const kWeightedChannels = [];
            let weightedChannelCount = 0;

            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                // Skip LFE channel in 5.1 layout
                if (audioBuffer.numberOfChannels > 2 && channel === 3) continue;

                const samples = audioBuffer.getChannelData(channel);
                const weight = channelWeights[channel];
                weightedChannelCount += weight > 0 ? 1 : 0;

                // Create buffer for this channel
                const channelBuffer = new AudioBuffer({
                    numberOfChannels: 1,
                    length: samples.length,
                    sampleRate: sampleRate
                });
                channelBuffer.copyToChannel(samples, 0);

                // Apply K-weighting
                const filteredSamples = await this.applyKWeighting(channelBuffer);
                kWeightedChannels.push({
                    samples: filteredSamples,
                    weight: weight
                });
            }

            // Process blocks with overlap
            for (let start = 0; start + blockSamples <= audioBuffer.length; start += hopSize) {
                let sumSquared = 0;
                
                // Sum the weighted, K-weighted samples for all channels
                for (const channel of kWeightedChannels) {
                    const samples = channel.samples;
                    const weight = channel.weight;
                    let channelSum = 0;
                    
                    // Calculate mean square value for this channel's block
                    for (let i = start; i < start + blockSamples; i++) {
                        channelSum += samples[i] * samples[i];
                    }
                    
                    // Apply channel weight to mean square value
                    sumSquared += (channelSum / blockSamples) * weight;
                }
                
                // Calculate LUFS
                const blockLoudness = -0.691 + 10 * Math.log10(sumSquared);
                
                if (isFinite(blockLoudness) && !isNaN(blockLoudness)) {
                    shortTermValues.push(blockLoudness);
                }
            }

            return shortTermValues;
        }

        async applyKWeighting(buffer) {
            const context = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
            const source = context.createBufferSource();
            source.buffer = buffer;

            // Stage 1: Pre-filter (high-pass) using exact ITU coefficients
            const preFilter = context.createIIRFilter(this.preFilterB, this.preFilterA);

            // Stage 2: High-shelf filter using exact ITU coefficients
            const highShelf = context.createIIRFilter(this.highShelfB, this.highShelfA);

            // Connect the filters
            source.connect(preFilter);
            preFilter.connect(highShelf);
            highShelf.connect(context.destination);
            source.start();

            // Render and return the filtered samples
            const filteredBuffer = await context.startRendering();
            return filteredBuffer.getChannelData(0);
        }
    }

    // Initialize loudness analyzer
    const loudnessAnalyzer = new LoudnessAnalyzer();

    // Update analyzeLoudness function to use the new analyzer
    async function analyzeLoudness(track, isTrackA) {
        try {
            const lufs = await loudnessAnalyzer.analyzeLoudness(track.buffer);
            const trackLetter = isTrackA ? 'a' : 'b';
            const loudnessDisplay = document.getElementById(`track-${trackLetter}-loudness`);
            loudnessDisplay.textContent = lufs.toFixed(1);

            // Store the loudness value for matching
            track.loudness = lufs;
            track.gainAdjustment = 0;  // Initialize gain adjustment
            updateGainDisplay(isTrackA ? 'A' : 'B');

            // Enable loudness matching if both tracks have been analyzed
            if (trackA?.loudness !== undefined && trackB?.loudness !== undefined) {
                matchLoudnessButton.disabled = false;
            }
        } catch (error) {
            console.error('Error analyzing loudness:', error);
        }
    }

    // Add loudness matching functionality
    matchLoudnessButton.addEventListener('click', async () => {
        if (!trackA?.buffer || !trackB?.buffer) return;

        const wasPlaying = isPlaying;
        if (wasPlaying) {
            pausePlayback();
        }

        const currentTime = audioContext.currentTime;
        
        // Step 1: Match LUFS-S Max
        const targetLoudness = Math.min(trackA.loudness, trackB.loudness);
        
        // Calculate initial gain adjustments to match LUFS
        let gainAdjustA = 0;
        let gainAdjustB = 0;
        
        if (trackA.loudness > targetLoudness) {
            gainAdjustA = targetLoudness - trackA.loudness;
        }
        if (trackB.loudness > targetLoudness) {
            gainAdjustB = targetLoudness - trackB.loudness;
        }
        
        // Step 2: Find the highest peak after LUFS matching
        const peakA = findPeak(trackA.buffer) * Math.pow(10, gainAdjustA / 20);
        const peakB = findPeak(trackB.buffer) * Math.pow(10, gainAdjustB / 20);
        const highestPeak = Math.max(peakA, peakB);
        
        // Step 3: Calculate additional gain needed to bring highest peak to -2dB
        const TARGET_PEAK_DB = -2;
        const additionalGain = TARGET_PEAK_DB - 20 * Math.log10(highestPeak);
        
        // Apply combined gain adjustments
        trackA.gainAdjustment = gainAdjustA + additionalGain;
        trackB.gainAdjustment = gainAdjustB + additionalGain;
        
        // Apply gains to audio nodes
        const gainValueA = Math.pow(10, trackA.gainAdjustment / 20);
        const gainValueB = Math.pow(10, trackB.gainAdjustment / 20);
        
        trackA.gainNode.gain.cancelScheduledValues(currentTime);
        trackB.gainNode.gain.cancelScheduledValues(currentTime);
        
        trackA.gainNode.gain.setValueAtTime(trackA.gainNode.gain.value, currentTime);
        trackB.gainNode.gain.setValueAtTime(trackB.gainNode.gain.value, currentTime);
        
        trackA.gainNode.gain.linearRampToValueAtTime(gainValueA, currentTime + 0.01);
        trackB.gainNode.gain.linearRampToValueAtTime(gainValueB, currentTime + 0.01);
        
        // Update displays
        updateGainDisplay('A');
        updateGainDisplay('B');
        
        const newLoudnessA = trackA.loudness + trackA.gainAdjustment;
        const newLoudnessB = trackB.loudness + trackB.gainAdjustment;
        
        document.getElementById('track-a-loudness').textContent = newLoudnessA.toFixed(1);
        document.getElementById('track-b-loudness').textContent = newLoudnessB.toFixed(1);
        
        if (wasPlaying) {
            startPlayback();
        }
    });

    // Helper function to find peak sample value in an audio buffer
    function findPeak(buffer) {
        let peak = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < data.length; i++) {
                const abs = Math.abs(data[i]);
                if (abs > peak) {
                    peak = abs;
                }
            }
        }
        return peak;
    }

    // Add gain adjustment functionality
    document.querySelectorAll('.gain-button').forEach(button => {
        button.addEventListener('click', () => {
            const track = button.dataset.track.toUpperCase();
            const adjustment = parseFloat(button.dataset.adjust);
            adjustGain(track, adjustment);
        });
    });

    function adjustGain(track, adjustment) {
        const trackObj = track === 'A' ? trackA : trackB;
        if (!trackObj) return;
        
        // Initialize gainAdjustment if not set
        if (typeof trackObj.gainAdjustment !== 'number') {
            trackObj.gainAdjustment = 0;
        }

        // Apply the adjustment
        trackObj.gainAdjustment += adjustment;
        
        // Calculate and apply the new gain value
        const gainValue = Math.pow(10, trackObj.gainAdjustment / 20);
        const currentTime = audioContext.currentTime;
        
        trackObj.gainNode.gain.cancelScheduledValues(currentTime);
        trackObj.gainNode.gain.setValueAtTime(trackObj.gainNode.gain.value, currentTime);
        trackObj.gainNode.gain.linearRampToValueAtTime(gainValue, currentTime + 0.01);

        // Update displays
        updateGainDisplay(track);
        const newLoudness = trackObj.loudness + trackObj.gainAdjustment;
        const loudnessDisplay = document.getElementById(`track-${track.toLowerCase()}-loudness`);
        loudnessDisplay.textContent = newLoudness.toFixed(1);
    }

    function updateGainDisplay(track) {
        const trackObj = track === 'A' ? trackA : trackB;
        if (!trackObj) return;

        const gainDisplay = document.getElementById(`track-${track.toLowerCase()}-gain`);
        gainDisplay.textContent = trackObj.gainAdjustment.toFixed(1);
    }

    // Handle waveform click for seeking
    function handleWaveformClick(e) {
        if (!trackA?.buffer || !trackB?.buffer) return;
        
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const position = x / e.target.width;
        seek(position);
    }

    // Handle waveform touch for seeking on mobile
    function handleWaveformTouch(e) {
        e.preventDefault(); // Prevent scrolling while touching waveform
        if (!trackA?.buffer || !trackB?.buffer) return;
        
        const rect = e.target.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const position = x / e.target.width;
        seek(position);
    }

    // Add touch event handling for progress bar
    progressBar.addEventListener('touchstart', handleProgressTouch);
    progressBar.addEventListener('touchmove', handleProgressTouch);

    function handleProgressTouch(e) {
        e.preventDefault();
        const rect = progressBar.getBoundingClientRect();
        const touch = e.touches[0];
        const position = (touch.clientX - rect.left) / rect.width;
        seek(Math.max(0, Math.min(1, position)));
    }

    // Add hover effect for waveforms
    function updateWaveformStyles() {
        if (canvasA && canvasB) {
            [canvasA, canvasB].forEach(canvas => {
                canvas.style.cursor = 'pointer';
            });
        }
    }

    // Improve mobile button sizes and touch targets
    function updateMobileLayout() {
        const isMobile = window.innerWidth <= 768;
        const buttons = document.querySelectorAll('.control-button, .gain-button');
        
        buttons.forEach(button => {
            if (isMobile) {
                button.style.minHeight = '44px';  // Minimum touch target size
                button.style.padding = '12px 16px';
            } else {
                button.style.minHeight = '';
                button.style.padding = '';
            }
        });

        // Adjust volume slider for mobile
        if (isMobile) {
            volumeControl.style.width = '100%';
            volumeControl.style.margin = '10px 0';
        } else {
            volumeControl.style.width = '100px';
            volumeControl.style.margin = '';
        }
    }

    // Call updateMobileLayout on load and resize
    window.addEventListener('load', updateMobileLayout);
    window.addEventListener('resize', updateMobileLayout);

    // Update active track display
    function updateActiveTrack() {
        const waveformA = document.getElementById('waveform-a');
        const waveformB = document.getElementById('waveform-b');
        
        waveformA.classList.toggle('active', currentTrack === 'A');
        waveformB.classList.toggle('active', currentTrack === 'B');
    }

    // Clear track functionality
    document.getElementById('clear-a').addEventListener('click', (e) => {
        e.stopPropagation();
        clearTrack('A');
    });

    document.getElementById('clear-b').addEventListener('click', (e) => {
        e.stopPropagation();
        clearTrack('B');
    });

    function clearTrack(track) {
        if (isPlaying) {
            pausePlayback();
        }

        if (track === 'A') {
            if (trackA?.gainNode) {
                trackA.gainNode.disconnect();
            }
            trackA = null;
            updateTrackDisplay('A', '<p>Drag & drop audio file here</p><p class="upload-hint">Supported formats: .wav, .mp3, .aac, .m4a, .ogg, .flac</p><p class="upload-hint">Files are processed locally</p>');
            document.getElementById('upload-zone-a').classList.remove('has-file');
            if (ctxA) {
                ctxA.fillStyle = WAVE_BG;
                ctxA.fillRect(0, 0, canvasA.width, canvasA.height);
            }
        } else {
            if (trackB?.gainNode) {
                trackB.gainNode.disconnect();
            }
            trackB = null;
            updateTrackDisplay('B', '<p>Drag & drop audio file here</p><p class="upload-hint">Supported formats: .wav, .mp3, .aac, .m4a, .ogg, .flac</p><p class="upload-hint">Files are processed locally</p>');
            document.getElementById('upload-zone-b').classList.remove('has-file');
            if (ctxB) {
                ctxB.fillStyle = WAVE_BG;
                ctxB.fillRect(0, 0, canvasB.width, canvasB.height);
            }
        }

        updateControlsState();
        updateProgress();
    }

    // Reset loudness functionality
    document.getElementById('reset-loudness').addEventListener('click', () => {
        if (!trackA || !trackB) return;

        const wasPlaying = isPlaying;
        if (wasPlaying) {
            pausePlayback();
        }

        const currentTime = audioContext.currentTime;

        // Reset gain and delay adjustments
        if (trackA) {
            trackA.gainAdjustment = 0;
            trackA.delayTime = 0;
            trackA.gainNode.gain.cancelScheduledValues(currentTime);
            trackA.gainNode.gain.setValueAtTime(trackA.gainNode.gain.value, currentTime);
            trackA.gainNode.gain.linearRampToValueAtTime(1, currentTime + 0.01);
            trackA.delayNode.delayTime.setValueAtTime(0, currentTime);
            updateGainDisplay('A');
            updateDelayDisplay('A');
            const loudnessDisplay = document.getElementById('track-a-loudness');
            loudnessDisplay.textContent = trackA.loudness.toFixed(1);
        }

        if (trackB) {
            trackB.gainAdjustment = 0;
            trackB.delayTime = 0;
            trackB.gainNode.gain.cancelScheduledValues(currentTime);
            trackB.gainNode.gain.setValueAtTime(trackB.gainNode.gain.value, currentTime);
            trackB.gainNode.gain.linearRampToValueAtTime(1, currentTime + 0.01);
            trackB.delayNode.delayTime.setValueAtTime(0, currentTime);
            updateGainDisplay('B');
            updateDelayDisplay('B');
            const loudnessDisplay = document.getElementById('track-b-loudness');
            loudnessDisplay.textContent = trackB.loudness.toFixed(1);
        }

        if (wasPlaying) {
            startPlayback();
        }
    });

    // Update cursor style for upload zones
    uploadZoneA.style.cursor = 'pointer';
    uploadZoneB.style.cursor = 'pointer';

    // Add space bar control for playback
    document.addEventListener('keydown', (e) => {
        // Only handle space bar when not typing in an input
        if (e.code === 'Space' && e.target === document.body) {
            e.preventDefault(); // Prevent page scroll
            if (!playPauseButton.disabled) {
                if (!isPlaying) {
                    startPlayback();
                } else {
                    pausePlayback();
                }
            }
        }
    });

    // Add delay adjustment functionality
    document.querySelectorAll('.delay-button').forEach(button => {
        button.addEventListener('click', () => {
            const track = button.dataset.track.toUpperCase();
            const adjustment = parseFloat(button.dataset.adjust);
            adjustDelay(track, adjustment);
        });
    });

    function adjustDelay(track, adjustment) {
        const trackObj = track === 'A' ? trackA : trackB;
        if (!trackObj) return;
        
        // Convert ms to seconds for Web Audio API
        const newDelayMs = Math.max(0, (trackObj.delayTime || 0) + adjustment);
        const newDelaySec = newDelayMs / 1000;
        
        // Update delay time
        trackObj.delayTime = newDelayMs;
        trackObj.delayNode.delayTime.setValueAtTime(newDelaySec, audioContext.currentTime);

        // Update display
        updateDelayDisplay(track);
    }

    function updateDelayDisplay(track) {
        const trackObj = track === 'A' ? trackA : trackB;
        if (!trackObj) return;

        const delayDisplay = document.getElementById(`track-${track.toLowerCase()}-delay`);
        delayDisplay.textContent = Math.round(trackObj.delayTime);
    }

    // Add auto-align button to loudness buttons
    const loudnessButtons = document.querySelector('.loudness-buttons');
    const autoAlignButton = document.createElement('button');
    autoAlignButton.id = 'auto-align';
    autoAlignButton.className = 'control-button';
    autoAlignButton.textContent = 'Auto Align';
    autoAlignButton.disabled = true;
    
    // Insert auto-align button after match-loudness button
    const matchButton = document.getElementById('match-loudness');
    matchButton.parentNode.insertBefore(autoAlignButton, matchButton.nextSibling);

    // Auto alignment function
    async function findOptimalAlignment(trackABuffer, trackBBuffer) {
        // Use first 100ms for analysis
        const sampleRate = trackABuffer.sampleRate;
        const windowSize = Math.floor(sampleRate * 0.1); // 100ms window
        const dataA = trackABuffer.getChannelData(0).slice(0, windowSize);
        const dataB = trackBBuffer.getChannelData(0).slice(0, windowSize);
        
        // Find RMS values in small chunks to detect peaks
        const chunkSize = Math.floor(sampleRate * 0.001); // 1ms chunks
        const rmsA = calculateRMSChunks(dataA, chunkSize);
        const rmsB = calculateRMSChunks(dataB, chunkSize);
        
        // Find first significant peak in each track
        const thresholdA = Math.max(...rmsA) * 0.3; // 30% of max RMS
        const thresholdB = Math.max(...rmsB) * 0.3;
        
        let peakA = findFirstPeak(rmsA, thresholdA);
        let peakB = findFirstPeak(rmsB, thresholdB);
        
        // Calculate delay in milliseconds
        const delayMs = ((peakB - peakA) * chunkSize / sampleRate) * 1000;
        
        console.log('Peak A:', peakA, 'Peak B:', peakB, 'Delay:', delayMs);
        return delayMs;
    }

    function calculateRMSChunks(data, chunkSize) {
        const rmsValues = [];
        for (let i = 0; i < data.length; i += chunkSize) {
            let sum = 0;
            const end = Math.min(i + chunkSize, data.length);
            for (let j = i; j < end; j++) {
                sum += data[j] * data[j];
            }
            rmsValues.push(Math.sqrt(sum / (end - i)));
        }
        return rmsValues;
    }

    function findFirstPeak(rmsValues, threshold) {
        // Find the first value that exceeds the threshold
        for (let i = 0; i < rmsValues.length; i++) {
            if (rmsValues[i] > threshold) {
                return i;
            }
        }
        return 0;
    }

    // Add auto-align button handler
    autoAlignButton.addEventListener('click', async () => {
        if (!trackA?.buffer || !trackB?.buffer) return;
        
        const wasPlaying = isPlaying;
        if (wasPlaying) {
            pausePlayback();
        }
        
        try {
            // Show loading state
            autoAlignButton.textContent = 'Aligning...';
            autoAlignButton.disabled = true;
            
            // Find optimal delay
            const delayMs = await findOptimalAlignment(trackA.buffer, trackB.buffer);
            
            // Reset both delays first
            adjustDelay('A', -trackA.delayTime);
            adjustDelay('B', -trackB.delayTime);
            
            // Apply the new delay
            if (delayMs > 0) {
                adjustDelay('B', delayMs);
            } else {
                adjustDelay('A', -delayMs);
            }
            
            // Restore button state
            autoAlignButton.textContent = 'Auto Align';
            autoAlignButton.disabled = false;
            
            if (wasPlaying) {
                startPlayback();
            }
        } catch (error) {
            console.error('Error in auto alignment:', error);
            autoAlignButton.textContent = 'Auto Align';
            autoAlignButton.disabled = false;
        }
    });

    async function matchLoudness() {
        if (!trackA?.buffer || !trackB?.buffer) return;
        
        // Get current loudness values
        const loudnessA = await measureLoudness(trackA.buffer);
        const loudnessB = await measureLoudness(trackB.buffer);
        
        // Target level is -2 dBFS
        const targetLevel = -2;
        
        // Calculate gains needed to bring each track to target level
        const gainToTargetA = targetLevel - loudnessA.shortTerm;
        const gainToTargetB = targetLevel - loudnessB.shortTerm;
        
        // Apply gains to both tracks
        trackA.setGain(gainToTargetA);
        trackB.setGain(gainToTargetB);
        
        // Update displays
        updateTrackInfo('A', gainToTargetA);
        updateTrackInfo('B', gainToTargetB);
    }

    function updateTrackInfo(track, gainValue) {
        const gainDisplay = document.querySelector(`#track${track}GainValue`);
        if (gainDisplay) {
            gainDisplay.textContent = gainValue.toFixed(1);
        }
        
        // Update LUFS display after gain change
        updateLoudnessDisplay();
    }
});
