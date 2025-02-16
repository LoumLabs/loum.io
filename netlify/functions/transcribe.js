const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // Get the audio data from the request
    const formData = new FormData();
    const audioData = event.body; // This will be base64 encoded

    // Make request to Deepgram
    const response = await fetch('https://api.deepgram.com/v1/listen', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        buffer: audioData,
        mimetype: 'audio/wav', // We'll need to adjust this based on the input
      }),
    });

    if (!response.ok) {
      throw new Error(`Deepgram API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // For local development
      },
      body: JSON.stringify({
        text: data.results?.channels[0]?.alternatives[0]?.transcript || 'No transcription available',
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to transcribe audio' }),
    };
  }
}
