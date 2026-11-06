import type { AsrClient, AsrOptions, AsrResult } from "./types.js";import type { CaptionCue } from "../captions/types.js";
import { alignSpokenWords } from "../captions/spoken-alignment.js";
import type { TtsTimingResult, WordTiming } from "../tts/tts-client.js";
import { calculateTextOverlap } from "../captions/audio-aligner.js";
import { asrResultToCues } from "./to-captions.js";

export interface ScriptAlignedAsr {
  cues: CaptionCue[];
  /** Jaccard overlap between the script and the raw ASR text (0..1). */
  overlap: number;
  mismatchWarning?: string;
  wordAccuracy: "high" | "low";
}

function asrToTiming(result: AsrResult): TtsTimingResult {
  return {
    accuracy: result.words.length > 0 ? "high" : "low",
    words: result.words.map((w): WordTiming => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })),
  };
}

/**
 * Pure form of script alignment: displayed text comes from the script, timing comes
 * from the ASR. Without a script the raw ASR text is kept verbatim.
 */
export function alignScriptWithRaw(
  scriptText: string | undefined,
  raw: AsrResult
): ScriptAlignedAsr {
  const hasScript = Boolean(scriptText?.trim());
  const rawText = raw.segments.map((s) => s.text).filter(Boolean).join(" ");
  const overlap = hasScript ? calculateTextOverlap(scriptText!.trim(), rawText) : 1;

  const mismatchWarning =
    hasScript && overlap < 0.65 && rawText
      ? `Cảnh báo: Kịch bản chỉ khớp ${(overlap * 100).toFixed(0)}% với nội dung nhận dạng giọng nói. Kiểm tra lại kịch bản trước khi render.`
      : undefined;

  if (!hasScript || !raw.words.length) {
    return {
      cues: asrResultToCues(raw),
      overlap,
      mismatchWarning,
      wordAccuracy: raw.words.length ? "high" : "low",
    };
  }

  const aligned = alignSpokenWords(scriptText!.trim(), asrToTiming(raw), { caseInsensitive: true });
  if (aligned.words.length === 0) {
    return { cues: asrResultToCues(raw), overlap, mismatchWarning, wordAccuracy: "low" };
  }

  // Rebuild cues from the aligned words (script tokens with ASR timings), keeping
  // the same cue-length rules as raw ASR cues so display text stays complete.
  // An anchored token inherits the real ASR timestamp; a token Whisper could not
  // match (e.g. mispronounced English terms) is interpolated between anchors, so
  // the whole cue set is honestly labelled by `aligned.accuracy`.
  const alignedWords: AsrResult["words"] = aligned.words.map((w) => ({ ...w, probability: 1 }));
  return {
    cues: asrResultToCues({ ...raw, words: alignedWords }, { wordAccuracy: aligned.accuracy }),
    overlap,
    mismatchWarning,
    wordAccuracy: aligned.accuracy,
  };
}

/** Convenience wrapper: transcribe via an AsrClient then align to a script. */
export async function alignScriptWithAsr(
  client: AsrClient,
  audioPath: string,
  scriptText: string | undefined,
  opts?: AsrOptions
): Promise<ScriptAlignedAsr & { raw: AsrResult }> {
  const raw = await client.transcribe(audioPath, opts);
  return { ...alignScriptWithRaw(scriptText, raw), raw };
}
