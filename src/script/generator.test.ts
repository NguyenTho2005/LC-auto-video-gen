import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cleanLlmJson, generateScript } from "./generator.js";
import { FakeLLMProvider } from "./llm-provider.js";

describe("Script Generator Pipeline (M4)", () => {
  const testOutputDir = "output/test-script-generator";

  const validScriptJson = JSON.stringify({
    schemaVersion: 2,
    metadata: {
      title: "Đánh giá siêu phẩm công nghệ",
      source: { url: "https://example.com/item", domain: "example.com", image: null },
      channel: "Tech Channel",
      useOgImage: false,
    },
    voice: { provider: "edge-tts", voiceId: "vi-VN-NamMinhNeural", speed: 1.0 },
    scenes: [
      {
        id: "hook",
        type: "hook",
        voiceText: "Liệu siêu phẩm mới có xứng đáng giá hai mươi triệu?",
        templateData: { template: "hook", headline: "SIÊU PHẨM MỚI", subhead: "Giá 20 triệu có đáng?" },
      },
      {
        id: "body-1",
        type: "body",
        voiceText: "Máy trang bị chip mạnh mẽ với 16GB RAM.",
        templateData: {
          template: "spec-table",
          productName: "Siêu phẩm",
          specs: [
            { label: "RAM", value: "16GB" },
            { label: "Bộ nhớ", value: "512GB" },
          ],
        },
      },
      {
        id: "body-2",
        type: "body",
        voiceText: "Ưu điểm là thiết kế mỏng nhẹ nhưng pin chỉ ở mức trung bình.",
        templateData: {
          template: "pros-cons",
          pros: ["Mỏng nhẹ", "Màn hình đẹp"],
          cons: ["Pin trung bình"],
        },
      },
      {
        id: "body-3",
        type: "body",
        voiceText: "Máy được chấm điểm tám phẩy năm trên mười điểm.",
        templateData: {
          template: "verdict-score",
          productName: "Siêu phẩm",
          score: 8.5,
          scale: "10",
          verdict: "Rất đáng mua",
          summary: "Thiết bị cân bằng tốt nhất.",
        },
      },
      {
        id: "outro",
        type: "outro",
        voiceText: "Theo dõi kênh để đón xem đánh giá mới nhất.",
        templateData: {
          template: "outro",
          ctaTop: "THEO DÕI",
          channelName: "Tech Channel",
          source: "example.com",
        },
      },
    ],
  });

  const sourceArticle = `
Ra mắt siêu phẩm công nghệ mới nhất.
Mẫu máy sở hữu 16GB RAM cùng 512GB bộ nhớ trong.
Giá bán dự kiến 20 triệu đồng.
Điểm đánh giá sơ bộ đạt 8.5 trên 10.
`;

  beforeEach(() => {
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe("cleanLlmJson", () => {
    it("strips ```json code fences", () => {
      const raw = "```json\n{\"foo\": \"bar\"}\n```";
      expect(cleanLlmJson(raw)).toBe('{"foo": "bar"}');
    });

    it("leaves plain JSON intact", () => {
      const raw = '{"foo": "bar"}';
      expect(cleanLlmJson(raw)).toBe('{"foo": "bar"}');
    });
  });

  describe("generateScript", () => {
    it("successfully creates script.json, sources.json, and script.review.md with FakeLLMProvider", async () => {
      const fakeProvider = new FakeLLMProvider({
        responses: [`\`\`\`json\n${validScriptJson}\n\`\`\``],
      });

      const result = await generateScript({
        input: sourceArticle,
        preset: "news_short",
        outputDir: testOutputDir,
        llmProvider: fakeProvider,
      });

      expect(result.script.scenes).toHaveLength(5);
      expect(existsSync(join(testOutputDir, "script.json"))).toBe(true);
      expect(existsSync(join(testOutputDir, "sources.json"))).toBe(true);
      expect(existsSync(join(testOutputDir, "script.review.md"))).toBe(true);

      const reviewMd = readFileSync(join(testOutputDir, "script.review.md"), "utf8");
      expect(reviewMd).toContain("Báo cáo Duyệt Kịch bản");
      expect(reviewMd.toLowerCase()).toContain("siêu phẩm");
    });

    it("retries up to 2 times when LLM outputs invalid JSON on first attempt", async () => {
      const invalidJson = '{"broken": json here';
      const fakeProvider = new FakeLLMProvider({
        responses: [invalidJson, validScriptJson],
      });

      const result = await generateScript({
        input: sourceArticle,
        preset: "review_60",
        outputDir: testOutputDir,
        llmProvider: fakeProvider,
      });

      expect(fakeProvider.callCount).toBe(2);
      expect(result.script.scenes).toHaveLength(5);
      expect(existsSync(join(testOutputDir, "script.json"))).toBe(true);
    });

    it("throws error when all attempts fail", async () => {
      const invalidJson = '{"broken": json';
      const fakeProvider = new FakeLLMProvider({
        responses: [invalidJson, invalidJson, invalidJson],
      });

      await expect(
        generateScript({
          input: sourceArticle,
          outputDir: testOutputDir,
          llmProvider: fakeProvider,
        }),
      ).rejects.toThrow("Failed to generate valid script after 3 attempts");
    });

    it("flags numbers absent from source in review markdown", async () => {
      // Modify script to include fabricated number 9999
      const modified = JSON.parse(validScriptJson);
      modified.scenes[1].voiceText = "Máy trang bị chip với 9999GB RAM cực khủng.";
      modified.scenes[1].templateData.specs[0].value = "9999GB";

      const fakeProvider = new FakeLLMProvider({
        responses: [JSON.stringify(modified)],
      });

      const result = await generateScript({
        input: sourceArticle, // source does NOT have 9999
        outputDir: testOutputDir,
        llmProvider: fakeProvider,
      });

      expect(result.factCheck.flaggedNumbers.some((f) => f.number === "9999")).toBe(true);
      const reviewMd = readFileSync(join(testOutputDir, "script.review.md"), "utf8");
      expect(reviewMd).toContain("CẢNH BÁO SỐ LIỆU CHƯA XÁC MINH");
      expect(reviewMd).toContain("9999");
    });
  });
});
