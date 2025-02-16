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
    // Parse the multipart form data
    const audioData = event.body;
    
    // Log for debugging
    console.log('Received request:', {
      contentType: event.headers['content-type'],
      bodyLength: event.body.length,
    });

    // Make request to Deepgram
    const response = await fetch('https://api.deepgram.com/v1/listen', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': event.headers['content-type'] || 'audio/wav',
      },
      body: audioData, // Send the raw audio data
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Deepgram error:', errorText);
      throw new Error(`Deepgram API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Deepgram response:', data);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        text: data.results?.channels[0]?.alternatives[0]?.transcript || 'No transcription available',
      }),
    };
  } catch (error) {
    console.error('Error in function:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ 
        error: 'Failed to transcribe audio',
        details: error.message
      }),
    };
  }
}
