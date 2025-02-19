// Load albums from JSON file
let albums = [];
let currentAlbumId = null;

// Function to get a random album (different from current)
function getRandomAlbum() {
    if (!albums || albums.length === 0) {
        console.error('No albums available');
        return null;
    }
    
    // Filter out current album to prevent repeats
    const availableAlbums = albums.filter(album => album.id !== currentAlbumId);
    if (availableAlbums.length === 0) {
        // If we've filtered out all albums, reset and use the full list
        availableAlbums = albums;
    }
    
    const randomIndex = Math.floor(Math.random() * availableAlbums.length);
    const newAlbum = availableAlbums[randomIndex];
    currentAlbumId = newAlbum.id;
    return newAlbum;
}

function loadRandomAlbum() {
    const album = getRandomAlbum();
    if (!album) return;  // Don't proceed if no album is available
    
    const embed = document.getElementById('embed');
    if (!embed) {
        console.error('Embed container not found');
        return;
    }
    
    // Clear existing content
    embed.innerHTML = '';
    
    // Create new iframe
    const iframe = document.createElement('iframe');
    iframe.style.border = 0;
    iframe.width = "350px";
    iframe.height = "470px";
    iframe.setAttribute('src', `https://bandcamp.com/EmbeddedPlayer/album=${album.id}/size=large/bgcol=333333/linkcol=0f91ff/tracklist=false/transparent=true/`);
    iframe.setAttribute('seamless', '');
    embed.appendChild(iframe);
    
    // Update link to album
    const albumLink = document.getElementById('album-link');
    if (albumLink) {
        albumLink.href = album.url;
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Load albums from JSON file
    fetch('bandcamp_albums.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('No albums found in JSON file');
            }
            albums = data;
            console.log(`Loaded ${albums.length} albums`);
            loadRandomAlbum();
        })
        .catch(error => {
            console.error('Error loading albums:', error);
            // Fallback to a default album if loading fails
            albums = [{
                id: "1618145259",
                url: "https://cloudcore.bandcamp.com/album/bad-posture"
            }];
            loadRandomAlbum();
        });
    
    // Add click handler for next button
    const button = document.getElementById('next-button');
    if (button) {
        button.addEventListener('click', loadRandomAlbum);
    } else {
        console.error('Next button not found');
    }
});
