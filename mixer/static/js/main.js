// Utility function to format time
const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Track collection
let tracks = [];

// Function to check if all required elements are present
function checkRequiredElements() {
    const requiredElements = {};
    let missingElements = [];

    // Check deck elements
    ['a', 'b'].forEach(deck => {
        requiredElements[`deck-${deck}`] = {
            container: document.getElementById(`deck-${deck}`),
            playPauseButton: document.getElementById(`play-pause-${deck}`),
            stopButton: document.getElementById(`stop-${deck}`),
            cueButton: document.getElementById(`cue-${deck}`),
            loopButton: document.getElementById(`loop-${deck}`),
            tempoMinus: document.getElementById(`tempo-minus-${deck}`),
            tempoPlus: document.getElementById(`tempo-plus-${deck}`),
            tempoValue: document.getElementById(`tempo-value-${deck}`),
            resetButton: document.getElementById(`reset-${deck}`),
            syncButton: document.getElementById(`sync-${deck}`),
            pitchUpBtn: document.getElementById(`pitch-up-${deck}`),
            pitchDownBtn: document.getElementById(`pitch-down-${deck}`),
            bpmDisplay: document.getElementById(`bpm-${deck}`),
            playhead: document.getElementById(`playhead-${deck}`)
        };

        // Check which elements are missing
        Object.entries(requiredElements[`deck-${deck}`]).forEach(([name, element]) => {
            if (!element) {
                missingElements.push(`${name} for deck ${deck}`);
            }
        });
    });

    // Check mixer elements
    const mixerElements = {
        crossfader: document.getElementById('crossfader'),
        crossfaderValue: document.getElementById('crossfader-value'),
        crossfaderCurve: document.getElementById('crossfader-curve'),
        addTracks: document.getElementById('add-tracks'),
        trackFileInput: document.getElementById('track-file-input')
    };

    Object.entries(mixerElements).forEach(([name, element]) => {
        if (!element) {
            missingElements.push(name);
        }
    });

    return {
        success: missingElements.length === 0,
        missingElements,
        elements: requiredElements
    };
}

// Function to get collection name from URL or window variable
function getCollectionName() {
    // Check for collection in window variable (set by index.html)
    if (window.mixerCollection) {
        return window.mixerCollection;
    }
    
    // Check URL hash (legacy method)
    const hash = window.location.hash.slice(1);
    if (hash) {
        return hash;
    }
    
    return null;
}

// Function to load collection config
async function loadCollectionConfig(collectionName) {
    try {
        if (!collectionName) return null;
        
        // Convert collection name to lowercase for case-insensitive handling
        const normalizedName = collectionName.toLowerCase();
        const configPath = `configs/${normalizedName}.json`;
            
        console.log('Fetching collection config:', configPath);
        const response = await fetch(configPath);
        if (!response.ok) {
            console.error('Failed to load collection config:', response.status, response.statusText);
            throw new Error(`Failed to load collection config: ${response.statusText}`);
        }
        const config = await response.json();
        console.log('Loaded config:', config);
        
        // Update collection info display
        const collectionInfo = document.querySelector('.collection-info');
        const collectionTitle = document.querySelector('.collection-title');
        const collectionArtist = document.querySelector('.collection-artist');
        const collectionArtwork = document.querySelector('.collection-artwork img');
        const collectionLink = document.querySelector('.collection-link');
        
        if (config.collection_info) {
            collectionTitle.textContent = config.collection_info.title;
            collectionArtist.textContent = config.collection_info.artist;
            if (config.collection_info.artwork) {
                collectionArtwork.src = config.collection_info.artwork;
                collectionArtwork.alt = `${config.collection_info.title} Artwork`;
            }
            if (config.collection_info.bandcamp_url) {
                collectionLink.href = config.collection_info.bandcamp_url;
            }
            collectionInfo.classList.add('visible');
        }
        
        return config;
    } catch (error) {
        console.error('Error loading collection config:', error);
        return null;
    }
}

// Function to load collection tracks
async function loadCollectionTracks(trackConfigs, addTrackToList, loadTrackToDeck, audioProcessor) {
    console.log('Loading collection tracks...');
    const trackList = document.getElementById('track-list');
    trackList.innerHTML = '<div class="track-item">Loading collection...</div>';
    
    // Clear existing tracks
    tracks.length = 0;
    
    // Create an array to store tracks in their original order
    const loadedTracks = new Array(trackConfigs.length).fill(null);
    
    // Load all tracks in parallel but maintain order
    await Promise.all(trackConfigs.map(async (trackConfig, index) => {
        try {
            console.log('Fetching track:', trackConfig.title);
            const response = await fetch(trackConfig.url);
            if (!response.ok) throw new Error(`Failed to load track: ${trackConfig.title}`);
            
            const blob = await response.blob();
            const file = new File([blob], trackConfig.title + '.mp3', { type: 'audio/mpeg' });
            
            // Initialize audio context if needed
            if (!audioProcessor.isInitialized) {
                await audioProcessor.initialize();
            }

            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioProcessor.audioContext.decodeAudioData(arrayBuffer);
            
            // Create track object with predefined BPM from config
            const track = {
                file,
                title: trackConfig.title,
                artist: 'Unknown',
                bpm: trackConfig.bpm,
                duration: audioBuffer.duration,
                buffer: audioBuffer
            };
            
            // Store track in its original position
            loadedTracks[index] = track;
            console.log('Track loaded:', track.title, 'BPM:', track.bpm);
        } catch (error) {
            console.error('Error loading track:', trackConfig.title, error);
        }
    }));
    
    // Add successfully loaded tracks to the tracks array in order
    tracks.push(...loadedTracks.filter(track => track !== null));
    
    // Update track list after all tracks are loaded
    trackList.innerHTML = '';
    tracks.forEach((track, index) => {
        const trackElement = document.createElement('div');
        trackElement.className = 'track-item';
        trackElement.draggable = true; // Make draggable
        
        const titleDiv = document.createElement('div');
        titleDiv.textContent = track.title;
        
        const bpmDiv = document.createElement('div');
        bpmDiv.textContent = track.bpm ? track.bpm.toFixed(1) : '--';
        
        const durationDiv = document.createElement('div');
        durationDiv.textContent = formatTime(track.duration);
        
        trackElement.appendChild(titleDiv);
        trackElement.appendChild(bpmDiv);
        trackElement.appendChild(durationDiv);
        
        // Add drag and drop handlers
        trackElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index.toString());
        });
        
        // Add double-click handler to load into first available deck
        trackElement.addEventListener('dblclick', () => {
            const deck = !audioProcessor.buffers.a ? 'a' : 
                       !audioProcessor.buffers.b ? 'b' : null;
            if (deck && loadTrackToDeck) loadTrackToDeck(track, deck);
        });
        
        trackList.appendChild(trackElement);
    });
}

// Track list functions
const addTrackToList = async (file, predefinedBPM = null) => {
    try {
        // Initialize audio context if needed
        if (!audioProcessor.isInitialized) {
            await audioProcessor.initialize();
        }

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioProcessor.audioContext.decodeAudioData(arrayBuffer);
        
        // Create track object with predefined BPM or detect if not provided
        const track = {
            file,
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: 'Unknown',
            duration: audioBuffer.duration,
            buffer: audioBuffer
        };

        // Only detect BPM if not predefined
        if (predefinedBPM !== null) {
            track.bpm = predefinedBPM;
            // We'll set the audioProcessor BPM when loading to deck
        } else {
            track.bpm = await audioProcessor.detectBPM(audioBuffer);
        }
        
        tracks.push(track);
        updateTrackList();
        return track;
    } catch (error) {
        console.error('Error adding track:', error);
        alert('Error adding track. Please ensure it\'s a valid audio file.');
        return null;
    }
};

function initializeMixer(audioProcessor) {
    const waveforms = {
        a: new Waveform('deck-a'),
        b: new Waveform('deck-b')
    };

    // Deck state variables
    const deckState = {
        a: { isPlaying: false, isPaused: false },
        b: { isPlaying: false, isPaused: false }
    };

    // Dial control handler
    const handleDial = (element, onChange) => {
        if (!element) return { setValue: () => {} };

        let isDragging = false;
        let startY;
        let startValue;
        let lastValue;  // Track last value for calculating actual change
        let currentValue = 50; // Start at center
        let sensitivity = 0.5; // Reduced sensitivity for finer control

        const setRotation = (value) => {
            const knob = element.querySelector('.dial-knob');
            const valueDisplay = element.querySelector('.dial-value');
            if (!knob || !valueDisplay) return;

            // Convert 0-100 to -150 to +150 degrees for better visual range
            const rotation = (value / 100) * 300 - 150;
            knob.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
            
            // Update value display
            if (element.id.startsWith('high-') || 
                element.id.startsWith('mid-') || 
                element.id.startsWith('low-')) {
                // For EQ, convert 0-100 to -12 to +12
                const eqValue = ((value / 100) * 24) - 12;
                valueDisplay.textContent = `${eqValue > 0 ? '+' : ''}${eqValue.toFixed(1)}`;
            } else if (element.id.startsWith('trim-')) {
                // For trim, let the callback handle the display
                // (since it gets the actual dB value from audioProcessor)
            } else {
                // For other controls, show percentage
                valueDisplay.textContent = `${Math.round(value)}`;
            }
        };

        const updateValue = (e) => {
            if (!isDragging) return;

            // Calculate value change based on vertical movement
            const deltaY = startY - e.clientY;
            const deltaValue = (deltaY * sensitivity);
            let newValue = Math.min(Math.max(startValue + deltaValue, 0), 100);
            
            // Add shift key modifier for fine control
            if (e.shiftKey) {
                newValue = startValue + (deltaValue * 0.2);
            }

            // Snap to center when close
            if (Math.abs(newValue - 50) < 2) {
                newValue = 50;
            }

            newValue = Math.min(Math.max(newValue, 0), 100);
            
            // Handle EQ mirroring when Alt/Option is pressed
            if ((element.id.startsWith('high-') || 
                 element.id.startsWith('mid-') || 
                 element.id.startsWith('low-')) && 
                (e.altKey || e.metaKey)) {
                
                // Only mirror if there's actual change from last value
                if (lastValue !== undefined && newValue !== lastValue) {
                    // Get the current deck and opposite deck
                    const currentDeck = element.id.endsWith('-a') ? 'a' : 'b';
                    const oppositeDeck = currentDeck === 'a' ? 'b' : 'a';
                    
                    // Get the EQ type (high, mid, low)
                    const eqType = element.id.split('-')[0];
                    
                    // Calculate the actual dB change
                    const lastDB = ((lastValue / 100) * 24) - 12;
                    const newDB = ((newValue / 100) * 24) - 12;
                    const dbChange = newDB - lastDB;
                    
                    // Get the opposite dial
                    const oppositeDial = document.getElementById(`${eqType}-${oppositeDeck}`);
                    if (oppositeDial) {
                        // Get current value of opposite dial directly in dB
                        const oppositeDisplay = oppositeDial.querySelector('.dial-value');
                        const oppositeCurrentDB = parseFloat(oppositeDisplay.textContent);
                        
                        // Calculate new opposite dB value by subtracting the same change
                        const oppositeNewDB = Math.round((oppositeCurrentDB - dbChange) * 10) / 10;
                        
                        // Clamp to -12 to +12 dB range
                        const clampedDB = Math.max(-12, Math.min(12, oppositeNewDB));
                        
                        // Convert back to 0-100 scale for the dial rotation
                        const oppositeNewValue = ((clampedDB + 12) / 24) * 100;
                        
                        // Update opposite dial
                        const oppositeKnob = oppositeDial.querySelector('.dial-knob');
                        if (oppositeKnob && oppositeDisplay) {
                            const oppositeRotation = (oppositeNewValue / 100) * 300 - 150;
                            oppositeKnob.style.transform = `translateX(-50%) rotate(${oppositeRotation}deg)`;
                            oppositeDisplay.textContent = `${clampedDB > 0 ? '+' : ''}${clampedDB.toFixed(1)}`;
                            
                            // Update the audio processor with the exact dB value
                            audioProcessor.setEQ(oppositeDeck, eqType, clampedDB);
                        }
                    }
                }
            }
            
            // Update last value for next comparison
            lastValue = newValue;
            currentValue = newValue;
            
            setRotation(newValue);
            
            // Convert value range for EQ
            if (element.id.startsWith('high-') || 
                element.id.startsWith('mid-') || 
                element.id.startsWith('low-')) {
                const eqValue = ((newValue / 100) * 24) - 12;
                onChange(eqValue);
            } else {
                onChange(newValue);
            }
        };

        // Mouse controls
        element.addEventListener('mousedown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startValue = currentValue;
            lastValue = currentValue;  // Initialize lastValue on mousedown
            document.body.style.cursor = 'ns-resize';
            element.classList.add('active');
            
            // Prevent text selection while dragging
            e.preventDefault();
        });

        // Double click to reset to center
        element.addEventListener('dblclick', (e) => {
            if ((element.id.startsWith('high-') || 
                element.id.startsWith('mid-') || 
                element.id.startsWith('low-')) && 
               (e.altKey || e.metaKey)) {
                // Set current dial to -12dB
                currentValue = 0;  // 0 in our 0-100 scale = -12dB
                setRotation(currentValue);
                onChange(-12);  // Set to -12dB
            } else {
                // Normal double-click behavior
                currentValue = 50;
                setRotation(currentValue);
                if (element.id.startsWith('high-') || 
                    element.id.startsWith('mid-') || 
                    element.id.startsWith('low-')) {
                    onChange(0); // Center EQ (0 dB)
                } else {
                    onChange(50); // Center value
                }
            }
        });

        document.addEventListener('mousemove', updateValue);
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = '';
                element.classList.remove('active');
            }
        });

        // Initialize dial position
        setRotation(currentValue);
        return {
            setValue: (value) => {
                currentValue = value;
                setRotation(value);
            }
        };
    };

    // Initialize dial visuals immediately
    ['a', 'b'].forEach(deck => {
        // Initialize BPM display to '--'
        const bpmDisplay = document.getElementById(`bpm-${deck}`);
        if (bpmDisplay) {
            bpmDisplay.textContent = '--';
        }

        // EQ dials
        ['high', 'mid', 'low'].forEach(band => {
            const dial = document.getElementById(`${band}-${deck}`);
            if (dial) {
                handleDial(dial, (value) => {
                    if (audioProcessor.isInitialized) {
                        audioProcessor.setEQ(deck, band, value);
                    }
                }).setValue(50); // Center position
            }
        });

        // Trim dial
        const trimDial = document.getElementById(`trim-${deck}`);
        if (trimDial) {
            handleDial(trimDial, (value) => {
                if (audioProcessor.isInitialized) {
                    // Convert 0-100 to -5 to +5 dB gain range
                    const db = audioProcessor.setTrimGain(deck, value);
                    // Update value display to show dB with special case for 0
                    const displayValue = Math.abs(db) < 0.1 ? "0" : `${db > 0 ? '+' : ''}${db.toFixed(1)}`;
                    trimDial.querySelector('.dial-value').textContent = displayValue;
                }
            }).setValue(50); // Center position (0 dB)
        }
    });

    // Initialize audio context on first user interaction
    const initializeAudio = async (e) => {
        // Only initialize on direct user interaction
        if (!e.isTrusted) return;
        
        try {
            await audioProcessor.initialize();
            // Remove initialization listeners once initialized
            document.removeEventListener('click', initializeAudio);
            document.removeEventListener('touchstart', initializeAudio);
        } catch (error) {
            console.error('Error initializing audio:', error);
        }
    };

    // Add initialization listeners
    document.addEventListener('click', initializeAudio);
    document.addEventListener('touchstart', initializeAudio);

    // Utility function to format time
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Update time displays
    const updateTimes = () => {
        ['a', 'b'].forEach(deck => {
            const currentTime = audioProcessor.getCurrentTime(deck);
            const duration = audioProcessor.getDuration(deck);
            const remaining = duration - currentTime;

            document.getElementById(`time-${deck}`).textContent = formatTime(currentTime);
            document.getElementById(`remaining-${deck}`).textContent = 
                `-${formatTime(remaining)}`;

            // Update playhead position
            const playhead = document.getElementById(`playhead-${deck}`);
            const position = (currentTime / duration) * 100;
            playhead.style.left = `${position}%`;

            // Update detail view position
            if (waveforms[deck]) {
                waveforms[deck].updateDetailPosition(currentTime / duration);
            }
        });
        requestAnimationFrame(updateTimes);
    };
    updateTimes();

    // Track list functions
    const addTrackToList = async (file) => {
        try {
            // Initialize audio context if needed
            if (!audioProcessor.isInitialized) {
                await audioProcessor.initialize();
            }

            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioProcessor.audioContext.decodeAudioData(arrayBuffer);
            const detectedBPM = await audioProcessor.detectBPM(audioBuffer);
            
            const track = {
                file,
                title: file.name.replace(/\.[^/.]+$/, ""),
                artist: 'Unknown',
                bpm: detectedBPM,
                duration: audioBuffer.duration
            };
            
            tracks.push(track);
            updateTrackList();
            return track;
        } catch (error) {
            console.error('Error adding track:', error);
            alert('Error adding track. Please ensure it\'s a valid audio file.');
            return null;
        }
    };

    // Handle files being dropped
    const handleFilesDrop = async (files, targetDeck = null) => {
        for (const file of files) {
            if (file.type.startsWith('audio/')) {
                const track = await addTrackToList(file);
                if (track && targetDeck) {
                    await loadTrackToDeck(track, targetDeck);
                }
            }
        }
    };

    // Add drag and drop for collection
    const trackList = document.getElementById('track-list');
    
    trackList.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        trackList.style.backgroundColor = '#2a2a2a';
    });

    trackList.addEventListener('dragleave', () => {
        trackList.style.backgroundColor = '';
    });

    trackList.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        trackList.style.backgroundColor = '';
        
        if (e.dataTransfer.files.length > 0) {
            await handleFilesDrop(e.dataTransfer.files);
        }
    });

    // Modify deck drop handlers to handle files
    ['a', 'b'].forEach(deck => {
        const container = document.getElementById(`deck-${deck}`);

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.style.backgroundColor = '#2a2a2a';
        });

        container.addEventListener('dragleave', () => {
            container.style.backgroundColor = '#1e1e1e';
        });

        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.style.backgroundColor = '#1e1e1e';
            
            // Handle files being dropped directly onto deck
            if (e.dataTransfer.files.length > 0) {
                await handleFilesDrop(e.dataTransfer.files, deck);
                return;
            }
            
            // Handle tracks from collection being dropped
            const trackIndex = e.dataTransfer.getData('text/plain');
            if (trackIndex !== '') {
                const track = tracks[parseInt(trackIndex)];
                if (track) loadTrackToDeck(track, deck);
            }
        });
    });

    // Track list drag and drop reordering
    let draggedItem = null;

    const updateTrackList = () => {
        const trackList = document.getElementById('track-list');
        const saveButton = document.getElementById('save-tracks');
        trackList.innerHTML = '';
        
        // Update save button state based on tracks
        saveButton.disabled = tracks.length === 0;
        
        tracks.forEach((track, index) => {
            const trackElement = document.createElement('div');
            trackElement.className = 'track-item';
            
            // Check if track is loaded in any deck
            const deckA = audioProcessor.currentTrack.a === track.file ? 'A' : '';
            const deckB = audioProcessor.currentTrack.b === track.file ? 'B' : '';
            const deckIndicator = deckA || deckB;
            
            // Ensure BPM is a number and has a valid value
            const bpm = Number(track.bpm);
            
            // Create individual elements for better control
            const titleDiv = document.createElement('div');
            titleDiv.textContent = track.title;
            
            const bpmDiv = document.createElement('div');
            bpmDiv.textContent = isNaN(bpm) ? '--' : bpm.toFixed(1);
            bpmDiv.style.cursor = 'context-menu';
            
            // Add right-click handler for BPM
            bpmDiv.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const newBPM = prompt('Enter BPM:', bpm || '');
                if (newBPM !== null) {
                    const parsedBPM = parseFloat(newBPM);
                    if (!isNaN(parsedBPM) && parsedBPM > 0) {
                        track.bpm = parsedBPM;
                        // Update BPM in deck if this track is loaded
                        if (audioProcessor.currentTrack.a === track.file) {
                            audioProcessor.bpm.a = parsedBPM;
                            const bpmDisplayA = document.getElementById('bpm-a');
                            if (bpmDisplayA) bpmDisplayA.textContent = parsedBPM.toFixed(1);
                        }
                        if (audioProcessor.currentTrack.b === track.file) {
                            audioProcessor.bpm.b = parsedBPM;
                            const bpmDisplayB = document.getElementById('bpm-b');
                            if (bpmDisplayB) bpmDisplayB.textContent = parsedBPM.toFixed(1);
                        }
                        updateTrackList();
                    } else {
                        alert('Please enter a valid BPM value greater than 0');
                    }
                }
            });
            
            const durationDiv = document.createElement('div');
            durationDiv.textContent = formatTime(track.duration);
            
            const deckIndicatorDiv = document.createElement('div');
            deckIndicatorDiv.className = 'deck-indicator';
            deckIndicatorDiv.textContent = deckIndicator;
            
            // Clear existing content and append new elements
            trackElement.innerHTML = '';
            trackElement.appendChild(titleDiv);
            trackElement.appendChild(bpmDiv);
            trackElement.appendChild(durationDiv);
            trackElement.appendChild(deckIndicatorDiv);
            
            // Drag and drop reordering
            trackElement.draggable = true;
            
            trackElement.addEventListener('dragstart', (e) => {
                draggedItem = trackElement;
                setTimeout(() => trackElement.classList.add('dragging'), 0);
                e.dataTransfer.setData('text/plain', index.toString());
            });
            
            trackElement.addEventListener('dragend', () => {
                draggedItem = null;
                trackElement.classList.remove('dragging');
            });
            
            trackElement.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (draggedItem === trackElement) return;
                trackElement.classList.add('drag-over');
            });
            
            trackElement.addEventListener('dragleave', () => {
                trackElement.classList.remove('drag-over');
            });
            
            trackElement.addEventListener('drop', (e) => {
                e.preventDefault();
                trackElement.classList.remove('drag-over');
                
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = index;
                
                if (fromIndex === toIndex) return;
                
                // Reorder tracks array
                const [movedTrack] = tracks.splice(fromIndex, 1);
                tracks.splice(toIndex, 0, movedTrack);
                
                updateTrackList();
            });
            
            // Double click to load into first available deck
            trackElement.addEventListener('dblclick', () => {
                const deck = !audioProcessor.buffers.a ? 'a' : 
                           !audioProcessor.buffers.b ? 'b' : null;
                if (deck && loadTrackToDeck) loadTrackToDeck(track, deck);
            });
            
            trackList.appendChild(trackElement);
        });
    };

    const loadTrackToDeck = async (track, deck) => {
        try {
            // Clear existing waveform first
            waveforms[deck].clear();
            
            const audioBuffer = await audioProcessor.loadAudio(deck, track.file);
            waveforms[deck].drawWaveform(audioBuffer);
            
            // Get all required elements
            const deckElements = {
                container: document.getElementById(`deck-${deck}`),
                playPauseButton: document.getElementById(`play-pause-${deck}`),
                stopButton: document.getElementById(`stop-${deck}`),
                tempoValue: document.getElementById(`tempo-value-${deck}`),
                bpmDisplay: document.getElementById(`bpm-${deck}`),
                playhead: document.getElementById(`playhead-${deck}`),
                loopButton: document.getElementById(`loop-${deck}`)
            };

            // Check if all required elements exist
            const missingElements = Object.entries(deckElements)
                .filter(([name, element]) => !element)
                .map(([name]) => name);

            if (missingElements.length > 0) {
                throw new Error(`Missing required elements for deck ${deck}: ${missingElements.join(', ')}`);
            }
            
            // Add has-track class to show clear button
            deckElements.container.classList.add('has-track');
            
            // Initialize deck state
            deckState[deck] = {
                isPlaying: false,
                isPaused: false
            };

            // Update track name in deck info
            const waveformStack = document.querySelector(`.waveform-stack:nth-child(${deck === 'a' ? 1 : 2})`);
            if (waveformStack) {
                const deckInfo = waveformStack.querySelector('.deck-info');
                if (deckInfo) {
                    let trackNameElement = deckInfo.querySelector('.track-name');
                    if (!trackNameElement) {
                        trackNameElement = document.createElement('div');
                        trackNameElement.className = 'track-name';
                        deckInfo.insertBefore(trackNameElement, deckInfo.querySelector('.bpm-display'));
                    }
                    trackNameElement.textContent = track.title;
                }
            }

            // Reset transport button states
            deckElements.playPauseButton.classList.remove('active');
            deckElements.playPauseButton.textContent = 'Play';
            
            // Reset tempo and BPM display
            deckElements.tempoValue.textContent = '0.0%';  // Show as 0.0% initially
            window[`tempo_${deck}`] = 100;  // Keep internal tempo at 100%
            
            // Set BPM in audioProcessor and display
            if (track.bpm && !isNaN(track.bpm)) {
                audioProcessor.bpm[deck] = track.bpm;
                audioProcessor.beatLength[deck] = 60 / track.bpm;
                window[`originalBPM_${deck}`] = track.bpm;
                if (deckElements.bpmDisplay) {
                    deckElements.bpmDisplay.textContent = track.bpm.toFixed(1);
                }
            } else {
                window[`originalBPM_${deck}`] = 0;
                if (deckElements.bpmDisplay) {
                    deckElements.bpmDisplay.textContent = '--';
                }
            }
            
            // Reset playhead position
            deckElements.playhead.style.left = '0%';
            
            // Reset loop state if exists
            if (deckElements.loopButton) {
                deckElements.loopButton.textContent = 'Loop In';
                deckElements.loopButton.classList.remove('active');
            }

            // Store the track reference for BPM calculations
            audioProcessor.currentTrack[deck] = track.file;
            
            // Update track list to show deck indicators
            updateTrackList();
        } catch (error) {
            console.error('Error loading track to deck:', error);
            alert('Error loading track to deck. Please try again.');
        }
    };

    // Deck handlers
    ['a', 'b'].forEach(deck => {
        // Get all required elements
        const elements = {
            container: document.getElementById(`deck-${deck}`),
            playPauseButton: document.getElementById(`play-pause-${deck}`),
            stopButton: document.getElementById(`stop-${deck}`),
            cueButton: document.getElementById(`cue-${deck}`),
            loopButton: document.getElementById(`loop-${deck}`),
            tempoMinus: document.getElementById(`tempo-minus-${deck}`),
            tempoPlus: document.getElementById(`tempo-plus-${deck}`),
            tempoValue: document.getElementById(`tempo-value-${deck}`),
            resetButton: document.getElementById(`reset-${deck}`),
            syncButton: document.getElementById(`sync-${deck}`),
            pitchUpBtn: document.getElementById(`pitch-up-${deck}`),
            pitchDownBtn: document.getElementById(`pitch-down-${deck}`)
        };

        // Log missing elements
        Object.entries(elements).forEach(([name, element]) => {
            if (!element) {
                console.warn(`Missing element: ${name} for deck ${deck}`);
            }
        });

        // Check if required elements exist before setting up event listeners
        if (!elements.container || !elements.playPauseButton || !elements.stopButton || 
            !elements.cueButton || !elements.loopButton) {
            console.warn(`Required elements for deck ${deck} not found`);
            return;
        }

        let seekPosition = 0;
        let tempo = 100;  // Base tempo is still 100 internally
        let originalBPM = 0;
        let isKeyboardCue = false;

        // Make these variables accessible to the loadTrackToDeck function
        window[`tempo_${deck}`] = tempo;
        window[`originalBPM_${deck}`] = originalBPM;

        // Initialize tempo display as 0.0%
        elements.tempoValue.textContent = '0.0%';

        // Add tempo adjustment handlers
        elements.tempoMinus.addEventListener('click', () => {
            const newTempo = Math.max(window[`tempo_${deck}`] - 0.5, 50); // Decrease by 0.5%, minimum 50%
            window[`tempo_${deck}`] = Math.round(newTempo * 10) / 10; // Round to 1 decimal place
            audioProcessor.setTempo(deck, window[`tempo_${deck}`]);
            const diff = window[`tempo_${deck}`] - 100;
            elements.tempoValue.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
            updateBPMDisplay();
        });

        elements.tempoPlus.addEventListener('click', () => {
            const newTempo = Math.min(window[`tempo_${deck}`] + 0.5, 150); // Increase by 0.5%, maximum 150%
            window[`tempo_${deck}`] = Math.round(newTempo * 10) / 10; // Round to 1 decimal place
            audioProcessor.setTempo(deck, window[`tempo_${deck}`]);
            const diff = window[`tempo_${deck}`] - 100;
            elements.tempoValue.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
            updateBPMDisplay();
        });

        // Add reset button handler
        elements.resetButton.addEventListener('click', () => {
            window[`tempo_${deck}`] = 100;
            window[`originalBPM_${deck}`] = 0;  // Reset originalBPM when resetting tempo
            audioProcessor.resetTempo(deck);
            elements.tempoValue.textContent = '0.0%';  // Show as 0.0% when reset
            updateBPMDisplay();
        });

        // Add sync button handler
        elements.syncButton.addEventListener('click', () => {
            const result = audioProcessor.syncToDeck(deck);
            if (result.success) {
                window[`tempo_${deck}`] = result.tempoAdjustment;
                const diff = result.tempoAdjustment - 100;
                elements.tempoValue.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
                window[`originalBPM_${deck}`] = result.currentBPM;
                const bpmDisplay = document.getElementById(`bpm-${deck}`);
                if (bpmDisplay) {
                    bpmDisplay.textContent = result.targetBPM.toFixed(1);
                }
                elements.syncButton.classList.add('active');
                setTimeout(() => elements.syncButton.classList.remove('active'), 200);
            }
        });

        // Add pitch bend handlers with keyboard state tracking
        let isKeyboardPitchUp = false;
        let isKeyboardPitchDown = false;

        elements.pitchUpBtn.addEventListener('mousedown', () => {
            if (!audioProcessor.buffers[deck]) return;
            if (!isKeyboardPitchUp) { // Only set pitch if not already set by keyboard
                elements.pitchUpBtn._mousePressed = true;
                audioProcessor.setPitch(deck, 1.15);
            }
        });

        elements.pitchUpBtn.addEventListener('mouseup', () => {
            if (!audioProcessor.buffers[deck]) return;
            if (elements.pitchUpBtn._mousePressed && !isKeyboardPitchUp) {
                audioProcessor.resetPitch(deck);
            }
            elements.pitchUpBtn._mousePressed = false;
        });

        elements.pitchUpBtn.addEventListener('mouseleave', () => {
            if (!audioProcessor.buffers[deck]) return;
            if (elements.pitchUpBtn._mousePressed && !isKeyboardPitchUp) {
                audioProcessor.resetPitch(deck);
            }
            elements.pitchUpBtn._mousePressed = false;
        });

        elements.pitchDownBtn.addEventListener('mousedown', () => {
            if (!audioProcessor.buffers[deck]) return;
            if (!isKeyboardPitchDown) { // Only set pitch if not already set by keyboard
                elements.pitchDownBtn._mousePressed = true;
                audioProcessor.setPitch(deck, 0.85);
            }
        });

        elements.pitchDownBtn.addEventListener('mouseup', () => {
            if (!audioProcessor.buffers[deck]) return;
            if (elements.pitchDownBtn._mousePressed && !isKeyboardPitchDown) {
                audioProcessor.resetPitch(deck);
            }
            elements.pitchDownBtn._mousePressed = false;
        });

        elements.pitchDownBtn.addEventListener('mouseleave', () => {
            if (!audioProcessor.buffers[deck]) return;
            if (elements.pitchDownBtn._mousePressed && !isKeyboardPitchDown) {
                audioProcessor.resetPitch(deck);
            }
            elements.pitchDownBtn._mousePressed = false;
        });

        // Store keyboard state flags in a way accessible to keyboard event handlers
        window[`isKeyboardPitchUp_${deck}`] = isKeyboardPitchUp;
        window[`isKeyboardPitchDown_${deck}`] = isKeyboardPitchDown;

        // Function to update BPM display based on tempo
        const updateBPMDisplay = () => {
            const bpmDisplay = document.getElementById(`bpm-${deck}`);
            if (!bpmDisplay) return;  // Exit if BPM display element doesn't exist

            // Use the global variables
            if (window[`originalBPM_${deck}`] === 0 && audioProcessor.currentTrack[deck]) {
                const track = tracks.find(t => t.file === audioProcessor.currentTrack[deck]);
                if (track && track.bpm) {
                    window[`originalBPM_${deck}`] = track.bpm;
                }
            }

            if (window[`originalBPM_${deck}`] > 0) {
                const adjustedBPM = (window[`originalBPM_${deck}`] * window[`tempo_${deck}`]) / 100;
                bpmDisplay.textContent = adjustedBPM.toFixed(1);
            } else {
                bpmDisplay.textContent = '--';
            }
        };

        // Set up waveform container event listeners
        if (elements.container) {
            elements.container.addEventListener('mousedown', (e) => {
                // Prevent if not left click
                if (e.button !== 0) return;
                
                const rect = elements.container.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const position = x / rect.width;
                
                if (audioProcessor.buffers[deck]) {
                    // Store current play state
                    const wasPlaying = deckState[deck].isPlaying;
                    
                    // Update pause position first
                    audioProcessor.pausePosition[deck] = position * audioProcessor.buffers[deck].duration;
                    
                    if (wasPlaying) {
                        // If playing, seek with immediate playback
                        audioProcessor.seekTo(deck, position, true);
                        deckState[deck].isPlaying = true;
                        deckState[deck].isPaused = false;
                        elements.playPauseButton.classList.add('active');
                        elements.playPauseButton.textContent = 'Pause';
                    } else {
                        // If not playing, just update position
                        audioProcessor.seekTo(deck, position, false);
                        deckState[deck].isPlaying = false;
                        deckState[deck].isPaused = true;
                        elements.playPauseButton.classList.remove('active');
                        elements.playPauseButton.textContent = 'Play';
                    }
                }
            });

            // Add waveform hover effect for better visual feedback
            elements.container.addEventListener('mousemove', (e) => {
                const rect = elements.container.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const position = x / rect.width;
                
                // Update cursor style
                elements.container.style.cursor = audioProcessor.buffers[deck] ? 'pointer' : 'default';
                
                // Show potential seek position
                const seekIndicator = elements.container.querySelector('.seek-indicator') || (() => {
                    const indicator = document.createElement('div');
                    indicator.className = 'seek-indicator';
                    elements.container.appendChild(indicator);
                    return indicator;
                })();
                
                seekIndicator.style.left = `${position * 100}%`;
                seekIndicator.style.display = audioProcessor.buffers[deck] ? 'block' : 'none';
            });

            elements.container.addEventListener('mouseleave', () => {
                const seekIndicator = elements.container.querySelector('.seek-indicator');
                if (seekIndicator) {
                    seekIndicator.style.display = 'none';
                }
            });
        }

        // Loop control
        let loopState = 'in'; // States: 'in', 'out', 'active'
        elements.loopButton.textContent = 'Loop In';
        
        elements.loopButton.addEventListener('click', () => {
            if (!audioProcessor.buffers[deck]) return;
            
            switch (loopState) {
                case 'in':
                    audioProcessor.setLoopIn(deck);
                    elements.loopButton.textContent = 'Loop Out';
                    loopState = 'out';
                    break;
                case 'out':
                    audioProcessor.setLoopOut(deck);
                    elements.loopButton.textContent = 'Loop';
                    elements.loopButton.classList.add('active');
                    loopState = 'active';
                    break;
                case 'active':
                    audioProcessor.clearLoop(deck);
                    elements.loopButton.textContent = 'Loop In';
                    elements.loopButton.classList.remove('active');
                    loopState = 'in';
                    break;
            }
        });

        // Handle cue button
        elements.cueButton.addEventListener('mousedown', () => {
            if (!audioProcessor.buffers[deck]) return;
            
            elements.cueButton.classList.add('active');
            
            // Always update play/pause button state when pressing cue
            elements.playPauseButton.classList.remove('active');
            elements.playPauseButton.textContent = 'Play';
            deckState[deck].isPlaying = false;
            deckState[deck].isPaused = true;
            
            audioProcessor.cue(deck);
            elements.cueButton._mousePressed = true; // Track if mouse initiated the cue
        });

        elements.cueButton.addEventListener('mouseup', () => {
            if (!audioProcessor.buffers[deck]) return;
            
            elements.cueButton.classList.remove('active');
            if (!isKeyboardCue && elements.cueButton._mousePressed) {
                audioProcessor.releaseCue(deck);
                deckState[deck].isPlaying = false;
                deckState[deck].isPaused = true;
            }
            elements.cueButton._mousePressed = false;
        });

        elements.cueButton.addEventListener('mouseleave', () => {
            if (!audioProcessor.buffers[deck] || isKeyboardCue) return;
            
            elements.cueButton.classList.remove('active');
            if (elements.cueButton._mousePressed) {
                audioProcessor.releaseCue(deck);
                deckState[deck].isPlaying = false;
                deckState[deck].isPaused = true;
            }
            elements.cueButton._mousePressed = false;
        });

        // Handle play/pause button
        elements.playPauseButton.addEventListener('click', async () => {
            if (!audioProcessor.buffers[deck]) return;

            try {
                if (!elements.playPauseButton.classList.contains('active')) {
                    // Check if we're holding cue
                    if (elements.cueButton.classList.contains('active')) {
                        // Continue playback from current preview without re-triggering
                        if (audioProcessor.sources[deck] && audioProcessor.sources[deck]._isCuePreview) {
                            audioProcessor.sources[deck]._isCuePreview = false; // Convert preview to normal playback
                            elements.cueButton.classList.remove('active');
                            elements.cueButton._mousePressed = false;
                            isKeyboardCue = false;
                        }
                    } else if (loopState === 'active' && !deckState[deck].isPlaying) {
                        // If we have an active loop and we're not playing, start from loop start
                        audioProcessor.startTime[deck] = audioProcessor.audioContext.currentTime;
                        audioProcessor.pausePosition[deck] = audioProcessor.loopPoints[deck].start;
                        await audioProcessor.play(deck);
                    } else {
                        // Normal play from current position
                        await audioProcessor.play(deck);
                    }
                    
                    deckState[deck].isPlaying = true;
                    deckState[deck].isPaused = false;
                    elements.playPauseButton.classList.add('active');
                    elements.playPauseButton.textContent = 'Pause';
                } else {
                    audioProcessor.pause(deck);
                    deckState[deck].isPlaying = false;
                    deckState[deck].isPaused = true;
                    elements.playPauseButton.classList.remove('active');
                    elements.playPauseButton.textContent = 'Play';
                }
            } catch (error) {
                console.error('Error playing/pausing track:', error);
                // Reset state on error
                deckState[deck].isPlaying = false;
                deckState[deck].isPaused = false;
                elements.playPauseButton.classList.remove('active');
                elements.playPauseButton.textContent = 'Play';
            }
        });

        // Handle stop button
        elements.stopButton.addEventListener('mousedown', () => {
            if (!audioProcessor.buffers[deck]) return;

            elements.stopButton.classList.add('active');
            audioProcessor.stop(deck);
            deckState[deck].isPlaying = false;
            deckState[deck].isPaused = false;
            elements.playPauseButton.classList.remove('active');
            elements.playPauseButton.textContent = 'Play';
            
            // Force playhead to appropriate position
            const playhead = document.getElementById(`playhead-${deck}`);

            // If we have an active loop
            if (loopState === 'active') {
                // If we're already stopped at loop start, clear the loop
                if (Math.abs(audioProcessor.pausePosition[deck] - audioProcessor.loopPoints[deck].start) < 0.01) {
                    // Reset loop UI state
                    loopState = 'in';
                    elements.loopButton.textContent = 'Loop In';
                    elements.loopButton.classList.remove('active');
                    waveforms[deck].clearLoop();
                    audioProcessor.clearLoop(deck);
                    // Reset to track start
                    audioProcessor.pausePosition[deck] = 0;
                    playhead.style.left = '0%';
                } else {
                    // First stop: move to loop start
                    audioProcessor.pausePosition[deck] = audioProcessor.loopPoints[deck].start;
                    const loopStartPercent = (audioProcessor.loopPoints[deck].start / audioProcessor.buffers[deck].duration) * 100;
                    playhead.style.left = `${loopStartPercent}%`;
                }
            } else {
                // No loop: reset to track start
                audioProcessor.pausePosition[deck] = 0;
                playhead.style.left = '0%';
            }

            // Remove active class after a short delay
            setTimeout(() => elements.stopButton.classList.remove('active'), 100);
        });
    });

    // Crossfader control
    const crossfader = document.getElementById('crossfader');
    const crossfaderValue = document.getElementById('crossfader-value');
    
    // Add double-click handler to reset crossfader
    crossfader.addEventListener('dblclick', () => {
        crossfader.value = 50;  // Reset to center
        audioProcessor.setCrossfader(50);
        crossfaderValue.textContent = 'C';
    });
    
    crossfader.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        audioProcessor.setCrossfader(value);
        
        // Update display
        if (value < 45) crossfaderValue.textContent = 'A';
        else if (value > 55) crossfaderValue.textContent = 'B';
        else crossfaderValue.textContent = 'C';
    });

    // Crossfader curve selector
    const crossfaderCurve = document.getElementById('crossfader-curve');
    crossfaderCurve.value = 'smooth';  // Set default to 'smooth'
    crossfaderCurve.addEventListener('change', (e) => {
        audioProcessor.setCrossfaderCurve(e.target.value);
    });

    // Create LED segments for meters
    const createMeterSegments = (meterId) => {
        const meter = document.getElementById(meterId);
        if (!meter) return;
        
        // Clear existing segments
        meter.innerHTML = '';
        
        // Create 30 segments for each meter (reduced from 35)
        for (let i = 0; i < 30; i++) {
            const segment = document.createElement('div');
            segment.className = 'led-segment';
            meter.appendChild(segment);
        }
    };

    // Initialize all meters
    ['a', 'b'].forEach(deck => {
        createMeterSegments(`meter-${deck}-l`);
        createMeterSegments(`meter-${deck}-r`);
    });
    createMeterSegments('meter-master-l');
    createMeterSegments('meter-master-r');

    // Update LED meters
    const updateMeters = () => {
        // Update channel meters
        ['a', 'b'].forEach(deck => {
            if (!audioProcessor.levelData[deck]) return;
            
            // Get level data
            const { level } = audioProcessor.getLevelData(deck);
            
            // Update channel meters
            [`meter-${deck}-l`, `meter-${deck}-r`].forEach(meterId => {
                const meter = document.getElementById(meterId);
                if (!meter) return;
                const segments = meter.getElementsByClassName('led-segment');
                
                // Update segments based on level with improved scaling
                Array.from(segments).forEach((segment, i) => {
                    // Using a more logarithmic scale with finer gradation
                    const threshold = Math.pow(1.12, i + 1) * 2;
                    segment.classList.remove('active', 'warning', 'peak');
                    
                    if (level >= threshold) {
                        if (i >= 26) { // Top 4 segments for peak (red)
                            segment.classList.add('peak');
                        } else if (i >= 20) { // Next 6 segments for warning (yellow)
                            segment.classList.add('warning');
                        } else {
                            segment.classList.add('active');
                        }
                    }
                });
            });
        });

        // Update master meters with same scaling
        const { level: masterLevel } = audioProcessor.getLevelData('master');
        ['meter-master-l', 'meter-master-r'].forEach(meterId => {
            const meter = document.getElementById(meterId);
            if (!meter) return;
            const segments = meter.getElementsByClassName('led-segment');
            
            Array.from(segments).forEach((segment, i) => {
                const threshold = Math.pow(1.12, i + 1) * 2;
                segment.classList.remove('active', 'warning', 'peak');
                
                if (masterLevel >= threshold) {
                    if (i >= 26) {
                        segment.classList.add('peak');
                    } else if (i >= 20) {
                        segment.classList.add('warning');
                    } else {
                        segment.classList.add('active');
                    }
                }
            });
        });

        requestAnimationFrame(updateMeters);
    };
    updateMeters();

    // Channel faders
    ['a', 'b'].forEach(deck => {
        const fader = document.getElementById(`fader-${deck}`);
        
        fader.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            audioProcessor.setVolume(deck, value);
        });

        // Initialize fader position and volume
        fader.value = 127;  // Start at top position (full volume)
        const initialValue = parseInt(fader.value);
        audioProcessor.setVolume(deck, initialValue);
    });

    // Master gain control
    const masterGain = document.getElementById('master-gain');

    masterGain.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        audioProcessor.setMasterGain(value / 127);
    });

    // Initialize master gain
    masterGain.value = 127;  // Changed from 100 to 127 (maximum)
    masterGain.dispatchEvent(new Event('input'));

    // Add clear deck button handlers
    ['a', 'b'].forEach(deck => {
        const clearButton = document.getElementById(`clear-deck-${deck}`);
        clearButton.addEventListener('click', () => {
            // Stop playback if playing
            if (audioProcessor.sources[deck]) {
                audioProcessor.stop(deck);
            }

            // Clear audio processor state
            audioProcessor.buffers[deck] = null;
            audioProcessor.sources[deck] = null;
            audioProcessor.currentTrack[deck] = null;
            audioProcessor.startTime[deck] = 0;
            audioProcessor.pausePosition[deck] = 0;
            audioProcessor.cuePoints[deck] = 0;
            audioProcessor.playbackRate[deck] = 1;
            audioProcessor.isLooping[deck] = false;
            audioProcessor.loopPoints[deck] = { start: null, end: null };

            // Clear waveform display
            waveforms[deck].clear();

            // Remove has-track class to hide clear button
            document.getElementById(`deck-${deck}`).classList.remove('has-track');

            // Clear track name if it exists
            const waveformStack = document.querySelector(`.waveform-stack:nth-child(${deck === 'a' ? 1 : 2})`);
            const trackNameElement = waveformStack.querySelector('.track-name');
            if (trackNameElement) {
                trackNameElement.textContent = '';
            }

            // Reset transport button states
            const playPauseButton = document.getElementById(`play-pause-${deck}`);
            const stopButton = document.getElementById(`stop-${deck}`);
            const loopButton = document.getElementById(`loop-${deck}`);
            
            playPauseButton.classList.remove('active');
            
            // Reset loop state if exists
            if (loopButton) {
                loopButton.textContent = 'Loop In';
                loopButton.classList.remove('active');
            }

            // Reset tempo display
            const tempoValue = document.getElementById(`tempo-value-${deck}`);
            const bpmDisplay = document.getElementById(`bpm-${deck}`);
            if (tempoValue) tempoValue.textContent = '100%';
            if (bpmDisplay) bpmDisplay.textContent = '--';

            // Update track list to remove deck indicator
            updateTrackList();
        });
    });

    // Save/Load collection handlers
    const saveButton = document.getElementById('save-tracks');
    saveButton.disabled = true; // Initially disabled
    
    saveButton.addEventListener('click', () => {
        if (tracks.length === 0) return;
        
        // Get current date and time
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        });
        const timeStr = now.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        // Create a formatted text table with fixed column widths
        const header = `Track List - ${dateStr} ${timeStr}\n` +
                      '='.repeat(70) + '\n\n' +
                      'Order | Title                                    | BPM   | Duration\n' +
                      '------+------------------------------------------+-------+----------\n';
                      
        const trackList = tracks.map((track, index) => {
            const orderNum = (index + 1).toString().padStart(2, ' ');
            const title = track.title.length > 40 ? track.title.substring(0, 37) + '...' : track.title.padEnd(40);
            const bpm = track.bpm ? track.bpm.toFixed(1).padStart(5) : '  --  ';
            const duration = formatTime(track.duration);
            return `  ${orderNum}  | ${title} | ${bpm} |   ${duration}`;
        }).join('\n');
        
        const footer = '\n' + '='.repeat(70) + '\n' +
                      `Total Tracks: ${tracks.length}\n` +
                      `Total Duration: ${formatTime(tracks.reduce((sum, track) => sum + track.duration, 0))}`;
        
        const content = header + trackList + footer;
        
        // Save as text file with date in filename
        const filename = `mixer-tracklist_${dateStr.replace(/\//g, '-')}_${timeStr.replace(':', '-')}.txt`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Track file input handler
    const trackFileInput = document.getElementById('track-file-input');
    if (trackFileInput) {
        trackFileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const audioFiles = [];
                const jsonFiles = [];
                
                // Sort files into audio and JSON
                for (const file of e.target.files) {
                    // Check if it's a JSON file by both MIME type and extension
                    if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
                        jsonFiles.push(file);
                    } else if (file.type.startsWith('audio/')) {
                        audioFiles.push(file);
                    }
                }

                // Handle audio files first
                for (const file of audioFiles) {
                    try {
                        await addTrackToList(file);
                    } catch (error) {
                        console.error('Error adding track:', error);
                        alert(`Error adding track ${file.name}. Please ensure it's a valid audio file.`);
                    }
                }

                // Then handle JSON collections
                for (const file of jsonFiles) {
                    try {
                        console.log('Reading JSON file:', file.name);
                        const text = await file.text();
                        console.log('JSON content:', text);
                        const collection = JSON.parse(text);
                        console.log('Parsed collection:', collection);
                        
                        if (!Array.isArray(collection)) {
                            throw new Error('Invalid collection format: expected an array');
                        }
                        
                        if (collection.length === 0) {
                            throw new Error('Collection is empty');
                        }

                        const message = `Please select the audio files for your collection "${file.name}".\n` +
                                      `The collection contains ${collection.length} tracks.\n` +
                                      `Try to select them in the same order as they appear in your collection.\n\n` +
                                      `Expected files:\n${collection.map(t => `- ${t.path}`).join('\n')}`;
                        
                        if (confirm(message)) {
                            // Create a persistent file input
                            let collectionInput = document.getElementById('collection-file-input');
                            if (!collectionInput) {
                                collectionInput = document.createElement('input');
                                collectionInput.type = 'file';
                                collectionInput.id = 'collection-file-input';
                                collectionInput.multiple = true;
                                collectionInput.accept = 'audio/*';
                                collectionInput.style.display = 'none';
                                document.body.appendChild(collectionInput);
                            }

                            // Store collection data for later use
                            collectionInput.dataset.collection = JSON.stringify(collection);
                            
                            // Add one-time listener for this specific collection
                            const handleCollectionFiles = async (e) => {
                                if (!e.target.files || e.target.files.length === 0) return;
                                
                                collectionInput.removeEventListener('change', handleCollectionFiles);
                                const storedCollection = JSON.parse(collectionInput.dataset.collection);
                                
                                console.log('Selected files:', Array.from(e.target.files).map(f => f.name));
                                const selectedFiles = Array.from(e.target.files);
                                const matchedTracks = [];
                                const unmatchedTracks = [];

                                // Try to match files with collection entries
                                for (const collectionTrack of storedCollection) {
                                    console.log('Trying to match track:', collectionTrack.path);
                                    
                                    // Try to find matching file by name first
                                    let matchedFile = selectedFiles.find(f => f.name === collectionTrack.path);
                                    console.log('Name match:', matchedFile?.name);
                                    
                                    // If no exact match, try to match by size and last modified if available
                                    if (!matchedFile && collectionTrack.size && collectionTrack.lastModified) {
                                        matchedFile = selectedFiles.find(f => 
                                            f.size === collectionTrack.size && 
                                            f.lastModified === collectionTrack.lastModified
                                        );
                                        console.log('Size/date match:', matchedFile?.name);
                                    }
                                    
                                    // If still no match, take the first remaining file
                                    if (!matchedFile && selectedFiles.length > 0) {
                                        matchedFile = selectedFiles[0];
                                        console.log('Fallback match:', matchedFile.name);
                                    }
                                    
                                    if (matchedFile) {
                                        // Remove the matched file from the pool
                                        selectedFiles.splice(selectedFiles.indexOf(matchedFile), 1);
                                        
                                        try {
                                            // Create a new track object with the collection metadata
                                            console.log('Adding track to list:', matchedFile.name);
                                            const track = await addTrackToList(matchedFile);
                                            if (track) {
                                                track.title = collectionTrack.title;
                                                track.artist = collectionTrack.artist;
                                                track.bpm = collectionTrack.bpm;
                                                matchedTracks.push(track);
                                                console.log('Successfully added track:', track.title);
                                            }
                                        } catch (error) {
                                            console.error('Error adding track:', matchedFile.name, error);
                                            unmatchedTracks.push(collectionTrack.path);
                                        }
                                    } else {
                                        console.log('No match found for:', collectionTrack.path);
                                        unmatchedTracks.push(collectionTrack.path);
                                    }
                                }

                                // Update the UI with the matched tracks
                                if (matchedTracks.length > 0) {
                                    console.log('Updating track list with matched tracks:', matchedTracks.length);
                                    tracks = [...tracks.filter(t => !matchedTracks.includes(t)), ...matchedTracks];
                                    updateTrackList();
                                }

                                // Report any unmatched tracks
                                if (unmatchedTracks.length > 0) {
                                    const message = `Some tracks could not be matched:\n${unmatchedTracks.join('\n')}`;
                                    console.warn(message);
                                    alert(message);
                                }
                            };

                            collectionInput.addEventListener('change', handleCollectionFiles);
                            collectionInput.click();
                        }
                    } catch (error) {
                        console.error('Error loading collection:', error);
                        alert(`Error loading collection ${file.name}: ${error.message}\n\nCheck the browser console for more details.`);
                    }
                }
            }
        });
    }

    // Keyboard event handlers
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return; // Ignore key repeat events
        
        switch (e.key.toLowerCase()) {
            // Deck A controls
            case 'a':
                if (!audioProcessor.buffers.a) return;
                const cueButtonA = document.getElementById('cue-a');
                const playPauseButtonA = document.getElementById('play-pause-a');
                
                // Always update play/pause button state when pressing cue
                playPauseButtonA.classList.remove('active');
                playPauseButtonA.textContent = 'Play';
                deckState.a.isPlaying = false;
                deckState.a.isPaused = true;
                
                cueButtonA.classList.add('active');
                audioProcessor.cue('a');
                isKeyboardCue = true;
                break;
            case 's':
                if (!audioProcessor.buffers.a) return;
                const playPauseA = document.getElementById('play-pause-a');
                playPauseA.click();
                break;
            case 'd':
                if (!audioProcessor.buffers.a) return;
                const stopA = document.getElementById('stop-a');
                stopA.dispatchEvent(new MouseEvent('mousedown'));
                break;
            case 'q':
                const pitchDownA = document.getElementById('pitch-down-a');
                window.isKeyboardPitchDown_a = true;
                pitchDownA.classList.add('active');
                // Start with a small pitch change and gradually increase
                let pitchValueA = 0.98;
                window.pitchIntervalA = setInterval(() => {
                    pitchValueA = Math.max(0.92, pitchValueA - 0.005);
                    audioProcessor.setPitch('a', pitchValueA);
                }, 30);
                break;
            case 'w':
                const pitchUpA = document.getElementById('pitch-up-a');
                window.isKeyboardPitchUp_a = true;
                pitchUpA.classList.add('active');
                // Start with a small pitch change and gradually increase
                let pitchValueUpA = 1.02;
                window.pitchIntervalUpA = setInterval(() => {
                    pitchValueUpA = Math.min(1.08, pitchValueUpA + 0.005);
                    audioProcessor.setPitch('a', pitchValueUpA);
                }, 30);
                break;

            // Deck B controls
            case 'b':
                if (!audioProcessor.buffers.b) return;
                const cueButtonB = document.getElementById('cue-b');
                const playPauseButtonB = document.getElementById('play-pause-b');
                
                // Always update play/pause button state when pressing cue
                playPauseButtonB.classList.remove('active');
                playPauseButtonB.textContent = 'Play';
                deckState.b.isPlaying = false;
                deckState.b.isPaused = true;
                
                cueButtonB.classList.add('active');
                audioProcessor.cue('b');
                isKeyboardCue = true;
                break;
            case 'n':
                if (!audioProcessor.buffers.b) return;
                const playPauseB = document.getElementById('play-pause-b');
                playPauseB.click();
                break;
            case 'm':
                if (!audioProcessor.buffers.b) return;
                const stopB = document.getElementById('stop-b');
                stopB.dispatchEvent(new MouseEvent('mousedown'));
                break;
            case 'g':
                const pitchDownB = document.getElementById('pitch-down-b');
                window.isKeyboardPitchDown_b = true;
                pitchDownB.classList.add('active');
                // Start with a small pitch change and gradually increase
                let pitchValueB = 0.98;
                window.pitchIntervalB = setInterval(() => {
                    pitchValueB = Math.max(0.92, pitchValueB - 0.005);
                    audioProcessor.setPitch('b', pitchValueB);
                }, 30);
                break;
            case 'h':
                const pitchUpB = document.getElementById('pitch-up-b');
                window.isKeyboardPitchUp_b = true;
                pitchUpB.classList.add('active');
                // Start with a small pitch change and gradually increase
                let pitchValueUpB = 1.02;
                window.pitchIntervalUpB = setInterval(() => {
                    pitchValueUpB = Math.min(1.08, pitchValueUpB + 0.005);
                    audioProcessor.setPitch('b', pitchValueUpB);
                }, 30);
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch (e.key.toLowerCase()) {
            // Deck A controls
            case 'a':
                if (!audioProcessor.buffers.a) return;
                const cueButtonA = document.getElementById('cue-a');
                cueButtonA.classList.remove('active');
                audioProcessor.releaseCue('a');
                deckState.a.isPlaying = false;
                deckState.a.isPaused = true;
                isKeyboardCue = false;
                break;
            case 'q':
                const pitchDownA = document.getElementById('pitch-down-a');
                window.isKeyboardPitchDown_a = false;
                pitchDownA.classList.remove('active');
                clearInterval(window.pitchIntervalA);
                audioProcessor.resetPitch('a');
                break;
            case 'w':
                const pitchUpA = document.getElementById('pitch-up-a');
                window.isKeyboardPitchUp_a = false;
                pitchUpA.classList.remove('active');
                clearInterval(window.pitchIntervalUpA);
                audioProcessor.resetPitch('a');
                break;

            // Deck B controls
            case 'b':
                if (!audioProcessor.buffers.b) return;
                const cueButtonB = document.getElementById('cue-b');
                cueButtonB.classList.remove('active');
                audioProcessor.releaseCue('b');
                deckState.b.isPlaying = false;
                deckState.b.isPaused = true;
                isKeyboardCue = false;
                break;
            case 'g':
                const pitchDownB = document.getElementById('pitch-down-b');
                window.isKeyboardPitchDown_b = false;
                pitchDownB.classList.remove('active');
                clearInterval(window.pitchIntervalB);
                audioProcessor.resetPitch('b');
                break;
            case 'h':
                const pitchUpB = document.getElementById('pitch-up-b');
                window.isKeyboardPitchUp_b = false;
                pitchUpB.classList.remove('active');
                clearInterval(window.pitchIntervalUpB);
                audioProcessor.resetPitch('b');
                break;
        }
    });

    // Add keyboard + mouse control for faders
    let activeKey = null;
    let mouseStartY = null;
    let mouseStartX = null;
    let initialFaderValue = null;
    let initialCrossfaderValue = null;
    
    // Add double-tap detection for crossfader centering
    let lastCKeyTime = 0;
    let lastCKeyWasHold = false;
    const doubleTapThreshold = 300; // milliseconds

    window.addEventListener('keydown', (e) => {
        if (e.key === 'c' && !e.repeat && !activeKey) {
            const now = Date.now();
            if (now - lastCKeyTime < doubleTapThreshold && !lastCKeyWasHold) {
                // Double tap detected - center the crossfader
                const crossfader = document.getElementById('crossfader');
                if (crossfader) {
                    crossfader.value = 50; // Center position
                    crossfader.dispatchEvent(new Event('input'));
                }
                lastCKeyTime = 0; // Reset timer
                lastCKeyWasHold = false;
            } else {
                lastCKeyTime = now;
            }
        }
        
        // Only trigger if no other key is being held
        if (!activeKey) {
            if (e.key === '1' || e.key === '2' || e.key === 'c') {
                activeKey = e.key;
                mouseStartY = null;
                mouseStartX = null;
                document.body.style.cursor = e.key === 'c' ? 'ew-resize' : 'ns-resize';
                if (e.key === 'c') lastCKeyWasHold = true;
                e.preventDefault();
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === activeKey) {
            activeKey = null;
            mouseStartY = null;
            mouseStartX = null;
            initialFaderValue = null;
            initialCrossfaderValue = null;
            document.body.style.cursor = 'default';
            if (e.key === 'c') {
                setTimeout(() => {
                    lastCKeyWasHold = false;
                }, 50);
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!activeKey) return;

        if (activeKey === 'c') {
            // Crossfader control
            const crossfader = document.getElementById('crossfader');
            if (!crossfader) return;

            if (mouseStartX === null) {
                mouseStartX = e.clientX;
                initialCrossfaderValue = parseFloat(crossfader.value);
            }

            const deltaX = e.clientX - mouseStartX;
            const newValue = Math.max(0, Math.min(100, initialCrossfaderValue + (deltaX * 0.5)));
            
            crossfader.value = newValue;
            crossfader.dispatchEvent(new Event('input'));
        } else {
            // Channel fader control
            const deck = activeKey === '1' ? 'a' : 'b';
            const fader = document.getElementById(`fader-${deck}`);
            if (!fader) return;

            if (mouseStartY === null) {
                mouseStartY = e.clientY;
                initialFaderValue = parseFloat(fader.value);
            }

            const deltaY = mouseStartY - e.clientY;
            // Scale the movement and invert it since the fader's range is 0-127
            const newValue = Math.max(0, Math.min(127, initialFaderValue + (deltaY * 0.5)));
            
            fader.value = newValue;
            fader.dispatchEvent(new Event('input'));
        }
    });

    // Create mixer object with public methods
    const mixer = {
        addTrackToList: addTrackToList,
        loadTrackToDeck: loadTrackToDeck,
        updateTrackList: updateTrackList
    };

    // Set up file input handler - SINGLE POINT OF CONTROL
    const fileInput = document.getElementById('track-file-input');
    const addTracksBtn = document.getElementById('add-tracks');
    
    if (addTracksBtn && fileInput) {
        // Remove any existing listeners
        const newFileInput = fileInput.cloneNode(true);
        fileInput.parentNode.replaceChild(newFileInput, fileInput);
        
        addTracksBtn.addEventListener('click', () => {
            if (!audioProcessor.isInitialized) {
                audioProcessor.initialize().then(() => {
                    newFileInput.click();
                });
            } else {
                newFileInput.click();
            }
        });
        
        newFileInput.addEventListener('change', async (event) => {
            if (event.target.files.length > 0) {
                const files = Array.from(event.target.files);
                for (const file of files) {
                    if (file.type.startsWith('audio/')) {
                        await mixer.addTrackToList(file);
                    }
                }
                event.target.value = '';
            }
        });
    }

    // Check if this is the first load
    const path = window.location.pathname;
    const collectionKey = `mixerLoaded_${path}`;
    const hasLoaded = sessionStorage.getItem(collectionKey);
    if (!hasLoaded) {
        // Set the flag and reload once
        sessionStorage.setItem(collectionKey, 'true');
        window.location.reload();
        return;
    }

    return mixer;
}

// Ensure DOM is fully loaded before running any code
window.addEventListener('load', async () => {
    // Initialize audio processor
    audioProcessor = new AudioProcessor();
    await audioProcessor.initialize();
    
    // Initialize the mixer with the audio processor
    const mixer = initializeMixer(audioProcessor);
    
    // Check for collection in URL
    const collectionName = getCollectionName();
    if (collectionName) {
        console.log('Loading collection:', collectionName);
        const config = await loadCollectionConfig(collectionName);
        if (config && config.tracks) {
            await loadCollectionTracks(config.tracks, mixer.addTrackToList, mixer.loadTrackToDeck, audioProcessor);
        }
    }
});

// Also handle hash changes while the app is running
window.addEventListener('hashchange', async () => {
    const hash = window.location.hash.slice(1);
    if (hash) {
        const collectionName = hash.toLowerCase();
        console.log('Loading collection from hash change:', collectionName);
        
        const config = await loadCollectionConfig(collectionName);
        if (config && config.tracks) {
            await loadCollectionTracks(config.tracks, mixer.addTrackToList, mixer.loadTrackToDeck, audioProcessor);
        }
    }
}); 