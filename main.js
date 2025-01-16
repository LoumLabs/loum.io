const { app, BrowserWindow, protocol, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
const store = new Store({
    name: 'loum-storage',
    encryptionKey: 'your-encryption-key',
    clearInvalidConfig: true
});

// Add IPC handlers for storage operations with error handling
ipcMain.handle('store-get', async (event, key) => {
    try {
        return store.get(key);
    } catch (error) {
        console.error('Error getting value from store:', error);
        return null;
    }
});

ipcMain.handle('store-set', async (event, key, value) => {
    try {
        store.set(key, value);
        return true;
    } catch (error) {
        console.error('Error setting value in store:', error);
        return false;
    }
});

ipcMain.handle('store-delete', async (event, key) => {
    try {
        store.delete(key);
        return true;
    } catch (error) {
        console.error('Error deleting value from store:', error);
        return false;
    }
});

ipcMain.handle('store-clear', async () => {
    try {
        store.clear();
        return true;
    } catch (error) {
        console.error('Error clearing store:', error);
        return false;
    }
});

// Add IPC handlers for file system operations
ipcMain.handle('fs-read-file', async (event, filePath, encoding) => {
    try {
        const fullPath = path.join(__dirname, filePath);
        if (encoding) {
            return await fs.readFile(fullPath, encoding);
        } else {
            return await fs.readFile(fullPath);
        }
    } catch (error) {
        console.error('Error reading file:', error);
        throw error;
    }
});

ipcMain.handle('fs-write-file', async (event, filePath, data) => {
    try {
        const fullPath = path.join(__dirname, filePath);
        await fs.writeFile(fullPath, data);
    } catch (error) {
        console.error('Error writing file:', error);
        throw error;
    }
});

ipcMain.handle('fs-exists', async (event, filePath) => {
    try {
        const fullPath = path.join(__dirname, filePath);
        await fs.access(fullPath);
        return true;
    } catch {
        return false;
    }
});

// Add IPC handlers for path operations
ipcMain.handle('path-join', async (event, ...args) => {
    return path.join(...args);
});

ipcMain.handle('path-resolve', async (event, ...args) => {
    return path.resolve(...args);
});

// Map content types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

// Get the current app context from a URL
function getCurrentApp(pathname) {
    const subApps = ['mixer', 'audiodata', 'AB', 'meter', 'tuner'];
    
    // Clean up the pathname
    const cleanPath = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    
    // First, check if the path starts with a sub-app name
    const parts = cleanPath.split('/');
    if (parts.length > 0 && subApps.includes(parts[0])) {
        return parts[0];
    }
    
    // Then check if the path contains a sub-app name (for static files)
    for (const app of subApps) {
        if (cleanPath.includes(`${app}/`)) {
            return app;
        }
    }
    
    return '';
}

// Try to find a file in multiple possible locations
function findFile(filePath, currentApp = '') {
    const possiblePaths = [];

    // Clean up the file path
    const cleanPath = filePath.replace(/^\/+/, '').replace(/\/+$/, '');
    console.log('Finding file:', cleanPath, 'in app context:', currentApp);

    // If we're in a sub-app context
    if (currentApp) {
        // For paths that include the app name
        if (cleanPath.includes(`${currentApp}/`)) {
            // Try the exact path first
            possiblePaths.push(
                path.join(__dirname, cleanPath),
                // Try without the app name prefix
                path.join(__dirname, cleanPath.replace(`${currentApp}/`, '')),
                // Try in the app's directory
                path.join(__dirname, currentApp, cleanPath.replace(`${currentApp}/`, '')),
                // Try in the app's static directory
                path.join(__dirname, currentApp, 'static', cleanPath.replace(`${currentApp}/static/`, ''))
            );
        } else {
            // For paths that don't include the app name
            possiblePaths.push(
                path.join(__dirname, currentApp, cleanPath),
                path.join(__dirname, cleanPath),
                path.join(__dirname, currentApp, 'static', cleanPath.replace('static/', '')),
                // Add direct static path
                path.join(__dirname, currentApp, 'static', cleanPath)
            );
        }

        // Special handling for CSS files
        if (cleanPath.endsWith('.css')) {
            possiblePaths.push(
                // Try in the app's css directory
                path.join(__dirname, currentApp, 'static', 'css', path.basename(cleanPath)),
                // Try in the root css directory
                path.join(__dirname, 'static', 'css', path.basename(cleanPath))
            );
        }
    } else {
        // For root-level files
        possiblePaths.push(
            path.join(__dirname, cleanPath),
            path.join(__dirname, 'static', cleanPath.replace('static/', '')),
            path.join(__dirname, 'static', cleanPath)
        );
    }

    // Remove duplicates from possiblePaths
    const uniquePaths = [...new Set(possiblePaths)];
    console.log('Looking for file:', cleanPath);
    console.log('In paths:', uniquePaths);

    for (const tryPath of uniquePaths) {
        console.log('Trying path:', tryPath);
        try {
            if (fs.existsSync(tryPath) && fs.statSync(tryPath).isFile()) {
                console.log('Found at:', tryPath);
                // Log file stats
                const stats = fs.statSync(tryPath);
                console.log('File stats:', {
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    isFile: stats.isFile()
                });
                return tryPath;
            }
        } catch (error) {
            console.error('Error checking path:', tryPath, error);
        }
    }

    // If not found and it's a CSS file, try alternate names
    if (cleanPath.endsWith('.css')) {
        console.log('Trying alternate CSS filenames...');
        const alternateNames = [
            cleanPath,
            cleanPath.replace('style.css', 'styles.css'),
            cleanPath.replace('styles.css', 'style.css')
        ];

        for (const altName of alternateNames) {
            for (const basePath of [__dirname, path.join(__dirname, currentApp), path.join(__dirname, currentApp, 'static', 'css')]) {
                const tryPath = path.join(basePath, altName);
                console.log('Trying alternate path:', tryPath);
                try {
                    if (fs.existsSync(tryPath) && fs.statSync(tryPath).isFile()) {
                        console.log('Found at (alternate):', tryPath);
                        return tryPath;
                    }
                } catch (error) {
                    console.error('Error checking alternate path:', tryPath, error);
                }
            }
        }
    }

    console.log('File not found in any of the paths');
    return null;
}

// Handle the custom protocol for internal routing
function createProtocolHandler() {
    protocol.handle('app', request => {
        let url = new URL(request.url);
        let filePath = url.pathname;
        
        // Remove leading 'app://' and trailing '/'
        if (filePath.startsWith('/')) {
            filePath = filePath.slice(1);
        }
        if (filePath.endsWith('/')) {
            filePath = filePath.slice(0, -1);
        }

        // Get the current app context
        const currentApp = getCurrentApp(filePath);
        console.log('Request for:', filePath, 'in app context:', currentApp);
        console.log('Original URL:', request.url);

        // If no specific path is requested, serve index.html
        if (!filePath) {
            filePath = 'index.html';
        }

        // Handle index.html for sub-apps
        if (currentApp && !path.extname(filePath)) {
            filePath = `${filePath}/index.html`.replace('//', '/');
        }

        try {
            // Try to find the file in possible locations
            console.log('Looking for file:', filePath);
            const fullPath = findFile(filePath, currentApp);
            if (!fullPath) {
                console.error(`File not found: ${filePath} (currentApp: ${currentApp})`);
                console.error('Attempted paths:', possiblePaths);
                return new Response(null, { status: 404 });
            }

            const content = fs.readFileSync(fullPath);
            const contentType = getContentType(fullPath);
            
            console.log('Serving:', fullPath, 'as', contentType);
            
            // Add detailed logging for CSS files
            if (contentType === 'text/css') {
                console.log('CSS Content Length:', content.length);
                console.log('CSS File Path:', fullPath);
                console.log('First 100 bytes:', content.slice(0, 100).toString());
            }

            return new Response(content, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Content-Security-Policy': "default-src 'self' app:; " +
                        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com app:; " +
                        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com app:; " +
                        "style-src-elem 'self' 'unsafe-inline' https://cdnjs.cloudflare.com app:; " +
                        "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com app:; " +
                        "img-src 'self' data: https: app:; " +
                        "media-src 'self' data: app:; " +
                        "connect-src 'self' https: app:; " +
                        "font-src 'self' data: https://cdnjs.cloudflare.com app:;",
                    'X-Content-Type-Options': 'nosniff',
                    'X-Frame-Options': 'SAMEORIGIN',
                    // Add cache control to ensure styles are not cached incorrectly
                    'Cache-Control': 'no-cache',
                    // Add CORS headers to ensure styles can load
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } catch (error) {
            console.error(`Error serving file ${filePath}:`, error);
            console.error('Stack trace:', error.stack);
            return new Response(null, { status: 404 });
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#1e1e1e',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true,
            devTools: isDev
        }
    });

    // Set CSP headers
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' app:;",
                    "script-src 'self' app: 'unsafe-inline';",  // Remove unsafe-eval
                    "style-src 'self' app: 'unsafe-inline' https://cdnjs.cloudflare.com;",
                    "font-src 'self' app: https://cdnjs.cloudflare.com;",
                    "img-src 'self' app: data: https:;",
                    "media-src 'self' app: blob:;",
                    "connect-src 'self' app: https:;"
                ].join(' ')
            }
        });
    });

    // Load the index.html file
    mainWindow.loadURL('app://./index.html').catch(err => {
        console.error('Error loading index.html:', err);
    });

    // Open external links in browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Handle window errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load:', errorCode, errorDescription);
    });

    mainWindow.webContents.on('crashed', (event) => {
        console.error('Window crashed:', event);
        createWindow(); // Recreate window if it crashes
    });

    mainWindow.on('unresponsive', () => {
        console.error('Window became unresponsive');
    });

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}

// Handle app errors
app.on('render-process-gone', (event, webContents, details) => {
    console.error('Render process gone:', details.reason, details.exitCode);
    if (details.reason === 'crashed') {
        createWindow();
    }
});

app.on('child-process-gone', (event, details) => {
    console.error('Child process gone:', details.type, details.reason);
});

// Handle file system permissions
app.on('web-contents-created', (event, contents) => {
    contents.on('select-bluetooth-device', (event, devices, callback) => {
        event.preventDefault();
        callback('');
    });

    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'audioCapture'];
        callback(allowedPermissions.includes(permission));
    });
});

app.whenReady().then(async () => {
    await createProtocolHandler();
    createWindow();

    // Handle file system access
    protocol.registerFileProtocol('file', (request, callback) => {
        const filePath = request.url.replace('file://', '');
        callback({ path: filePath });
    });
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
}); 