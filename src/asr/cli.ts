#!/usr/bin/env node
/**
 * CLI script for M8: transcribe a local MP3/WAV into SRT + word timings.
 *
 * Usage:
 *   npm run asr -- <audio.(mp3|wav)> [--out file.srt] [--script file.txt] [--lang vi] [--json file.json]
 *
 * Requires `npm run asr:setup` once (venv + pinned PhoWhisper-small model, ~0.97 GB).
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import { asrInstalled, FasterWhisperClient } from "./faster-whisper-client.js";
import { alignScriptWithAsr } from "./script-align.js";
import { generateSrt } from "../captions/srt.js";

function usage(): never {
  console.error("Usage: npm run asr -- <audio.(mp3|wav)> [--out file.srt] [--script file.txt] [--lang vi]");
  process.exit(1);
}

interface ParsedArgs {
  audio: string;
  out?: string;
  scriptPath?: string;
  lang: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = { audio: "", lang: process.env.ASR_LANGUAGE ?? "vi" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out") parsed.out = args[++i];
    else if (a === "--script") parsed.scriptPath = args[++i];
    else if (a === "--lang" || a === "--language") parsed.lang = args[++i];
    else if (a === "--help" || a === "-h") usage();
    else if (!parsed.audio) parsed.audio = a;
    else usage();
  }
  if (!parsed.audio) usage();
  return parsed;
}

async function main() {
  const { audio, out, scriptPath, lang } = parseArgs(process.argv.slice(2));

  if (!(await stat(audio)).isFile()) {
    console.error(`File audio không tồn tại: ${audio}`);
    process.exit(1);
  }
  if (!asrInstalled()) {
    console.error("ASR chưa cài. Chạy: npm run asr:setup (tải model ~0.97 GB lần đầu).");
    process.exit(1);
  }

  const scriptText = scriptPath ? (await readFile(scriptPath, "utf8")).trim() : undefined;
  const outputPath = out ?? audio.replace(/\.[^/.]+$/, "") + ".srt";

  console.log(`Nhận dạng: ${audio}`);
  const client = new FasterWhisperClient();
  const t0 = Date.now();
  const { cues, overlap, mismatchWarning, wordAccuracy } = await alignScriptWithAsr(client, audio, scriptText, {
    language: lang,
    onStage: (stage) => {
      if (stage === "loading") console.log("Đang nạp model...");
      if (stage === "transcribing") console.log("Đang nhận dạng...");
    },
  });
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  await writeFile(outputPath, generateSrt(cues), "utf8");
  console.log(`SRT: ${outputPath} (${cues.length} cue, ${elapsedSec}s)`);
  console.log(`Chất lượng word timing: ${wordAccuracy}`);
  if (scriptText) console.log(`Độ khớp kịch bản ↔ ASR: ${(overlap * 100).toFixed(0)}%`);
  if (mismatchWarning) console.warn(mismatchWarning);
}

main().catch((err) => {
  console.error(`Lỗi ASR: ${err.message}`);
  process.exit(1);
});
