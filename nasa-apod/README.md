# NASA APOD Sonification

A web application that creates a live, procedural soundscape based on NASA's Astronomy Picture of the Day (APOD).

## Features

- Fetches daily astronomy pictures from NASA's APOD API
- Analyzes image properties (colors, brightness, contrast)
- Generates real-time ambient soundscapes based on image characteristics
- Full-screen immersive experience

## Setup

1. Get a NASA API key from https://api.nasa.gov/
2. Replace the `NASA_API_KEY` in `nasa-apod.js` with your API key
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the local server:
   ```bash
   npm start
   ```
5. Open `http://localhost:3000/nasa-apod.html` in your browser

## How it Works

The app analyzes various properties of the APOD image:
- Average colors → Synth parameters and filter settings
- Brightness → Sound frequency ranges
- Color distribution → Reverb and spatial effects

These properties are then mapped to different sound parameters to create an evolving soundscape that reflects the visual characteristics of the astronomical image.

## Technologies Used

- NASA APOD API
- Tone.js for audio synthesis
- HTML5 Canvas for image analysis
- Vanilla JavaScript
