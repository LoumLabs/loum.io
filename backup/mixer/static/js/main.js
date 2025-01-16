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
            playPauseButton: document.getElementById(`play-${deck}`),
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
            playhead: document.getElementById(`playhead-${deck}`),
            fader: document.getElementById(`fader-${deck}`),
            trim: document.getElementById(`trim-${deck}`),
            high: document.getElementById(`high-${deck}`),
            mid: document.getElementById(`mid-${deck}`),
            low: document.getElementById(`low-${deck}`)
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
        trackFileInput: document.getElementById('track-file-input'),
        trackList: document.getElementById('track-list'),
        masterGain: document.getElementById('master-gain')
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

// Function to load collection config
async function loadCollectionConfig(collectionName) {
    try {
        // Convert collection name to lowercase for case-insensitive handling
        const normalizedName = collectionName.toLowerCase();
        console.log('Fetching collection config:', `/mixer/configs/${normalizedName}.json`);
        const response = await fetch(`/mixer/configs/${normalizedName}.json`);
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

async function initializeMixer(audioProcessor) {
    // Check if this is the first load
    const path = window.location.pathname;
    const collectionKey = `mixerLoaded_${path}`;
    try {
        const hasLoaded = await window.electron.store.get(collectionKey);
        if (!hasLoaded) {
            // Set the flag and reload once
            await window.electron.store.set(collectionKey, 'true');
            window.location.reload();
            return null;
        }

        // Initialize mixer object
        const mixer = {
            audioProcessor,
            tracks: [],
            currentDeck: null,
            addTrackToList,
            loadTrackToDeck: async (track, deck) => {
                try {
                    await audioProcessor.loadAudio(deck, track.file);
                    // Update BPM display
                    const bpmDisplay = document.getElementById(`bpm-${deck}`);
                    if (bpmDisplay) {
                        bpmDisplay.textContent = track.bpm ? track.bpm.toFixed(1) : '--';
                    }
                } catch (error) {
                    console.error('Error loading track to deck:', error);
                }
            }
        };

        return mixer;
    } catch (error) {
        console.error('Error checking mixer loaded state:', error);
        return null;
    }
}

// Ensure DOM is fully loaded before running any code
window.addEventListener('load', async () => {
    console.log('Initializing mixer...');
    
    // Check for required elements
    const elementCheck = checkRequiredElements();
    
    if (!elementCheck.success) {
        console.error('Missing required elements:', elementCheck.missingElements);
        return;
    }

    try {
        // Create audio processor instance
        const audioProcessor = new AudioProcessor();
        
        // Initialize the mixer with the audio processor
        const mixer = await initializeMixer(audioProcessor);
        if (!mixer) {
            console.error('Failed to initialize mixer');
            return;
        }

        console.log('Mixer initialized successfully');

        // Set up deck controls
        ['a', 'b'].forEach(deck => {
            // Volume control
            const fader = document.getElementById(`fader-${deck}`);
            if (fader) {
                fader.addEventListener('input', (e) => {
                    audioProcessor.setVolume(deck, e.target.value / 127);
                });
            }

            // Play/Pause button
            const playButton = document.getElementById(`play-${deck}`);
            if (playButton) {
                playButton.addEventListener('click', () => {
                    audioProcessor.togglePlayback(deck);
                    playButton.classList.toggle('playing');
                });
            }

            // Stop button
            const stopButton = document.getElementById(`stop-${deck}`);
            if (stopButton) {
                stopButton.addEventListener('click', () => {
                    audioProcessor.stop(deck);
                    const playButton = document.getElementById(`play-${deck}`);
                    if (playButton) {
                        playButton.classList.remove('playing');
                    }
                });
            }

            // Cue button
            const cueButton = document.getElementById(`cue-${deck}`);
            if (cueButton) {
                cueButton.addEventListener('click', () => {
                    audioProcessor.setCuePoint(deck);
                });
            }

            // Loop button
            const loopButton = document.getElementById(`loop-${deck}`);
            if (loopButton) {
                loopButton.addEventListener('click', () => {
                    audioProcessor.toggleLoop(deck);
                    loopButton.classList.toggle('active');
                });
            }

            // Tempo controls
            const tempoMinus = document.getElementById(`tempo-minus-${deck}`);
            const tempoPlus = document.getElementById(`tempo-plus-${deck}`);
            const tempoValue = document.getElementById(`tempo-value-${deck}`);
            const resetButton = document.getElementById(`reset-${deck}`);
            const pitchUpBtn = document.getElementById(`pitch-up-${deck}`);
            const pitchDownBtn = document.getElementById(`pitch-down-${deck}`);

            if (tempoMinus && tempoPlus && tempoValue) {
                tempoMinus.addEventListener('click', () => {
                    audioProcessor.adjustTempo(deck, -0.5);
                    tempoValue.textContent = `${(audioProcessor.getPlaybackRate(deck) * 100).toFixed(1)}%`;
                });

                tempoPlus.addEventListener('click', () => {
                    audioProcessor.adjustTempo(deck, 0.5);
                    tempoValue.textContent = `${(audioProcessor.getPlaybackRate(deck) * 100).toFixed(1)}%`;
                });

                resetButton.addEventListener('click', () => {
                    audioProcessor.resetTempo(deck);
                    tempoValue.textContent = '100%';
                });

                pitchUpBtn.addEventListener('click', () => {
                    audioProcessor.adjustPitch(deck, 1);
                });

                pitchDownBtn.addEventListener('click', () => {
                    audioProcessor.adjustPitch(deck, -1);
                });
            }

            // EQ controls
            ['high', 'mid', 'low'].forEach(band => {
                const dial = document.getElementById(`${band}-${deck}`);
                if (dial) {
                    dial.addEventListener('input', (e) => {
                        audioProcessor.setEQ(deck, band, e.target.value);
                    });
                }
            });

            // Trim control
            const trim = document.getElementById(`trim-${deck}`);
            if (trim) {
                trim.addEventListener('input', (e) => {
                    audioProcessor.setTrim(deck, e.target.value);
                });
            }
        });

        // Crossfader setup
        const crossfader = document.getElementById('crossfader');
        const crossfaderValue = document.getElementById('crossfader-value');
        const crossfaderCurve = document.getElementById('crossfader-curve');

        if (crossfader && crossfaderValue) {
            crossfader.addEventListener('input', (e) => {
                const value = e.target.value;
                audioProcessor.setCrossfader(value / 100);
                crossfaderValue.textContent = value === '50' ? 'C' : 
                                            value < 50 ? 'A' : 'B';
            });
        }

        if (crossfaderCurve) {
            crossfaderCurve.addEventListener('change', (e) => {
                audioProcessor.setCrossfaderCurve(e.target.value);
            });
        }

        // Master gain control
        const masterGain = document.getElementById('master-gain');
        if (masterGain) {
            masterGain.addEventListener('input', (e) => {
                audioProcessor.setMasterGain(e.target.value / 127);
            });
        }

        // Initialize waveform visualizers
        const waveformA = new Waveform('deck-a', audioProcessor);
        const waveformB = new Waveform('deck-b', audioProcessor);

        // Set up track file input
        const trackFileInput = document.getElementById('track-file-input');
        const addTracksButton = document.getElementById('add-tracks');

        if (trackFileInput && addTracksButton) {
            addTracksButton.addEventListener('click', () => {
                trackFileInput.click();
            });

            trackFileInput.addEventListener('change', async (e) => {
                const files = e.target.files;
                if (files.length > 0) {
                    for (const file of files) {
                        if (file.type.startsWith('audio/')) {
                            await mixer.addTrackToList(file);
                        }
                    }
                }
            });
        }

        // Set up drag and drop zones
        const dropZones = document.querySelectorAll('.waveform-container');
        dropZones.forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
            });

            zone.addEventListener('dragleave', () => {
                zone.classList.remove('drag-over');
            });

            zone.addEventListener('drop', async (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                
                const deck = zone.id.split('-')[1];
                const files = e.dataTransfer.files;
                
                if (files.length > 0) {
                    const file = files[0];
                    if (file.type.startsWith('audio/')) {
                        const track = await mixer.addTrackToList(file);
                        if (track) {
                            await mixer.loadTrackToDeck(track, deck);
                        }
                    }
                }
            });
        });

    } catch (error) {
        console.error('Error initializing mixer:', error);
    }
}); 