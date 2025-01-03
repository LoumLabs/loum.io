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
    
    // State
    let isProcessing = false;
    let selectedFiles = new Set();
    let fileListData = [];
    let audioProcessor = new AudioProcessor();
    
    // Chart state
    let currentChartData = null;
    let chartDataHash = null;
    
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

            // Stage 1: Get file info for all files
            showProcessingStatus('', 'Stage 1/3: Reading file info...');
            const fileInfoResults = [];
            for (const file of files) {
                try {
                    const fileInfo = await audioProcessor.getFileInfo(file);
                    fileInfoResults.push({ filename: file.name, file_info: fileInfo });
                } catch (error) {
                    console.error(`Error getting file info for ${file.name}:`, error);
                    showError(`Error reading ${file.name}: ${error.message}`);
                }
            }
            updateFileInfoTable(fileInfoResults);

            // Stage 2: Process loudness for all files
            showProcessingStatus('', 'Stage 2/3: Analyzing loudness...');
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
            showProcessingStatus('', 'Stage 3/3: Analyzing frequency bands...');
            const multibandResults = [];
            for (const file of files) {
                try {
                    const audioBuffer = await audioProcessor.loadAudioFile(file);
                    const results = await audioProcessor.filters.processMultiband(audioBuffer);
                    multibandResults.push({
                        filename: file.name,
                        ...results
                    });
                    updateMultibandTables(multibandResults);
                } catch (error) {
                    console.error(`Error analyzing multiband for ${file.name}:`, error);
                    showError(`Error analyzing ${file.name}: ${error.message}`);
                }
            }

        } finally {
            isProcessing = false;
            uploadZone.classList.remove('loading');
            clearProcessingStatus();
            fileInput.value = '';
        }
    }

    function updateFileList() {
        fileList.innerHTML = '';
        fileListData.forEach((fileData, index) => {
            const item = document.createElement('div');
            item.className = 'file-list-item';
            item.dataset.index = index;
            item.textContent = fileData.name;
            if (selectedFiles.has(index)) {
                item.classList.add('selected');
            }
            fileList.appendChild(item);
        });
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
                    <td>${info.format}</td>
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
        
        const existingErrors = uploadZone.querySelectorAll('.error-message');
        existingErrors.forEach(err => err.remove());
        
        uploadZone.appendChild(errorDiv);
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
        if (!isProcessing && selectedFiles.size > 0) {
            removeFiles(Array.from(selectedFiles));
        }
    });

    clearFilesBtn.addEventListener('click', () => {
        if (!isProcessing) {
            removeFiles(Array.from(fileListData.keys()));
        }
    });

    // File selection handling
    fileList.addEventListener('click', (e) => {
        const item = e.target.closest('.file-list-item');
        if (!item) return;

        const index = parseInt(item.dataset.index);
        if (selectedFiles.has(index)) {
            selectedFiles.delete(index);
            item.classList.remove('selected');
        } else {
            selectedFiles.add(index);
            item.classList.add('selected');
        }
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
            }]
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
}); 