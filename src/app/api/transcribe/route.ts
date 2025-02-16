import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  console.log('Received transcription request');

  // Validate API key
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error('Deepgram API key is missing');
    return NextResponse.json(
      { error: 'Transcription service configuration error' },
      { status: 500 }
    );
  }

  try {
    // Get the form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      console.error('No file found in request');
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log('Processing file:', {
      name: file.name,
      type: file.type,
      size: Math.round(file.size / 1024 / 1024 * 100) / 100 + 'MB'
    });

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      console.log('Sending to Deepgram...');
      
      // Make direct API call to Deepgram
      const response = await fetch('https://api.deepgram.com/v1/listen?smart_format=true&model=general&language=en-US', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': file.type || 'audio/wav'
        },
        body: buffer
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Deepgram API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        return NextResponse.json(
          { 
            error: 'Transcription failed', 
            details: errorData?.error || response.statusText
          },
          { status: response.status }
        );
      }

      const result = await response.json();
      console.log('Received response from Deepgram');

      if (!result?.results?.channels?.[0]?.alternatives?.[0]) {
        console.error('No transcription results:', result);
        return NextResponse.json(
          { error: 'No transcription results received' },
          { status: 500 }
        );
      }

      const transcription = {
        text: result.results.channels[0].alternatives[0].transcript,
        confidence: result.results.channels[0].alternatives[0].confidence,
      };

      console.log('Transcription successful:', {
        textLength: transcription.text.length,
        confidence: transcription.confidence
      });

      return NextResponse.json(transcription);
    } catch (deepgramError: any) {
      console.error('Deepgram API error:', deepgramError);
      return NextResponse.json(
        { 
          error: 'Transcription service error', 
          details: deepgramError.message || 'Unknown Deepgram error'
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { 
        error: 'Server error', 
        details: error.message || 'Unknown server error'
      },
      { status: 500 }
    );
  }
}
