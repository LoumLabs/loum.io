// Initial album list with album IDs
const albums = [
    {
        id: '494503896',  // Defenders Of The City
        url: 'https://supermadnes.bandcamp.com/album/defenders-of-the-city'
    },
    {
        id: '1876423409', // Live at Rare Bird Farm
        url: 'https://catclydeband.bandcamp.com/album/live-at-rare-bird-farm-a-benefit-album-for-western-north-carolina'
    },
    {
        id: '3711838002', // Disk Musik
        url: 'https://phantomlimblabel.bandcamp.com/album/disk-musik-a-dd-records-compilation'
    }
];

// Keep track of current album
let currentAlbumId = null;

// DOM elements
const nextButton = document.getElementById('nextButton');

// Function to get a random album (different from current)
function getRandomAlbum() {
    // Filter out current album
    const availableAlbums = albums.filter(album => album.id !== currentAlbumId);
    
    // Get random album from remaining options
    const randomIndex = Math.floor(Math.random() * availableAlbums.length);
    const newAlbum = availableAlbums[randomIndex];
    
    // Update current album ID
    currentAlbumId = newAlbum.id;
    return newAlbum;
}

// Function to create player iframe
function createPlayerIframe(album) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width: 348px; height: 466px;';
    iframe.setAttribute('seamless', '');
    iframe.src = `https://bandcamp.com/EmbeddedPlayer/album=${album.id}/size=large/bgcol=ffffff/linkcol=0687f5/tracklist=false/transparent=true/`;
    
    const fallbackLink = document.createElement('a');
    fallbackLink.href = album.url;
    fallbackLink.textContent = 'View album on Bandcamp';
    iframe.appendChild(fallbackLink);
    
    return iframe;
}

// Function to switch players
function switchPlayer(newAlbum) {
    // Remove current player if it exists
    const currentPlayer = document.querySelector('iframe');
    if (currentPlayer) {
        currentPlayer.remove();
    }
    
    // Create and insert new player
    const newPlayer = createPlayerIframe(newAlbum);
    document.querySelector('.container').insertBefore(newPlayer, nextButton);
}

// Load initial album
switchPlayer(getRandomAlbum());

// Add click handler for next button
nextButton.addEventListener('click', () => {
    switchPlayer(getRandomAlbum());
});
