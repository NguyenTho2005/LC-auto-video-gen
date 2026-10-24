import { describe, it, expect } from "vitest";
import { generateSrt, parseSrt } from "./srt.js";
import { formatSrtTime, parseSrtTime, CaptionCue } from "./types.js";

describe("SRT Module (M1)", () => {
  describe("Timestamp formatting and parsing", () => {
    it("formats milliseconds to HH:MM:SS,mmm correctly", () => {
      expect(formatSrtTime(0)).toBe("00:00:00,000");
      expect(formatSrtTime(1234)).toBe("00:00:01,234");
      expect(formatSrtTime(65432)).toBe("00:01:05,432");
      expect(formatSrtTime(3661005)).toBe("01:01:01,005");
    });

    it("parses HH:MM:SS,mmm and HH:MM:SS.mmm to milliseconds", () => {
      expect(parseSrtTime("00:00:00,000")).toBe(0);
      expect(parseSrtTime("00:00:01,234")).toBe(1234);
      expect(parseSrtTime("00:01:05,432")).toBe(65432);
      expect(parseSrtTime("01:01:01,005")).toBe(3661005);
      expect(parseSrtTime("00:00:02.500")).toBe(2500);
    });

    it("throws clear error on malformed timestamps", () => {
      expect(() => parseSrtTime("invalid")).toThrow(/Invalid SRT timestamp/);
      expect(() => parseSrtTime("00:00,000")).toThrow(/Invalid SRT timestamp/);
    });
  });

  describe("SRT Round-trip (PRD2 Acceptance Criterion 3)", () => {
    it("cue → SRT → cue preserves cue count and timing within <= 1ms tolerance", () => {
      const originalCues: CaptionCue[] = [
        {
          id: 1,
          startMs: 250,
          endMs: 1450,
          startSec: 0.25,
          endSec: 1.45,
          text: "Chào mừng các bạn",
          words: [
            { text: "Chào", startMs: 250, endMs: 600 },
            { text: "mừng", startMs: 600, endMs: 1000 },
            { text: "các", startMs: 1000, endMs: 1200 },
            { text: "bạn", startMs: 1200, endMs: 1450 },
          ],
        },
        {
          id: 2,
          startMs: 1600,
          endMs: 3850,
          startSec: 1.6,
          endSec: 3.85,
          text: "đến với bản tin công nghệ AI",
          words: [
            { text: "đến", startMs: 1600, endMs: 1900 },
            { text: "với", startMs: 1900, endMs: 2200 },
            { text: "bản", startMs: 2200, endMs: 2500 },
            { text: "tin", startMs: 2500, endMs: 2800 },
            { text: "công", startMs: 2800, endMs: 3300 },
            { text: "nghệ", startMs: 3300, endMs: 3600 },
            { text: "AI", startMs: 3600, endMs: 3850 },
          ],
        },
      ];

      const srtString = generateSrt(originalCues);
      const parsedCues = parseSrt(srtString);

      expect(parsedCues.length).toBe(originalCues.length);

      for (let i = 0; i < originalCues.length; i++) {
        const orig = originalCues[i];
        const parsed = parsedCues[i];

        expect(Math.abs(parsed.startMs - orig.startMs)).toBeLessThanOrEqual(1);
        expect(Math.abs(parsed.endMs - orig.endMs)).toBeLessThanOrEqual(1);
        expect(parsed.text).toBe(orig.text);
      }
    });
  });

  describe("Vietnamese, BOM & CRLF handling (PRD2 Acceptance Criterion 4)", () => {
    it("correctly parses SRT with UTF-8 BOM, CRLF and Vietnamese diacritics", () => {
      const srtWithBomAndCrlf =
        "\uFEFF1\r\n" +
        "00:00:01,000 --> 00:00:02,500\r\n" +
        "Ứng dụng trí tuệ nhân tạo\r\n\r\n" +
        "2\r\n" +
        "00:00:02,700 --> 00:00:04,800\r\n" +
        "đột phá công nghệ năm 2026\r\n";

      const cues = parseSrt(srtWithBomAndCrlf);

      expect(cues).toHaveLength(2);
      expect(cues[0].startMs).toBe(1000);
      expect(cues[0].endMs).toBe(2500);
      expect(cues[0].text).toBe("Ứng dụng trí tuệ nhân tạo");

      expect(cues[1].startMs).toBe(2700);
      expect(cues[1].endMs).toBe(4800);
      expect(cues[1].text).toBe("đột phá công nghệ năm 2026");
    });

    it("correctly handles multi-line cue texts joined together", () => {
      const multiLineSrt =
        "1\n" +
        "00:00:00,500 --> 00:00:03,000\n" +
        "Dòng thứ nhất của phụ đề\n" +
        "và dòng thứ hai cùng một cue\n";

      const cues = parseSrt(multiLineSrt);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe(
        "Dòng thứ nhất của phụ đề và dòng thứ hai cùng một cue"
      );
    });

    it("throws descriptive errors when SRT is malformed", () => {
      const invalidTime =
        "1\n" +
        "00:00:05,000 --> 00:00:02,000\n" +
        "Thời gian kết thúc nhỏ hơn bắt đầu\n";

      expect(() => parseSrt(invalidTime)).toThrow(/earlier than start time/);

      const missingText = "1\n00:00:01,000 --> 00:00:02,000\n\n";
      expect(() => parseSrt(missingText)).toThrow(/Empty subtitle text/);
    });
  });
});

