import type { AsrClient, AsrOptions, AsrResult } from "./types.js";

/**
 * Deterministic fake ASR used by tests. No network, no model, no Python.
 * Lines starting with "==sec" move the fake timeline to sec seconds; each other
 * line becomes one segment spoken right after the previous one. Optional word
 * durations are derived evenly inside each segment, mirroring real worker output.
 */
export function buildFakeAsrResult(spec: string, opts?: { language?: string; model?: string; revision?: string }): AsrResult {
  const lines = spec
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let cursorSec = 0;
  const segments: AsrResult["segments"] = [];
  const words: AsrResult["words"] = [];

  for (const line of lines) {
    const seek = line.match(/^==([\d.]+)s?$/);
    if (seek) {
      cursorSec = parseFloat(seek[1]);
      continue;
    }
    const tokens = line.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const startMs = Math.round(cursorSec * 1000);
    const endMs = startMs + Math.round(tokens.join(" ").length * 60); // ~60ms per char
    const dur = endMs - startMs;
    tokens.forEach((t, i) => {
      words.push({
        text: t.normalize("NFC"),
        startMs: startMs + Math.round((i / tokens.length) * dur),
        endMs: i === tokens.length - 1 ? dur + startMs : startMs + Math.round(((i + 1) / tokens.length) * dur),
        probability: 0.97,
      });
    });
    segments.push({ startMs, endMs, text: tokens.join(" ").normalize("NFC") });
    cursorSec = endMs / 1000;
  }

  return {
    model: opts?.model ?? "fake-asr",
    revision: opts?.revision ?? "0000000000000000000000000000000000000000",
    language: opts?.language ?? "vi",
    durationSec: cursorSec,
    segments,
    words,
  };
}

export class FakeAsrClient implements AsrClient {
  calls: { audioPath: string; opts?: AsrOptions }[] = [];
  private result: AsrResult;

  constructor(result?: AsrResult) {
    this.result = result ?? buildFakeAsrResult("Xin chào mọi người, đây là thử nghiệm nhận dạng giọng nói tiếng Việt cục bộ.");
  }

  transcribe(audioPath: string, opts?: AsrOptions): Promise<AsrResult> {
    this.calls.push({ audioPath, opts });
    return Promise.resolve(this.result);
  }

  get lastOpts() {
    return this.calls[this.calls.length - 1]?.opts;
  }
}
