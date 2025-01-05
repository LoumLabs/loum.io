document.addEventListener('DOMContentLoaded', () => {
    // Audio Context and Nodes
    let audioContext;
    let trackA = null;
    let trackB = null;
    let sourceA = null;
    let sourceB = null;
    let gainA = null;
    let gainB = null;
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
            
            // Redraw waveforms if they exist
            if (trackA?.buffer) drawWaveform(trackA.buffer, ctxA, WAVE_COLOR_A);
            if (trackB?.buffer) drawWaveform(trackB.buffer, ctxB, WAVE_COLOR_B);
        }
    }

    function drawWaveform(audioBuffer, ctx, color) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const data = audioBuffer.getChannelData(0); // Use first channel
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        ctx.fillStyle = WAVE_BG;
        ctx.fillRect(0, 0, width, height);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;

        for (let i = 0; i < width; i++) {
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

    // File Upload Processing
    async function handleFileUpload(file, isTrackA) {
        initAudioContext();
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            if (isTrackA) {
                if (trackA?.gainNode) {
                    trackA.gainNode.disconnect();
                }
                trackA = {
                    buffer: audioBuffer,
                    name: file.name,
                    gainNode: audioContext.createGain()
                };
                trackA.gainNode.connect(masterGain);
                updateTrackDisplay('A', file.name);
                drawWaveform(audioBuffer, ctxA, WAVE_COLOR_A);
                document.getElementById('upload-zone-a').classList.add('has-file');
            } else {
                if (trackB?.gainNode) {
                    trackB.gainNode.disconnect();
                }
                trackB = {
                    buffer: audioBuffer,
                    name: file.name,
                    gainNode: audioContext.createGain()
                };
                trackB.gainNode.connect(masterGain);
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

    // Modify startPlayback to include playhead animation
    function startPlayback() {
        if (!trackA || !trackB) return;
        
        const offset = pauseTime;
        startTime = audioContext.currentTime - offset;

        // Create and configure source nodes
        sourceA = audioContext.createBufferSource();
        sourceB = audioContext.createBufferSource();
        
        sourceA.buffer = trackA.buffer;
        sourceB.buffer = trackB.buffer;

        sourceA.connect(trackA.gainNode);
        sourceB.connect(trackB.gainNode);

        // Set initial gain values based on current track and stored gain adjustments
        const trackAGain = Math.pow(10, (trackA.gainAdjustment || 0) / 20);
        const trackBGain = Math.pow(10, (trackB.gainAdjustment || 0) / 20);

        trackA.gainNode.gain.setValueAtTime(
            currentTrack === 'A' ? trackAGain : 0, 
            audioContext.currentTime
        );
        trackB.gainNode.gain.setValueAtTime(
            currentTrack === 'B' ? trackBGain : 0, 
            audioContext.currentTime
        );

        // Start both sources in sync
        sourceA.start(0, offset);
        sourceB.start(0, offset);

        isPlaying = true;
        playPauseButton.textContent = 'Pause';

        // Start progress and playhead updates
        requestAnimationFrame(updateProgress);
        requestAnimationFrame(drawPlayhead);
    }

    function pausePlayback() {
        if (!isPlaying) return;

        pauseTime = audioContext.currentTime - startTime;
        sourceA?.stop();
        sourceB?.stop();
        sourceA = null;
        sourceB = null;

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
        
        if (isPlaying) {
            const currentTime = audioContext.currentTime;
            
            // Get the stored gain adjustments
            const trackAGain = Math.pow(10, (trackA.gainAdjustment || 0) / 20);
            const trackBGain = Math.pow(10, (trackB.gainAdjustment || 0) / 20);
            
            // Update track state and visual feedback
            currentTrack = nextTrack;
            updateActiveTrack();
            document.getElementById('current-track-display').textContent = nextTrack;
            
            // Quick crossfade between tracks
            if (nextTrack === 'B') {
                trackA.gainNode.gain.cancelScheduledValues(currentTime);
                trackB.gainNode.gain.cancelScheduledValues(currentTime);
                trackA.gainNode.gain.setValueAtTime(trackA.gainNode.gain.value, currentTime);
                trackB.gainNode.gain.setValueAtTime(trackB.gainNode.gain.value, currentTime);
                trackA.gainNode.gain.linearRampToValueAtTime(0, currentTime + FADE_TIME);
                trackB.gainNode.gain.linearRampToValueAtTime(trackBGain, currentTime + FADE_TIME);
            } else {
                trackA.gainNode.gain.cancelScheduledValues(currentTime);
                trackB.gainNode.gain.cancelScheduledValues(currentTime);
                trackA.gainNode.gain.setValueAtTime(trackA.gainNode.gain.value, currentTime);
                trackB.gainNode.gain.setValueAtTime(trackB.gainNode.gain.value, currentTime);
                trackB.gainNode.gain.linearRampToValueAtTime(0, currentTime + FADE_TIME);
                trackA.gainNode.gain.linearRampToValueAtTime(trackAGain, currentTime + FADE_TIME);
            }
        } else {
            // If not playing, instant switch
            const trackAGain = Math.pow(10, (trackA.gainAdjustment || 0) / 20);
            const trackBGain = Math.pow(10, (trackB.gainAdjustment || 0) / 20);
            
            trackA.gainNode.gain.value = nextTrack === 'A' ? trackAGain : 0;
            trackB.gainNode.gain.value = nextTrack === 'B' ? trackBGain : 0;
            
            currentTrack = nextTrack;
            updateActiveTrack();
            document.getElementById('current-track-display').textContent = nextTrack;
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
    uploadZoneB.addEventListener('dragover', handleDragOver);
    uploadZoneB.addEventListener('dragleave', handleDragLeave);
    uploadZoneB.addEventListener('drop', handleDrop);

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
        if (!trackA?.loudness || !trackB?.loudness) return;

        const wasPlaying = isPlaying;
        if (wasPlaying) {
            pausePlayback();
        }

        // Find the quieter track's loudness
        const targetLoudness = Math.min(trackA.loudness, trackB.loudness);

        // Calculate and apply gain adjustments
        if (trackA.loudness > targetLoudness) {
            const gainAdjust = targetLoudness - trackA.loudness;
            trackA.gainNode.gain.value = Math.pow(10, gainAdjust / 20);
            trackA.gainAdjustment = gainAdjust;
            updateGainDisplay('A');
            
            // Update loudness display
            const loudnessDisplay = document.getElementById('track-a-loudness');
            loudnessDisplay.textContent = targetLoudness.toFixed(1);
        }
        
        if (trackB.loudness > targetLoudness) {
            const gainAdjust = targetLoudness - trackB.loudness;
            trackB.gainNode.gain.value = Math.pow(10, gainAdjust / 20);
            trackB.gainAdjustment = gainAdjust;
            updateGainDisplay('B');
            
            // Update loudness display
            const loudnessDisplay = document.getElementById('track-b-loudness');
            loudnessDisplay.textContent = targetLoudness.toFixed(1);
        }

        if (wasPlaying) {
            startPlayback();
        }
    });

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
        trackObj.gainNode.gain.value = gainValue;

        // Update the gain display
        updateGainDisplay(track);

        // Update the loudness display with the new effective loudness
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
            updateTrackDisplay('A', '<p>Drag & drop audio file here</p><p class="upload-hint">Supported formats: .wav, .mp3, .aac, .m4a, .ogg, .flac</p>');
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
            updateTrackDisplay('B', '<p>Drag & drop audio file here</p><p class="upload-hint">Supported formats: .wav, .mp3, .aac, .m4a, .ogg, .flac</p>');
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

        // Reset gain adjustments
        if (trackA) {
            trackA.gainAdjustment = 0;
            trackA.gainNode.gain.value = 1;
            updateGainDisplay('A');
            const loudnessDisplay = document.getElementById('track-a-loudness');
            loudnessDisplay.textContent = trackA.loudness.toFixed(1);
        }

        if (trackB) {
            trackB.gainAdjustment = 0;
            trackB.gainNode.gain.value = 1;
            updateGainDisplay('B');
            const loudnessDisplay = document.getElementById('track-b-loudness');
            loudnessDisplay.textContent = trackB.loudness.toFixed(1);
        }

        if (wasPlaying) {
            startPlayback();
        }
    });
});
