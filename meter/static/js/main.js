let audioProcessor = null;
let vuMeter = null;
let spectrumAnalyzer = null;
let spectrogram = null;
let currentView = 'spectrum'; // 'spectrum' or 'spectrogram'
let animationFrame = null;
let isInitialized = false;
let lastFrameTime = 0;
const TARGET_FRAME_RATE = 60;
const FRAME_INTERVAL = 1000 / TARGET_FRAME_RATE;

// Initialize visualizations immediately
function initializeVisualizations() {
    const vuCanvas = document.getElementById('vuMeter');
    const spectrumCanvas = document.getElementById('spectrum');
    const spectrogramCanvas = document.getElementById('spectrogram');
    
    if (!vuCanvas || !spectrumCanvas || !spectrogramCanvas) {
        console.error('Required canvas elements not found');
        return;
    }
    
    // Initialize VU meter
    vuMeter = new VUMeter(vuCanvas);
    spectrumAnalyzer = new SpectrumAnalyzer(spectrumCanvas);
    spectrogram = new Spectrogram(spectrogramCanvas);
    
    // Show initial view
    updateView(currentView);
    
    // Draw initial state
    requestAnimationFrame(() => {
        // Draw VU meter with zero input
        vuMeter.draw(new Float32Array(2048).fill(0));
        
        // Draw spectrum analyzer with minimum values
        spectrumAnalyzer.draw(new Float32Array(1024).fill(-90));
        
        // Draw spectrogram with minimum values
        spectrogram.draw(new Float32Array(1024).fill(-90));
    });
    
    isInitialized = true;
}

async function initializeAudio() {
    if (!isInitialized) {
        initializeVisualizations();
    }
    
    try {
        // Initialize audio processor
        audioProcessor = new AudioProcessor();
        await audioProcessor.initialize();
        
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
        // Get both time domain and frequency data
        const timeDomainData = audioProcessor.getTimeDomainData();
        const frequencyData = audioProcessor.getFrequencyData();
        
        if (timeDomainData && frequencyData) {
            // Update VU meter with time domain data
            vuMeter?.draw(timeDomainData);
            
            // Update current view with frequency data
            if (currentView === 'spectrum' && spectrumAnalyzer) {
                spectrumAnalyzer.draw(frequencyData);
            } else if (spectrogram) {
                spectrogram.draw(frequencyData);
            }
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
        
        // Draw static state when stopped
        requestAnimationFrame(() => {
            vuMeter?.draw(new Float32Array(2048).fill(0));
            spectrumAnalyzer?.draw(new Float32Array(1024).fill(-90));
            spectrogram?.draw(new Float32Array(1024).fill(-90));
        });
    }
}

function updateView(view) {
    currentView = view;
    
    // Update canvas visibility
    const spectrumCanvas = document.getElementById('spectrum');
    const spectrogramCanvas = document.getElementById('spectrogram');
    const spectrumButton = document.getElementById('spectrumButton');
    const spectrogramButton = document.getElementById('spectrogramButton');
    
    if (!spectrumCanvas || !spectrogramCanvas || !spectrumButton || !spectrogramButton) return;
    
    requestAnimationFrame(() => {
        if (view === 'spectrum') {
            spectrumCanvas.classList.add('active');
            spectrogramCanvas.classList.remove('active');
        } else {
            spectrumCanvas.classList.remove('active');
            spectrogramCanvas.classList.add('active');
        }
        
        // Update button states
        spectrumButton.classList.toggle('active', view === 'spectrum');
        spectrogramButton.classList.toggle('active', view === 'spectrogram');
        
        // Trigger resize for the active visualization
        if (view === 'spectrum' && spectrumAnalyzer) {
            spectrumAnalyzer.handleResize();
        } else if (view === 'spectrogram' && spectrogram) {
            spectrogram.handleResize();
        }
    });
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
    const spectrumButton = document.getElementById('spectrumButton');
    const spectrogramButton = document.getElementById('spectrogramButton');
    
    if (startButton) {
        startButton.addEventListener('click', toggleAudio);
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