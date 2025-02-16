const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  console.log('Received request:', {
    method: event.httpMethod,
    path: event.path,
    headers: event.headers,
  });

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // Parse the JSON body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
      console.log('Parsed request body:', {
        hasAudio: !!requestBody.audio,
        audioLength: requestBody.audio?.length,
        mimetype: requestBody.mimetype,
      });
    } catch (parseError) {
      console.error('JSON parse error:', {
        error: parseError.message,
        body: event.body.substring(0, 100) + '...',
      });
      throw new Error('Invalid JSON in request body');
    }

    const { audio, mimetype } = requestBody;
    
    if (!audio) {
      throw new Error('No audio data provided');
    }

    // Log request info for debugging
    console.log('Request info:', {
      mimetype,
      audioLength: audio.length,
      apiKey: process.env.DEEPGRAM_API_KEY ? 'Present' : 'Missing'
    });

    // Make request to Deepgram
    console.log('Making Deepgram request:', {
      url: 'https://api.deepgram.com/v1/listen',
      mimetype,
      hasApiKey: !!process.env.DEEPGRAM_API_KEY,
    });

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

    const responseText = await response.text();
    console.log('Deepgram response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries([...response.headers]),
      body: responseText.substring(0, 100) + '...',
    });

    if (!response.ok) {
      throw new Error(`Deepgram API error: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    console.log('Deepgram success response:', {
      hasResults: !!data.results,
      channels: data.results?.channels?.length || 0
    });

    const transcript = data.results?.channels[0]?.alternatives[0]?.transcript;

    console.log('Successfully transcribed:', {
      hasTranscript: !!transcript,
      length: transcript?.length,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        text: transcript || 'No transcription available',
      }),
    };
  } catch (error) {
    console.error('Function error:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

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
