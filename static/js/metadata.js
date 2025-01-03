class MetadataAnalyzer {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async getMetadata(file) {
        try {
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            const tags = this.parseWAVMetadata(arrayBuffer);

            // Log metadata for debugging
            console.log('Read metadata:', tags);

            return tags;
        } catch (error) {
            console.error('Error reading metadata:', error);
            return {};
        }
    }

    async readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e.target.error);
            reader.readAsArrayBuffer(file);
        });
    }

    async parseID3(arrayBuffer) {
        const tags = {};
        
        try {
            // Look for ID3 header
            const view = new DataView(arrayBuffer);
            if (view.getUint32(0) === 0x52494646) { // "RIFF" header
                // Parse WAV metadata
                return this.parseWAVMetadata(arrayBuffer);
            }

            // Check for ID3v2 header
            if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2)) === 'ID3') {
                // Parse ID3v2 tags
                return this.parseID3v2Tags(arrayBuffer);
            }
        } catch (error) {
            console.warn('Error parsing metadata tags:', error);
        }

        return tags;
    }

    parseWAVMetadata(arrayBuffer) {
        const tags = {};
        const view = new DataView(arrayBuffer);
        let offset = 12; // Skip RIFF header

        try {
            // Validate RIFF header
            const riffHeader = String.fromCharCode(
                view.getUint8(0),
                view.getUint8(1),
                view.getUint8(2),
                view.getUint8(3)
            );
            
            if (riffHeader !== 'RIFF') {
                console.warn('Invalid RIFF header');
                return tags;
            }

            const fileSize = view.getUint32(4, true);
            // Allow for padding bytes in size check
            if (Math.abs(fileSize + 8 - arrayBuffer.byteLength) > 2) {
                console.warn('Significant file size mismatch:', { expected: fileSize + 8, actual: arrayBuffer.byteLength });
            }

            const waveHeader = String.fromCharCode(
                view.getUint8(8),
                view.getUint8(9),
                view.getUint8(10),
                view.getUint8(11)
            );
            
            if (waveHeader !== 'WAVE') {
                console.warn('Invalid WAVE header');
                return tags;
            }

            // Track chunk positions for validation
            let lastChunkEnd = 12;
            let foundFmt = false;

            while (offset < arrayBuffer.byteLength - 8) {
                // Ensure we can read chunk header
                if (offset + 8 > arrayBuffer.byteLength) {
                    console.log('Reached end of file while reading chunk header');
                    break;
                }

                const chunkId = String.fromCharCode(
                    view.getUint8(offset),
                    view.getUint8(offset + 1),
                    view.getUint8(offset + 2),
                    view.getUint8(offset + 3)
                );

                // Validate chunk ID (should be printable ASCII)
                if (!chunkId.match(/^[\x20-\x7E]{4}$/)) {
                    console.warn('Invalid chunk ID at offset:', offset);
                    break;
                }

                const chunkSize = view.getUint32(offset + 4, true);

                // Validate chunk size
                if (chunkSize < 0 || offset + 8 + chunkSize > arrayBuffer.byteLength) {
                    console.warn('Invalid chunk size:', {
                        id: chunkId,
                        size: chunkSize,
                        offset: offset,
                        available: arrayBuffer.byteLength - offset - 8
                    });
                    break;
                }

                // Track fmt chunk for validation
                if (chunkId === 'fmt ') {
                    foundFmt = true;
                }

                if (chunkId === 'LIST') {
                    // Ensure we can read the list type
                    if (offset + 12 <= arrayBuffer.byteLength) {
                        const listType = String.fromCharCode(
                            view.getUint8(offset + 8),
                            view.getUint8(offset + 9),
                            view.getUint8(offset + 10),
                            view.getUint8(offset + 11)
                        );

                        if (listType === 'INFO') {
                            // Calculate actual INFO data size (chunk size minus LIST type)
                            const infoSize = chunkSize - 4;
                            
                            // Validate INFO chunk size
                            if (infoSize > 0 && offset + 12 + infoSize <= arrayBuffer.byteLength) {
                                this.parseINFOChunk(arrayBuffer, offset + 12, infoSize, tags);
                            } else {
                                console.warn('Invalid INFO chunk size:', {
                                    offset: offset + 12,
                                    size: infoSize,
                                    available: arrayBuffer.byteLength - offset - 12
                                });
                            }
                        }
                    }
                }

                // Update last chunk position
                lastChunkEnd = offset + 8 + chunkSize;
                if (chunkSize % 2 !== 0) lastChunkEnd++; // Account for padding

                // Move to next chunk, including padding
                offset = lastChunkEnd;

                // Validate next chunk alignment
                if (offset % 2 !== 0) {
                    console.warn('Chunk not aligned at offset:', offset);
                    break;
                }
            }

            // Validate we found required chunks
            if (!foundFmt) {
                console.warn('No fmt chunk found');
            }

        } catch (error) {
            console.warn('Error parsing WAV metadata:', error);
        }

        return tags;
    }

    parseINFOChunk(arrayBuffer, offset, size, tags) {
        const view = new DataView(arrayBuffer);
        const decoder = new TextDecoder('utf-8');
        let pos = offset;

        // Map INFO chunk IDs to metadata fields (matching desktop app)
        const fieldMap = {
            'INAM': 'Title',
            'IART': 'Artist',
            'IPRD': 'Album',
            'IGNR': 'Genre',
            'ICRD': 'Year',
            'ICOM': 'Composer',
            'IPUB': 'Publisher',
            'ICOP': 'Copyright',
            'ISRC': 'ISRC',
            'IENG': 'Engineer',
            'ISFT': 'Encoder',
            'ICMT': 'Comments'
        };

        try {
            // Validate initial offset and size
            if (offset < 0 || size < 0 || offset + size > arrayBuffer.byteLength) {
                console.warn('Invalid INFO chunk bounds:', { offset, size });
                return tags;
            }

            // Calculate exact end position of INFO chunk
            const maxPos = Math.min(offset + size, arrayBuffer.byteLength);
            
            // Log chunk details for debugging
            console.log('Parsing INFO chunk:', {
                offset: offset,
                size: size,
                maxPos: maxPos,
                bufferLength: arrayBuffer.byteLength
            });

            // Ensure we have enough space for at least one field
            if (maxPos - pos < 8) {
                console.log('INFO chunk too small for fields');
                return tags;
            }

            // Track the total bytes read to ensure we don't exceed chunk size
            let bytesRead = 0;

            while (bytesRead < size - 8) { // Need at least 8 bytes for field header
                // Validate remaining space
                const remainingBytes = size - bytesRead;
                if (remainingBytes < 8) {
                    console.log('Reached end of INFO chunk (less than header size remains)');
                    break;
                }

                // Read field ID with bounds checking
                let fieldId;
                try {
                    fieldId = String.fromCharCode(
                        view.getUint8(pos),
                        view.getUint8(pos + 1),
                        view.getUint8(pos + 2),
                        view.getUint8(pos + 3)
                    );
                } catch (e) {
                    console.warn('Error reading field ID at offset:', pos);
                    break;
                }

                // Validate field ID format (must be 4 printable ASCII characters)
                if (!fieldId.match(/^[\x20-\x7E]{4}$/)) {
                    console.log('Reached end of valid metadata at offset:', pos);
                    break;
                }

                // Read field size with bounds checking
                let fieldSize;
                try {
                    fieldSize = view.getUint32(pos + 4, true);
                } catch (e) {
                    console.warn('Error reading field size at offset:', pos + 4);
                    break;
                }

                // Validate field size against remaining chunk space
                const remainingSpace = size - bytesRead - 8;
                if (fieldSize <= 0 || fieldSize > remainingSpace) {
                    console.log('Field size exceeds remaining chunk space:', {
                        fieldId,
                        fieldSize,
                        remainingSpace
                    });
                    break;
                }

                try {
                    // Read field value
                    const fieldData = new Uint8Array(arrayBuffer, pos + 8, fieldSize);
                    let value = decoder.decode(fieldData).replace(/\0+$/, '').trim();

                    // Map the field ID to our metadata field name
                    const fieldName = fieldMap[fieldId];
                    if (fieldName && value) {
                        // Special handling for certain fields (matching desktop app)
                        switch (fieldId) {
                            case 'ICRD': // Year field
                                const yearMatch = value.match(/\d{4}/);
                                if (yearMatch) {
                                    value = yearMatch[0];
                                }
                                break;
                            case 'IENG': // Engineer field
                                // Keep full engineer name/info
                                break;
                            case 'ISFT': // Encoder field
                                // Keep version info if present
                                break;
                        }
                        tags[fieldName] = value;
                        
                        // Log successful field read
                        console.log('Read metadata field:', {
                            id: fieldId,
                            name: fieldName,
                            size: fieldSize,
                            value: value,
                            position: pos
                        });
                    }

                    // Move to next field, including padding
                    const totalFieldSize = 8 + fieldSize + (fieldSize % 2); // header + data + padding
                    pos += totalFieldSize;
                    bytesRead += totalFieldSize;

                    // Break if we've reached or exceeded the chunk size
                    if (bytesRead >= size) {
                        console.log('Reached end of INFO chunk');
                        break;
                    }
                } catch (fieldError) {
                    console.warn('Error parsing field:', {
                        id: fieldId,
                        error: fieldError,
                        position: pos
                    });
                    break;
                }
            }
        } catch (error) {
            console.warn('Error parsing INFO chunk:', error);
        }

        return tags;
    }

    parseID3v2Tags(arrayBuffer) {
        const tags = {};
        const view = new DataView(arrayBuffer);
        const decoder = new TextDecoder('utf-8');

        // Skip ID3 header
        let offset = 10;
        const size = this.syncSafeInt(view.getUint32(6));

        while (offset < size) {
            const frameId = String.fromCharCode(
                view.getUint8(offset),
                view.getUint8(offset + 1),
                view.getUint8(offset + 2),
                view.getUint8(offset + 3)
            );
            const frameSize = view.getUint32(offset + 4);
            const frameData = new Uint8Array(arrayBuffer, offset + 10, frameSize - 1);
            
            // Map ID3v2 frames to our metadata fields
            const value = decoder.decode(frameData).replace(/\0+$/, '');
            switch (frameId) {
                case 'TIT2': tags.Title = value; break;
                case 'TPE1': tags.Artist = value; break;
                case 'TALB': tags.Album = value; break;
                case 'TCON': tags.Genre = value; break;
                case 'TYER': tags.Year = value; break;
                case 'TENC': tags.Engineer = value; break;
                case 'TCOP': tags.Copyright = value; break;
                case 'TSRC': tags.ISRC = value; break;
            }

            offset += 10 + frameSize;
        }

        return tags;
    }

    syncSafeInt(num) {
        return ((num & 0x7f000000) >> 3) |
               ((num & 0x007f0000) >> 2) |
               ((num & 0x00007f00) >> 1) |
               ((num & 0x0000007f));
    }

    async saveMetadata(file, metadata) {
        try {
            // Read the original file
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            console.log('Original file size:', arrayBuffer.byteLength);

            // Create backup buffer
            const backupBuffer = arrayBuffer.slice(0);

            // Store original metadata for verification
            const originalMetadata = await this.getMetadata(file);

            // Verify WAV structure
            if (!this.verifyWAVStructure(arrayBuffer)) {
                throw new Error('Invalid WAV file structure');
            }

            // Calculate original audio hash
            const originalHash = this.calculateAudioHash(arrayBuffer);
            if (!originalHash) {
                throw new Error('Could not calculate audio hash');
            }
            console.log('Original audio hash:', originalHash);

            try {
                // Update WAV metadata - this returns a new buffer
                const newBuffer = await this.updateWAVMetadata(arrayBuffer, metadata);

                // Verify the new file
                if (!this.verifyWAVStructure(newBuffer)) {
                    throw new Error('Modified file has invalid WAV structure');
                }

                // Calculate new hash and compare
                const newHash = this.calculateAudioHash(newBuffer);
                console.log('New audio hash:', newHash);
                
                if (!newHash || newHash !== originalHash) {
                    throw new Error('Audio data integrity check failed');
                }

                // Compare audio specifications
                if (!this.compareAudioSpecs(arrayBuffer, newBuffer)) {
                    throw new Error('Audio specifications changed during metadata update');
                }

                // Create new file with modified metadata
                const modifiedFile = new File([newBuffer], file.name, { type: file.type });

                // Verify metadata was written correctly
                const newMetadata = await this.getMetadata(modifiedFile);
                if (!this.verifyMetadataWrite(metadata, newMetadata)) {
                    throw new Error('Metadata verification failed');
                }

                console.log('Successfully created modified file');

                return {
                    success: true,
                    file: modifiedFile,
                    originalMetadata,
                    newMetadata
                };
            } catch (error) {
                // If anything goes wrong, return a file created from the backup buffer
                console.error('Error during metadata modification:', error);
                const restoredFile = new File([backupBuffer], file.name, { type: file.type });
                return {
                    success: false,
                    error: error.message,
                    file: restoredFile,
                    originalMetadata
                };
            }
        } catch (error) {
            console.error('Error saving metadata:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    verifyMetadataWrite(expected, actual) {
        // Map between our field names and INFO chunk IDs
        const fieldMap = {
            'Title': ['INAM', 'title'],
            'Artist': ['IART', 'artist'],
            'Album': ['IPRD', 'album'],
            'Genre': ['IGNR', 'genre'],
            'Year': ['ICRD', 'date'],
            'Composer': ['ICOM', 'composer'],
            'Publisher': ['IPUB', 'publisher'],
            'Copyright': ['ICOP', 'copyright'],
            'ISRC': ['ISRC', 'isrc'],
            'Engineer': ['IENG', 'engineer'],
            'Encoder': ['ISFT', 'encoder'],
            'Comments': ['ICMT', 'comment']
        };

        // Check each expected field
        for (const [field, value] of Object.entries(expected)) {
            if (!value) continue; // Skip empty values

            // Get possible field names from the map
            const possibleFields = fieldMap[field] || [];
            
            // Try to find the value in the actual metadata
            const actualValue = possibleFields.reduce((found, key) => {
                return found || actual[key] || actual[field];
            }, null);

            if (!actualValue || actualValue.trim() !== value.trim()) {
                console.warn('Metadata verification failed for field:', {
                    field,
                    expected: value,
                    actual: actualValue
                });
                return false;
            }
        }

        return true;
    }

    compareAudioSpecs(buffer1, buffer2) {
        try {
            // Compare fmt chunks
            const fmt1 = this.getFmtChunk(buffer1);
            const fmt2 = this.getFmtChunk(buffer2);

            if (!fmt1 || !fmt2) {
                console.warn('Could not find fmt chunks for comparison');
                return false;
            }

            // Compare essential audio parameters
            const view1 = new DataView(buffer1, fmt1.offset + 8, fmt1.size);
            const view2 = new DataView(buffer2, fmt2.offset + 8, fmt2.size);

            const params = [
                { name: 'format', size: 2, getter: 'getUint16' },
                { name: 'channels', size: 2, getter: 'getUint16' },
                { name: 'sampleRate', size: 4, getter: 'getUint32' },
                { name: 'byteRate', size: 4, getter: 'getUint32' },
                { name: 'blockAlign', size: 2, getter: 'getUint16' },
                { name: 'bitsPerSample', size: 2, getter: 'getUint16' }
            ];

            let offset = 0;
            for (const param of params) {
                const value1 = view1[param.getter](offset, true);
                const value2 = view2[param.getter](offset, true);
                
                if (value1 !== value2) {
                    console.warn(`Mismatch in ${param.name}:`, { original: value1, modified: value2 });
                    return false;
                }
                
                offset += param.size;
            }

            return true;
        } catch (error) {
            console.warn('Error comparing audio specs:', error);
            return false;
        }
    }

    getFmtChunk(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        let offset = 12; // Skip RIFF header

        while (offset < arrayBuffer.byteLength - 8) {
            const chunkId = String.fromCharCode(
                view.getUint8(offset),
                view.getUint8(offset + 1),
                view.getUint8(offset + 2),
                view.getUint8(offset + 3)
            );
            const chunkSize = view.getUint32(offset + 4, true);

            if (chunkId === 'fmt ') {
                return { offset, size: chunkSize };
            }

            offset += 8 + chunkSize;
            if (chunkSize % 2 !== 0) offset++; // Padding byte
        }

        return null;
    }

    async updateWAVMetadata(arrayBuffer, metadata) {
        const sourceView = new DataView(arrayBuffer);
        const encoder = new TextEncoder();
        const decoder = new TextDecoder('utf-8');
        
        // First pass: find all chunks and their sizes
        let offset = 12; // Skip RIFF header
        let chunks = [];
        let dataChunk = null;
        let fmtChunk = null;
        let existingMetadata = {};

        console.log('First pass: finding chunks');
        while (offset < arrayBuffer.byteLength - 8) {
            const chunkId = String.fromCharCode(
                sourceView.getUint8(offset),
                sourceView.getUint8(offset + 1),
                sourceView.getUint8(offset + 2),
                sourceView.getUint8(offset + 3)
            );
            const chunkSize = sourceView.getUint32(offset + 4, true);

            console.log('Found chunk:', { id: chunkId, size: chunkSize, offset });

            if (chunkId === 'data') {
                dataChunk = { offset, size: chunkSize };
            } else if (chunkId === 'fmt ') {
                fmtChunk = { offset, size: chunkSize };
            }

            offset += 8 + chunkSize;
            if (chunkSize % 2 !== 0) offset++; // Padding byte
        }

        if (!dataChunk || !fmtChunk) {
            throw new Error('Could not find required chunks');
        }

        // Calculate metadata size
        let metadataSize = 12; // LIST + INFO headers
        const fieldMap = {
            'Title': 'INAM',
            'Artist': 'IART',
            'Album': 'IPRD',
            'Genre': 'IGNR',
            'Year': 'ICRD',
            'Composer': 'ICOM',
            'Publisher': 'IPUB',
            'Copyright': 'ICOP',
            'ISRC': 'ISRC',
            'Engineer': 'IENG',
            'Encoder': 'ISFT',
            'Comments': 'ICMT'
        };

        // Calculate metadata fields size
        const metadataFields = [];
        
        // First add fields from the new metadata
        for (const [field, value] of Object.entries(metadata)) {
            if (!fieldMap[field] || !value) continue;
            const cleanValue = value.trim();
            if (cleanValue.length === 0) continue;
            
            // Create field value with null terminator
            const fieldValue = new Uint8Array(cleanValue.length + 1);
            fieldValue.set(encoder.encode(cleanValue));
            fieldValue[cleanValue.length] = 0; // Add null terminator

            // Calculate padded length (must be even)
            const paddedLength = (fieldValue.length + 1) & ~1;
            
            metadataFields.push({
                id: fieldMap[field],
                value: fieldValue,
                paddedLength,
                originalValue: cleanValue
            });
            metadataSize += 8 + paddedLength; // header + padded value
        }

        console.log('Metadata fields to write:', metadataFields.map(f => ({
            id: f.id,
            value: f.originalValue,
            size: f.paddedLength
        })));

        // Create new buffer with exact size needed
        const newSize = 12 + fmtChunk.size + 8 + metadataSize + 8 + dataChunk.size;
        const newBuffer = new ArrayBuffer(newSize);
        const newView = new DataView(newBuffer);
        const newArray = new Uint8Array(newBuffer);

        // Copy RIFF header
        newArray.set(new Uint8Array(arrayBuffer, 0, 12));
        
        // Update RIFF size
        newView.setUint32(4, newSize - 8, true);

        // Copy fmt chunk
        let writeOffset = 12;
        newArray.set(
            new Uint8Array(arrayBuffer, fmtChunk.offset, fmtChunk.size + 8),
            writeOffset
        );
        writeOffset += fmtChunk.size + 8;

        // Write LIST chunk
        console.log('Writing LIST chunk at offset:', writeOffset);

        // Write LIST header
        for (let i = 0; i < 4; i++) {
            newView.setUint8(writeOffset + i, 'LIST'.charCodeAt(i));
        }
        newView.setUint32(writeOffset + 4, metadataSize - 8, true);
        
        // Write INFO identifier
        for (let i = 0; i < 4; i++) {
            newView.setUint8(writeOffset + 8 + i, 'INFO'.charCodeAt(i));
        }

        // Write metadata fields
        writeOffset += 12;
        for (const field of metadataFields) {
            // Write field ID
            for (let i = 0; i < 4; i++) {
                newView.setUint8(writeOffset + i, field.id.charCodeAt(i));
            }

            // Write field size (actual size including null terminator)
            newView.setUint32(writeOffset + 4, field.value.length, true);

            // Write field value (includes null terminator)
            newArray.set(field.value, writeOffset + 8);

            // Add padding byte if needed
            if (field.paddedLength > field.value.length) {
                newView.setUint8(writeOffset + 8 + field.value.length, 0);
            }

            writeOffset += 8 + field.paddedLength;
        }

        // Write data chunk
        console.log('Writing data chunk at offset:', writeOffset);
        
        // Write data chunk header
        for (let i = 0; i < 4; i++) {
            newView.setUint8(writeOffset + i, 'data'.charCodeAt(i));
        }
        newView.setUint32(writeOffset + 4, dataChunk.size, true);

        // Copy data chunk content
        newArray.set(
            new Uint8Array(arrayBuffer, dataChunk.offset + 8, dataChunk.size),
            writeOffset + 8
        );

        return newBuffer;
    }

    async updateID3Metadata(arrayBuffer, metadata) {
        const view = new DataView(arrayBuffer);
        const encoder = new TextEncoder();

        // Map metadata fields to ID3v2 frame IDs
        const frameMap = {
            'Title': 'TIT2',
            'Artist': 'TPE1',
            'Album': 'TALB',
            'Genre': 'TCON',
            'Year': 'TYER',
            'Engineer': 'TENC',
            'Copyright': 'TCOP',
            'ISRC': 'TSRC'
        };

        // Skip ID3 header
        let offset = 10;
        const size = this.syncSafeInt(view.getUint32(6));

        // Update existing frames
        while (offset < size) {
            const frameId = String.fromCharCode(
                view.getUint8(offset),
                view.getUint8(offset + 1),
                view.getUint8(offset + 2),
                view.getUint8(offset + 3)
            );
            const frameSize = view.getUint32(offset + 4);

            // Find matching metadata field
            const field = Object.entries(frameMap).find(([_, id]) => id === frameId)?.[0];
            if (field && metadata[field]) {
                const encodedValue = encoder.encode(metadata[field]);
                
                // Write frame value (skip frame header)
                for (let i = 0; i < encodedValue.length; i++) {
                    view.setUint8(offset + 10 + i, encodedValue[i]);
                }
            }

            offset += 10 + frameSize;
        }
    }

    verifyWAVStructure(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        
        try {
            // Check RIFF header
            const riffHeader = String.fromCharCode(
                view.getUint8(0),
                view.getUint8(1),
                view.getUint8(2),
                view.getUint8(3)
            );
            
            if (riffHeader !== 'RIFF') {
                console.warn('Invalid RIFF header');
                return false;
            }

            const fileSize = view.getUint32(4, true);
            if (Math.abs(fileSize + 8 - arrayBuffer.byteLength) > 2) {
                console.warn('File size mismatch:', {
                    expected: fileSize + 8,
                    actual: arrayBuffer.byteLength
                });
                return false;
            }

            // Check WAVE format
            const waveHeader = String.fromCharCode(
                view.getUint8(8),
                view.getUint8(9),
                view.getUint8(10),
                view.getUint8(11)
            );
            
            if (waveHeader !== 'WAVE') {
                console.warn('Invalid WAVE header');
                return false;
            }

            // Check for mandatory chunks and their order
            let offset = 12;
            let foundFmt = false;
            let foundData = false;
            let lastChunkWasFmt = false;

            while (offset < arrayBuffer.byteLength - 8) {
                const chunkId = String.fromCharCode(
                    view.getUint8(offset),
                    view.getUint8(offset + 1),
                    view.getUint8(offset + 2),
                    view.getUint8(offset + 3)
                );
                const chunkSize = view.getUint32(offset + 4, true);

                // Validate chunk size
                if (chunkSize < 0 || offset + 8 + chunkSize > arrayBuffer.byteLength) {
                    console.warn('Invalid chunk size:', {
                        chunk: chunkId,
                        size: chunkSize,
                        offset: offset
                    });
                    return false;
                }

                if (chunkId === 'fmt ') {
                    if (foundFmt) {
                        console.warn('Multiple fmt chunks found');
                        return false;
                    }
                    foundFmt = true;
                    lastChunkWasFmt = true;
                } else if (chunkId === 'data') {
                    if (!foundFmt) {
                        console.warn('Data chunk before fmt chunk');
                        return false;
                    }
                    foundData = true;
                } else {
                    lastChunkWasFmt = false;
                }

                offset += 8 + chunkSize;
                if (chunkSize % 2 !== 0) offset++; // Padding byte
            }

            if (!foundFmt || !foundData) {
                console.warn('Missing required chunks:', {
                    fmt: foundFmt,
                    data: foundData
                });
                return false;
            }

            return true;
        } catch (error) {
            console.warn('Error verifying WAV structure:', error);
            return false;
        }
    }

    calculateAudioHash(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        let offset = 12; // Skip RIFF header
        
        try {
            while (offset < arrayBuffer.byteLength - 8) {
                const chunkId = String.fromCharCode(
                    view.getUint8(offset),
                    view.getUint8(offset + 1),
                    view.getUint8(offset + 2),
                    view.getUint8(offset + 3)
                );
                const chunkSize = view.getUint32(offset + 4, true);

                if (chunkId === 'data') {
                    // Hash only the audio data chunk
                    const dataArray = new Uint8Array(arrayBuffer, offset + 8, chunkSize);
                    return this.hashArray(dataArray);
                }

                offset += 8 + chunkSize;
                if (chunkSize % 2 !== 0) offset++; // Padding byte
            }
        } catch (error) {
            console.warn('Error calculating audio hash:', error);
        }
        
        return null;
    }

    hashArray(array) {
        let hash = 0;
        for (let i = 0; i < array.length; i++) {
            hash = ((hash << 5) - hash) + array[i];
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }
} 