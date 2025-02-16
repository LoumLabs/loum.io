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
    // Parse the JSON body
    const { audio, mimetype } = JSON.parse(event.body);
    
    // Log request info for debugging
    console.log('Request info:', {
      mimetype,
      audioLength: audio.length,
      apiKey: process.env.DEEPGRAM_API_KEY ? 'Present' : 'Missing'
    });

    // Make request to Deepgram
    const response = await fetch('https://api.deepgram.com/v1/listen', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        buffer: audio,
        mimetype: mimetype || 'audio/wav'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Deepgram error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`Deepgram API error: ${errorText}`);
    }

    const data = await response.json();
    console.log('Deepgram success response:', {
      hasResults: !!data.results,
      channels: data.results?.channels?.length || 0
    });

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
    console.error('Function error:', error);
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
