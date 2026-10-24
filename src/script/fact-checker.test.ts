import { describe, it, expect } from "vitest";
import {
  extractNumbersFromString,
  extractNumbersFromTemplateData,
  factCheckScript,
} from "./fact-checker.js";
import type { Script } from "../render/script-schema.js";

describe("Fact Checker (M4)", () => {
  describe("extractNumbersFromString", () => {
    it("extracts integers, decimals and thousands separators", () => {
      const text = "Phiên bản GPT 5.5 có 200MP và giá 29.990.000đ đạt 82.7% điểm.";
      const numbers = extractNumbersFromString(text);

      expect(numbers).toContain("5.5");
      expect(numbers).toContain("200");
      expect(numbers).toContain("29.990.000");
      expect(numbers).toContain("82.7");
    });

    it("extracts spoken Vietnamese numbers like năm chấm năm", () => {
      const text = "Hệ thống đạt mức năm chấm năm điểm.";
      const numbers = extractNumbersFromString(text);
      expect(numbers).toContain("5.5");
    });
  });

  describe("extractNumbersFromTemplateData", () => {
    it("extracts numbers from nested template objects", () => {
      const td = {
        template: "spec-table" as const,
        productName: "Phone 16",
        specs: [
          { label: "Camera", value: "200 megapixel" },
          { label: "Pin", value: "5000 mAh" },
        ],
      };
      const numbers = extractNumbersFromTemplateData(td);
      expect(numbers).toContain("16");
      expect(numbers).toContain("200");
      expect(numbers).toContain("5000");
    });
  });

  describe("factCheckScript", () => {
    const mockScript: Script = {
      schemaVersion: 2,
      metadata: {
        title: "Test Video",
        source: { url: "https://example.com", domain: "example.com", image: null },
        channel: "Test Channel",
        useOgImage: false,
      },
      voice: { provider: "edge-tts", voiceId: "vi-VN-NamMinhNeural", speed: 1.0 },
      scenes: [
        {
          id: "hook",
          type: "hook",
          voiceText: "iPhone 16 Pro Max vừa ra mắt với camera 200 megapixel.",
          templateData: { template: "hook", headline: "IPHONE 16 PRO", subhead: "Camera 200MP", kenBurns: "zoom-in" },
        },
        {
          id: "body-1",
          type: "body",
          voiceText: "Thiết bị có giá niêm yết là 29.990.000đ.",
          templateData: { template: "price-tag", productName: "iPhone 16", price: "29.990.000đ" },
        },
        {
          id: "body-2",
          type: "body",
          voiceText: "Đặc biệt thời lượng pin lên đến 999 giờ sử dụng liên tục.", // BỊA ĐẶT (hallucinated)
          templateData: { template: "stat-hero", value: "999 giờ", label: "Thời lượng pin" },
        },
        {
          id: "body-3",
          type: "body",
          voiceText: "Màn hình có tần số quét 120Hz mượt mà.",
          templateData: { template: "callout", statement: "Màn hình 120Hz siêu mượt", tag: "MÀN HÌNH" },
        },
        {
          id: "outro",
          type: "outro",
          voiceText: "Theo dõi kênh để biết thêm chi tiết.",
          templateData: { template: "outro", ctaTop: "THEO DÕI", channelName: "Test Channel", source: "example.com" },
        },
      ],
    };

    const sourceContent = `
Apple chính thức giới thiệu iPhone 16 Pro Max.
Máy được trang bị hệ thống camera 200 megapixel cực kỳ sắc nét.
Màn hình kích thước lớn với tần số quét 120Hz.
Giá bán khởi điểm từ 29.990.000 đồng tại thị trường Việt Nam.
Pin máy đáp ứng tốt 24 giờ sử dụng thông thường.
`;

    it("verifies numbers present in source and flags fabricated numbers", () => {
      const result = factCheckScript(mockScript, sourceContent);

      // Verified numbers
      expect(result.verifiedNumbers).toContain("200");
      expect(result.verifiedNumbers).toContain("120");
      expect(result.verifiedNumbers).toContain("29.990.000");

      // Flagged number (999 is fabricated, not in source!)
      expect(result.flaggedNumbers.some((f) => f.number === "999" && f.sceneId === "body-2")).toBe(true);
    });
  });
});
