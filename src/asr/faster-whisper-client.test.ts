import { describe, expect, it, beforeAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { globSync } from "node:fs";
import { FasterWhisperClient } from "./faster-whisper-client.js";
import { FakeAsrClient, buildFakeAsrResult } from "./fake-asr-client.js";

const exec = promisify(execFile);
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../.asr-cache");

beforeAll(() => {
  // Cache phải bền giữa các lần chạy thật, nhưng test dùng key riêng — xoá sạch trước mỗi run.
  for (const f of globSync(join(CACHE_DIR, "test-key-*.json"))) {
    void rm(f, { force: true }).catch(() => {});
  }
});

function fakeSpawn(script: { exitCode: number; stdout: string; stderr?: string }) {
  return function injected(cmd: string, args: string[], options: any) {
    void cmd;
    void args;
    void options;
    // Same ordering as the real worker: status/log lines on stderr, JSON on stdout.
    return spawn("node", [
      "-e",
      `process.stderr.write(${JSON.stringify(script.stderr ?? "")});process.stdout.write(${JSON.stringify(script.stdout)});process.exit(${script.exitCode});`,
    ]) as any;
  };
}

async function writeTempAudio(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "asr-"));
  const path = join(dir, "voice.wav");
  // valid 1s PCM WAV header + payload (44-byte header, 44100 Hz mono 16-bit)
  const sampleRate = 44100;
  const samples = new Int16Array(sampleRate);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length * 2, 40);
  await writeFile(path, Buffer.concat([header, Buffer.from(samples.buffer)]));
  return path;
}

describe("FasterWhisperClient (worker giả, không mạng, không model thật)", () => {
  it("lỗi exit 2 kèm status JSON → thông báo rõ nguyên nhân", async () => {
    const audio = await writeTempAudio();
    const client = new FasterWhisperClient({
      pythonPath: "node",
      workerPath: "-e",
      cacheKeyFor: async () => "test-key-missing",
      spawnImpl: fakeSpawn({
        exitCode: 2,
        stdout: "",
        stderr: '{"code": 4, "message": "Chưa tải model ASR. Chạy npm run asr:setup."}\n',
      }),
    } as any);
    await expect(client.transcribe(audio, { timeoutMs: 2000 })).rejects.toThrow(/asr:setup/);
  });

  it("audio hỏng (exit 3) → báo file hỏng", async () => {
    const audio = await writeTempAudio();
    const client = new FasterWhisperClient({
      cacheKeyFor: async () => "test-key-broken",
      spawnImpl: fakeSpawn({
        exitCode: 3,
        stdout: "",
        stderr: '{"code": 3, "message": "ffmpeg không đọc được audio; file có thể hỏng."}\n',
      }),
    } as any);
    await expect(client.transcribe(audio, { timeoutMs: 2000 })).rejects.toThrow(/hỏng hoặc không đọc được/);
  });

  it("timeout → huỷ worker (SIGKILL) và báo vượt thời gian", async () => {
    const audio = await writeTempAudio();
    const client = new FasterWhisperClient({
      cacheKeyFor: async () => "test-key-timeout",
      spawnImpl: () => spawn("node", ["-e", "setInterval(()=>{},1000);"]) as any,
    } as any);
    await expect(client.transcribe(audio, { timeoutMs: 300 })).rejects.toThrow(/vượt quá/);
  }, 5000);

  it("ENOENT python → hướng dẫn asr:setup", async () => {
    const audio = await writeTempAudio();
    const client = new FasterWhisperClient({ pythonPath: "asr-python-khong-ton-tai" } as any);
    await expect(client.transcribe(audio, { timeoutMs: 2000 })).rejects.toThrow(/asr:setup/);
  }, 5000);

  it("worker trả JSON hợp lệ → AsrResult có segments/words", async () => {
    const audio = await writeTempAudio();
    const fake = buildFakeAsrResult("kết quả giả từ worker");
    const client = new FasterWhisperClient({
      cacheKeyFor: async () => "test-key-ok",
      spawnImpl: fakeSpawn({
        exitCode: 0,
        stdout: JSON.stringify(fake) + "\n",
      }),
    } as any);
    const result = await client.transcribe(audio, { timeoutMs: 5000 });
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.words[0].probability).toBeGreaterThan(0);
  });

  it("cache hit → không spawn worker lần hai", async () => {
    const audio = await writeTempAudio();
    const fake = buildFakeAsrResult("cache hit kể cả lần sau");
    let spawns = 0;
    const base = fakeSpawn({ exitCode: 0, stdout: JSON.stringify(fake) + "\n" });
    const spawnImpl = (cmd: string, args: string[], options: any) => {
      spawns++;
      return base(cmd, args, options);
    };
    const client = new FasterWhisperClient({ cacheKeyFor: async () => "test-key-cache", spawnImpl } as any);
    const first = await client.transcribe(audio, { timeoutMs: 5000 });
    const second = await client.transcribe(audio, { timeoutMs: 5000 });
    expect(spawns).toBe(1);
    expect(second).toEqual(first);
  });
});

describe("FakeAsrClient hợp đồng AsrClient", () => {
  it("ghi nhận lệnh gọi và trả timing tăng dần", async () => {
    const fake = new FakeAsrClient();
    const out = await fake.transcribe("/x.wav", { language: "vi" });
    expect(fake.lastOpts?.language).toBe("vi");
    for (let i = 1; i < out.words.length; i++) {
      expect(out.words[i].startMs).toBeGreaterThanOrEqual(out.words[i - 1].startMs);
    }
  });
});
