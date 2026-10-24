import { describe, it, expect, beforeEach } from "vitest";
import { applyLexicon, resetLexiconCache } from "./lexicon.js";

describe("Lexicon Pronunciation Dictionary (M5)", () => {
  beforeEach(() => {
    resetLexiconCache();
  });

  it("replaces words case-insensitively with whole word boundaries", () => {
    const custom = {
      iPhone: "ai phôn",
      AI: "ây ai",
      OpenAI: "âu pừn ây ai",
    };

    expect(applyLexicon("Chiếc iphone mới rất đẹp.", custom)).toBe("Chiếc ai phôn mới rất đẹp.");
    expect(applyLexicon("IPHONE 16 Pro Max", custom)).toBe("ai phôn 16 Pro Max");
    expect(applyLexicon("Công nghệ AI đang phát triển.", custom)).toBe("Công nghệ ây ai đang phát triển.");
    expect(applyLexicon("OpenAI vừa công bố mô hình mới.", custom)).toBe("âu pừn ây ai vừa công bố mô hình mới.");
  });

  it("does not replace partial substrings inside other words", () => {
    const custom = {
      AI: "ây ai",
    };

    // "tai", "hai", "mai" should NOT be replaced by "tây ai"
    expect(applyLexicon("Đôi tai nghe này rất tốt.", custom)).toBe("Đôi tai nghe này rất tốt.");
    expect(applyLexicon("Có hai phương án.", custom)).toBe("Có hai phương án.");
  });

  it("loads config/lexicon.json by default", () => {
    const res = applyLexicon("Tôi vừa mua iPhone.");
    expect(res).toBe("Tôi vừa mua ai phôn.");
  });
});

