import { EdgeTTS, createSRT } from "edge-tts-universal";
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TtsClient, TtsTimingResult, WordTiming } from "./tts-client.js";

const execFileAsync = promisify(execFile);

export interface EdgeTtsOpts {
  voice: string;         // e.g. "vi-VN-HoaiMyNeural" or "vi-VN-NamMinhNeural"
  rate?: string;         // e.g. "+0%", "+10%", "-5%"
  pitch?: string;        // e.g. "+0Hz"
  volume?: string;       // e.g. "+0%"
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Edge TTS client using Microsoft Edge online text-to-speech service (Free).
 * Uses edge-tts-universal with automatic fallback to python edge-tts CLI.
 *
 * Supports subtitle generation (SRT) and word boundary cues.
 */
export class EdgeTtsClient implements TtsClient {
  constructor(private cfg: EdgeTtsOpts) {}

  async generate(text: string, audioOutPath: string, srtOutPath?: string): Promise<TtsTimingResult> {
    return await this.synthesizeWithRetry(text, audioOutPath, srtOutPath);
  }

  private async tryPythonEdgeTts(
    text: string,
    audioOutPath: string,
    srtOutPath?: string,
  ): Promise<boolean> {
    try {
      const args = [
        "-m",
        "edge_tts",
        "--voice",
        this.cfg.voice,
        "--text",
        text,
        "--write-media",
        audioOutPath,
        "--no-progress",
      ];
      if (this.cfg.rate && this.cfg.rate !== "+0%") args.push("--rate", this.cfg.rate);
      if (this.cfg.pitch && this.cfg.pitch !== "+0Hz") args.push("--pitch", this.cfg.pitch);
      if (this.cfg.volume && this.cfg.volume !== "+0%") args.push("--volume", this.cfg.volume);
      if (srtOutPath) args.push("--write-subtitles", srtOutPath);

      await execFileAsync("python3", args);
      return true;
    } catch {
      return false;
    }
  }

  private async synthesizeWithRetry(
    text: string,
    audioOutPath: string,
    srtOutPath?: string,
  ): Promise<TtsTimingResult> {
    const delays = [1000, 2000, 4000];
    let lastErr: unknown;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const tts = new EdgeTTS(text, this.cfg.voice, {
          rate: this.cfg.rate ?? "+0%",
          pitch: this.cfg.pitch ?? "+0Hz",
          volume: this.cfg.volume ?? "+0%",
        });

        // Timeout of 3500ms to detect dead websocket / 403 hang in edge-tts-universal
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("EdgeTTS synthesize timeout")), 3500)
        );

        const result = await Promise.race([tts.synthesize(), timeoutPromise]);
        const buffer = Buffer.from(await result.audio.arrayBuffer());
        if (buffer.length === 0) {
          throw new Error("Edge TTS returned empty audio buffer");
        }
        await writeFile(audioOutPath, buffer);

        const words: WordTiming[] = [];
        if (result.subtitle && result.subtitle.length > 0) {
          for (const item of result.subtitle) {
            // Offset and duration are in 100ns units (10,000 units = 1ms)
            const startMs = Math.round(item.offset / 10_000);
            const durMs = Math.round(item.duration / 10_000);
            words.push({
              text: item.text.trim(),
              startMs,
              endMs: startMs + durMs,
            });
          }

          if (srtOutPath) {
            const srtContent = createSRT(result.subtitle);
            await writeFile(srtOutPath, srtContent, "utf8");
          }

          return { accuracy: "high", words };
        }

        return { accuracy: "low", words: [] };
      } catch (e) {
        lastErr = e;
        if (!process.env.VITEST) {
          const pythonOk = await this.tryPythonEdgeTts(text, audioOutPath, srtOutPath);
          if (pythonOk) return { accuracy: "low", words: [] };
        }
        if (attempt === delays.length) throw e;
        await sleep(delays[attempt]);
      }
    }
    throw lastErr;
  }
}

