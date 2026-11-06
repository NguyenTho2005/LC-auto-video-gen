import { describe, expect, it } from "vitest";
import { buildFakeAsrResult } from "./fake-asr-client.js";
import { asrResultToCues } from "./to-captions.js";
import { generateSrt } from "../captions/srt.js";

describe("asrResultToCues", () => {
  it("mỗi cue ≤ 64 ký tự, không chồng lấn, accuracy high when words present", () => {
    const long = Array.from({ length: 80 }, (_, i) => `từ${i}`).join(" ");
    const raw = buildFakeAsrResult(long);
    const cues = asrResultToCues(raw, { maxCharsPerLine: 32, maxLines: 2 });
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0].accuracy).toBe("high");
    let prevEnd = 0;
    for (const c of cues) {
      expect(c.startMs).toBeGreaterThanOrEqual(prevEnd);
      expect(c.endMs).toBeGreaterThan(c.startMs);
      expect(c.text.length).toBeLessThanOrEqual(64);
      expect(c.words.length).toBeGreaterThan(0);
      prevEnd = c.endMs;
    }
  });

  it("cue không vượt quá tổng thời lượng audio", () => {
    const raw = buildFakeAsrResult("Xin chào, đây là dòng cuối cùng của bài đọc.");
    const cues = asrResultToCues(raw);
    for (const c of cues) {
      expect(c.endSec).toBeLessThanOrEqual(raw.durationSec + 0.001);
    }
  });

  it("cắt cue sau dấu câu + khoảng lặng dài", () => {
    const raw = buildFakeAsrResult("Đoạn một kết thúc. ==0.2s Từ tiếp theo sau lặng");
    const cues = asrResultToCues(raw);
    expect(cues.length).toBeGreaterThanOrEqual(2);
    const first = cues[0];
    expect(first.text).toMatch(/kết thúc/);
    expect(first.endMs).toBeLessThanOrEqual(cues[1].startMs + 0.001);
  });

  it("SRT sinh ra hợp lệ từ cue ASR (round-trip)", () => {
    const raw = buildFakeAsrResult("Hai dòngikhác nhau. ==0.5s Dòng sau");
    const cues = asrResultToCues(raw);
    const srt = generateSrt(cues);
    expect(srt).toMatch(/^1\n\d{2}:\d{2}:\d{2},\d{3} --> /);
    expect(srt.trimEnd().endsWith("Dòng sau")).toBe(true);
  });

  it("hồi quy: sau khi đẩy cue theo giới hạn ký tự, bộ đếm phải reset (không 1 từ/cue)", () => {
    // ~80 từ liên tục, không dấu câu, chớp ngắn → phải tạo vài cue nhiều từ.
    const many = Array.from({ length: 80 }, (_, i) => `từ${i}`).join(" ");
    const raw = buildFakeAsrResult(many);
    const cues = asrResultToCues(raw, { maxCharsPerLine: 32, maxLines: 2 });
    expect(cues.length).toBeLessThan(40); // không phải mỗi từ một cue
    expect(cues.some((c) => c.words.length >= 3)).toBe(true);
  });

  it("hồi quy: cue ngắn không kéo dài chen vào giờ bắt đầu tự nhiên của từ kế (Voice tiếngdense)", () => {
    // từ cách nhau ~300 ms (tiếng Việt dày): min 400 ms không được đẩy cue kế tiếp lệch dồn
    const words = ["vậy", "đà", "số", "chúng", "ta", "chỉ", "dùng"].map((t, i) => ({
      text: t,
      startMs: 4280 + i * 300,
      endMs: 4280 + i * 300 + 240,
      probability: 0.95,
    }));
    const raw = buildFakeAsrResult(words.map((w) => w.text).join(" "));
    raw.words = words;
    raw.durationSec = 8;
    const cues = asrResultToCues(raw);
    let prevEnd = 0;
    for (const c of cues) {
      expect(c.startMs).toBeGreaterThanOrEqual(prevEnd);
      expect(c.endMs).toBeGreaterThan(c.startMs);
      prevEnd = c.endMs;
    }
    // không bị xếp lớp dồn dần: 7 từ liền nhau phải thành 1 cue, kết thúc ở
    // giờ kết thúc tự nhiên của từ cuối (không bị đẩy lệch dồn)
    expect(cues.length).toBe(1);
    expect(cues[0].text).toContain("dùng");
    expect(cues[0].endMs).toBeLessThanOrEqual(6320);
  });
});
