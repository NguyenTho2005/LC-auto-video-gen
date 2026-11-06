import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { buildCreativeScript } from "./creative-builder.js";
import * as uploads from "./uploads.js";

describe("Creative Mode - Creative Script Builder", () => {
  it("automatically derives transcript from SRT content when transcript is omitted", async () => {
    // Mock readUpload to avoid requiring a real ffprobe/ffmpeg file
    vi.spyOn(uploads, "readUpload").mockResolvedValue({
      path: "/fake/path/audio.wav",
      durationSec: 10,
      name: "audio.mp3",
    });

    const srtContent = `1
00:00:00,000 --> 00:00:02,500
Chào mừng bạn đến với công cụ tạo video.

2
00:00:02,500 --> 00:00:06,000
Hệ thống hỗ trợ tự động hoàn toàn từ SRT.

3
00:00:06,000 --> 00:00:10,000
Hãy đăng ký kênh để theo dõi tin tức mới.`;

    const result = await buildCreativeScript({
      url: "https://github.com/example/repo",
      transcript: "", // Left empty by user!
      audioUploadId: randomUUID(),
      srtContent,
      channelName: "DevPeek36",
    });

    expect(result.script).toBeDefined();
    expect(result.script.scenes.length).toBeGreaterThanOrEqual(3);

    // Verify all spoken text from SRT is included in scenes
    const allVoice = result.script.scenes.map((s) => s.voiceText).join(" ");
    expect(allVoice).toContain("Chào mừng bạn đến với công cụ tạo video");
    expect(allVoice).toContain("Hệ thống hỗ trợ tự động hoàn toàn từ SRT");
    expect(allVoice).toContain("Hãy đăng ký kênh để theo dõi tin tức mới");
  });

  it("throws clear error when neither transcript nor srtContent is provided", async () => {
    vi.spyOn(uploads, "readUpload").mockResolvedValue({
      path: "/fake/path/audio.wav",
      durationSec: 10,
      name: "audio.mp3",
    });

    await expect(
      buildCreativeScript({
        url: "https://github.com/example/repo",
        transcript: "",
        audioUploadId: randomUUID(),
      })
    ).rejects.toThrow("Cần cung cấp kịch bản lời đọc (transcript) hoặc file phụ đề (SRT).");
  });
});
