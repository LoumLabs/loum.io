import { Handler } from '@netlify/functions';
import { Deepgram } from '@deepgram/sdk';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No body provided' }),
      };
    }

    // Parse the multipart form data
    const boundary = event.headers['content-type']?.split('boundary=')[1];
    if (!boundary) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid content type' }),
      };
    }

    // Get the audio data from the form data
    const parts = event.body.split(boundary);
    const audioDataPart = parts.find(part => part.includes('Content-Type: audio/'));
    if (!audioDataPart) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No audio file found' }),
      };
    }

    // Extract the audio data and content type
    const contentTypeMatch = audioDataPart.match(/Content-Type: (audio\/\w+)/);
    if (!contentTypeMatch) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid audio content type' }),
      };
    }
    const contentType = contentTypeMatch[1];

    // Get the actual audio data (everything after the headers)
    const audioData = audioDataPart.split('\r\n\r\n')[1].trim();
    const buffer = Buffer.from(audioData, 'base64');

    const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY as string);

    const response = await deepgram.transcription.preRecorded({
      buffer,
      mimetype: contentType,
    }, {
      model: 'general',
      language: 'en-US',
      punctuate: true,
      utterances: true
    });

    if (!response?.results?.channels?.[0]?.alternatives?.[0]) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'No transcript generated' }),
      };
    }

    const transcript = response.results.channels[0].alternatives[0];

    return {
      statusCode: 200,
      body: JSON.stringify({
        text: transcript.transcript,
        confidence: transcript.confidence,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to transcribe audio' }),
    };
  }
};
