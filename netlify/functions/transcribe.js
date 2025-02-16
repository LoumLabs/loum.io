const busboy = require('busboy');
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  console.log('Received request:', {
    method: event.httpMethod,
    contentType: event.headers['content-type'],
    bodyLength: event.body?.length
  });

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
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

    // Send to Deepgram
    const response = await fetch('https://api.deepgram.com/v1/listen', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': contentType || 'audio/wav'
      },
      body: audioBuffer
    });

    const data = await response.json();
    console.log('Deepgram response:', data);

    if (!response.ok) {
      console.error('Deepgram error:', data);
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Deepgram API error', details: data })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        text: data.results?.channels[0]?.alternatives[0]?.transcript || ''
      })
    };
  } catch (error) {
    console.error('Server error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

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
