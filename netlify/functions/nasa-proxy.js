const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    const { url } = event.queryStringParameters;
    
    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'URL parameter is required' })
      };
    }

    // Only allow NASA APOD URLs
    if (!url.startsWith('https://apod.nasa.gov/') && !url.startsWith('https://api.nasa.gov/')) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Only NASA APOD URLs are allowed' })
      };
    }

    const response = await fetch(url);
    const contentType = response.headers.get('content-type');
    const buffer = await response.buffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to proxy request' })
    };
  }
};
