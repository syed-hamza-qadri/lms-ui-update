import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioBlob = formData.get('audio') as Blob

    if (!audioBlob) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
    }

    // Convert blob to buffer
    const arrayBuffer = await audioBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Use Deepgram API (free tier available)
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY

    if (!deepgramApiKey) {
      console.error('[Transcribe API] DEEPGRAM_API_KEY is not set')
      return NextResponse.json(
        {
          error: 'Transcription service not configured',
          message: 'Please add DEEPGRAM_API_KEY to .env.local',
        },
        { status: 503 }
      )
    }

    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=en', {
      method: 'POST',
      headers: {
        Authorization: `Token ${deepgramApiKey}`,
        'Content-Type': 'audio/webm',
      },
      body: buffer,
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Transcribe API] Deepgram error:', error)
      return NextResponse.json(
        { error: 'Failed to transcribe audio', details: error },
        { status: response.status }
      )
    }

    const result = await response.json() as any
    const transcript = result.results?.channels[0]?.alternatives[0]?.transcript || ''

    return NextResponse.json({ transcript })
  } catch (error) {
    console.error('[Transcribe API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process transcription', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
