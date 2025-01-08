document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing application...');

    // Elements
    const fileList = document.getElementById('file-list');
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const removeSelectedBtn = document.getElementById('remove-selected');
    const clearFilesBtn = document.getElementById('clear-files');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Initialize navigation buttons to disabled state
    document.querySelectorAll('.prev-button').forEach(button => {
        button.disabled = true;
    });
    document.querySelectorAll('.next-button').forEach(button => {
        button.disabled = true;
    });
    
    // State
    let isProcessing = false;
    let selectedFiles = new Set();
    let fileListData = [];
    let audioProcessor = new AudioProcessor();
    let currentFileIndex = -1;
    
    // Chart state
    let currentChartData = null;
    let chartDataHash = null;
    
    // Metadata handling
    let metadataTemplate = localStorage.getItem('metadataTemplate') || '{artist} - {track_name} - {comments}';
    let defaultEngineer = localStorage.getItem('defaultEngineer') || '';
    let currentMetadata = null;

    // Metadata settings modal
    const settingsModal = document.createElement('div');
    settingsModal.className = 'settings-modal';
    settingsModal.innerHTML = `
        <div class="settings-modal-content">
            <div class="settings-row">
                <label>Filename Template:</label>
                <input type="text" id="template-input" value="${metadataTemplate}">
            </div>
            <div class="settings-row">
                <label>Default Engineer:</label>
                <input type="text" id="engineer-input" value="${defaultEngineer}">
            </div>
            <div class="button-container">
                <button id="save-settings" class="control-button">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(settingsModal);

    // Metadata event handlers
    document.getElementById('metadata-settings')?.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    document.getElementById('save-settings')?.addEventListener('click', () => {
        metadataTemplate = document.getElementById('template-input').value;
        defaultEngineer = document.getElementById('engineer-input').value;
        localStorage.setItem('metadataTemplate', metadataTemplate);
        localStorage.setItem('defaultEngineer', defaultEngineer);
        settingsModal.style.display = 'none';
    });

    document.getElementById('suggest-metadata')?.addEventListener('click', () => {
        if (!currentMetadata || !fileListData.length) return;

        const currentFile = fileListData[currentFileIndex];
        const fileName = currentFile.name;
        const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
        
        // Parse filename using template
        const parts = fileNameWithoutExt.split(' - ');
        const templateParts = metadataTemplate.split(' - ');
        
        const metadata = {};
        templateParts.forEach((part, index) => {
            if (parts[index]) {
                if (part === '{artist}') metadata.artist = parts[index];
                if (part === '{track_name}') metadata.title = parts[index];
                if (part === '{comments}') metadata.comments = parts[index];
            }
        });

        // Set suggested values
        if (metadata.title) setMetadataInputValue('Title', metadata.title);
        if (metadata.artist) setMetadataInputValue('Artist', metadata.artist);
        if (defaultEngineer) setMetadataInputValue('Engineer', defaultEngineer);
    });

    document.getElementById('save-metadata')?.addEventListener('click', async () => {
        if (!fileListData.length || currentFileIndex === -1) return;

        const currentFile = fileListData[currentFileIndex];
        
        // Collect metadata from inputs
        const metadata = {};
        document.querySelectorAll('.metadata-input').forEach(input => {
            const field = input.closest('tr').cells[0].textContent;
            const value = input.value.trim();
            if (value) metadata[field] = value;
        });

        try {
            // Save metadata using the analyzer
            const result = await audioProcessor.metadataAnalyzer.saveMetadata(currentFile.file, metadata);
            if (result.success) {
                try {
                    // Show save file picker with default location
                    const handle = await window.showSaveFilePicker({
                        suggestedName: currentFile.name,
                        types: [{
                            description: 'WAV files',
                            accept: {'audio/wav': ['.wav']}
                        }]
                    });
                    
                    // Create writable stream
                    const writable = await handle.createWritable();
                    await writable.write(result.file);
                    await writable.close();

                    // Get the new filename from the handle
                    const newFileName = handle.name;
                    
                    // Only update references if the filename has changed
                    if (newFileName !== currentFile.name) {
                        // Update the filename in fileListData
                        fileListData[currentFileIndex].name = newFileName;
                        
                        // Update file list display
                        updateFileList();
                        
                        // Update file name in all tables
                        updateFileNameInTable('#file-info tbody', currentFile.name, newFileName);
                        updateFileNameInTable('#loudness-results tbody', currentFile.name, newFileName);
                        updateFileNameInTable('#multiband-rms tbody', currentFile.name, newFileName);
                        
                        // Update current file name display
                        const fileNameDisplay = document.querySelector('.current-file-name');
                        if (fileNameDisplay) {
                            fileNameDisplay.textContent = newFileName;
                        }
                    }

                    // Now that we've successfully saved the file, update the file reference
                    // and reload metadata from the actual saved file
                    const savedFile = await handle.getFile();
                    fileListData[currentFileIndex].file = savedFile;
                    fileListData[currentFileIndex].metadataFile = null; // Clear any temporary metadata file
                    
                    // Read and display the actual metadata from the saved file
                    const updatedMetadata = await audioProcessor.metadataAnalyzer.getMetadata(savedFile);
                    updateMetadataDisplay(updatedMetadata);
                    
                    showSuccess('Metadata saved successfully');
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        // If save was aborted, reload original metadata
                        const originalMetadata = await audioProcessor.metadataAnalyzer.getMetadata(currentFile.file);
                        updateMetadataDisplay(originalMetadata);
                        throw error;
                    }
                }
            } else {
                throw new Error(result.error || 'Failed to save metadata');
            }
        } catch (error) {
            showError('Error saving metadata: ' + error.message);
            // On any error, reload original metadata
            const originalMetadata = await audioProcessor.metadataAnalyzer.getMetadata(currentFile.file);
            updateMetadataDisplay(originalMetadata);
        }
    });

    // Helper function to update filename in a table
    function updateFileNameInTable(tableSelector, oldName, newName) {
        const tbody = document.querySelector(tableSelector);
        if (!tbody) return;
        
        const rows = tbody.getElementsByTagName('tr');
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].cells[0].textContent === oldName) {
                rows[i].cells[0].textContent = newName;
            }
        }
    }

    function updateMetadataDisplay(metadata) {
        currentMetadata = metadata;
        
        // Update display
        Object.entries(metadata).forEach(([field, value]) => {
            const row = findMetadataRow(field);
            if (row) {
                row.cells[1].textContent = value || '';
                const input = row.cells[2].querySelector('input');
                if (input) input.value = value || '';
            }
        });

        // Clear fields that don't have metadata
        document.querySelectorAll('#metadata-table tbody tr').forEach(row => {
            const field = row.cells[0].textContent;
            if (!metadata[field]) {
                row.cells[1].textContent = '';
                const input = row.cells[2].querySelector('input');
                if (input) input.value = '';
            }
        });
    }

    async function loadMetadata(file) {
        try {
            const metadata = await audioProcessor.metadataAnalyzer.getMetadata(file);
            currentMetadata = metadata;

            // Update display
            Object.entries(metadata).forEach(([field, value]) => {
                const row = findMetadataRow(field);
                if (row) {
                    row.cells[1].textContent = value || '';
                    const input = row.cells[2].querySelector('input');
                    if (input) input.value = value || '';
                }
            });

            // Clear fields that don't have metadata
            document.querySelectorAll('#metadata-table tbody tr').forEach(row => {
                const field = row.cells[0].textContent;
                if (!metadata[field]) {
                    row.cells[1].textContent = '';
                    const input = row.cells[2].querySelector('input');
                    if (input) input.value = '';
                }
            });
        } catch (error) {
            console.error('Error loading metadata:', error);
            showError('Error loading metadata: ' + error.message);
            throw error;
        }
    }

    function findMetadataRow(field) {
        const rows = document.querySelectorAll('#metadata-table tbody tr');
        return Array.from(rows).find(row => row.cells[0].textContent === field);
    }

    function setMetadataInputValue(field, value) {
        const row = findMetadataRow(field);
        if (row) {
            const input = row.cells[2].querySelector('input');
            if (input) input.value = value;
        }
    }

    function showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = message;
        document.body.appendChild(successDiv);
        setTimeout(() => successDiv.remove(), 3000);
    }

    // Initialize tabs
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            console.log('Switching to tab:', tabId);
            
            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // File handling
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (!isProcessing) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    });

    // Add click handler for upload zone
    uploadZone.addEventListener('click', () => {
        if (!isProcessing) {
            fileInput.click();
        }
    });

    document.querySelector('.upload-button').addEventListener('click', () => {
        if (!isProcessing) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (!isProcessing && e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    });

    async function handleFiles(files) {
        if (isProcessing) return;
        isProcessing = true;
        uploadZone.classList.add('loading');

        try {
            // First, add all files to the list
            for (const file of files) {
                const fileId = generateFileId(file);
                fileListData.push({ id: fileId, name: file.name, file });
            }
            updateFileList();

            // Stage 1: Get file info and metadata for all files
            showProcessingStatus('', 'Stage 1/4: Reading file info and metadata...');
            const fileInfoResults = [];
            for (const file of files) {
                try {
                    const fileInfo = await audioProcessor.getFileInfo(file);
                    fileInfoResults.push({ filename: file.name, file_info: fileInfo });
                    
                    // Load metadata for the file
                    const metadata = await audioProcessor.metadataAnalyzer.getMetadata(file);
                    if (metadata) {
                        updateMetadataDisplay(metadata);
                    }
                } catch (error) {
                    console.error(`Error getting file info for ${file.name}:`, error);
                    showError(`Error reading ${file.name}: ${error.message}`);
                }
            }
            updateFileInfoTable(fileInfoResults);

            // Stage 2: Process loudness for all files
            showProcessingStatus('', 'Stage 2/4: Analyzing loudness...');
            const loudnessResults = [];
            for (const file of files) {
                try {
                    const audioBuffer = await audioProcessor.loadAudioFile(file);
                    const results = await audioProcessor.loudnessAnalyzer.analyzeLoudness(audioBuffer);
                    loudnessResults.push({
                        filename: file.name,
                        lufs_i: results.integratedLoudness.toFixed(1),
                        lufs_s_max: results.shortTermMax.toFixed(1),
                        lra: results.loudnessRange.toFixed(1),
                        sample_peak: results.samplePeak.toFixed(1),
                        true_peak: results.truePeak.toFixed(1)
                    });
                    updateLoudnessTable(loudnessResults);
                } catch (error) {
                    console.error(`Error analyzing loudness for ${file.name}:`, error);
                    showError(`Error analyzing ${file.name}: ${error.message}`);
                }
            }

            // Stage 3: Process multiband for all files
            showProcessingStatus('', 'Stage 3/4: Analyzing frequency bands...');
            const multibandResults = [];
            for (const file of files) {
                try {
                    const audioBuffer = await audioProcessor.loadAudioFile(file);
                    const results = await audioProcessor.filters.processMultiband(audioBuffer);
                    multibandResults.push({
                        filename: file.name,
                        ...results
                    });
                    updateMultibandTables([...multibandResults]);
                } catch (error) {
                    console.error(`Error analyzing multiband for ${file.name}:`, error);
                    showError(`Error analyzing ${file.name}: ${error.message}`);
                }
            }

            // Initialize navigation buttons state
            document.querySelectorAll('.prev-button').forEach(button => {
                button.disabled = true;
            });
            document.querySelectorAll('.next-button').forEach(button => {
                button.disabled = true;
            });

            // Stage 4: Select the first file and show its metadata
            showProcessingStatus('', 'Stage 4/4: Loading metadata...');
            if (fileListData.length > 0) {
                currentFileIndex = 0;
                const firstFile = fileListData[0];
                
                // Update file name display immediately
                const fileNameDisplay = document.querySelector('.current-file-name');
                if (fileNameDisplay) {
                    fileNameDisplay.textContent = firstFile.name;
                }
                
                // Update all navigation buttons state
                document.querySelectorAll('.prev-button').forEach(button => {
                    button.disabled = currentFileIndex <= 0;
                });
                document.querySelectorAll('.next-button').forEach(button => {
                    button.disabled = currentFileIndex >= fileListData.length - 1;
                });
                
                const metadata = await audioProcessor.metadataAnalyzer.getMetadata(firstFile.file);
                updateMetadataDisplay(metadata);
            }

        } finally {
            isProcessing = false;
            uploadZone.classList.remove('loading');
            clearProcessingStatus();
            fileInput.value = '';
        }
    }

    function updateFileList() {
        // Clear the file list
        while (fileList.firstChild) {
            fileList.removeChild(fileList.firstChild);
        }

        // Update file list display
        fileListData.forEach((fileData, index) => {
            const row = document.createElement('div');
            row.className = 'file-list-item';
            if (selectedFiles.has(index)) {
                row.classList.add('selected');
            }
            row.dataset.index = index;
            row.textContent = fileData.name;
            fileList.appendChild(row);
        });

        updateButtonStates();
    }

    function updateFileInfoTable(results) {
        const tbody = document.querySelector('#file-info tbody');
        if (!tbody) return;

        results.forEach(result => {
            if (!result.file_info) return;
            
            const info = result.file_info;
            const existingRow = Array.from(tbody.rows).find(row => 
                row.cells[0].textContent === result.filename
            );
            
            const rowContent = `
                    <td>${result.filename}</td>
                    <td>WAV</td>
                    <td>${info.sample_rate}</td>
                    <td>${info.bit_depth}</td>
                    <td>${info.duration}</td>
                    <td>${info.file_size}</td>
                `;

            if (existingRow) {
                existingRow.innerHTML = rowContent;
            } else {
                const row = tbody.insertRow();
                row.innerHTML = rowContent;
            }
        });
    }

    function updateLoudnessTable(results) {
        const tbody = document.querySelector('#loudness-results tbody');
        if (!tbody) return;

        results.forEach(result => {
            const existingRow = Array.from(tbody.rows).find(row => 
                row.cells[0].textContent === result.filename
            );
            
            const rowContent = `
                <td>${result.filename}</td>
                <td>${result.lufs_i ? result.lufs_i : 'N/A'}</td>
                <td>${result.lufs_s_max ? result.lufs_s_max : 'N/A'}</td>
                <td>${result.lra ? result.lra : 'N/A'}</td>
                <td>${result.sample_peak ? result.sample_peak : 'N/A'}</td>
                <td>${result.true_peak ? result.true_peak : 'N/A'}</td>
            `;
            
            if (existingRow) {
                existingRow.innerHTML = rowContent;
            } else {
                const row = tbody.insertRow();
                row.innerHTML = rowContent;
            }
        });
    }

    function updateMultibandTables(results) {
        const rmsTableBody = document.querySelector('#multiband-rms tbody');
        // const ratiosTableBody = document.querySelector('#multiband-ratios tbody');
        const createChartBtn = document.getElementById('create-chart');

        results.forEach(result => {
            // Update RMS table
            const rmsRowContent = `
                <td>${result.filename}</td>
                <td>${result.low.toFixed(1)}</td>
                <td>${result.mid.toFixed(1)}</td>
                <td>${result.high.toFixed(1)}</td>
            `;

            updateTableRow(rmsTableBody, result.filename, rmsRowContent);

            // Calculate and update ratios - commented out for now
            /*
            const lowMidRatio = Math.pow(10, (result.low - result.mid) / 20);
            const midHighRatio = Math.pow(10, (result.mid - result.high) / 20);
            
            const ratiosRowContent = `
                <td>${result.filename}</td>
                <td>${lowMidRatio.toFixed(2)}</td>
                <td>${midHighRatio.toFixed(2)}</td>
            `;

            updateTableRow(ratiosTableBody, result.filename, ratiosRowContent);
            */
        });

        // Enable chart button if we have data
        if (createChartBtn) {
            createChartBtn.disabled = !document.querySelector('#multiband-rms tbody tr');
        }
    }

    function updateTableRow(tbody, filename, content) {
        if (!tbody) return;
        
        const existingRow = Array.from(tbody.rows).find(row => 
            row.cells[0].textContent === filename
        );
        
        if (existingRow) {
            existingRow.innerHTML = content;
        } else {
            const row = tbody.insertRow();
            row.innerHTML = content;
        }
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    function generateFileId(file) {
        return `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    function removeFiles(indices) {
        // Remove files from fileListData
        indices.sort((a, b) => b - a); // Sort in descending order to avoid index shifting
        indices.forEach(index => {
            const filename = fileListData[index].name;
            fileListData.splice(index, 1);
            
            // Remove from all results tables
            removeFromTable('#file-info tbody', filename);
            removeFromTable('#loudness-results tbody', filename);
            removeFromTable('#multiband-rms tbody', filename);
            removeFromTable('#multiband-ratios tbody', filename);
        });
        
        // Clear selected files and update display
        selectedFiles.clear();
        updateFileList();

        // Clear chart if no files remain
        if (fileListData.length === 0 && window.multibandChart) {
            window.multibandChart.destroy();
            window.multibandChart = null;
            chartDataHash = null;
            currentChartData = null;
        }

        // Clear metadata display if no files remain
        if (fileListData.length === 0) {
            currentFileIndex = -1;
            // Clear file name display
            const fileNameDisplay = document.querySelector('.current-file-name');
            if (fileNameDisplay) {
                fileNameDisplay.textContent = '';
            }
            // Clear metadata fields
            document.querySelectorAll('#metadata-table tbody tr').forEach(row => {
                row.cells[1].textContent = '';
                const input = row.cells[2].querySelector('input');
                if (input) input.value = '';
            });
            // Disable navigation buttons
            const prevButton = document.querySelector('.prev-button');
            const nextButton = document.querySelector('.next-button');
            if (prevButton) prevButton.disabled = true;
            if (nextButton) nextButton.disabled = true;
        } else {
            // If files remain, show the first one
            currentFileIndex = 0;
            updateMetadataView();
        }
    }

    function removeFromTable(tableSelector, filename) {
        const tbody = document.querySelector(tableSelector);
        if (!tbody) return;
        
        const rows = tbody.getElementsByTagName('tr');
        for (let i = rows.length - 1; i >= 0; i--) {
            if (rows[i].cells[0].textContent === filename) {
                tbody.deleteRow(i);
            }
        }
    }

    // Event listeners for file removal
    removeSelectedBtn.addEventListener('click', () => {
        const selectedIndexes = Array.from(selectedFiles).sort((a, b) => b - a);
        selectedIndexes.forEach(index => {
            const fileToRemove = fileListData[index];
            // Remove from tables
            ['#file-info tbody', '#loudness-results tbody', '#multiband-rms tbody'].forEach(selector => {
                removeFromTable(selector, fileToRemove.name);
            });
            fileListData.splice(index, 1);
        });
        selectedFiles.clear();
        updateFileList();
        updateButtonStates();
    });

    // Add event listener for clear files button
    clearFilesBtn.addEventListener('click', () => {
        fileListData = [];
        selectedFiles.clear();
        updateFileList();
        updateButtonStates();
        
        // Clear all tables
        ['#file-info tbody', '#loudness-results tbody', '#multiband-rms tbody'].forEach(selector => {
            const tbody = document.querySelector(selector);
            if (tbody) tbody.innerHTML = '';
        });
    });

    // File selection handling
    fileList.addEventListener('click', async (e) => {
        const item = e.target.closest('.file-list-item');
        if (!item) return;

        const index = parseInt(item.dataset.index);
        
        // Toggle selection for file operations
        if (selectedFiles.has(index)) {
            selectedFiles.delete(index);
            item.classList.remove('selected');
        } else {
            selectedFiles.add(index);
            item.classList.add('selected');
        }
        updateButtonStates();

        // Update current file index and metadata view
        currentFileIndex = index;
        updateMetadataView();
    });

    // Create Chart button handler
    document.getElementById('create-chart')?.addEventListener('click', () => {
        console.log('Chart button clicked');
        const rows = document.querySelectorAll('#multiband-rms tbody tr');
        if (!rows || rows.length === 0) {
            showError('No data available to view chart');
            return;
        }

        const data = Array.from(rows).map(row => ({
            filename: row.cells[0].textContent,
            low: parseFloat(row.cells[1].textContent),
            mid: parseFloat(row.cells[2].textContent),
            high: parseFloat(row.cells[3].textContent)
        }));
        console.log('Data prepared:', data);

        // Show modal
        const modal = document.getElementById('chart-modal');
        modal.style.display = 'flex';
        console.log('Modal shown');

        // Create new chart
        createMultibandChart(data);
        chartDataHash = JSON.stringify(data);
        currentChartData = data;
        console.log('Chart created');
    });

    // Modal close button handler
    document.querySelector('.close-button')?.addEventListener('click', () => {
        document.getElementById('chart-modal').style.display = 'none';
    });

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('chart-modal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    function createMultibandChart(data) {
        console.log('Creating chart with data:', data);
        const canvas = document.getElementById('multiband-chart');
        console.log('Canvas element:', canvas);
        
        const ctx = canvas.getContext('2d');
        console.log('Canvas context:', ctx);
        
        // Destroy existing chart if it exists
        if (window.multibandChart) {
            console.log('Destroying existing chart');
            window.multibandChart.destroy();
        }

        // Variables for selection box
        let isSelecting = false;
        let startY = 0;
        let currentY = 0;
        let selectionBox = null;

        // Create frequency bands array
        const frequencyBands = ['Low', 'Mid', 'High'];

        // Generate rainbow colors for each file
        const colors = generateRainbowColors(data.length);

        // Create datasets - one line per file
        const datasets = data.map((fileData, index) => ({
            label: fileData.filename.replace('.wav', ''),
            data: [fileData.low, fileData.mid, fileData.high],
            borderColor: colors[index],
            backgroundColor: colors[index],
            borderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            tension: 0.1,
            pointStyle: 'circle',
            fill: false
        }));

        console.log('Creating new chart with datasets:', datasets);

        window.multibandChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: frequencyBands,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                aspectRatio: 0.01,
                layout: {
                    padding: {
                        top: 20,
                        right: 60,
                        bottom: 10,
                        left: 80
                    }
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = 'crosshair';
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        min: -37,
                        max: 0,
                        grid: {
                            color: function(context) {
                                if (context.tick && context.tick.value % 5 === 0) {
                                    return 'rgba(255, 255, 255, 0.15)';
                                }
                                return 'rgba(255, 255, 255, 0.05)';
                            },
                            lineWidth: function(context) {
                                if (context.tick && context.tick.value % 5 === 0) {
                                    return 1;
                                }
                                return 0.5;
                            },
                            drawBorder: true,
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            tickLength: 10,
                            drawTicks: true,
                            offset: false,
                            display: true
                        },
                        border: {
                            width: 1,
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.8)',
                            font: {
                                size: 11,
                                family: 'monospace'
                            },
                            padding: 8,
                            stepSize: 1,
                            autoSkip: false,
                            maxRotation: 0,
                            callback: function(value) {
                                return value % 5 === 0 ? value : '';
                            }
                        },
                        title: {
                            display: true,
                            text: 'RMS Level (dB)',
                            color: 'rgba(255, 255, 255, 0.8)',
                            font: {
                                size: 12,
                                weight: 'normal',
                                family: 'monospace'
                            },
                            padding: {
                                top: 15,
                                bottom: 15
                            }
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            lineWidth: 0.5,
                            drawBorder: true,
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            tickLength: 10,
                            drawTicks: true,
                            offset: false
                        },
                        border: {
                            width: 1,
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.8)',
                            font: {
                                size: 12,
                                family: 'monospace'
                            },
                            padding: 12
                        },
                        title: {
                            display: true,
                            text: 'Frequency Bands',
                            color: 'rgba(255, 255, 255, 0.8)',
                            font: {
                                size: 12,
                                weight: 'normal',
                                family: 'monospace'
                            },
                            padding: {
                                top: 15,
                                bottom: 10
                            }
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Multiband RMS Analysis',
                        color: 'rgba(255, 255, 255, 0.9)',
                        font: {
                            size: 16,
                            weight: 'normal',
                            family: 'monospace'
                        },
                        padding: {
                            top: 20,
                            bottom: 25
                        }
                    },
                    legend: {
                        position: 'top',
                        align: 'start',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.8)',
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: {
                                size: 12,
                                family: 'monospace'
                            },
                            boxWidth: 8,
                            boxHeight: 8
                        }
                    }
                }
            },
            plugins: [{
                id: 'customBackground',
                beforeDraw: (chart) => {
                    const ctx = chart.canvas.getContext('2d');
                    ctx.save();
                    ctx.fillStyle = '#2b2b2b';
                    ctx.fillRect(0, 0, chart.width, chart.height);
                    ctx.restore();
                }
            }, {
                id: 'selectionBox',
                afterDraw: (chart) => {
                    if (isSelecting && selectionBox) {
                        const ctx = chart.ctx;
                        const yAxis = chart.scales.y;
                        const chartArea = chart.chartArea;
                        
                        // Draw selection box
                        ctx.save();
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                        ctx.lineWidth = 1;
                        
                        const boxTop = Math.min(startY, currentY);
                        const boxHeight = Math.abs(currentY - startY);
                        
                        ctx.fillRect(chartArea.left, boxTop, chartArea.right - chartArea.left, boxHeight);
                        ctx.strokeRect(chartArea.left, boxTop, chartArea.right - chartArea.left, boxHeight);

                        // Draw dB range label
                        const startDb = yAxis.getValueForPixel(startY);
                        const currentDb = yAxis.getValueForPixel(currentY);
                        const dbRange = Math.abs(startDb - currentDb).toFixed(1);
                        
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                        ctx.font = '12px monospace';
                        ctx.textAlign = 'right';
                        const text = `Range: ${dbRange} dB`;
                        ctx.fillText(text, chartArea.right - 10, boxTop - 5);
                        
                        ctx.restore();
                    }
                }
            }]
        });

        // Add mouse event listeners for selection box
        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const point = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            const position = Chart.helpers.getRelativePosition(point, window.multibandChart);
            const chartArea = window.multibandChart.chartArea;
            
            // Only start selection if within chart area
            if (position.y >= chartArea.top && position.y <= chartArea.bottom) {
                isSelecting = true;
                startY = position.y;
                currentY = startY;
                selectionBox = { start: startY, end: startY };
                window.multibandChart.draw();
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const point = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            const position = Chart.helpers.getRelativePosition(point, window.multibandChart);
            const chartArea = window.multibandChart.chartArea;

            // Update cursor style based on chart area
            if (position.y >= chartArea.top && position.y <= chartArea.bottom) {
                canvas.style.cursor = 'crosshair';
            } else {
                canvas.style.cursor = 'default';
            }
            
            if (isSelecting) {
                currentY = Math.max(chartArea.top, Math.min(chartArea.bottom, position.y));
                selectionBox.end = currentY;
                window.multibandChart.draw();
            }
        });

        window.addEventListener('mouseup', () => {
            if (isSelecting) {
                isSelecting = false;
                selectionBox = null;
                window.multibandChart.draw();
            }
        });
    }

    // Helper function to generate rainbow colors like Python's plt.cm.rainbow
    function generateRainbowColors(count) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = (i / count) * 360;
            colors.push(`hsl(${hue}, 100%, 50%)`);
        }
        return colors;
    }

    function showProcessingStatus(filename, status) {
        const statusDiv = document.getElementById('status-text');
        if (statusDiv) {
            statusDiv.textContent = status;
        }
    }

    function clearProcessingStatus() {
        const statusDiv = document.getElementById('status-text');
        if (statusDiv) {
            statusDiv.textContent = '';
        }
    }

    // Navigation buttons
    document.querySelectorAll('.prev-button').forEach(button => {
        button.addEventListener('click', () => {
            if (currentFileIndex > 0) {
                currentFileIndex--;
                updateMetadataView();
            }
        });
    });

    document.querySelectorAll('.next-button').forEach(button => {
        button.addEventListener('click', () => {
            if (currentFileIndex < fileListData.length - 1) {
                currentFileIndex++;
                updateMetadataView();
            }
        });
    });

    async function updateMetadataView() {
        // Update current file name display
        const currentFile = fileListData[currentFileIndex];
        const fileNameDisplay = document.querySelector('.current-file-name');
        if (fileNameDisplay) {
            fileNameDisplay.textContent = currentFile.name;
        }

        // Update all navigation buttons state
        document.querySelectorAll('.prev-button').forEach(button => {
            button.disabled = currentFileIndex <= 0;
        });
        document.querySelectorAll('.next-button').forEach(button => {
            button.disabled = currentFileIndex >= fileListData.length - 1;
        });

        // Load metadata for current file
        try {
            const fileToRead = currentFile.metadataFile || currentFile.file;
            const metadata = await audioProcessor.metadataAnalyzer.getMetadata(fileToRead);
            updateMetadataDisplay(metadata);
        } catch (error) {
            console.error('Error loading metadata:', error);
            showError('Error loading metadata: ' + error.message);
        }
    }

    // Update file info in the table
    function updateFileInfo(file, audioBuffer) {
        const duration = formatDuration(audioBuffer.duration);
        const sampleRate = audioBuffer.sampleRate;
        const bitDepth = 16; // WAV files are typically 16-bit
        const format = 'WAV';
        
        const fileInfo = {
            name: file.name,
            format: format,
            sampleRate: `${sampleRate.toLocaleString()} Hz`,
            bitDepth: `${bitDepth}-bit`,
            duration: duration,
            size: formatFileSize(file.size)
        };

        // Update file info table
        const table = document.getElementById('file-info-table');
        const row = table.insertRow(-1);
        
        Object.values(fileInfo).forEach(value => {
            const cell = row.insertCell(-1);
            cell.textContent = value;
        });

        return fileInfo;
    }

    function updateButtonStates() {
        const hasSelection = selectedFiles.size > 0;
        removeSelectedBtn.disabled = !hasSelection;
        clearFilesBtn.disabled = fileListData.length === 0;
    }
}); 