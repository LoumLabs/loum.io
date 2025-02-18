const express = require('express');
const cors = require('cors');
const path = require('path');

// Fallback APOD data in case of rate limits
const FALLBACK_APOD = {
    "date": "2024-02-18",
    "explanation": "What's happening in the center of this galaxy? The merger of two very massive black holes -- the most massive black hole merger yet observed. The discovery was made by gravitational wave observatories that detected the spacetime ripples created by this merger nearly 7 billion light years away. The resulting black hole has a mass about 142 times that of our Sun, making it the first known intermediate mass black hole -- more massive than stellar black holes but less massive than supermassive black holes. The featured illustration envisions the surrounding environment of this historic merger. The black holes are shown here just before collision, circling each other only a few times a second, with the stars of their host galaxy visible in the background. The heaviest black hole of the pair was likely about 85 solar masses, while its partner was about 66 solar masses. The resulting black hole has less mass than the sum of these two, because some mass was lost as energy -- the energy that created the detected gravitational waves. The discovery marks the first and second most massive black holes ever observed to merge, and provides evidence that merging black holes can themselves be created by the collision of other black holes.",
    "hdurl": "https://apod.nasa.gov/apod/image/2402/M31_HubbleSpitzerGendler_2000.jpg",
    "media_type": "image",
    "service_version": "v1",
    "title": "Andromeda Galaxy",
    "url": "https://apod.nasa.gov/apod/image/2402/M31_HubbleSpitzerGendler_960.jpg"
};

import('node-fetch').then(({ default: fetch }) => {
    const app = express();
    const port = 3001;

    // Enable CORS for all routes
    app.use(cors());

    // Serve static files from the current directory
    app.use(express.static(__dirname));

    // Simple in-memory cache
    const cache = new Map();
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

    // Helper to get APOD
    async function getAPOD(apiKey) {
        const url = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}`;
        const cacheKey = 'latest';
        
        // Check cache first
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log('Returning cached APOD');
            return cached.data;
        }
        
        console.log('Fetching APOD from:', url);
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            console.log('APOD response:', {
                status: response.status,
                statusText: response.statusText,
                data: JSON.stringify(data)
            });
            
            if (!response.ok) {
                console.log('NASA API error, using fallback data');
                return FALLBACK_APOD;
            }
            
            // Cache the result
            cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            
            return data;
        } catch (error) {
            console.error('Error fetching from NASA API:', error);
            return FALLBACK_APOD;
        }
    }

    // Proxy endpoint for NASA APOD API
    app.get('/api/nasa-apod', async (req, res) => {
        try {
            const apiKey = req.query.api_key || 'jjI5Itcch87urx6LfudFewle91AzBZz3RxCanubs';
            const data = await getAPOD(apiKey);
            res.json(data);
        } catch (error) {
            console.error('Error:', error.message);
            res.json(FALLBACK_APOD);
        }
    });

    // Proxy endpoint for images
    app.get('/proxy-image', async (req, res) => {
        try {
            const imageUrl = req.query.url;
            if (!imageUrl) {
                throw new Error('No image URL provided');
            }
            
            // Check image cache
            const cacheKey = `image_${imageUrl}`;
            const cached = cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                console.log('Returning cached image:', imageUrl);
                res.setHeader('Content-Type', cached.contentType);
                return res.send(cached.data);
            }
            
            console.log('Proxying image:', imageUrl);
            const response = await fetch(imageUrl);
            
            console.log('Image response:', {
                status: response.status,
                statusText: response.statusText,
                type: response.headers.get('content-type')
            });
            
            if (!response.ok) {
                throw new Error(`Image fetch failed with status: ${response.status}`);
            }
            
            const contentType = response.headers.get('content-type');
            const buffer = await response.buffer();
            
            // Cache the image
            cache.set(cacheKey, {
                data: buffer,
                contentType: contentType,
                timestamp: Date.now()
            });
            
            res.setHeader('Content-Type', contentType);
            res.send(buffer);
        } catch (error) {
            console.error('Error:', error.message);
            res.status(500).json({ error: error.message || 'Failed to fetch image' });
        }
    });

    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
});
