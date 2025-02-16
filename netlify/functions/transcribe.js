const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  console.log('Received request:', {
    method: event.httpMethod,
    path: event.path,
    contentType: event.headers['content-type'],
    bodyLength: event.body?.length
  });

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
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
        bodyStart: event.body.substring(0, 100) + '...',
        contentType: event.headers['content-type']
      });
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Invalid JSON in request body',
          details: parseError.message
        })
      };
    }

    const { audio, mimetype } = requestBody;
    
    if (!audio) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'No audio data provided'
        })
      };
    }

    // Log request info for debugging
    console.log('Request info:', {
      mimetype,
      audioLength: audio.length,
      apiKey: process.env.DEEPGRAM_API_KEY ? 'Present' : 'Missing'
    });

    if (!process.env.DEEPGRAM_API_KEY) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Deepgram API key not configured'
        })
      };
    }

    // Make request to Deepgram
    console.log('Making Deepgram request:', {
      url: 'https://api.deepgram.com/v1/listen',
      mimetype,
      hasApiKey: true
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
      headers: Object.fromEntries(response.headers.entries()),
      bodyLength: responseText.length
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Deepgram API error',
          details: responseText
        })
      };
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Deepgram response:', {
        error: parseError,
        responseText: responseText.substring(0, 100) + '...'
      });
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Invalid JSON response from Deepgram',
          details: parseError.message
        })
      };
    }

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
