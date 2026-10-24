#!/usr/bin/env node
/**
 * CLI script to import an external SRT file into an existing output directory.
 * Overwrites generated caption cues with user-provided subtitles.
 *
 * Usage:
 *   npm run captions:import -- <output-dir> <file.srt>
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseSrt } from "./srt.js";
import { ScriptSchema } from "../render/script-schema.js";
import { composeHtml } from "../render/html-composer.js";
import { getDurationSec } from "../assets/audio-tools.js";
import { loadConfig } from "../config.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: npm run captions:import -- <output-dir> <file.srt>");
    process.exit(1);
  }

  const outputDir = args[0];
  const srtFilePath = args[1];

  if (!existsSync(outputDir)) {
    console.error(`Error: Output directory does not exist: ${outputDir}`);
    process.exit(1);
  }

  if (!existsSync(srtFilePath)) {
    console.error(`Error: SRT file does not exist: ${srtFilePath}`);
    process.exit(1);
  }

  console.log(`Importing SRT: ${srtFilePath}`);
  console.log(`Target directory: ${outputDir}`);

  // 1. Read and parse SRT (handles BOM, CRLF, multi-line cues, UTF-8 Vietnamese)
  const srtRaw = await readFile(srtFilePath, "utf8");
  let cues;
  try {
    cues = parseSrt(srtRaw);
  } catch (err: any) {
    console.error(`Failed to parse SRT file:\n${err.message}`);
    process.exit(1);
  }

  console.log(`Successfully parsed ${cues.length} caption cue(s).`);

  // 2. Save captions.srt and captions.json in outputDir
  await writeFile(join(outputDir, "captions.srt"), srtRaw, "utf8");
  await writeFile(
    join(outputDir, "captions.json"),
    JSON.stringify(cues, null, 2),
    "utf8"
  );
  console.log(`Saved captions.srt and captions.json to ${outputDir}`);

  // 3. Update script.json if captions was disabled
  const scriptJsonPath = join(outputDir, "script.json");
  if (existsSync(scriptJsonPath)) {
    const rawScript = JSON.parse(await readFile(scriptJsonPath, "utf8"));
    if (!rawScript.captions) {
      rawScript.captions = { enabled: true, style: "tiktok-bold" };
    } else {
      rawScript.captions.enabled = true;
    }
    await writeFile(scriptJsonPath, JSON.stringify(rawScript, null, 2), "utf8");

    // 4. Update index.html so rerender immediately displays imported captions
    const script = ScriptSchema.parse(rawScript);
    const cfg = loadConfig();

    const sceneAudio = await Promise.all(
      script.scenes.map(async (s) => {
        const path = join(outputDir, "voice", `scene-${s.id}.mp3`);
        const dur = existsSync(path) ? await getDurationSec(path) : 3.0;
        return { id: s.id, durationSec: dur };
      })
    );

    const hasBg = existsSync(join(outputDir, "images", "bg.jpg"));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: hasBg ? "images/bg.jpg" : null,
      audioRelPath: "voice.mp3",
      tiktok: cfg.tiktok,
      tiktokAvatarRelPath: "tiktok-avatar.jpg",
      captionCues: cues,
    });

    await writeFile(join(outputDir, "index.html"), html, "utf8");
    console.log(`Updated composition index.html with new caption layer.`);
  }

  console.log(
    `Done! To re-render video with new captions, run:\n  npm run rerender -- ${outputDir}`
  );
}

main().catch((err) => {
  console.error("Unhandled error in captions:import:", err);
  process.exit(1);
});

