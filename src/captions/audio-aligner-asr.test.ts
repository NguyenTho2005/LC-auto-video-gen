import { describe, expect, it } from "vitest";
import { alignCreativeAudioAndSubtitles } from "./audio-aligner.js";
import { asrResultToCues } from "../asr/to-captions.js";
import { buildFakeAsrResult } from "../asr/fake-asr-client.js";

const audioParams = {
  audioPath: "không-đùng-đến-ffmpeg-vì-asr-cues-ưu-tiên.wav",
  totalDurationSec: 12,
};

describe("alignCreativeAudioAndSubtitles · nguồn asr-words (M8)", () => {
  it("ưu tiên asr-words: không gọi ffmpeg, highlight accurate-only, timingQuality.wordAccuracy high", async () => {
    const raw = buildFakeAsrResult("video đầu tiên của chúng ta. ==1.5s cảnh thứ hai nói tiếp lý do.");
    const asrCues = asrResultToCues(raw);
    const result = await alignCreativeAudioAndSubtitles({
      ...audioParams,
      transcript: "video đầu tiên của chúng ta. cảnh thứ hai nói tiếp lý do.",
      sceneTexts: ["video đầu tiên của chúng ta.", "cảnh thứ hai nói tiếp lý do.", "Outro"],
      asrCues,
    });
    expect(result.timingQuality.source).toBe("asr-words");
    expect(result.timingQuality.wordAccuracy).toBe("high");
    expect(result.highlightMode).toBe("accurate-only");
    expect(result.cues[0].accuracy).toBe("high");
    expect(result.cues[0].words.length).toBeGreaterThan(0);
  });

  it("không có ASR → giữ nguyên luồng acoustic cũ (không lùi)", async () => {
    const result = await alignCreativeAudioAndSubtitles({
      ...audioParams,
      transcript: "Một câu gốc duy nhất cho luồng cũ.",
      sceneTexts: ["Một câu gốc duy nhất cho luồng cũ.", "Outro"],
    });
    expect(result.timingQuality.source).not.toBe("asr-words");
    expect(result.timingQuality.wordAccuracy).toBe("low");
    expect(result.highlightMode).toBe("estimated");
  });

  it("cảnh báo căn chỉnh theo kịch bản được echo vào timingQuality", async () => {
    const raw = buildFakeAsrResult("bay cao alguno từ xa lạ");
    const asrCues = asrResultToCues(raw);
    const result = await alignCreativeAudioAndSubtitles({
      ...audioParams,
      transcript: "nội dung hoàn toàn khác biệt",
      sceneTexts: ["nội dung hoàn toàn khác biệt", "Outro"],
      asrCues,
      asrMismatchWarning: "Cảnh báo: Kịch bản chỉ khớp 0% với nội dung nhận dạng giọng nói.",
    });
    expect(result.timingQuality.mismatchWarning).toContain("0%");
  });
});
