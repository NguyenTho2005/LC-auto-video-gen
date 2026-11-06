/**
 * ASR data structures for M8 (audio → SRT, local speech recognition).
 */

export interface AsrWord {
  text: string;
  startMs: number;
  endMs: number;
  probability: number;
}

export interface AsrSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface AsrResult {
  model: string;
  revision: string;
  language: string;
  durationSec: number;
  segments: AsrSegment[];
  words: AsrWord[];
}

export interface AsrOptions {
  language?: string;
  /** Kill the worker after this many milliseconds. Defaults to elapsed audio × 6 + 60s. */
  timeoutMs?: number;
  /** Notified with stage messages from worker stderr ("loading", "transcribing"...). */
  onStage?: (stage: string) => void;
  /** Abort/dispose support: killing the worker while transcription is running. */
  signal?: AbortSignal;
}

export interface AsrClient {
  transcribe(audioPath: string, opts?: AsrOptions): Promise<AsrResult>;
}

/** Injection points for tests: fake python/worker without touching the network or model. */
export interface AsrClientOverrides {
  pythonPath?: string;
  workerPath?: string;
  revision?: string;
  spawnImpl?: (cmd: string, args: string[], options: any) => any;
  cacheKeyFor?: (audioPath: string, revision: string, opts: AsrOptions) => Promise<string>;
}
