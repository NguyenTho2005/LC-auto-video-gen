"""Edge speech plus provider word boundaries. Text is read on stdin, never argv."""
import asyncio, json, sys
import edge_tts

async def synthesize(data, voice, boundary):
    communicator = edge_tts.Communicate(
        data['text'], voice,
        rate=data.get('rate', '+0%'),
        pitch=data.get('pitch', '+0Hz'),
        volume=data.get('volume', '+0%'),
        boundary=boundary
    )
    words = []
    audio_received = False
    subtitles = edge_tts.SubMaker()
    with open(data['audio'], 'wb') as audio:
        async for chunk in communicator.stream():
            if chunk['type'] == 'audio':
                audio.write(chunk['data'])
                audio_received = True
            elif chunk['type'] == 'WordBoundary':
                words.append({
                    'text': chunk['text'],
                    'startMs': round(chunk['offset'] / 10000),
                    'endMs': round((chunk['offset'] + chunk['duration']) / 10000)
                })
                subtitles.feed(chunk)
    if not audio_received:
        raise edge_tts.exceptions.NoAudioReceived("No audio was received.")
    if data.get('srt') and words:
        with open(data['srt'], 'w', encoding='utf8') as out:
            out.write(subtitles.get_srt())
    return words

async def main():
    data = json.load(sys.stdin)
    voice = data.get('voice', 'vi-VN-NamMinhNeural')
    partner = 'vi-VN-HoaiMyNeural' if voice == 'vi-VN-NamMinhNeural' else 'vi-VN-NamMinhNeural'
    # Attempt 1: original voice with WordBoundary
    try:
        words = await synthesize(data, voice, 'WordBoundary')
        print(json.dumps({'accuracy': 'high', 'words': words}, ensure_ascii=False))
        return
    except Exception:
        pass

    # Attempt 2: original voice with SentenceBoundary
    try:
        words = await synthesize(data, voice, 'SentenceBoundary')
        print(json.dumps({'accuracy': 'low', 'words': []}, ensure_ascii=False))
        return
    except Exception:
        pass

    # Attempt 3: partner Vietnamese voice
    words = await synthesize(data, partner, 'SentenceBoundary')
    print(json.dumps({'accuracy': 'low', 'words': []}, ensure_ascii=False))

asyncio.run(main())
