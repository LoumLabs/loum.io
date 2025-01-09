document.addEventListener('DOMContentLoaded', () => {
    const audioProcessor = new AudioProcessor();
    const waveforms = {
        a: new Waveform('deck-a'),
        b: new Waveform('deck-b')
    };

    // Track collection
    let tracks = [];

    // Dial control handler
    const handleDial = (element, onChange) => {
        if (!element) return { setValue: () => {} };

        let isDragging = false;
        let startY;
        let startValue;
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
            document.body.style.cursor = 'ns-resize';
            element.classList.add('active');
            
            // Prevent text selection while dragging
            e.preventDefault();
        });

        // Double click to reset to center
        element.addEventListener('dblclick', () => {
            currentValue = 50;
            setRotation(currentValue);
            if (element.id.startsWith('high-') || 
                element.id.startsWith('mid-') || 
                element.id.startsWith('low-')) {
                onChange(0); // Center EQ (0 dB)
            } else {
                onChange(50); // Center value
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
            
            // If this was triggered by the "Add Tracks" button, trigger the file input
            if (e.target.id === 'add-tracks') {
                document.getElementById('track-file-input').click();
            }
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
                if (deck) loadTrackToDeck(track, deck);
            });
            
            trackList.appendChild(trackElement);
        });
    };

    const loadTrackToDeck = async (track, deck) => {
        try {
            const audioBuffer = await audioProcessor.loadAudio(deck, track.file);
            waveforms[deck].drawWaveform(audioBuffer);
            
            // Add has-track class to show clear button
            document.getElementById(`deck-${deck}`).classList.add('has-track');
            
            // Reset UI state when loading new track
            const deckControls = {
                play: document.getElementById(`play-${deck}`),
                pause: document.getElementById(`pause-${deck}`),
                stop: document.getElementById(`stop-${deck}`),
                tempo: document.getElementById(`tempo-value-${deck}`),
                bpm: document.getElementById(`bpm-${deck}`),
                playhead: document.getElementById(`playhead-${deck}`),
                loop: document.getElementById(`loop-${deck}`)
            };

            // Update track name in deck info
            const waveformStack = document.querySelector(`.waveform-stack:nth-child(${deck === 'a' ? 1 : 2})`);
            const deckInfo = waveformStack.querySelector('.deck-info');
            let trackNameElement = deckInfo.querySelector('.track-name');
            if (!trackNameElement) {
                trackNameElement = document.createElement('div');
                trackNameElement.className = 'track-name';
                deckInfo.insertBefore(trackNameElement, deckInfo.querySelector('.bpm-display'));
            }
            trackNameElement.textContent = track.title;

            // Reset transport button states
            deckControls.play.classList.remove('active');
            deckControls.pause.classList.remove('active');
            deckControls.play.disabled = false;
            deckControls.pause.disabled = false;
            deckControls.stop.disabled = false;
            
            // Reset tempo and BPM display
            deckControls.tempo.textContent = '100%';
            
            // If track has a stored BPM, use it and update the audioProcessor
            const bpmDisplay = document.getElementById(`bpm-${deck}`);
            if (track.bpm && !isNaN(track.bpm) && track.bpm > 0) {
                audioProcessor.bpm[deck] = track.bpm;
                audioProcessor.beatLength[deck] = 60 / track.bpm;
                if (bpmDisplay) {
                    bpmDisplay.textContent = track.bpm.toFixed(1);
                }
            } else if (audioProcessor.bpm[deck] > 0) {
                // If no stored BPM but detection worked, use detected BPM
                track.bpm = audioProcessor.bpm[deck];
                if (bpmDisplay) {
                    bpmDisplay.textContent = audioProcessor.bpm[deck].toFixed(1);
                }
            } else {
                // If no valid BPM available
                if (bpmDisplay) {
                    bpmDisplay.textContent = '--';
                }
            }
            
            // Reset playhead position
            deckControls.playhead.style.left = '0%';
            
            // Reset loop state if exists
            if (deckControls.loop) {
                deckControls.loop.textContent = 'Loop In';
                deckControls.loop.classList.remove('active');
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

    // Add tracks button handler
    document.getElementById('add-tracks').addEventListener('click', (e) => {
        if (audioProcessor.isInitialized) {
            const fileInput = document.getElementById('track-file-input');
            fileInput.accept = 'audio/*,.json';  // Accept both audio and JSON files
            fileInput.click();
        }
    });

    // Deck handlers
    ['a', 'b'].forEach(deck => {
        const container = document.getElementById(`deck-${deck}`);
        const playButton = document.getElementById(`play-${deck}`);
        const pauseButton = document.getElementById(`pause-${deck}`);
        const stopButton = document.getElementById(`stop-${deck}`);
        const cueButton = document.getElementById(`cue-${deck}`);
        const loopButton = document.getElementById(`loop-${deck}`);
        const tempoControls = document.querySelector(`#deck-${deck} .transport-controls .tempo-controls`);
        const tempoMinus = document.getElementById(`tempo-minus-${deck}`);
        const tempoPlus = document.getElementById(`tempo-plus-${deck}`);
        const tempoValue = document.getElementById(`tempo-value-${deck}`);
        const resetButton = document.getElementById(`reset-${deck}`);
        const syncButton = document.getElementById(`sync-${deck}`);
        const pitchUpBtn = document.getElementById(`pitch-up-${deck}`);
        const pitchDownBtn = document.getElementById(`pitch-down-${deck}`);
        let isPlaying = false;
        let isPaused = false;
        let seekPosition = 0;
        let tempo = 100;
        let originalBPM = 0;

        // Function to update BPM display based on tempo
        const updateBPMDisplay = () => {
            const bpmDisplay = document.getElementById(`bpm-${deck}`);
            if (!bpmDisplay) return;  // Exit if BPM display element doesn't exist

            if (originalBPM === 0 && audioProcessor.currentTrack[deck]) {
                const track = tracks.find(t => t.file === audioProcessor.currentTrack[deck]);
                if (track && track.bpm) {
                    originalBPM = track.bpm;
                }
            }

            if (originalBPM > 0) {
                const adjustedBPM = (originalBPM * tempo) / 100;
                bpmDisplay.textContent = adjustedBPM.toFixed(1);
            } else {
                bpmDisplay.textContent = '--';
            }
        };

        // Add tempo adjustment handlers
        tempoMinus.addEventListener('click', () => {
            tempo = Math.max(tempo - 1, 50); // Minimum 50%
            audioProcessor.setTempo(deck, tempo);
            tempoValue.textContent = `${tempo}%`;
            updateBPMDisplay();
        });

        tempoPlus.addEventListener('click', () => {
            tempo = Math.min(tempo + 1, 150); // Maximum 150%
            audioProcessor.setTempo(deck, tempo);
            tempoValue.textContent = `${tempo}%`;
            updateBPMDisplay();
        });

        // Add reset button handler
        resetButton.addEventListener('click', () => {
            tempo = 100;
            audioProcessor.resetTempo(deck);
            tempoValue.textContent = '100%';
            updateBPMDisplay();
        });

        // Add sync button handler
        syncButton.addEventListener('click', () => {
            const result = audioProcessor.syncToDeck(deck);
            if (result.success) {
                tempo = result.tempoAdjustment;
                tempoValue.textContent = `${Math.round(tempo)}%`;
                originalBPM = result.currentBPM;
                const bpmDisplay = document.getElementById(`bpm-${deck}`);
                if (bpmDisplay) {
                    bpmDisplay.textContent = result.targetBPM.toFixed(1);
                }
                syncButton.classList.add('active');
                setTimeout(() => syncButton.classList.remove('active'), 200);
            }
        });

        // Add pitch bend handlers
        pitchUpBtn.addEventListener('mousedown', () => {
            audioProcessor.setPitch(deck, 1.15); // Speed up by 15% (reduced from 50%)
        });

        pitchUpBtn.addEventListener('mouseup', () => {
            audioProcessor.resetPitch(deck);
        });

        pitchUpBtn.addEventListener('mouseleave', () => {
            audioProcessor.resetPitch(deck);
        });

        pitchDownBtn.addEventListener('mousedown', () => {
            audioProcessor.setPitch(deck, 0.85); // Slow down by 15% (reduced from 50%)
        });

        pitchDownBtn.addEventListener('mouseup', () => {
            audioProcessor.resetPitch(deck);
        });

        pitchDownBtn.addEventListener('mouseleave', () => {
            audioProcessor.resetPitch(deck);
        });

        // Enable/disable transport buttons when track is loaded
        const updateButtonStates = (hasTrack) => {
            playButton.disabled = !hasTrack;
            pauseButton.disabled = !hasTrack;
            stopButton.disabled = !hasTrack;
        };

        // Waveform seeking
        if (container) {
            container.addEventListener('mousedown', (e) => {
                // Prevent if not left click
                if (e.button !== 0) return;
                
                const rect = container.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const position = x / rect.width;
                
                if (audioProcessor.buffers[deck]) {
                    // Store current play state
                    const wasPlaying = isPlaying;
                    
                    // Stop any current playback
                    if (audioProcessor.sources[deck]) {
                        audioProcessor.stop(deck);
                        audioProcessor.sources[deck] = null;
                    }
                    
                    // Store seek position
                    seekPosition = position;
                    
                    // Only start playback if it was already playing
                    audioProcessor.seekTo(deck, position, wasPlaying);
                    
                    // Update button states based on previous state
                    if (wasPlaying) {
                        isPlaying = true;
                        isPaused = false;
                        playButton.classList.add('active');
                    } else {
                        isPlaying = false;
                        isPaused = true;
                        playButton.classList.remove('active');
                        // Update pause position in audio processor
                        audioProcessor.pausePosition[deck] = position * audioProcessor.buffers[deck].duration;
                    }
                }
            });

            // Add waveform hover effect for better visual feedback
            container.addEventListener('mousemove', (e) => {
                const rect = container.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const position = x / rect.width;
                
                // Update cursor style
                container.style.cursor = audioProcessor.buffers[deck] ? 'pointer' : 'default';
                
                // Show potential seek position
                const seekIndicator = container.querySelector('.seek-indicator') || (() => {
                    const indicator = document.createElement('div');
                    indicator.className = 'seek-indicator';
                    container.appendChild(indicator);
                    return indicator;
                })();
                
                seekIndicator.style.left = `${position * 100}%`;
                seekIndicator.style.display = audioProcessor.buffers[deck] ? 'block' : 'none';
            });

            container.addEventListener('mouseleave', () => {
                const seekIndicator = container.querySelector('.seek-indicator');
                if (seekIndicator) {
                    seekIndicator.style.display = 'none';
                }
            });
        }

        // Loop control
        let loopState = 'in'; // States: 'in', 'out', 'active'
        loopButton.textContent = 'Loop In';
        
        loopButton.addEventListener('click', () => {
            if (!audioProcessor.buffers[deck]) return;
            
            const currentTime = audioProcessor.getCurrentTime(deck);
            
            switch (loopState) {
                case 'in':
                    // Set loop in point
                    audioProcessor.setLoopIn(deck);
                    waveforms[deck].setLoopStart(currentTime);
                    loopButton.textContent = 'Loop Out';
                    loopState = 'out';
                    break;
                    
                case 'out':
                    // Set loop out point and start looping
                    audioProcessor.setLoopOut(deck);
                    waveforms[deck].setLoopEnd(currentTime);
                    loopButton.textContent = 'Loop';
                    loopButton.classList.add('active');
                    loopState = 'active';
                    
                    // If we're not playing, set the pause position to loop start
                    if (!isPlaying) {
                        audioProcessor.pausePosition[deck] = audioProcessor.loopPoints[deck].start;
                    }
                    break;
                    
                case 'active':
                    // Toggle loop on/off
                    const newState = audioProcessor.toggleLoop(deck);
                    if (newState === 'in') {
                        // Clear loop
                        audioProcessor.clearLoop(deck);
                        waveforms[deck].clearLoop();
                        loopButton.textContent = 'Loop In';
                        loopButton.classList.remove('active');
                        loopState = 'in';
                    }
                    break;
            }
        });

        // Handle play button
        playButton.addEventListener('click', async () => {
            if (!audioProcessor.buffers[deck]) return;

            try {
                // If we have an active loop and we're not playing, start from loop start
                if (loopState === 'active' && !isPlaying) {
                    audioProcessor.startTime[deck] = audioProcessor.audioContext.currentTime;
                    audioProcessor.pausePosition[deck] = audioProcessor.loopPoints[deck].start;
                }
                
                await audioProcessor.play(deck);
                isPlaying = true;
                isPaused = false;
                playButton.classList.add('active');
                pauseButton.classList.remove('active');
                // Enable pause and stop buttons
                pauseButton.disabled = false;
                stopButton.disabled = false;
            } catch (error) {
                console.error('Error playing track:', error);
                // Reset state on error
                isPlaying = false;
                isPaused = false;
                playButton.classList.remove('active');
            }
        });

        // Handle pause button
        pauseButton.addEventListener('click', () => {
            if (!audioProcessor.buffers[deck]) return;

            if (isPlaying) {
                try {
                    audioProcessor.pause(deck);
                    isPlaying = false;
                    isPaused = true;
                    playButton.classList.remove('active');
                    pauseButton.classList.add('active');
                    // Keep stop button enabled
                    stopButton.disabled = false;
                } catch (error) {
                    console.error('Error pausing track:', error);
                    // Reset state on error
                    isPlaying = false;
                    isPaused = false;
                    playButton.classList.remove('active');
                    pauseButton.classList.remove('active');
                }
            }
        });

        // Handle stop button
        stopButton.addEventListener('click', () => {
            if (!audioProcessor.buffers[deck]) return;

            try {
                audioProcessor.stop(deck);
                isPlaying = false;
                isPaused = false;
                seekPosition = 0;
                playButton.classList.remove('active');
                pauseButton.classList.remove('active');
                // Reset button states but keep them enabled if track is loaded
                pauseButton.disabled = !audioProcessor.buffers[deck];
                stopButton.disabled = !audioProcessor.buffers[deck];
                
                // Force playhead to start position
                const playhead = document.getElementById(`playhead-${deck}`);
                playhead.style.left = '0%';

                // If we have an active loop, set pause position to loop start
                if (loopState === 'active') {
                    audioProcessor.pausePosition[deck] = audioProcessor.loopPoints[deck].start;
                } else {
                    // Reset loop UI state
                    loopState = 'in';
                    loopButton.textContent = 'Loop In';
                    loopButton.classList.remove('active');
                    waveforms[deck].clearLoop();
                }
            } catch (error) {
                console.error('Error stopping track:', error);
                // Reset state on error
                isPlaying = false;
                isPaused = false;
                playButton.classList.remove('active');
                pauseButton.classList.remove('active');
            }
        });

        // Update loadTrackToDeck function to enable all transport buttons
        const originalLoadTrackToDeck = window.loadTrackToDeck;
        window.loadTrackToDeck = async (track, deckId) => {
            await originalLoadTrackToDeck(track, deckId);
            if (deckId === deck) {
                updateButtonStates(true);
            }
        };

        // Handle cue button
        cueButton.addEventListener('mousedown', () => {
            if (!audioProcessor.buffers[deck]) return;

            if (!isPlaying) {
                // If not playing (either paused or stopped), set cue point and start preview
                audioProcessor.cue(deck);
                // Visual feedback
                cueButton.classList.add('active');
            } else {
                // Normal cue preview behavior
                audioProcessor.cue(deck);
                // Update play state since we stopped playback
                isPlaying = false;
                isPaused = false;
                playButton.classList.remove('active');
            }
        });

        cueButton.addEventListener('mouseup', () => {
            if (!audioProcessor.buffers[deck]) return;
            
            // Only release if we were previewing
            if (audioProcessor.sources[deck]?._isCuePreview) {
                audioProcessor.releaseCue(deck);
                cueButton.classList.remove('active');
            }
        });

        cueButton.addEventListener('mouseleave', () => {
            if (!audioProcessor.buffers[deck]) return;
            
            // Only release if we were previewing
            if (audioProcessor.sources[deck]?._isCuePreview) {
                audioProcessor.releaseCue(deck);
                cueButton.classList.remove('active');
            }
        });

        cueButton.addEventListener('dblclick', () => {
            audioProcessor.setCuePoint(deck);
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
                    // Adjust threshold scaling for better visual representation
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

        // Initialize fader position
        audioProcessor.setVolume(deck, 100); // Start at full volume
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
            const playButton = document.getElementById(`play-${deck}`);
            const pauseButton = document.getElementById(`pause-${deck}`);
            const stopButton = document.getElementById(`stop-${deck}`);
            const loopButton = document.getElementById(`loop-${deck}`);
            
            playButton.classList.remove('active');
            pauseButton.classList.remove('active');
            
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
}); 