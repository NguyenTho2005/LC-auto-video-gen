import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ScriptSchema } from "./script-schema.js";
import { composeHtml, ComposeArgs } from "./html-composer.js";
import { CaptionCue } from "../captions/types.js";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");

describe("Captions Integration & Backward Compatibility (M1)", () => {
  it("criterion 5: parses old v1 script fixtures without captions without errors", () => {
    const rawNoImage = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-no-image.json"), "utf8")
    );
    const parsedNoImage = ScriptSchema.parse(rawNoImage);
    expect(parsedNoImage.captions).toBeUndefined();

    const rawWithImage = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-with-image.json"), "utf8")
    );
    const parsedWithImage = ScriptSchema.parse(rawWithImage);
    expect(parsedWithImage.captions).toBeUndefined();
  });

  it("parses new script with optional captions enabled", () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-no-image.json"), "utf8")
    );
    raw.captions = { enabled: true, style: "tiktok-bold" };

    const parsed = ScriptSchema.parse(raw);
    expect(parsed.captions).toBeDefined();
    expect(parsed.captions?.enabled).toBe(true);
    expect(parsed.captions?.style).toBe("tiktok-bold");
  });

  it("does not render captions container in HTML if captions are omitted or disabled", () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-no-image.json"), "utf8")
    );
    const script = ScriptSchema.parse(raw);

    const args: ComposeArgs = {
      script,
      sceneAudio: script.scenes.map((s) => ({ id: s.id, durationSec: 3 })),
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
    };

    const html = composeHtml(args);
    expect(html).not.toContain("captions-container");
    expect(html).not.toContain('<div class="caption-cue"');
  });

  it("criterion 1: renders visible captions layer when captions.enabled is true", () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-no-image.json"), "utf8")
    );
    raw.captions = { enabled: true, style: "tiktok-bold" };
    const script = ScriptSchema.parse(raw);

    const mockCues: CaptionCue[] = [
      {
        id: 1,
        startMs: 200,
        endMs: 1500,
        startSec: 0.2,
        endSec: 1.5,
        text: "Xin chào các bạn",
        words: [
          { text: "Xin", startMs: 200, endMs: 500 },
          { text: "chào", startMs: 500, endMs: 900 },
          { text: "các", startMs: 900, endMs: 1100 },
          { text: "bạn", startMs: 1100, endMs: 1500 },
        ],
      },
    ];

    const args: ComposeArgs = {
      script,
      sceneAudio: script.scenes.map((s) => ({ id: s.id, durationSec: 3 })),
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      captionCues: mockCues,
    };

    const html = composeHtml(args);
    expect(html).toContain("captions-container caption-style-tiktok-bold");
    expect(html).toContain('class="caption-cue clip" data-start="0.200" data-duration="1.300"');
    expect(html).toContain('class="caption-word" data-word-start="0.200" data-word-duration="0.300"');
    expect(html).toContain('<span class="word-text">Xin</span>');
    expect(html).toContain('<span class="word-highlight">Xin</span>');
  });
});
