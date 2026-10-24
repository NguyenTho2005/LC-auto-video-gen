import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");

describe("captions:import CLI (M1)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "captions-import-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("imports valid SRT into project and writes captions.srt & captions.json", async () => {
    // Copy sample-script-no-image.json to tmpDir
    const rawScript = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "sample-script-no-image.json"), "utf8")
    );
    writeFileSync(
      join(tmpDir, "script.json"),
      JSON.stringify(rawScript, null, 2),
      "utf8"
    );

    // Create a sample SRT file to import
    const srtContent =
      "1\n00:00:00,500 --> 00:00:02,000\nPhụ đề được nhập từ bên ngoài\n\n" +
      "2\n00:00:02,200 --> 00:00:04,500\nKhớp thời gian hoàn hảo với video\n";
    const srtPath = join(tmpDir, "external.srt");
    writeFileSync(srtPath, srtContent, "utf8");

    // Run import-cli
    const { stdout } = await execFileAsync("npx", [
      "tsx",
      "src/captions/import-cli.ts",
      tmpDir,
      srtPath,
    ]);

    expect(stdout).toContain("Successfully parsed 2 caption cue(s)");
    expect(existsSync(join(tmpDir, "captions.srt"))).toBe(true);
    expect(existsSync(join(tmpDir, "captions.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "index.html"))).toBe(true);

    const importedSrt = readFileSync(join(tmpDir, "captions.srt"), "utf8");
    expect(importedSrt).toContain("Phụ đề được nhập từ bên ngoài");

    const html = readFileSync(join(tmpDir, "index.html"), "utf8");
    expect(html).toContain("captions-container");
    expect(html).toContain('<span class="word-text">Phụ</span>');
    expect(html).toContain('<span class="word-text">ngoài</span>');
  });

  it("fails with clear error if SRT syntax is malformed", async () => {
    const malformedSrtPath = join(tmpDir, "malformed.srt");
    writeFileSync(malformedSrtPath, "malformed content without timestamps", "utf8");

    await expect(
      execFileAsync("npx", ["tsx", "src/captions/import-cli.ts", tmpDir, malformedSrtPath])
    ).rejects.toThrow();
  });
});
