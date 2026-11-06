import type { AsrResult } from "./types.js";
import type { CaptionCue, TimedWord } from "../captions/types.js";

export interface AsrCueOptions {
  maxCharsPerLine?: number;
  maxLines?: number;
  maxCueMs?: number;
  minCueMs?: number;
  /** Break a cue after these sentence-final punctuation marks. */
  breakAfterPunctuation?: boolean;
  /** Timing fidelity of the words fed in: "high" = real ASR timestamps,
   * "low" = some words interpolated between anchors (script↔ASR aligned). */
  wordAccuracy?: "high" | "low";
}

const DEFAULTS = {
  maxCharsPerLine: 32,
  maxLines: 2,
  maxCueMs: 6000,
  minCueMs: 400,
  breakAfterPunctuation: true,
};

function sentenceFinal(token: string): boolean {
  return /[\p{L}\p{N}][.!?…。！？]$/u.test(token.normalize("NFC"));
}

/** Gap (ms) between one word ending and the next starting; long gap ⇒ natural cue break. */
function gapMs(prev: NormWord, next: NormWord): number {
  return Math.max(0, next.startMs - prev.endMs);
}

interface NormWord {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Converts ASR output into renderable CaptionCue[].
 * Guarantees: non-overlapping cues, minimum duration when audio allows,
 * ≤ maxCharsPerLine × maxLines characters, cue text assembled from the timed words
 * so karaoke highlight stays in sync. accuracy = "high" (real word timestamps).
 */
export function asrResultToCues(result: AsrResult, options: AsrCueOptions = {}): CaptionCue[] {
  const opt = { ...DEFAULTS, ...options, wordAccuracy: options.wordAccuracy ?? "high" };
  const maxCueChars = opt.maxCharsPerLine * opt.maxLines;
  const words: NormWord[] = result.words
    .filter((w) => w.text && w.endMs >= w.startMs)
    .map((w) => ({
      text: w.text.normalize("NFC"),
      startMs: w.startMs,
      endMs: w.endMs,
    }));

  const groups: NormWord[][] = [];
  let current: NormWord[] = [];
  let currentChars = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const projectedChars = currentChars + (current.length ? 1 : 0) + w.text.length;
    const projectedMs = current.length ? w.endMs - current[0].startMs : w.endMs - w.startMs;

    if (
      current.length &&
      (projectedChars > maxCueChars || projectedMs > opt.maxCueMs || gapMs(current[current.length - 1], w) > 700)
    ) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(w);
    // Recompute for the (possibly just-created) group: `projectedChars` was
    // accumulated against the old group; a fresh group starts from this word alone.
    currentChars = current.length === 1 ? w.text.length : projectedChars;

    const next = words[i + 1];
    if (
      next &&
      opt.breakAfterPunctuation &&
      sentenceFinal(w.text) &&
      (currentChars > opt.maxCharsPerLine / 2 || gapMs(w, next) > 220)
    ) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }
  }
  if (current.length) groups.push(current);

  const clampedEnd = Math.round(result.durationSec * 1000);
  const cues: CaptionCue[] = [];
  let prevEnd = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    let startMs = group[0].startMs;
    let endMs = group[group.length - 1].endMs;

    // Non-overlap and monotonic cues.
    if (startMs < prevEnd) startMs = prevEnd;
    if (endMs <= startMs) endMs = startMs + 300;

    // Minimum cue length, but never steal time from the next group's natural
    // start — Vietnamese speech is dense (~330 ms/word); extending every short
    // word to 400 ms would push the next cue forward and cascade into garbage.
    const nextStart = gi + 1 < groups.length ? groups[gi + 1][0].startMs : Infinity;
    const room = nextStart - startMs;
    if (endMs - startMs < opt.minCueMs) {
      const wanted = startMs + opt.minCueMs;
      endMs = room >= opt.minCueMs + 60 ? wanted : Math.max(endMs, startMs + Math.min(room, opt.minCueMs));
    }

    // Never extend past the real audio duration.
    if (clampedEnd > 0 && endMs > clampedEnd) {
      endMs = Math.max(startMs + 60, clampedEnd);
    }
    prevEnd = endMs;

    const timed: TimedWord[] = group.map((w) => ({
      text: w.text,
      startMs: Math.max(startMs, Math.min(endMs, w.startMs)),
      endMs: Math.max(startMs, Math.min(endMs, Math.max(w.endMs, w.startMs + 60))),
    }));

    cues.push({
      id: cues.length + 1,
      startMs,
      endMs,
      startSec: startMs / 1000,
      endSec: endMs / 1000,
      text: timed.map((t) => t.text).join(" "),
      words: timed,
      accuracy: opt.wordAccuracy,
    });
  }
  return cues;
}
