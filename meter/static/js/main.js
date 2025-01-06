let audioProcessor = null;
let animationFrame = null;
let isInitialized = false;
let lastFrameTime = 0;
let isHolding = false;
let allTimePeakSPL = 0;  // Track all-time peak
let spectrumAnalyzer = null;
let spectrogram = null;
let vuMeter = null;
let heldValues = {
    current: 0,
    peak: 0,
    avg: 0,
    frequencyData: null,
    timeDomainData: null
};

// Add circular buffer for recent frames
const FRAME_BUFFER_SIZE = 3;  // Store last 3 frames
const recentFrames = Array(FRAME_BUFFER_SIZE).fill(null).map(() => ({
    current: 0,
    peak: 0,
    avg: 0,
    frequencyData: null,
    timeDomainData: null
}));
let frameBufferIndex = 0;

const TARGET_FRAME_RATE = 30;  // Reduced for smoother updates
const FRAME_INTERVAL = 1000 / TARGET_FRAME_RATE;

// Initialize visualizations immediately
function initializeVisualizations() {
    const spectrumCanvas = document.getElementById('spectrum');
    const spectrogramCanvas = document.getElementById('spectrogram');
    const vuMeterCanvas = document.getElementById('vuMeter');
    
    if (!spectrumCanvas || !spectrogramCanvas || !vuMeterCanvas) {
        console.error('Required canvas elements not found');
        return;
    }
    
    // Initialize analyzers
    spectrumAnalyzer = new SpectrumAnalyzer(spectrumCanvas);
    spectrogram = new Spectrogram('spectrogram');
    vuMeter = new VUMeter(vuMeterCanvas);
    
    // Show initial view
    updateView(currentView);
    
    // Draw initial state
    requestAnimationFrame(() => {
        // Create initial data array
        const initialData = new Float32Array(1024).fill(-90);
        
        // Draw spectrum analyzer with minimum values
        spectrumAnalyzer.draw(initialData);
        
        // Draw spectrogram with minimum values
        spectrogram.draw(initialData);
        
        // Set initial display values to 0
        document.getElementById('currentValue').textContent = '0';
        document.getElementById('peakValue').textContent = '0';
        document.getElementById('avgValue').textContent = '0';
        
        // Reset meter bar
        const meterFill = document.querySelector('.meter-fill');
        if (meterFill) {
            meterFill.style.width = '0%';
        }
    });
    
    isInitialized = true;
}

// Running average buffers with longer periods for smoother display
const avgBuffer = new Array(60).fill(-90);  // Keep long buffer for true average
const peakBuffer = new Array(30).fill(-90);  // Keep moderate buffer for peak
const currentBuffer = new Array(8).fill(-90);  // Reduced from 15 for faster response
let avgIndex = 0;
let peakIndex = 0;
let currentIndex = 0;
let lastDisplayUpdate = 0;
const DISPLAY_UPDATE_INTERVAL = 100;  // Update display more frequently (was 150ms)

function calculateRunningAverage(buffer, newValue, index) {
    buffer[index] = newValue;
    return buffer.reduce((a, b) => a + b) / buffer.length;
}

function updateMeterDisplay(current, peak, avg) {
    const now = performance.now();
    
    // Update meter bar every frame for smooth movement
    const meterFill = document.querySelector('.meter-fill');
    if (meterFill) {
        // Map SPL range (30-120 dB) to percentage
        const minSPL = 30;  // Quiet room
        const maxSPL = 120; // Loud sound
        const percentage = Math.min(100, Math.max(0, ((current - minSPL) / (maxSPL - minSPL)) * 100));
        meterFill.style.width = `${percentage}%`;
    }
    
    // If holding, use held values for display
    if (isHolding && heldValues.current) {
        document.getElementById('currentValue').textContent = heldValues.current;
        document.getElementById('peakValue').textContent = heldValues.peak;
        document.getElementById('avgValue').textContent = heldValues.avg;
        return;
    }
    
    // If not initialized or audio is stopped, show zeros
    if (!audioProcessor?.isInitialized) {
        document.getElementById('currentValue').textContent = '0';
        document.getElementById('peakValue').textContent = '0';
        document.getElementById('avgValue').textContent = '0';
        return;
    }
    
    // Update digital display at a slower rate
    if (now - lastDisplayUpdate > DISPLAY_UPDATE_INTERVAL) {
        // Calculate smoothed values with longer buffers
        const smoothedCurrent = calculateRunningAverage(currentBuffer, current, currentIndex);
        const smoothedPeak = calculateRunningAverage(peakBuffer, peak, peakIndex);
        const smoothedAvg = calculateRunningAverage(avgBuffer, avg, avgIndex);
        
        // Update indices
        currentIndex = (currentIndex + 1) % currentBuffer.length;
        peakIndex = (peakIndex + 1) % peakBuffer.length;
        avgIndex = (avgIndex + 1) % avgBuffer.length;
        
        // Round SPL values to whole numbers and ensure they're not negative
        const currentSPL = Math.max(0, Math.round(smoothedCurrent));
        const peakSPL = Math.max(0, Math.round(smoothedPeak));
        const avgSPL = Math.max(0, Math.round(smoothedAvg));
        
        // Update all-time peak
        allTimePeakSPL = Math.max(allTimePeakSPL, currentSPL);
        
        // Update display
        document.getElementById('currentValue').textContent = currentSPL.toString();
        document.getElementById('peakValue').textContent = allTimePeakSPL.toString();
        document.getElementById('avgValue').textContent = avgSPL.toString();
        
        lastDisplayUpdate = now;
    }
}

function toggleHold() {
    const holdButton = document.getElementById('holdButton');
    isHolding = !isHolding;
    
    if (isHolding) {
        // Get the frame from two positions back in the circular buffer to avoid the button press
        const holdFrameIndex = (frameBufferIndex - 2 + FRAME_BUFFER_SIZE) % FRAME_BUFFER_SIZE;
        const holdFrame = recentFrames[holdFrameIndex];
        
        if (holdFrame && holdFrame.frequencyData) {
            // Store the actual values that were displayed
            heldValues = {
                current: document.getElementById('currentValue').textContent,
                peak: document.getElementById('peakValue').textContent,
                avg: document.getElementById('avgValue').textContent,
                frequencyData: new Float32Array(holdFrame.frequencyData),
                timeDomainData: new Float32Array(holdFrame.timeDomainData)
            };
        }
        
        holdButton.classList.add('active');
    } else {
        holdButton.classList.remove('active');
        heldValues.frequencyData = null;
        heldValues.timeDomainData = null;
    }
}

async function initializeAudio() {
    if (!isInitialized) {
        initializeVisualizations();
    }
    
    try {
        // Initialize audio processor
        audioProcessor = new AudioProcessor();
        await audioProcessor.initialize();
        
        // Resume audio context (this is needed for audio to flow)
        await audioProcessor.audioContext.resume();
        
        // Start animation loop
        animate();
        
        // Update UI
        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.textContent = 'Stop';
        }
    } catch (error) {
        console.error('Error initializing audio:', error);
        alert('Error accessing microphone. Please ensure microphone permissions are granted.');
    }
}

function animate(timestamp) {
    if (!audioProcessor?.isInitialized) return;
    
    // Calculate time since last frame
    const elapsed = timestamp - lastFrameTime;
    
    // Only update if enough time has passed
    if (elapsed >= FRAME_INTERVAL) {
        // Get data from either live input or held values
        let timeDomainData, frequencyData;
        let currentLevel = 30; // Default to quiet room level
        
        if (isHolding && heldValues.frequencyData) {
            timeDomainData = heldValues.timeDomainData;
            frequencyData = heldValues.frequencyData;
            currentLevel = parseFloat(heldValues.current);
        } else {
            timeDomainData = audioProcessor.getTimeDomainData();
            frequencyData = audioProcessor.getFrequencyData();
            
            // Get SPL from VU meter
            if (timeDomainData) {
                currentLevel = vuMeter.draw(timeDomainData);
            }
            
            // Store current frame in circular buffer
            if (timeDomainData && frequencyData) {
                recentFrames[frameBufferIndex] = {
                    current: currentLevel.toString(),
                    peak: document.getElementById('peakValue').textContent,
                    avg: document.getElementById('avgValue').textContent,
                    frequencyData: new Float32Array(frequencyData),
                    timeDomainData: new Float32Array(timeDomainData)
                };
                frameBufferIndex = (frameBufferIndex + 1) % FRAME_BUFFER_SIZE;
            }
        }
        
        // Update meter display with the SPL values
        updateMeterDisplay(currentLevel, currentLevel, currentLevel);
        
        // Update visualizations with actual sample rate
        if (currentView === 'spectrum' && spectrumAnalyzer) {
            spectrumAnalyzer.draw(frequencyData, audioProcessor.sampleRate);
        } else if (spectrogram) {
            spectrogram.draw(frequencyData);
        }
        
        lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);
    }
    
    // Schedule next frame
    animationFrame = requestAnimationFrame(animate);
}

function toggleAudio() {
    const button = document.getElementById('startButton');
    if (!button) return;
    
    if (!audioProcessor?.isInitialized) {
        // Reset all-time peak when starting new session
        allTimePeakSPL = 0;
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
        
        // Reset displays to zero
        document.getElementById('currentValue').textContent = '0';
        document.getElementById('peakValue').textContent = '0';
        document.getElementById('avgValue').textContent = '0';
        
        // Reset meter bar
        const meterFill = document.querySelector('.meter-fill');
        if (meterFill) {
            meterFill.style.width = '0%';
        }
        
        // Reset visualizations with very low values to hide them
        spectrumAnalyzer?.draw(new Float32Array(1024).fill(-200));
        spectrogram?.draw(new Float32Array(1024).fill(-200));
    }
}

let currentView = 'spectrum';

function updateView(view) {
    const spectrumCanvas = document.getElementById('spectrum');
    const spectrogramCanvas = document.getElementById('spectrogram');
    const vuMeterCanvas = document.getElementById('vuMeter');
    const spectrumButton = document.getElementById('spectrumButton');
    const spectrogramButton = document.getElementById('spectrogramButton');
    
    // Remove active class from all canvases and buttons
    [spectrumCanvas, spectrogramCanvas, vuMeterCanvas].forEach(canvas => {
        if (canvas) canvas.classList.remove('active');
    });
    [spectrumButton, spectrogramButton].forEach(button => {
        if (button) button.classList.remove('active');
    });
    
    // Show selected view
    switch(view) {
        case 'spectrum':
            if (spectrumCanvas) spectrumCanvas.classList.add('active');
            if (spectrumButton) spectrumButton.classList.add('active');
            break;
        case 'spectrogram':
            if (spectrogramCanvas) spectrogramCanvas.classList.add('active');
            if (spectrogramButton) spectrogramButton.classList.add('active');
            break;
        case 'vuMeter':
            if (vuMeterCanvas) vuMeterCanvas.classList.add('active');
            break;
    }
    
    currentView = view;
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
    const holdButton = document.getElementById('holdButton');
    const spectrumButton = document.getElementById('spectrumButton');
    const spectrogramButton = document.getElementById('spectrogramButton');
    
    if (startButton) {
        startButton.addEventListener('click', toggleAudio);
    }
    if (holdButton) {
        holdButton.addEventListener('click', toggleHold);
    }
    if (spectrumButton) {
        spectrumButton.addEventListener('click', () => updateView('spectrum'));
    }
    if (spectrogramButton) {
        spectrogramButton.addEventListener('click', () => updateView('spectrogram'));
    }
}

// Initialize event listeners when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEventListeners);
} else {
    initializeEventListeners();
} 