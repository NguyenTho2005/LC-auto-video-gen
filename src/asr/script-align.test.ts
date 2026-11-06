import { describe, expect, it } from "vitest";
import { FakeAsrClient, buildFakeAsrResult } from "./fake-asr-client.js";
import { alignScriptWithRaw, alignScriptWithAsr } from "./script-align.js";
import { calculateTextOverlap } from "../captions/audio-aligner.js";

describe("alignScriptWithRaw (dùng kịch bản, thời gian của ASR)", () => {
  const raw = buildFakeAsrResult("xin chao cac ban day la thu nghiem");

  it("kịch bản khớp: chữ hiển thị = kịch bản, timing từ ASR, accuracy high", () => {
    const aligned = alignScriptWithRaw("Xin chào các bạn! Đây là thử nghiệm.", raw);
    expect(aligned.wordAccuracy).toBe("high");
    expect(aligned.cues[0].accuracy).toBe("high");
    const cueText = aligned.cues.map((c) => c.text).join(" ");
    expect(cueText).toContain("Đây là thử nghiệm");
    // Kịch bản giữ đúng dấu câu → overlap hiển thị vs kịch bản = 1
    expect(calculateTextOverlap(cueText, "Xin chào các bạn! Đây là thử nghiệm.")).toBeGreaterThan(0.9);
    // Thời gian bắt đầu/phep từ ASR cung cấp
    expect(aligned.cues[0].startMs).toBe(raw.words[0].startMs);
  });

  it("không có kịch bản: giữ nguyên văn bản ASR", () => {
    const aligned = alignScriptWithRaw(undefined, raw);
    const joined = aligned.cues.map((c) => c.text).join(" ");
    expect(calculateTextOverlap(joined, "xin chao cac ban day la thu nghiem")).toBe(1);
    expect(aligned.wordAccuracy).toBe("high");
  });

  it("kịch bản lệch strongly → cảnh báo mismatch, overlap < 0.65", () => {
    const lech = "Nội dung hoàn toàn khác biệt hẳn từ ngữ không giống";
    const aligned = alignScriptWithRaw(lech, raw);
    expect(aligned.overlap).toBeLessThan(0.65);
    expect(aligned.mismatchWarning).toBeTruthy();
  });

  it("ASR không có từ → accuracy low, vẫn trả cue raw", () => {
    const empty = { ...raw, words: [] };
    const aligned = alignScriptWithRaw("Xin chào", empty);
    expect(aligned.wordAccuracy).toBe("low");
  });
});

describe("alignScriptWithAsr (qua client)", () => {
  it("gọi client đúng path, có timing và trả raw", async () => {
    const fake = new FakeAsrClient();
    const result = await alignScriptWithAsr(fake, "/audio/test.wav", "Xin chào mọi người");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].audioPath).toBe("/audio/test.wav");
    expect(result.raw.model).toBe("fake-asr");
    expect(result.cues[0].startMs).toBeGreaterThanOrEqual(0);
  });
});
