import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AsrClient, AsrOptions, AsrResult, AsrClientOverrides } from "./types.js";
import { log } from "../utils/logger.js";

const exec = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const RUNTIME_DIR = join(ROOT, ".asr-runtime");
const CACHE_DIR = join(ROOT, ".asr-cache");
export const ASR_MODEL = "qbsmlabs/PhoWhisper-small";
export const ASR_REVISION = "644a8705b6981de92b10659b105763bdb39b61ef";

export function asrPythonPath(): string {
  return join(ROOT, ".asr-venv/bin/python");
}

export function asrWorkerPath(): string {
  return join(ROOT, "scripts/asr_worker.py");
}

/** True only when the venv exists AND at least one pinned model snapshot was prepared. */
export function asrInstalled(): boolean {
  if (!existsSync(asrPythonPath())) return false;
  try {
    const installed = JSON.parse(readFileSync(join(RUNTIME_DIR, "installed.json"), "utf8")) as {
      model: string;
      revision: string;
    };
    return Boolean(installed.revision);
  } catch {
    return false;
  }
}

function classifyExit(code: number | null, stderrTail: string): string {
  if (code === null) return "Worker ASR bị gián đoạn.";
  if (code === 137) return "Nhận dạng bị huỷ hoặc hết bộ nhớ.";
  // Worker writes one JSON status line to stderr before exiting non-zero.
  const lines = stderrTail.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) {
      try {
        const parsed = JSON.parse(line) as { message?: string };
        if (typeof parsed.message === "string") return parsed.message;
      } catch {
        /* not the status line */
      }
    }
  }
  return `Worker ASR thoát với mã ${code}.`;
}

function friendlyMessage(raw: string): string {
  // Map raw worker messages to friendly Vietnamese guidance.
  if (raw.includes("faster-whisper chưa cài")) return "ASR chưa cài. Chạy npm run asr:setup để tạo venv.";
  if (raw.includes("Chưa tải model ASR")) return "Model ASR chưa tải. Chạy npm run asr:setup (tải về ~0.97 GB lần đầu).";
  if (raw.includes("không tồn tại")) return "File audio không còn trên đĩa. Hãy tải lại audio.";
  if (raw.includes("không đọc được audio")) return "File audio hỏng hoặc không đọc được.";
  return raw;
}

/** Content-addressed cache key: sha256(audio) + model revision + options (language). */
export async function cacheKeyFor(audioPath: string, revision: string, opts: AsrOptions): Promise<string> {
  const audioHash = createHash("sha256").update(await readFile(audioPath)).digest("hex");
  return createHash("sha256").update(`${audioHash}|${revision}|${opts.language ?? "vi"}`).digest("hex");
}

async function readCache(key: string): Promise<AsrResult | undefined> {
  try {
    const raw = await readFile(join(CACHE_DIR, key + ".json"), "utf8");
    const stored = JSON.parse(raw) as { result: AsrResult };
    return stored.result;
  } catch {
    return undefined;
  }
}

/** Loads a cached ASR result for an audio file (M8→creative-build auto-reuse). */
export async function readCachedAsr(audioPath: string, opts: AsrOptions = {}, revision = ASR_REVISION): Promise<AsrResult | undefined> {
  try {
    return readCache(await cacheKeyFor(audioPath, revision, opts));
  } catch (err: any) {
    log.warn(`[ASR] Không đọc được cache (${err.code ?? err.name}).`);
    return undefined;
  }
}

async function writeCache(key: string, result: AsrResult): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(join(CACHE_DIR, key + ".json"), JSON.stringify({ revision: result.revision, model: result.model, result }));
  } catch (err: any) {
    log.warn(`[ASR] Không ghi được cache: ${err.message}`);
  }
}

async function defaultTimeoutMs(audioPath: string): Promise<number> {
  try {
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", audioPath]);
    const durationSec = parseFloat(stdout.trim());
    if (Number.isFinite(durationSec)) return 60_000 + durationSec * 1000 * 6;
  } catch {
    /* fall through */
  }
  return 60_000 + 600 * 1000;
}

/** One-shot faster-whisper worker bridge. No ports, no daemon: spawn → JSON on stdout → exit. */
export class FasterWhisperClient implements AsrClient {
  constructor(private overrides?: AsrClientOverrides) {}

  async transcribe(audioPath: string, opts: AsrOptions = {}): Promise<AsrResult> {
    const inj = this.overrides;
    if (process.env.VITEST && !inj) {
      throw new Error("ASR phải dùng fake/mock trong test.");
    }
    const pythonPath = inj?.pythonPath ?? asrPythonPath();
    const workerPath = inj?.workerPath ?? asrWorkerPath();
    const revision = inj?.revision ?? ASR_REVISION;
    const spawnImpl = inj?.spawnImpl ?? spawn;
    const cacheKeyImpl = inj?.cacheKeyFor ?? cacheKeyFor;

    const key = await cacheKeyImpl(audioPath, revision, opts);
    const cached = await readCache(key);
    if (cached) {
      log.info(`[ASR] Dùng cache: ${cached.segments.length} đoạn, ${cached.words.length} từ.`);
      return cached;
    }

    const timeoutMs = opts.timeoutMs ?? (await defaultTimeoutMs(audioPath));
    const child = spawnImpl(pythonPath, ["-u", workerPath, "--audio", audioPath, "--language", opts.language ?? "vi"], {
      cwd: ROOT,
      env: { ...process.env, ASR_DEVICE: process.env.ASR_DEVICE ?? "auto" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    return await new Promise<AsrResult>((resolve, reject) => {
      let stdout = "";
      let stderrTail = "";
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
        try {
          child.kill("SIGKILL");
        } catch {
          /* already exited */
        }
      };

      const timer = setTimeout(
        () =>
          finish(() =>
            reject(new Error(`Nhận dạng vượt quá ${(timeoutMs / 1000).toFixed(0)}s. Thử audio ngắn hơn hoặc chọn model nhỏ hơn ở ASR_MODEL.`))
          ),
        timeoutMs
      );
      if (opts.signal) {
        if (opts.signal.aborted) {
          finish(() => reject(new Error("Đã huỷ nhận dạng.")));
          return;
        }
        opts.signal.addEventListener("abort", () => finish(() => reject(new Error("Đã huỷ nhận dạng."))), { once: true });
      }

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString("utf8")).slice(-4000);
        const line = chunk.toString("utf8");
        if (opts.onStage) {
          if (line.includes("Nạp model")) opts.onStage("loading");
          if (line.includes("Đang nhận dạng")) opts.onStage("transcribing");
        }
      });
      child.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          finish(() => reject(new Error("ASR chưa cài. Chạy npm run asr:setup để tạo venv và tải model.")));
        } else {
          finish(() => reject(err));
        }
      });
      child.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void (async () => {
          if (code === 0) {
            try {
              const parsed = JSON.parse(stdout) as AsrResult;
              if (!Array.isArray(parsed.segments) || !Array.isArray(parsed.words) || typeof parsed.durationSec !== "number") {
                throw new Error("Worker ASR trả JSON không đúng cấu trúc.");
              }
              log.info(`[ASR] Xong: ${parsed.segments.length} đoạn, ${parsed.words.length} từ.`);
              try {
                await writeCache(key, parsed);
              } catch {
                /* cache write failure must not lose the result */
              }
              resolve(parsed);
            } catch (err: any) {
              reject(new Error(`Kết quả ASR không đọc được: ${err.message}`));
            }
            return;
          }
          const message = friendlyMessage(classifyExit(code, stderrTail));
          if (opts.onStage) opts.onStage("failed");
          reject(new Error(message));
        })();
      });
    });
  }
}

