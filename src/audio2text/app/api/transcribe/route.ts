import { NextResponse } from 'next/server';
import { Deepgram } from '@deepgram/sdk';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY as string);

    const response = await deepgram.transcription.preRecorded({
      buffer,
      mimetype: file.type,
    }, {
      model: 'general',
      language: 'en-US',
      punctuate: true,
      utterances: true
    });

    if (!response?.results?.channels?.[0]?.alternatives?.[0]) {
      return NextResponse.json(
        { error: 'No transcript generated' },
        { status: 500 }
      );
    }

    const transcript = response.results.channels[0].alternatives[0];

    return NextResponse.json({
      text: transcript.transcript,
      confidence: transcript.confidence,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to transcribe audio' },
      { status: 500 }
    );
  }
}
