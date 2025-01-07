// Audio Track class
class AudioTrack {
    constructor(buffer) {
        this.buffer = buffer;
        this.gain = 1.0;
        this.delay = 0;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('AB app initializing...');
    
    // Audio context setup
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let trackA = null;
    let trackB = null;
    let fileNameA = '';
    let fileNameB = '';
    let sourceA = null;
    let sourceB = null;
    let masterGain = null;
    let startTime = 0;
    let pauseTime = 0;
    let isPlaying = false;
    let currentTrack = 'A';
    let blindTestMode = false;
    const FADE_TIME = 0.05;

    // Waveform Variables
    const CANVAS_HEIGHT = 100;
    const WAVE_COLOR_A = '#4a9eff';
    const WAVE_COLOR_B = '#66b3ff';
    const WAVE_BG = '#1e1e1e';
    let canvasA, canvasB, ctxA, ctxB;

    // Add selection state variables
    let selectionStart = null;
    let selectionEnd = null;
    let isSelecting = false;
    const MIN_SELECTION_DURATION = 0.5; // Minimum selection duration in seconds

    // UI Elements
    let uploadZoneA, uploadZoneB, fileInputA, fileInputB, uploadButtons;
    let playPauseButton, stopButton, abToggle, blindTestToggle;
    let volumeControl, matchLoudnessButton, progressBar, progressFill;

    // Update file display
    function updateFileDisplay() {
        const fileADisplay = document.querySelector('#track-a .upload-content');
        const fileBDisplay = document.querySelector('#track-b .upload-content');
        
        if (fileADisplay && trackA) {
            fileADisplay.innerHTML = `<p>${fileNameA}</p>`;
        }
        if (fileBDisplay && trackB) {
            fileBDisplay.innerHTML = `<p>${fileNameB}</p>`;
        }

        // Enable controls if both tracks are loaded
        if (trackA && trackB) {
            playPauseButton.disabled = false;
            stopButton.disabled = false;
            abToggle.disabled = false;
            matchLoudnessButton.disabled = false;
        }
    }

    // Draw waveform
    function drawWaveform(buffer, track) {
        const canvas = track === 'A' ? canvasA.querySelector('canvas') : canvasB.querySelector('canvas');
        const ctx = track === 'A' ? ctxA : ctxB;
        const color = track === 'A' ? WAVE_COLOR_A : WAVE_COLOR_B;
        
        if (!canvas || !ctx) return;

        // Set canvas width to match container
        canvas.width = canvas.parentElement.clientWidth;
        
        // Clear canvas
        ctx.fillStyle = WAVE_BG;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw waveform
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;
        
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        
        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;
            
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            
            ctx.moveTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        
        ctx.stroke();
    }

    // File loading function
    function loadFile(file, index) {
        const reader = new FileReader();
        reader.onload = function(e) {
            audioContext.decodeAudioData(e.target.result)
                .then(buffer => {
                    if (index === 0) {
                        trackA = new AudioTrack(buffer);
                        fileNameA = file.name;
            } else {
                        trackB = new AudioTrack(buffer);
                        fileNameB = file.name;
                    }
                    updateFileDisplay();
                    drawWaveform(buffer, index === 0 ? 'A' : 'B');
                })
                .catch(error => {
                    console.error('Error decoding audio data:', error);
                });
        };
        reader.readAsArrayBuffer(file);
    }

    // Initialize UI elements and event handlers
    function initializeUI() {
        // Initialize DOM Elements
        uploadZoneA = document.getElementById('upload-zone-a');
        uploadZoneB = document.getElementById('upload-zone-b');
        fileInputA = document.querySelector('#track-a .file-input');
        fileInputB = document.querySelector('#track-b .file-input');
        uploadButtons = document.querySelectorAll('.upload-button');
        playPauseButton = document.getElementById('play-pause');
        stopButton = document.getElementById('stop');
        abToggle = document.getElementById('ab-toggle');
        blindTestToggle = document.getElementById('blind-test-toggle');
        volumeControl = document.getElementById('volume');
        matchLoudnessButton = document.getElementById('match-loudness');
        progressBar = document.querySelector('.progress-bar');
        progressFill = document.querySelector('.progress-fill');

        console.log('UI elements found:', {
            uploadZoneA, uploadZoneB, fileInputA, fileInputB,
            playPauseButton, stopButton, abToggle, blindTestToggle,
            volumeControl, matchLoudnessButton, progressBar, progressFill
        });

        if (fileInputA && fileInputB) {
            // File input handlers
            fileInputA.addEventListener('change', function(e) {
                const files = e.target.files;
                if (files.length > 0) {
                    loadFile(files[0], 0);
                }
            });

            fileInputB.addEventListener('change', function(e) {
                const files = e.target.files;
        if (files.length > 0) {
                    loadFile(files[0], 1);
                }
            });
            } else {
            console.error('File input elements not found');
        }

        // Initialize waveform containers
        canvasA = document.getElementById('waveform-a');
        canvasB = document.getElementById('waveform-b');
        if (canvasA && canvasB) {
            // Create canvas elements for waveforms
            const canvasElementA = document.createElement('canvas');
            const canvasElementB = document.createElement('canvas');
            canvasElementA.height = canvasElementB.height = CANVAS_HEIGHT;
            canvasA.appendChild(canvasElementA);
            canvasB.appendChild(canvasElementB);
            ctxA = canvasElementA.getContext('2d');
            ctxB = canvasElementB.getContext('2d');
            console.log('Canvas elements initialized');
            } else {
            console.error('Waveform containers not found');
        }
    }

    // Initialize UI and file handling
    function initialize() {
        console.log('Initializing UI elements...');
        
        // Initialize all UI elements first
        initializeUI();
        
        // Then check for files from Audiodata
        setTimeout(() => {
            console.log('Checking for files from Audiodata...');
            const storedFiles = JSON.parse(sessionStorage.getItem('abCompareFiles') || '[]');
            console.log('Stored files:', storedFiles);
            console.log('Window opener:', window.opener);
            console.log('AB Compare files:', window.opener?.abCompareFiles);
            
            if (storedFiles.length === 2 && window.opener?.abCompareFiles) {
                console.log('Loading files from Audiodata app');
                window.opener.abCompareFiles.forEach((file, index) => {
                    console.log(`Loading file ${index}:`, file.name);
                    loadFile(file, index);
                });
                // Clean up
                sessionStorage.removeItem('abCompareFiles');
                window.opener.abCompareFiles = null;
            }
        }, 500); // Give more time for everything to initialize
    }

    // Initialize after DOM is loaded
    initialize();
});
