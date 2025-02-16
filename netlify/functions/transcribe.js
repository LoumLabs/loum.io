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
    // Log request info for debugging
    console.log('Request headers:', event.headers);
    console.log('Request body length:', event.body.length);

    // Convert base64 body to buffer if needed
    const audioData = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : event.body;

    // Make request to Deepgram
    const response = await fetch('https://api.deepgram.com/v1/listen', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': event.headers['content-type'] || 'audio/wav',
      },
      body: audioData,
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
    console.log('Deepgram success response:', data);

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
