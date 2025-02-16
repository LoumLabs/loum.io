const fetch = require('node-fetch');
const busboy = require('busboy');

exports.handler = async function(event, context) {
  console.log('Received request:', {
    method: event.httpMethod,
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
    // Parse the multipart form data
    const { audioBuffer, contentType } = await parseFormData(event);
    
    if (!audioBuffer) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'No audio file provided' })
      };
    }

    // Convert the audio buffer to base64
    const audioBase64 = audioBuffer.toString('base64');

    // Log request info for debugging
    console.log('Request info:', {
      mimetype: contentType,
      audioLength: audioBase64.length,
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
      mimetype: contentType,
      hasApiKey: true
    });

    const response = await fetch('https://api.deepgram.com/v1/listen', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        buffer: audioBase64,
        mimetype: contentType || 'audio/wav'
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

function parseFormData(event) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: event.headers });
    let audioBuffer = null;
    let contentType = null;

    bb.on('file', (name, file, info) => {
      const chunks = [];
      contentType = info.mimeType;

      file.on('data', (data) => {
        chunks.push(data);
      });

      file.on('end', () => {
        audioBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('finish', () => {
      resolve({ audioBuffer, contentType });
    });

    bb.on('error', (error) => {
      reject(error);
    });

    bb.write(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
    bb.end();
  });
}
