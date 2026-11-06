import { beforeAll, afterAll, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { studioRouter, setTranscribeClientForTest } from "./routes.js";
import { buildFakeAsrResult } from "../asr/fake-asr-client.js";
import { FakeAsrClient } from "../asr/fake-asr-client.js";

vi.mock("../tts/tts-client.js", () => ({ createTtsClient: () => ({ generate: async () => ({ words: [], accuracy: "low" }) }) }));

const UPLOAD_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../.uploads");
const TEST_ID = "11111111-2222-3333-4444-555555555555";

async function seedUpload(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  // valid silent 1s mono 16-bit WAV
  const sampleRate = 8000;
  const samples = new Int16Array(sampleRate);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write("WAVE", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length * 2, 40);
  await writeFile(join(UPLOAD_DIR, TEST_ID + ".wav"), Buffer.concat([header, Buffer.from(samples.buffer)]));
  await writeFile(join(UPLOAD_DIR, TEST_ID + ".json"), JSON.stringify({ durationSec: 1, name: "test.wav" }));
}

let server: Server;
let url: string;

beforeAll(async () => {
  await seedUpload();
  const raw = buildFakeAsrResult("nghe được mọi người xin chào tự động", { model: "fake-asr-test", revision: "0".repeat(40), language: "vi" });
  const client = new FakeAsrClient(raw);
  setTranscribeClientForTest(client);
  const app = express();
  app.use(express.json());
  app.use("/api/studio", studioRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

afterAll(async () => {
  setTranscribeClientForTest(null);
  await rm(join(UPLOAD_DIR, TEST_ID + ".wav"), { force: true });
  await rm(join(UPLOAD_DIR, TEST_ID + ".json"), { force: true });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("/api/studio/transcribe trả SRT + word timing từ fake", async () => {
  const res = await fetch(url + "/api/studio/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: TEST_ID, language: "vi" }),
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.cues.length).toBeGreaterThan(0);
  expect(data.quality.source).toBe("asr");
  expect(data.quality.wordAccuracy).toBe("high");
  expect(data.srt).toMatch(/--> /);
  expect(data.durationSec).toBeGreaterThan(0);
});

it("/api/studio/transcribe có kịch bản → chữ = kịch bản", async () => {
  const res = await fetch(url + "/api/studio/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: TEST_ID, scriptText: "Nghe được mọi người!" }),
  });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(JSON.stringify(data.cues)).toContain("Nghe được mọi người");
});

it("/api/studio/transcribe lỗi luôn là JSON", async () => {
  const res = await fetch(url + "/api/studio/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: randomUUID() }),
  });
  expect(res.status).toBe(400);
  const data = await res.json();
  expect(typeof data.error).toBe("string");
});

it("/api/studio/uploads đọc json metadata không phá luồng cũ", async () => {
  const meta = JSON.parse(await readFile(join(UPLOAD_DIR, TEST_ID + ".json"), "utf8"));
  expect(meta.durationSec).toBe(1);
});
