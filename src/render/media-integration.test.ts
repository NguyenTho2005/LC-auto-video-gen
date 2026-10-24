import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ScriptSchema } from "./script-schema.js";
import { composeHtml, ComposeArgs } from "./html-composer.js";
import { MediaAssetRecord } from "../media/media-manager.js";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");

describe("Media Scene Integration (M2)", () => {
  it("validates scene media schema with all supported options", () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-no-image.json"), "utf8")
    );
    raw.scenes[0].media = {
      type: "image",
      src: "media/scene-hook.jpg",
      fit: "cover",
      fx: "kenburns",
      credit: "Jane Doe / Unsplash",
      license: "Unsplash License",
    };
    raw.scenes[1].media = {
      type: "video",
      src: "media/scene-body-1.mp4",
      fit: "contain",
      fx: "none",
    };
    raw.scenes[2].media = {
      type: "screenshot",
      src: "media/scene-body-2.jpg",
      fit: "cover",
    };

    const script = ScriptSchema.parse(raw);
    expect(script.scenes[0].media?.type).toBe("image");
    expect(script.scenes[0].media?.fx).toBe("kenburns");
    expect(script.scenes[1].media?.type).toBe("video");
    expect(script.scenes[1].media?.fit).toBe("contain");
    expect(script.scenes[2].media?.type).toBe("screenshot");
    expect(script.scenes[2].media?.fx).toBe("kenburns"); // default fx
  });

  it("renders scene media wrapper, Ken Burns class and credit badge in HTML", () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-no-image.json"), "utf8")
    );
    const script = ScriptSchema.parse(raw);

    const mockMediaMap: Record<string, MediaAssetRecord> = {
      hook: {
        sceneId: "hook",
        type: "image",
        originalSrc: "https://example.com/photo.jpg",
        localRelPath: "media/scene-hook.jpg",
        fit: "cover",
        fx: "kenburns",
        credit: "Photo by Pexels",
        license: "Pexels License",
      },
    };

    const args: ComposeArgs = {
      script,
      sceneAudio: script.scenes.map((s) => ({ id: s.id, durationSec: 3 })),
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      mediaMap: mockMediaMap,
    };

    const html = composeHtml(args);

    // Verify scene-hook contains media wrapper
    expect(html).toContain('class="scene-media-wrapper"');
    expect(html).toContain('class="scene-media-img fit-cover fx-kenburns" src="media/scene-hook.jpg"');
    expect(html).toContain('class="media-credit-badge">Nguồn: Photo by Pexels</div>');

    // Verify scene-body-1 (without media) does NOT contain media wrapper
    const sceneBody1Chunk = html.split('id="scene-body-1"')[1].split('id="scene-body-2"')[0];
    expect(sceneBody1Chunk).not.toContain('class="scene-media-wrapper"');
  });

  it("backward compatibility: script without media renders without media wrappers", () => {
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
    expect(html).not.toContain("scene-media-wrapper");
    expect(html).not.toContain("media-credit-badge");
  });
});

