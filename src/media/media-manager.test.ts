import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { processSceneMedia } from "./media-manager.js";
import { FakeStockProvider } from "./stock-provider.js";
import { ScriptSchema, Script } from "../render/script-schema.js";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");

describe("Media Manager (M2)", () => {
  let tmpDir: string;

  beforeEach(() => {
    nock.cleanAll();
    tmpDir = mkdtempSync(join(tmpdir(), "media-manager-test-"));
  });

  afterEach(() => {
    nock.cleanAll();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies local media file into media/ and writes media.json", async () => {
    const localImgPath = join(tmpDir, "local-source.jpg");
    writeFileSync(localImgPath, Buffer.from("FAKE_JPEG_BYTES"));

    const raw = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-no-image.json"), "utf8")
    );
    raw.scenes[0].media = {
      type: "image",
      src: localImgPath,
      fit: "cover",
      fx: "kenburns",
      credit: "Local Photographer",
      license: "Custom License",
    };

    const script: Script = ScriptSchema.parse(raw);
    const { mediaRecords, mediaMap } = await processSceneMedia(script, tmpDir);

    expect(mediaRecords).toHaveLength(1);
    expect(mediaMap["hook"]).toBeDefined();
    expect(mediaMap["hook"].localRelPath).toBe("media/scene-hook.jpg");
    expect(mediaMap["hook"].fx).toBe("kenburns");
    expect(mediaMap["hook"].credit).toBe("Local Photographer");

    expect(existsSync(join(tmpDir, "media", "scene-hook.jpg"))).toBe(true);
    expect(existsSync(join(tmpDir, "media.json"))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(tmpDir, "media.json"), "utf8"));
    expect(manifest[0].sceneId).toBe("hook");
    expect(manifest[0].credit).toBe("Local Photographer");
  });

  it("downloads stock media using stock: query", async () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-no-image.json"), "utf8")
    );
    raw.scenes[1].media = {
      type: "image",
      src: "stock:chipset",
      fit: "cover",
      fx: "kenburns",
    };

    nock("https://mock.stock.internal")
      .get("/photo-1-chipset.jpg")
      .reply(200, Buffer.from("STOCK_IMAGE_DATA"));

    const stockProvider = new FakeStockProvider();
    const script: Script = ScriptSchema.parse(raw);

    const { mediaRecords, mediaMap } = await processSceneMedia(script, tmpDir, stockProvider);

    expect(mediaRecords).toHaveLength(1);
    expect(mediaMap["body-1"]).toBeDefined();
    expect(existsSync(join(tmpDir, "media", "scene-body-1.jpg"))).toBe(true);
    expect(readFileSync(join(tmpDir, "media", "scene-body-1.jpg")).toString()).toBe("STOCK_IMAGE_DATA");
  });

  it("handles og:image only when metadata.useOgImage is true", async () => {
    nock("https://example.com")
      .get("/article-og.jpg")
      .reply(200, Buffer.from("OG_IMAGE_DATA"));

    const raw = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-with-image.json"), "utf8")
    );
    raw.metadata.source.image = "https://example.com/article-og.jpg";

    // 1. Without useOgImage (default false) -> og:image is not used
    raw.metadata.useOgImage = false;
    let script: Script = ScriptSchema.parse(raw);
    let result = await processSceneMedia(script, tmpDir);
    expect(result.mediaRecords.find((r) => r.sceneId === "__og_image__")).toBeUndefined();

    // 2. With useOgImage: true -> og:image is processed and warning is recorded
    raw.metadata.useOgImage = true;
    script = ScriptSchema.parse(raw);
    result = await processSceneMedia(script, tmpDir);
    const ogRecord = result.mediaRecords.find((r) => r.sceneId === "__og_image__");
    expect(ogRecord).toBeDefined();
    expect(ogRecord?.copyrightWarning).toContain("ATTENTION: og:image");
    expect(existsSync(join(tmpDir, "media", "og-image.jpg"))).toBe(true);
  });
});

