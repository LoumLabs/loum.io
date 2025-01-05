document.addEventListener('DOMContentLoaded', () => {
    // Audio Context
    let audioContext;
    let trackA = null;
    let trackB = null;
    let isPlaying = false;
    let currentTrack = 'A';
    let blindTestMode = false;

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

    // Initialize Audio Context on user interaction
    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    // File Upload Handlers
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

    // File Upload Processing
    async function handleFileUpload(file, isTrackA) {
        initAudioContext();
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            if (isTrackA) {
                trackA = {
                    buffer: audioBuffer,
                    name: file.name
                };
                updateTrackDisplay('A', file.name);
            } else {
                trackB = {
                    buffer: audioBuffer,
                    name: file.name
                };
                updateTrackDisplay('B', file.name);
            }

            updateControlsState();
            analyzeLoudness(isTrackA ? trackA : trackB, isTrackA);
        } catch (error) {
            console.error('Error loading audio file:', error);
            alert('Error loading audio file. Please try another file.');
        }
    }

    // Update UI
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
    }

    // Loudness Analysis
    async function analyzeLoudness(track, isTrackA) {
        // TODO: Implement loudness analysis
        const loudnessDisplay = document.getElementById(`track-${isTrackA ? 'a' : 'b'}-loudness`);
        loudnessDisplay.textContent = '-23.0'; // Placeholder
    }

    // Playback Controls
    function togglePlayPause() {
        if (!isPlaying) {
            startPlayback();
        } else {
            pausePlayback();
        }
    }

    function startPlayback() {
        // TODO: Implement playback
        isPlaying = true;
        playPauseButton.textContent = 'Pause';
    }

    function pausePlayback() {
        // TODO: Implement pause
        isPlaying = false;
        playPauseButton.textContent = 'Play';
    }

    function stopPlayback() {
        // TODO: Implement stop
        isPlaying = false;
        playPauseButton.textContent = 'Play';
    }

    function switchTrack() {
        if (!trackA || !trackB) return;
        
        currentTrack = currentTrack === 'A' ? 'B' : 'A';
        abToggle.textContent = blindTestMode ? 
            `Switch to Track ${currentTrack === 'A' ? '1' : '2'}` : 
            `Switch to Track ${currentTrack}`;
        
        // TODO: Implement smooth crossfade between tracks
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

    playPauseButton.addEventListener('click', togglePlayPause);
    stopButton.addEventListener('click', stopPlayback);
    abToggle.addEventListener('click', switchTrack);
    
    blindTestToggle.addEventListener('change', (e) => {
        blindTestMode = e.target.checked;
        abToggle.textContent = blindTestMode ? 
            `Switch to Track ${currentTrack === 'A' ? '1' : '2'}` : 
            `Switch to Track ${currentTrack}`;
    });

    volumeControl.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        // TODO: Implement volume control
    });

    progressBar.addEventListener('click', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        // TODO: Implement seeking
    });
});
