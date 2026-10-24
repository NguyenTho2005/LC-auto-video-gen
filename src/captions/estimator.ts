import { TimedWord } from "./types.js";

/**
 * Proportionally estimate word timings from plain text and total scene duration.
 * Used as fallback for TTS providers without native timestamp metadata (e.g. ElevenLabs, Vbee).
 * Marked with accuracy: "low".
 */
export function estimateWordTimings(
  voiceText: string,
  durationSec: number,
  offsetMs = 0
): TimedWord[] {
  const totalMs = Math.max(100, Math.round(durationSec * 1000));
  const rawWords = voiceText
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (rawWords.length === 0) {
    return [];
  }

  // Weight each word by its length (longer words usually take longer to pronounce)
  // Give a minimum weight of 2 characters so short words still get reasonable time
  const weights = rawWords.map((w) => Math.max(2, w.length));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let currentMs = offsetMs;
  const result: TimedWord[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const word = rawWords[i];
    const weight = weights[i];
    const isLast = i === rawWords.length - 1;

    let wordDurMs = Math.round((weight / totalWeight) * totalMs);
    // Ensure last word closes exactly at offsetMs + totalMs
    if (isLast) {
      wordDurMs = Math.max(50, offsetMs + totalMs - currentMs);
    } else {
      wordDurMs = Math.max(100, wordDurMs);
    }

    const startMs = currentMs;
    const endMs = currentMs + wordDurMs;

    result.push({
      text: word.normalize("NFC"),
      startMs,
      endMs,
    });

    currentMs = endMs;
  }

  return result;
}

