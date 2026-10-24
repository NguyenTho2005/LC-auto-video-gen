import { CaptionCue, formatSrtTime, parseSrtTime } from "./types.js";

/**
 * Generate standard SRT (SubRip) format text from CaptionCue list.
 * Output is UTF-8 with standard line breaks and 1-based indexing.
 */
export function generateSrt(cues: CaptionCue[]): string {
  if (cues.length === 0) return "";

  const blocks = cues.map((cue, idx) => {
    const id = idx + 1;
    const startTime = formatSrtTime(cue.startMs);
    const endTime = formatSrtTime(cue.endMs);
    const text = cue.text.normalize("NFC").trim();
    return `${id}\n${startTime} --> ${endTime}\n${text}`;
  });

  return blocks.join("\n\n") + "\n";
}

/**
 * Parse an SRT (SubRip) string into structured CaptionCue list.
 *
 * Supports:
 * - UTF-8 BOM stripping
 * - CRLF and LF line endings
 * - Multi-line cue text
 * - Comma and dot millisecond separators (00:00:01,500 or 00:00:01.500)
 * - Strict error throwing for malformed syntax
 */
export function parseSrt(rawContent: string): CaptionCue[] {
  if (!rawContent || rawContent.trim() === "") {
    return [];
  }

  // 1. Strip UTF-8 BOM if present
  let clean = rawContent.replace(/^\uFEFF/, "");

  // 2. Normalize Windows CRLF / CR to standard LF
  clean = clean.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  // 3. Split into subtitle blocks by two or more newlines
  const rawBlocks = clean.split(/\n\n+/);
  const cues: CaptionCue[] = [];

  for (let bIdx = 0; bIdx < rawBlocks.length; bIdx++) {
    const block = rawBlocks[bIdx].trim();
    if (!block) continue;

    const lines = block.split("\n");
    if (lines.length < 2) {
      throw new Error(
        `Malformed SRT block at index ${bIdx + 1}: expected at least 2 lines (timestamp + text), got:\n"${block}"`
      );
    }

    let timeLineIndex = 0;
    // Check if line 0 is numeric index (standard SRT)
    if (/^\d+$/.test(lines[0].trim())) {
      timeLineIndex = 1;
    }

    if (lines.length <= timeLineIndex) {
      throw new Error(`Malformed SRT block at index ${bIdx + 1}: missing timestamp line.`);
    }

    const timeLine = lines[timeLineIndex].trim();
    const timeMatch = timeLine.match(
      /^(\d{1,2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{3})/
    );

    if (!timeMatch) {
      throw new Error(
        `Invalid SRT timestamp line in block ${bIdx + 1}: "${timeLine}". Expected "HH:MM:SS,mmm --> HH:MM:SS,mmm"`
      );
    }

    const startMs = parseSrtTime(timeMatch[1]);
    const endMs = parseSrtTime(timeMatch[2]);

    if (endMs < startMs) {
      throw new Error(
        `Invalid SRT timing in block ${bIdx + 1}: end time (${timeMatch[2]}) is earlier than start time (${timeMatch[1]})`
      );
    }

    // Text lines are all lines after time line
    const textLines = lines.slice(timeLineIndex + 1);
    if (textLines.length === 0 || textLines.every((l) => l.trim() === "")) {
      throw new Error(`Empty subtitle text in SRT block ${bIdx + 1}`);
    }

    const cueText = textLines.join(" ").replace(/\s+/g, " ").normalize("NFC").trim();

    // Extract word-level approximations for the cue
    const words = cueText.split(/\s+/).filter(Boolean);
    const durationMs = endMs - startMs;
    const wordCount = words.length;

    const timedWords = words.map((w, wIdx) => {
      const wStart = startMs + Math.round((wIdx / wordCount) * durationMs);
      const wEnd =
        wIdx === wordCount - 1
          ? endMs
          : startMs + Math.round(((wIdx + 1) / wordCount) * durationMs);
      return {
        text: w,
        startMs: wStart,
        endMs: wEnd,
      };
    });

    cues.push({
      id: bIdx + 1,
      startMs,
      endMs,
      startSec: startMs / 1000,
      endSec: endMs / 1000,
      text: cueText,
      words: timedWords,
      accuracy: "high",
    });
  }

  return cues;
}

