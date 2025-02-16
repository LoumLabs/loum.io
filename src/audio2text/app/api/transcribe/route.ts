import { NextRequest, NextResponse } from 'next/server';
import { Deepgram } from '@deepgram/sdk';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  console.log('API route hit: /audio2text/api/transcribe');
  
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error('Deepgram API key not found in environment variables');
      return NextResponse.json(
        { error: 'Deepgram API key not found' },
        { status: 500 }
      );
    }

    console.log('API key found, processing form data...');
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('No file provided in request');
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log('Processing file:', {
      name: file.name,
      type: file.type,
      size: Math.round(file.size / 1024) + 'KB'
    });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('Initializing Deepgram client...');
    const deepgram = new Deepgram(apiKey);

    console.log('Sending request to Deepgram...');
    const response = await deepgram.transcription.preRecorded({
      buffer,
      mimetype: file.type,
    }, {
      smart_format: true,
      model: 'general',
      language: 'en-US'
    });

    if (!response?.results?.channels?.[0]?.alternatives?.[0]) {
      console.error('No transcript in Deepgram response:', response);
      return NextResponse.json(
        { error: 'No transcript generated' },
        { status: 500 }
      );
    }

    const transcript = response.results.channels[0].alternatives[0];

    console.log('Transcription successful:', {
      textLength: transcript.transcript.length,
      confidence: transcript.confidence
    });

    return NextResponse.json({
      text: transcript.transcript,
      confidence: transcript.confidence
    });
  } catch (error: any) {
    console.error('Transcription error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return NextResponse.json(
      { error: error.message || 'Failed to transcribe audio' },
      { status: 500 }
    );
  }
}
