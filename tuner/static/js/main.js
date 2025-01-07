let audioProcessor = null;
let pitchDetector = null;
let spectrumAnalyzer = null;
let animationFrame = null;
let isInitialized = false;
let lastFrameTime = 0;
let lastValidPitchData = null;
let lastValidPitchTime = 0;
let isHolding = false;
const DISPLAY_HOLD_TIME = 3000;  // Hold for 3 seconds

const TARGET_FRAME_RATE = 60;
const FRAME_INTERVAL = 1000 / TARGET_FRAME_RATE;
const SILENCE_THRESHOLD = -70;

// Tuner settings
const SETTINGS = {
    referencePitch: 440,
    temperament: 'equal',
    transposition: 0,
    filterMode: 'normal'
};

// Filter ranges for different instruments
const FILTER_RANGES = {
    normal: { min: 20, max: 4000, clarityThreshold: 0.8 },
    voice: { min: 60, max: 1000, clarityThreshold: 0.85, temporalWindow: 3 },  // Optimized for vocal range with higher stability
    guitar: { min: 60, max: 1200, clarityThreshold: 0.8, temporalWindow: 2 },  // Standard guitar range (E2 to E6)
    bass: { min: 30, max: 400, clarityThreshold: 0.8, temporalWindow: 2 }      // Bass guitar range (B0 to G4)
};

function initializeVisualizations() {
    const spectrumCanvas = document.getElementById('spectrum');
    
    if (!spectrumCanvas) {
        console.error('Required canvas elements not found');
        return;
    }
    
    spectrumAnalyzer = new SpectrumAnalyzer(spectrumCanvas);
    pitchDetector = new PitchDetector();
    
    // Initialize with 'normal' mode settings explicitly
    const initialMode = 'normal';
    const initialRange = FILTER_RANGES[initialMode];
    
    pitchDetector.updateSettings({
        bufferSize: 2048,
        temporalWindow: initialRange.temporalWindow || 2,
        clarityThreshold: initialRange.clarityThreshold || 0.8,
        noiseFloor: SILENCE_THRESHOLD,
        minFreq: initialRange.min,
        maxFreq: initialRange.max
    });
    
    // Set initial filter mode
    SETTINGS.filterMode = initialMode;
    
    requestAnimationFrame(() => {
        const initialData = new Float32Array(2048).fill(-90);
        spectrumAnalyzer.draw(initialData);
        resetDisplays();
        
        // Set initial states
        const filterButtons = document.querySelectorAll('.filter-button');
        filterButtons.forEach(button => {
            if (button.dataset.mode === initialMode) {
                button.classList.add('active');
            }
        });

        // Initialize spectrum analyzer with fundamental frequency label
        spectrumAnalyzer.setLabelCount(1);
        
        // Update button state to match
        const labelButtons = document.querySelectorAll('.peak-label-button');
        labelButtons.forEach(button => {
            if (button.dataset.labels === '1') {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    });
    
    isInitialized = true;
}

function resetDisplays() {
    document.querySelector('.note-name').textContent = '--';
    document.querySelector('.frequency-value').textContent = '0';
    document.querySelector('.cents-display').textContent = '0¢';
    
    // Reset semitone meter needle
    const meterScale = document.querySelector('.meter-scale');
    const centerPosition = meterScale.offsetWidth / 2;
    document.querySelector('.meter-needle').style.left = `${centerPosition}px`;
    
    // Reset pitch indicator to center
    const pitchIndicator = document.querySelector('.pitch-indicator');
    if (pitchIndicator) {
        pitchIndicator.style.transition = 'left 0.3s ease-out';
        pitchIndicator.style.left = '50%';
        // Reset color
        pitchIndicator.style.backgroundColor = '#808080';
    }
}

async function initializeAudio() {
    if (!isInitialized) {
        initializeVisualizations();
    }
    
    try {
        audioProcessor = new AudioProcessor();
        await audioProcessor.initialize();
        await audioProcessor.audioContext.resume();
        animate();
        
        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.textContent = 'Stop';
            startButton.classList.add('active');
        }
    } catch (error) {
        console.error('Error initializing audio:', error);
        if (error.name === 'NotAllowedError') {
            alert('Microphone access denied. Please enable microphone access in your browser settings to use the tuner.');
        } else {
            alert('Error accessing microphone. Please ensure your device has a working microphone and try again.');
        }
    }
}

function animate(timestamp) {
    if (!audioProcessor?.isInitialized) return;
    
    const elapsed = timestamp - lastFrameTime;
    
    if (elapsed >= FRAME_INTERVAL && !isHolding) {  // Only update if not holding
        const timeDomainData = audioProcessor.getTimeDomainData();
        const frequencyData = audioProcessor.getFrequencyData();
        
        if (timeDomainData && frequencyData) {
            // Calculate signal level with RMS and peak detection
            let sumSquares = 0;
            let peak = 0;
            for (let i = 0; i < timeDomainData.length; i++) {
                const value = timeDomainData[i];
                sumSquares += value * value;
                peak = Math.max(peak, Math.abs(value));
            }
            const rms = Math.sqrt(sumSquares / timeDomainData.length);
            const db = 20 * Math.log10(rms);
            
            const now = Date.now();
            
            // Use both RMS and peak for better silence detection
            if (db > SILENCE_THRESHOLD && peak > 0.01) {
                const pitchData = pitchDetector.detectPitch(timeDomainData, audioProcessor.getSampleRate());
                if (pitchData && pitchData.clarity > 0.8) {
                    lastValidPitchData = pitchData;
                    lastValidPitchTime = now;
                    updateDisplays(pitchData);
                }
            } else if (lastValidPitchData && (now - lastValidPitchTime) < DISPLAY_HOLD_TIME) {
                // Keep showing last valid pitch for the hold time
                updateDisplays(lastValidPitchData);
            } else {
                resetDisplays();
                lastValidPitchData = null;
            }
            
            // Update spectrum analyzer with smoother transitions
            requestAnimationFrame(() => {
                spectrumAnalyzer.draw(frequencyData, audioProcessor.getSampleRate());
            });
        }
        
        lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);
    }
    
    animationFrame = requestAnimationFrame(animate);
}

function updateDisplays(pitchData) {
    const noteDisplay = document.querySelector('.note-name');
    const freqDisplay = document.querySelector('.frequency-value');
    const centsDisplay = document.querySelector('.cents-display');
    const meterNeedle = document.querySelector('.meter-needle');
    const meterScale = document.querySelector('.meter-scale');
    
    // Update displays with data
    updateDisplayWithData(pitchData, noteDisplay, freqDisplay, centsDisplay, meterNeedle, meterScale);
}

function updateDisplayWithData(data, noteDisplay, freqDisplay, centsDisplay, meterNeedle, meterScale) {
    // Update note name with octave
    noteDisplay.textContent = `${data.note}${data.octave}`;
    
    // Update frequency with higher precision
    freqDisplay.textContent = data.frequency.toFixed(1);
    
    // Update cents
    const cents = data.cents;
    centsDisplay.textContent = `${cents >= 0 ? '+' : ''}${cents}¢`;
    
    // Calculate needle position for cents meter
    const meterWidth = meterScale.offsetWidth;
    const pixelsPerCent = meterWidth / 100;  // 100 cents total range (-50 to +50)
    const centerOffset = cents * pixelsPerCent;
    const centerPosition = meterWidth / 2;
    const needlePosition = centerPosition + centerOffset;
    
    // Update needle position using left
    meterNeedle.style.left = `${needlePosition}px`;
    
    // Update pitch position indicator
    const pitchIndicator = document.querySelector('.pitch-indicator');
    const pitchScale = document.querySelector('.pitch-scale');
    if (pitchIndicator && pitchScale) {
        // Calculate MIDI note number directly from frequency for smooth movement
        const midiNote = 12 * Math.log2(data.frequency / 440) + 69;  // A4 (440Hz) is MIDI note 69
        
        // Map MIDI note range (24-84, C1-C6) to position
        const minNote = 24;  // C1
        const maxNote = 84;  // C6
        const noteRange = maxNote - minNote;
        
        // Calculate position (0-100%)
        const position = ((midiNote - minNote) / noteRange) * 100;
        pitchIndicator.style.transform = 'translateX(-50%)';  // Keep centered on the line
        pitchIndicator.style.left = `${Math.max(0, Math.min(100, position))}%`;
        
        // Update color based on clarity
        const hue = Math.min(120, data.clarity * 120);  // 0-120 for red to green
        pitchIndicator.style.backgroundColor = `hsl(${hue}, 50%, 50%)`;
        pitchIndicator.style.boxShadow = `0 0 10px ${pitchIndicator.style.backgroundColor}`;
    }
    
    // Update colors based on tuning accuracy with smooth transitions
    const accuracy = Math.abs(cents);
    let color, shadowOpacity;
    
    if (accuracy <= 5) {
        // Green zone (±5 cents)
        color = '#4CAF50';
        shadowOpacity = Math.min(1, (5 - accuracy) / 5 + 0.3);
    } else if (accuracy <= 15) {
        // Amber zone (±15 cents)
        color = '#FFC107';
        shadowOpacity = Math.min(1, (15 - accuracy) / 10 + 0.3);
    } else {
        // Blue zone (>15 cents)
        color = '#4a9eff';
        shadowOpacity = Math.max(0.3, Math.min(1, 1 - (accuracy - 15) / 35));
    }
    
    // Apply smooth color transitions
    noteDisplay.style.transition = 'color 0.2s ease, text-shadow 0.2s ease';
    centsDisplay.style.transition = 'color 0.2s ease';
    
    noteDisplay.style.color = color;
    noteDisplay.style.textShadow = `0 0 10px ${color}${Math.round(shadowOpacity * 255).toString(16).padStart(2, '0')}`;
    centsDisplay.style.color = color;
    
    // Add visual feedback for perfect tune
    if (accuracy <= 2) {
        noteDisplay.classList.add('perfect-tune');
    } else {
        noteDisplay.classList.remove('perfect-tune');
    }
}

function toggleAudio() {
    const button = document.getElementById('startButton');
    if (!button) return;
    
    if (!audioProcessor?.isInitialized) {
        initializeAudio();
    } else {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        if (audioProcessor) {
            audioProcessor.suspend();
            audioProcessor = null;
        }
        button.textContent = 'Start';
        button.classList.remove('active');
        resetDisplays();
    }
}

function showCalibrationDialog() {
    const currentA4 = pitchDetector.getA4();
    const newFreq = prompt(`Enter new frequency for A4 (current: ${currentA4} Hz):`, currentA4);
    
    if (newFreq !== null) {
        const freq = parseFloat(newFreq);
        if (!isNaN(freq) && freq > 400 && freq < 500) {
            pitchDetector.setA4(freq);
            SETTINGS.referencePitch = freq;
            document.getElementById('calibrateButton').textContent = `A₄ = ${freq} Hz`;
        } else {
            alert('Please enter a valid frequency between 400 and 500 Hz');
        }
    }
}

function updateFilterMode(mode) {
    const range = FILTER_RANGES[mode];
    if (range) {
        SETTINGS.filterMode = mode;
        
        const settings = {
            minFreq: range.min,
            maxFreq: range.max,
            clarityThreshold: range.clarityThreshold || 0.93,
            temporalWindow: range.temporalWindow || 2
        };
        
        pitchDetector.updateSettings(settings);
        audioProcessor?.setVoiceMode(mode === 'voice');
    }
}

function toggleHold() {
    isHolding = !isHolding;
    const holdButton = document.getElementById('holdButton');
    holdButton.classList.toggle('active', isHolding);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeVisualizations);
} else {
    initializeVisualizations();
}

// Add event listeners
function initializeEventListeners() {
    const startButton = document.getElementById('startButton');
    const calibrateButton = document.getElementById('calibrateButton');
    const holdButton = document.getElementById('holdButton');
    const filterButtons = document.querySelectorAll('.filter-button');
    const peakLabelButtons = document.querySelectorAll('.peak-label-button');
    
    if (startButton) {
        startButton.addEventListener('click', toggleAudio);
    }
    if (calibrateButton) {
        calibrateButton.addEventListener('click', showCalibrationDialog);
    }
    if (holdButton) {
        holdButton.addEventListener('click', toggleHold);
    }
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.dataset.mode;
            updateFilterMode(mode);
            filterButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
        });
    });

    peakLabelButtons.forEach(button => {
        button.addEventListener('click', () => {
            const labelCount = parseInt(button.dataset.labels);
            spectrumAnalyzer.setLabelCount(labelCount);
            peakLabelButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
        });
    });
}

// Initialize event listeners when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEventListeners);
} else {
    initializeEventListeners();
} 