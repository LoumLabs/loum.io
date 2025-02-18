// Constants
const NASA_API_URL = 'https://api.nasa.gov/planetary/apod';
const PROXY_URL = '/.netlify/functions/nasa-proxy';
const STATIC_IMAGES = {
    aurora: 'https://apod.nasa.gov/apod/image/2502/BirdAurora_Coulon_2581.jpg',
    sunset: 'https://apod.nasa.gov/apod/image/2502/IMG_0340-Internet-2.jpg'
};

// Global state
let audioContext = null;
let synth = null;
let effects = null;
let isPlaying = false;
let scanPosition = { x: 0, y: 0 };
let scanDirection = { x: 1, y: 1 };
let scanInterval = null;
let lastAnalysis = null;
let scanOverlayContext = null;

// Initialize audio
async function initAudio() {
    if (audioContext) return;
    
    try {
        // Resume audio context on mobile
        if (Tone.context.state !== 'running') {
            await Tone.context.resume();
        }
        await Tone.start();
        console.log("Audio context started, state:", Tone.context.state);
        
        // Create synth
        synth = new Tone.MonoSynth({
            oscillator: {
                type: "sawtooth8" // More harmonics
            },
            envelope: {
                attack: 0.005,
                decay: 0.1,
                sustain: 0.3,
                release: 0.1
            },
            filterEnvelope: {
                attack: 0.005,
                decay: 0.2,
                sustain: 0.3,
                release: 0.2,
                baseFrequency: 200,
                octaves: 4,
                exponent: 2
            },
            volume: -6 // Increased volume
        }).toDestination();
        
        // Create effects
        effects = {
            filter: new Tone.Filter({
                type: "lowpass",
                frequency: 2000,
                rolloff: -12, // Less steep rolloff
                Q: 2
            }),
            delay: new Tone.PingPongDelay({
                delayTime: "8n",
                feedback: 0.4,
                wet: 0.3
            }),
            reverb: new Tone.Reverb({
                decay: 3,
                wet: 0.3
            }),
            limiter: new Tone.Limiter({
                threshold: -1,
                release: 0.1
            }).toDestination()
        };
        
        // Connect effects chain with limiter at the end
        synth.disconnect();
        synth.chain(
            effects.filter, 
            effects.delay, 
            effects.reverb, 
            effects.limiter, 
            Tone.Destination
        );
        
        console.log("Audio initialization complete");
        return true;
        
    } catch (error) {
        console.error("Failed to initialize audio:", error);
        return false;
    }
}

// Analyze image
function analyzeImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Analyze the entire image first for overall parameters
    let totalBrightness = 0;
    let totalContrast = 0;
    let totalColorfulness = 0;
    let pixels = 0;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        const brightness = (r + g + b) / (3 * 255);
        totalBrightness += brightness;
        
        const contrast = Math.abs(brightness - 0.5);
        totalContrast += contrast;
        
        const mean = (r + g + b) / 3;
        const colorfulness = Math.sqrt(
            ((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3
        ) / 255;
        totalColorfulness += colorfulness;
        
        pixels++;
    }
    
    lastAnalysis = {
        brightness: totalBrightness / pixels,
        contrast: totalContrast / pixels,
        colorfulness: totalColorfulness / pixels,
        width: canvas.width,
        height: canvas.height,
        imageData: imageData
    };
    
    console.log('Image analysis:', lastAnalysis);
    
    if (isPlaying) {
        stopSound();
        startSoundWithCheck();
    }
}

// Analyze a vertical slice of the image at specific coordinates
function analyzePixelArea(x, y, radius = 10) {
    if (!lastAnalysis || !lastAnalysis.imageData) return null;
    
    const { imageData, width, height } = lastAnalysis;
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    
    let totalRed = 0;
    let totalGreen = 0;
    let totalBlue = 0;
    let pixelCount = 0;
    
    // Sample pixels in area around coordinates
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const px = Math.max(0, Math.min(width - 1, x + dx));
            const py = Math.max(0, Math.min(height - 1, y + dy));
            
            const i = (py * width + px) * 4;
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            
            totalRed += r;
            totalGreen += g;
            totalBlue += b;
            pixelCount++;
        }
    }
    
    return {
        brightness: (totalRed + totalGreen + totalBlue) / (pixelCount * 3 * 255),
        colorBalance: {
            red: totalRed / (pixelCount * 255),
            green: totalGreen / (pixelCount * 255),
            blue: totalBlue / (pixelCount * 255)
        }
    };
}

// Initialize scan overlay
function initScanOverlay() {
    const canvas = document.getElementById('scan-overlay');
    const img = document.getElementById('apod-image');
    
    // Update canvas size to match image
    function updateCanvasSize() {
        const rect = img.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        scanOverlayContext = canvas.getContext('2d');
    }
    
    // Update canvas size when image loads or window resizes
    img.addEventListener('load', updateCanvasSize);
    window.addEventListener('resize', updateCanvasSize);
    updateCanvasSize();
}

// Draw scan line
function drawScanLine() {
    if (!scanOverlayContext || !lastAnalysis || !isPlaying) return;
    
    const canvas = scanOverlayContext.canvas;
    scanOverlayContext.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate actual position based on image dimensions and canvas size
    const x = (scanPosition.x / lastAnalysis.width) * canvas.width;
    const y = (scanPosition.y / lastAnalysis.height) * canvas.height;
    
    // Draw vertical scan line
    scanOverlayContext.beginPath();
    scanOverlayContext.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    scanOverlayContext.lineWidth = 2;
    scanOverlayContext.moveTo(x, 0);
    scanOverlayContext.lineTo(x, canvas.height);
    scanOverlayContext.stroke();
    
    // Draw small circle at current scan position
    scanOverlayContext.beginPath();
    scanOverlayContext.fillStyle = 'rgba(255, 255, 255, 0.5)';
    scanOverlayContext.arc(x, y, 4, 0, Math.PI * 2);
    scanOverlayContext.fill();
}

// Start sound generation
async function startSound() {
    if (!lastAnalysis) {
        console.warn("No image analysis available");
        return;
    }
    
    if (isPlaying) {
        stopSound();
    }
    
    console.log("Starting sound generation...");
    
    // Ensure transport is stopped
    Tone.Transport.stop();
    Tone.Transport.cancel();
    
    isPlaying = true;
    
    // Analyze initial area
    const initialAnalysis = analyzePixelArea(0, 0);
    if (!initialAnalysis) return;
    
    // Set initial BPM based on overall brightness and contrast
    const baseBPM = 60; // Slowest BPM
    const maxBPMIncrease = 80; // Maximum BPM increase
    const bpm = baseBPM + (lastAnalysis.brightness * maxBPMIncrease) + (lastAnalysis.contrast * maxBPMIncrease * 0.5);
    Tone.Transport.bpm.value = bpm;
    
    // Choose chord based on overall image analysis
    const { brightness, contrast, colorfulness } = lastAnalysis;
    const baseNote = Math.floor(brightness * 12) + 48; // C3 to B3
    
    // Create chord based on color balance
    const chord = [
        baseNote,
        baseNote + (colorfulness < 0.3 ? 3 : 4), // minor or major third
        baseNote + 7  // perfect fifth
    ].map(midi => Tone.Frequency(midi, "midi").toNote());
    
    console.log("Selected chord:", chord);
    
    // Set up arpeggiator pattern
    let noteIndex = 0;
    let lastAnalyzedArea = null;
    let currentChord = [];
    
    function updateCurrentChord(brightness) {
        // Adjust brightness curve to be more sensitive in dark range
        const adjustedBrightness = Math.pow(brightness * 2, 1.5); // Amplify and curve the brightness
        console.log(`Raw brightness: ${brightness.toFixed(2)}, Adjusted: ${adjustedBrightness.toFixed(2)}`);
        
        // Very dark areas (space)
        if (adjustedBrightness < 0.2) {
            currentChord = chord.map(note => Tone.Frequency(note).transpose(-12).toNote());
        } else {
            // Start with base octave
            currentChord = [...chord];
            
            // Add higher octave even with slight brightness (nebula)
            if (adjustedBrightness > 0.2) {
                const octaveUp = chord.map(note => Tone.Frequency(note).transpose(12).toNote());
                // Interleave the octaves for more interesting patterns
                currentChord = chord.reduce((acc, note, i) => {
                    acc.push(note, octaveUp[i]);
                    return acc;
                }, []);
                
                // Add second octave for bright spots (stars and bright nebula)
                if (adjustedBrightness > 0.4) {
                    const twoOctavesUp = chord.map(note => Tone.Frequency(note).transpose(24).toNote());
                    // Add highest notes at end of pattern
                    currentChord = currentChord.concat(twoOctavesUp);
                }
            }
        }
        
        console.log(`Adjusted Brightness: ${adjustedBrightness.toFixed(2)}, Notes: ${currentChord.length}, Pattern length: ${currentChord.length}`);
    }
    
    const loop = new Tone.Loop(time => {
        if (lastAnalyzedArea) {
            const { brightness, colorBalance } = lastAnalyzedArea;
            
            // Update available notes based on brightness
            updateCurrentChord(brightness);
            
            // Get next note from current chord
            const note = currentChord[noteIndex % currentChord.length];
            
            // More dramatic velocity changes
            const positionInChord = (noteIndex % currentChord.length) / currentChord.length;
            const octavePosition = Math.floor((noteIndex % currentChord.length) / chord.length);
            const octaveAttenuation = octavePosition * 0.1;
            
            // More dramatic velocity response to brightness
            const velocityBrightness = Math.pow(brightness * 2, 1.5); // Same curve as pattern
            const velocity = Math.min(1, 0.3 + (velocityBrightness * 0.7) + (1 - positionInChord * 0.2) - octaveAttenuation);
            
            // Faster notes in brighter areas
            const noteDuration = velocityBrightness > 0.3 ? "32n" : "16n";
            
            // More dramatic filter envelope in brighter areas
            const envAmount = Math.max(1, 1 + colorBalance.red * 4);
            synth.filterEnvelope.amount = envAmount;
            
            // Vary attack and release more dramatically
            const quickAttack = 0.005 + (colorBalance.blue * 0.02);
            const quickRelease = 0.05 + (colorBalance.green * 0.15);
            synth.envelope.attack = quickAttack;
            synth.envelope.release = quickRelease;
            
            synth.triggerAttackRelease(note, noteDuration, time, velocity);
        } else {
            const note = chord[noteIndex % chord.length];
            synth.triggerAttackRelease(note, "16n", time, 0.7);
        }
        
        noteIndex++;
    }, "16n").start(0);
    
    // Start scanning process
    const scanSpeed = {
        x: 2000,    // 2 seconds per horizontal step
        y: 16       // Back to slower scanning
    };
    
    scanPosition = { x: 0, y: 0 };
    scanDirection = { x: 1, y: 1 };
    
    let verticalScanCount = 0;
    const verticalScansBeforeHorizontalMove = 3; // More scans before moving horizontally
    const stepsPerVerticalScan = 40; // More steps for smoother movement
    let currentVerticalStep = 0;
    
    scanInterval = setInterval(() => {
        if (!isPlaying) return;
        
        const analysis = analyzePixelArea(scanPosition.x, scanPosition.y);
        if (analysis) {
            lastAnalyzedArea = analysis; // Store for arpeggiator
            const { brightness, colorBalance } = analysis;
            
            // More stable filter frequency
            const verticalPos = scanPosition.y / lastAnalysis.height;
            const brightnessCurve = Math.pow(brightness, 1.2); // Very gentle curve
            const filterFreq = Math.max(300, 300 + (brightnessCurve * 4000) * (1 + verticalPos * 0.5)); // Less range, higher base
            effects.filter.frequency.rampTo(filterFreq, 0.2); // Even slower ramp
            
            // Minimal resonance changes
            const movement = Math.abs(currentVerticalStep / stepsPerVerticalScan - 0.5);
            const freqNormalized = (filterFreq - 300) / 4000;
            const maxResonance = 1 + (freqNormalized * 1.5);
            effects.filter.Q.rampTo(Math.max(1, Math.min(maxResonance, 1.2 + movement)), 0.2);
            
            // Minimal detune
            const detuneAmount = movement * 5 - 2.5; // Very subtle detuning
            synth.detune.rampTo(detuneAmount, 0.2);
            
            // Stable envelope times
            const envTime = 0.02 + movement * 0.03; // More consistent times
            synth.envelope.attack = envTime;
            synth.envelope.decay = envTime * 1.5;
            synth.filterEnvelope.attack = envTime;
            synth.filterEnvelope.decay = envTime * 2;
            
            // Gentler filter envelope
            synth.filterEnvelope.baseFrequency = Math.max(300, 300 + brightness * 1500);
            synth.filterEnvelope.octaves = Math.max(1, 1 + brightness * 2);
            
            // More stable delay settings
            const delayTime = Tone.Time("8n").toSeconds() * (0.8 + movement * 0.2); // Very little variation
            effects.delay.delayTime.rampTo(delayTime, 0.3);
            
            // Increased reverb, reduced delay
            effects.delay.feedback.rampTo(Math.min(0.25, 0.1 + colorBalance.blue * 0.15), 0.3);
            effects.delay.wet.rampTo(Math.min(0.2, 0.1 + colorBalance.green * 0.1), 0.3);
            effects.reverb.wet.rampTo(Math.min(0.4, 0.2 + colorBalance.red * 0.2), 0.3); // More reverb
            
            // Draw scan line
            drawScanLine();
            
            // Calculate vertical movement
            currentVerticalStep++;
            if (currentVerticalStep >= stepsPerVerticalScan) {
                currentVerticalStep = 0;
                scanDirection.y *= -1;
                
                if (scanDirection.y === 1) {
                    verticalScanCount++;
                    
                    if (verticalScanCount >= verticalScansBeforeHorizontalMove) {
                        verticalScanCount = 0;
                        scanPosition.x += scanDirection.x * 3; // Slower horizontal movement
                        
                        if (scanPosition.x >= lastAnalysis.width || scanPosition.x < 0) {
                            scanDirection.x *= -1;
                            scanPosition.x = Math.max(0, Math.min(scanPosition.x, lastAnalysis.width - 1));
                        }
                    }
                }
            }
            
            // Smoother vertical movement
            const progress = currentVerticalStep / stepsPerVerticalScan;
            const sinValue = Math.sin(progress * Math.PI);
            scanPosition.y = Math.floor((lastAnalysis.height - 1) * (scanDirection.y === 1 ? sinValue : 1 - sinValue));
        }
    }, scanSpeed.y);
    
    // Start transport
    Tone.Transport.start();
}

// Stop sound generation
function stopSound() {
    console.log("Stopping sound...");
    isPlaying = false;
    
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
    
    Tone.Transport.stop();
    Tone.Transport.cancel();
    
    if (synth) {
        synth.triggerRelease();
    }
}

// Start sound only after initialization
async function startSoundWithCheck() {
    if (!await initAudio()) {
        console.error("Failed to initialize audio");
        return;
    }
    await startSound();
}

// Fetch APOD data from NASA API
async function fetchAPOD() {
    const img = document.getElementById('apod-image');
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');
    const imageSource = document.getElementById('image-source');
    
    if (!loading || !errorMessage || !img || !imageSource) {
        console.error('Required UI elements not found');
        return;
    }
    
    try {
        loading.style.display = 'block';
        errorMessage.style.display = 'none';
        img.style.display = 'none';
        
        let imageUrl;
        let imageData = null;
        
        // Handle different image sources
        if (imageSource.value === 'apod') {
            console.log('Fetching APOD data...');
            
            // Proxy the API request through our Netlify function
            const response = await fetch(`${PROXY_URL}?url=${encodeURIComponent(NASA_API_URL)}`);
            imageData = await response.json();
            
            if (!response.ok || imageData.error) {
                throw new Error(imageData.error || 'Failed to fetch APOD data');
            }
            
            if (!imageData.media_type || imageData.media_type !== 'image') {
                throw new Error('Invalid or unsupported media type received');
            }
            
            imageUrl = imageData.url;
        } else {
            // Use static image
            imageUrl = STATIC_IMAGES[imageSource.value];
            console.log('Using static image:', imageSource.value);
        }
        
        // Set up the image
        img.crossOrigin = 'Anonymous';
        img.style.opacity = '0';
        img.style.transition = 'opacity 1s ease-in-out';
        
        // Proxy the image through our Netlify function
        const proxiedUrl = `${PROXY_URL}?url=${encodeURIComponent(imageUrl)}`;
        img.src = proxiedUrl;
        
        // Wait for image to load before analyzing
        await new Promise((resolve, reject) => {
            img.onload = () => {
                img.style.display = 'block';
                setTimeout(() => {
                    img.style.opacity = '1';
                }, 100);
                loading.style.display = 'none';
                resolve();
            };
            img.onerror = () => reject(new Error('Failed to load image'));
        });
        
        // Update info if we have APOD data
        if (imageData) {
            const title = document.getElementById('apod-title');
            const explanation = document.getElementById('apod-explanation');
            const dateElement = document.getElementById('apod-date');
            const copyright = document.getElementById('apod-copyright');
            
            if (title && explanation && dateElement) {
                title.textContent = imageData.title || 'NASA APOD';
                explanation.textContent = imageData.explanation || '';
                dateElement.textContent = imageData.date || '';
                
                if (copyright && imageData.copyright) {
                    copyright.textContent = `Copyright: ${imageData.copyright.trim()}`;
                }
            }
        }
        
        // Analyze the loaded image
        analyzeImage(img);
        
    } catch (error) {
        console.error('Error:', error);
        loading.style.display = 'none';
        errorMessage.style.display = 'block';
        errorMessage.textContent = error.message;
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements
    const playButton = document.getElementById('play-btn');
    const infoButton = document.getElementById('info-btn');
    const infoPanel = document.querySelector('.image-info');
    const imageSource = document.getElementById('image-source');
    const img = document.getElementById('apod-image');
    
    if (!playButton || !infoButton || !infoPanel || !imageSource || !img) {
        console.error('Required UI elements not found');
        return;
    }

    // Toggle window-filling view
    function toggleExpanded() {
        img.classList.toggle('expanded');
        // Ensure info panel is hidden when expanded
        if (img.classList.contains('expanded')) {
            infoPanel.classList.remove('show');
        }
    }

    // Add click handler for expanding
    img.addEventListener('click', toggleExpanded);
    
    // Handle escape key to exit expanded view
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && img.classList.contains('expanded')) {
            toggleExpanded();
        }
    });

    playButton.addEventListener('click', async () => {
        try {
            // Always try to resume the audio context first
            if (Tone.context.state !== 'running') {
                await Tone.context.resume();
            }
            
            // Initialize audio if needed
            if (!audioContext) {
                await initAudio();
            }
            
            // Toggle play state
            if (isPlaying) {
                stopSound();
                document.getElementById('play-btn').textContent = 'Play sound';
            } else {
                await startSoundWithCheck();
                document.getElementById('play-btn').textContent = 'Stop sound';
            }
        } catch (error) {
            console.error('Error starting sound:', error);
        }
    });

    infoButton.addEventListener('click', () => {
        infoPanel.classList.toggle('show');
    });
    
    imageSource.addEventListener('change', () => {
        if (isPlaying) {
            stopSound();
            playButton.textContent = 'Play sound';
        }
        fetchAPOD();
    });
    
    // Initialize scan overlay
    initScanOverlay();
    
    // Load today's image
    fetchAPOD();
});
