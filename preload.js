const { contextBridge, ipcRenderer } = require('electron');

// Helper function to validate storage keys
function isValidKey(key) {
    return typeof key === 'string' && key.length > 0;
}

// Helper function to validate storage values
function isValidValue(value) {
    return value !== undefined && value !== null;
}

// Helper function to validate paths
function isValidPath(filePath) {
    return typeof filePath === 'string' && filePath.length > 0 && !filePath.includes('..');
}

// Expose protected methods that allow the renderer process to use
// specific electron APIs safely through a contextBridge
contextBridge.exposeInMainWorld(
    'electron',
    {
        // Expose storage API that uses IPC with validation
        store: {
            get: async (key) => {
                if (!isValidKey(key)) {
                    console.error('Invalid key provided to store.get');
                    return null;
                }
                return await ipcRenderer.invoke('store-get', key);
            },
            set: async (key, value) => {
                if (!isValidKey(key)) {
                    console.error('Invalid key provided to store.set');
                    return false;
                }
                if (!isValidValue(value)) {
                    console.error('Invalid value provided to store.set');
                    return false;
                }
                return await ipcRenderer.invoke('store-set', key, value);
            },
            remove: async (key) => {
                if (!isValidKey(key)) {
                    console.error('Invalid key provided to store.remove');
                    return false;
                }
                return await ipcRenderer.invoke('store-delete', key);
            },
            clear: async () => {
                return await ipcRenderer.invoke('store-clear');
            }
        },
        // Add file system operations
        fs: {
            readFile: async (filePath, encoding = null) => {
                if (!isValidPath(filePath)) {
                    throw new Error('Invalid file path');
                }
                try {
                    const result = await ipcRenderer.invoke('fs-read-file', filePath, encoding);
                    return result;
                } catch (error) {
                    console.error('Error reading file:', error);
                    throw error;
                }
            },
            writeFile: async (filePath, data) => {
                if (!isValidPath(filePath)) {
                    throw new Error('Invalid file path');
                }
                try {
                    await ipcRenderer.invoke('fs-write-file', filePath, data);
                } catch (error) {
                    console.error('Error writing file:', error);
                    throw error;
                }
            },
            exists: async (filePath) => {
                if (!isValidPath(filePath)) {
                    throw new Error('Invalid file path');
                }
                try {
                    return await ipcRenderer.invoke('fs-exists', filePath);
                } catch (error) {
                    console.error('Error checking file existence:', error);
                    throw error;
                }
            }
        },
        // Add path operations
        path: {
            join: (...args) => {
                return ipcRenderer.invoke('path-join', ...args);
            },
            resolve: (...args) => {
                return ipcRenderer.invoke('path-resolve', ...args);
            }
        },
        // IPC communication
        ipc: {
            send: (channel, data) => {
                // Whitelist channels
                const validChannels = ['toMain'];
                if (validChannels.includes(channel)) {
                    ipcRenderer.send(channel, data);
                }
            },
            receive: (channel, func) => {
                const validChannels = ['fromMain'];
                if (validChannels.includes(channel)) {
                    // Strip event as it includes `sender` 
                    ipcRenderer.on(channel, (event, ...args) => func(...args));
                }
            }
        }
    }
); 