import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { ScriptSchema, type Script } from "./render/script-schema.js";
import { loadConfig } from "./config.js";
import { createTtsClient } from "./tts/tts-client.js";
import { fetchImage } from "./assets/image-fetcher.js";
import { getDurationSec, concatWithSilence, mixSfxOntoVoice, mixBgmWithVoice, type SfxMixSpec } from "./assets/audio-tools.js";
import { indexSfxLibrary, pickSfxForScene, defaultPlayback } from "./assets/sfx-selector.js";
import { existsSync } from "node:fs";
import { composeHtml } from "./render/html-composer.js";
import { renderWithHyperframes } from "./render/hyperframes-runner.js";
import { log } from "./utils/logger.js";
import { groupWordsIntoCues } from "./captions/grouper.js";
import { generateSrt, parseSrt } from "./captions/srt.js";
import { estimateWordTimings } from "./captions/estimator.js";
import type { TimedWord, CaptionCue } from "./captions/types.js";
import { processSceneMedia } from "./media/media-manager.js";
import { PexelsProvider, PixabayProvider } from "./media/stock-provider.js";
import { applyLexicon } from "./tts/lexicon.js";
import { generatePublishChecklist, extractCoverFrame } from "./ingest/publish-kit.js";

const TOTAL_STEPS = 8;
const DURATION_MIN_SEC = 48;
const DURATION_MAX_SEC = 72;
const SCENE_GAP_SEC = 0.3;
/**
 * Extra seconds added to the outro scene visual duration AFTER the voice ends.
 * Gives the TikTok follow card time to be read by the viewer (otherwise the
 * video ends a few hundred ms after the card slides up + click animation).
 * Audio stays silent during this hold; visual stays on screen.
 */
const OUTRO_HOLD_SEC = 3;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "render", "templates");
/** Path to the SFX library (relative to project root) */
const SFX_DIR = join(__dirname, "..", "assets", "sfx");

const HYPERFRAMES_CONFIG = {
  $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
  registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  paths: {
    blocks: "compositions",
    components: "compositions/components",
    assets: "assets",
  },
};

export async function runPipeline(scriptPath: string): Promise<void> {
  const cfg = loadConfig();
  const outputDir = dirname(scriptPath);
  log.info(`Output directory: ${outputDir}`);

  // STEP 1
  log.step(1, TOTAL_STEPS, `Load env + validate script.json (TTS provider: ${cfg.ttsProvider})`);
  const raw = JSON.parse(await readFile(scriptPath, "utf8"));
  // Substitute env placeholder before validation (works for all providers)
  if (raw.voice?.voiceId === "${VIETNAMESE_VOICEID}" || raw.voice?.voiceId === "${VOICE_ID}") {
    raw.voice.voiceId =
      cfg.ttsProvider === "edge-tts" ? cfg.edgeTtsVoice
      : cfg.ttsProvider === "lucylab" ? cfg.lucylabVoiceId!
      : cfg.ttsProvider === "elevenlabs" ? cfg.elevenlabsVoiceId!
      : cfg.vbeeVoiceCode;
  }
  const script: Script = ScriptSchema.parse(raw);

  // STEP 2
  log.step(2, TOTAL_STEPS, "Write script.txt for CapCut");
  const fullText = script.scenes.map((s) => s.voiceText).join("\n\n");
  await writeFile(join(outputDir, "script.txt"), fullText);

  // STEP 3 + 4 in parallel
  log.step(3, TOTAL_STEPS, "Process media assets & og:image (parallel) + Step 4 TTS");
  const imgPath = join(outputDir, "images", "bg.jpg");
  // Only use og:image as background if explicitly enabled in metadata (M2 compliance)
  const allowOgImage = script.metadata.useOgImage || false;
  const imgPromise = allowOgImage
    ? fetchImage(script.metadata.source.image, imgPath)
    : Promise.resolve({ success: false, reason: "og:image disabled by default for copyright compliance" });

  const stockProvider = process.env.PEXELS_API_KEY
    ? new PexelsProvider(process.env.PEXELS_API_KEY)
    : process.env.PIXABAY_API_KEY
    ? new PixabayProvider(process.env.PIXABAY_API_KEY)
    : undefined;

  const mediaPromise = processSceneMedia(script, outputDir, stockProvider);

  // STEP 4
  const ttsClient = createTtsClient(cfg);
  // Concurrency: LucyLab requires 1 (only 1 concurrent export per key);
  // ElevenLabs supports parallel calls but we keep 1 by default to be polite.
  const limit = pLimit(cfg.ttsConcurrency);
  const voiceDir = join(outputDir, "voice");
  await mkdir(voiceDir, { recursive: true });

  const sceneAudioPromises = script.scenes.map((scene) =>
    limit(async () => {
      const out = join(voiceDir, `scene-${scene.id}.mp3`);
      const srtOut = join(voiceDir, `scene-${scene.id}.srt`);
      const wordsPath = join(voiceDir, `scene-${scene.id}.words.json`);
      let words: TimedWord[] = [];
      let accuracy: "high" | "low" = "low";

      // IDEMPOTENT: skip TTS if voice file already exists.
      // To force re-TTS for a scene, delete its mp3 file before running.
      // This saves API quota when only some scenes' voiceText changed.
      if (existsSync(out)) {
        const dur = await getDurationSec(out);
        log.info(`  scene ${scene.id}: REUSE existing mp3 (${dur.toFixed(2)}s) — delete to force re-TTS`);
        if (existsSync(wordsPath)) {
          try {
            words = JSON.parse(await readFile(wordsPath, "utf8"));
            accuracy = "high";
          } catch {}
        } else if (existsSync(srtOut)) {
          try {
            const srtCues = parseSrt(await readFile(srtOut, "utf8"));
            words = srtCues.flatMap((c) => c.words);
            accuracy = "high";
          } catch {}
        }
        if (words.length === 0) {
          words = estimateWordTimings(scene.voiceText, dur);
          accuracy = "low";
        }
        return { id: scene.id, path: out, durationSec: dur, words, accuracy };
      }

      const spokenText = applyLexicon(scene.voiceText);
      log.info(`  TTS scene ${scene.id} (${spokenText.length} chars)...`);
      const timing = await ttsClient.generate(spokenText, out, srtOut);
      const dur = await getDurationSec(out);
      log.info(`  scene ${scene.id}: ${dur.toFixed(2)}s`);

      if (timing && timing.words && timing.words.length > 0) {
        words = timing.words;
        accuracy = timing.accuracy;
        await writeFile(wordsPath, JSON.stringify(words, null, 2), "utf8");
      } else if (existsSync(srtOut)) {
        try {
          const srtCues = parseSrt(await readFile(srtOut, "utf8"));
          words = srtCues.flatMap((c) => c.words);
          accuracy = "high";
          await writeFile(wordsPath, JSON.stringify(words, null, 2), "utf8");
        } catch {}
      }

      if (words.length === 0) {
        words = estimateWordTimings(scene.voiceText, dur);
        accuracy = "low";
        await writeFile(wordsPath, JSON.stringify(words, null, 2), "utf8");
      }

      return { id: scene.id, path: out, durationSec: dur, words, accuracy };
    }),
  );

  const [imgResult, mediaResult, sceneAudio] = await Promise.all([
    imgPromise,
    mediaPromise,
    Promise.all(sceneAudioPromises),
  ]);

  let bgImageRelPath: string | null = null;
  if (imgResult.success) {
    bgImageRelPath = "images/bg.jpg";
  } else {
    log.warn(`Background image fetch failed: ${imgResult.reason} → using gradient fallback`);
  }

  // STEP 5
  log.step(5, TOTAL_STEPS, "Concat voice scenes + mix SFX layer");
  const voiceRawMp3 = join(outputDir, "voice-raw.mp3");
  const voiceMp3 = join(outputDir, "voice.mp3");
  await concatWithSilence(sceneAudio.map((a) => a.path), SCENE_GAP_SEC, voiceRawMp3);

  // Compute scene start times (cumulative voice durations + gaps)
  let cursor = 0;
  const sceneStarts: Record<string, number> = {};
  for (const a of sceneAudio) {
    sceneStarts[a.id] = cursor;
    cursor += a.durationSec + SCENE_GAP_SEC;
  }

  // Build SFX mix list using smart 3-tier selector
  const sfxIndex = indexSfxLibrary(SFX_DIR);
  const indexCats = Object.keys(sfxIndex).length;
  const indexFiles = Object.values(sfxIndex).reduce((s, a) => s + a.length, 0);
  log.info(`  SFX library: ${indexFiles} files in ${indexCats} categories`);

  const sfxList: SfxMixSpec[] = [];
  for (const scene of script.scenes) {
    const startSec = sceneStarts[scene.id];

    // Tier 1: explicit override in script.json
    if (scene.sfx) {
      if (scene.sfx.name === "none") {
        log.info(`  scene ${scene.id}: SFX disabled (explicit "none")`);
        continue;
      }
      const sfxPath = join(SFX_DIR, `${scene.sfx.name}.mp3`);
      if (existsSync(sfxPath)) {
        sfxList.push({ path: sfxPath, startSec: startSec + scene.sfx.startOffsetSec, volume: scene.sfx.volume });
        log.info(`  scene ${scene.id}: SFX override -> ${scene.sfx.name}.mp3`);
      } else {
        log.warn(`  scene ${scene.id}: explicit SFX not found, skipping: ${scene.sfx.name}.mp3`);
      }
      continue;
    }

    // Tier 2/3: smart selection by content + template
    const picked = pickSfxForScene({
      voiceText: scene.voiceText,
      templateName: scene.templateData.template,
      sceneId: scene.id,
      index: sfxIndex,
    });
    if (!picked) {
      log.warn(`  scene ${scene.id}: no SFX available (empty library?)`);
      continue;
    }

    const sfxPath = join(SFX_DIR, picked.relPath);
    const playback = defaultPlayback(picked);
    sfxList.push({ path: sfxPath, startSec: startSec + playback.offsetSec, volume: playback.volume });

    const why = picked.source === "semantic"
      ? `semantic match "${picked.matchedKeyword}"`
      : picked.source;
    log.info(`  scene ${scene.id}: SFX -> ${picked.relPath} (${why})`);
  }
  log.info(`  mixing ${sfxList.length} SFX into voice.mp3`);
  await mixSfxOntoVoice(voiceRawMp3, sfxList, voiceMp3);

  // STEP 5.1 (M5): Mix Background Music (BGM) with ducking
  if (script.bgm?.src) {
    let bgmFile = script.bgm.src;
    if (!existsSync(bgmFile)) {
      const candidate = join(process.cwd(), bgmFile);
      if (existsSync(candidate)) bgmFile = candidate;
    }
    if (existsSync(bgmFile)) {
      const vol = script.bgm.volume ?? 0.18;
      const duck = script.bgm.duck ?? true;
      const duckVol = script.bgm.duckVolume ?? 0.06;
      log.info(`  mixing BGM: ${script.bgm.src} (vol=${vol}, duck=${duck})`);
      const tempMixed = join(outputDir, "voice-before-bgm.mp3");
      await copyFile(voiceMp3, tempMixed);
      await mixBgmWithVoice(tempMixed, bgmFile, voiceMp3, {
        volume: vol,
        duck,
        duckVolume: duckVol,
      });
    } else {
      log.warn(`  BGM file not found: ${script.bgm.src} — skipping BGM`);
    }
  }

  const totalAudioSec = await getDurationSec(voiceMp3);
  log.info(`  voice.mp3 total: ${totalAudioSec.toFixed(2)}s`);

  // Preset duration tolerance check (M5)
  let minTolerance = DURATION_MIN_SEC;
  let maxTolerance = DURATION_MAX_SEC;
  if (script.preset === "short_30") {
    minTolerance = 25;
    maxTolerance = 38;
  } else if (script.preset === "news_45") {
    minTolerance = 38;
    maxTolerance = 55;
  } else if (script.preset === "review_60") {
    minTolerance = 55;
    maxTolerance = 75;
  }

  if (totalAudioSec < minTolerance || totalAudioSec > maxTolerance) {
    log.warn(`Total duration ${totalAudioSec.toFixed(1)}s outside preset [${minTolerance}, ${maxTolerance}]s tolerance — proceeding anyway`);
  }

  // Build global captions (M1)
  const allCues: CaptionCue[] = [];
  let cueIdCounter = 1;
  for (const a of sceneAudio) {
    const startSec = sceneStarts[a.id];
    const sceneStartMs = Math.round(startSec * 1000);
    const sceneCues = groupWordsIntoCues(a.words, { sceneStartMs }, cueIdCounter);
    cueIdCounter += sceneCues.length;
    allCues.push(...sceneCues);
  }

  // Export captions.srt and captions.json for the full video
  const srtContent = generateSrt(allCues);
  await writeFile(join(outputDir, "captions.srt"), srtContent, "utf8");
  await writeFile(join(outputDir, "captions.json"), JSON.stringify(allCues, null, 2), "utf8");
  log.info(`  Captions: exported ${allCues.length} cues → captions.srt & captions.json`);

  // STEP 6 — Compose HTML + write hyperframes project files
  log.step(6, TOTAL_STEPS, "Compose HTML + project files");

  // Resolve TikTok avatar — download URL if provided, else copy bundled default
  // Bundled avatar can be jpg/jpeg/png/webp — pick whichever exists
  const findBundledAvatar = (): string => {
    const baseDir = join(__dirname, "..", "assets");
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      const p = join(baseDir, `avatar.${ext}`);
      if (existsSync(p)) return p;
    }
    throw new Error(`No bundled avatar found. Place an image at assets/avatar.{jpg,png,webp}`);
  };
  const bundledAvatar = findBundledAvatar();
  const ttAvatarExt = bundledAvatar.split(".").pop()!.toLowerCase();
  const ttAvatarFile = `tiktok-avatar.${ttAvatarExt}`;
  const ttAvatarOut = join(outputDir, ttAvatarFile);
  if (cfg.tiktok.avatarUrl) {
    const r = await fetchImage(cfg.tiktok.avatarUrl, ttAvatarOut);
    if (!r.success) {
      log.warn(`TikTok avatar download failed: ${r.reason} → falling back to bundled default`);
      await copyFile(bundledAvatar, ttAvatarOut);
    }
  } else {
    await copyFile(bundledAvatar, ttAvatarOut);
  }

  if (cfg.safeZoneOverlay && script.metadata.safeZoneOverlay === undefined) {
    script.metadata.safeZoneOverlay = true;
  }

  const html = composeHtml({
    script,
    sceneAudio: sceneAudio.map((a) => ({ id: a.id, durationSec: a.durationSec })),
    gapSec: SCENE_GAP_SEC,
    bgImageRelPath,
    audioRelPath: "voice.mp3",
    tiktok: cfg.tiktok,
    tiktokAvatarRelPath: ttAvatarFile,
    outroHoldSec: OUTRO_HOLD_SEC,
    captionCues: allCues,
    mediaMap: mediaResult.mediaMap,
  });

  // hyperframes expects: index.html (NOT composition.html), hyperframes.json, meta.json in DIR
  await writeFile(join(outputDir, "index.html"), html);

  await writeFile(join(outputDir, "hyperframes.json"), JSON.stringify(HYPERFRAMES_CONFIG, null, 2));

  const slug = basename(outputDir);
  await writeFile(join(outputDir, "meta.json"), JSON.stringify({
    id: slug,
    name: script.metadata.title,
    createdAt: new Date().toISOString(),
  }, null, 2));

  // Copy templates next to the index.html so relative paths resolve.
  // base.html.tmpl + animations.js are shared across themes (structure/behavior);
  // only styles.<theme>.css differs (visual look), and always lands as "styles.css".
  const themeFile = cfg.videoTheme === "light-pro" ? "styles.light-pro.css" : "styles.css";
  await copyFile(join(TPL_DIR, themeFile),       join(outputDir, "styles.css"));
  await copyFile(join(TPL_DIR, "animations.js"), join(outputDir, "animations.js"));

  // STEP 7
  log.step(7, TOTAL_STEPS, "Render with hyperframes");
  const videoPath = join(outputDir, "video.mp4");
  await renderWithHyperframes({ compositionDir: outputDir, outputPath: videoPath });

  // STEP 8
  log.step(8, TOTAL_STEPS, "Generate publish kit (publish.md + cover.png) & Finalize");
  const publishMd = generatePublishChecklist(
    {
      suggestedTitle: script.metadata.title,
      channelName: script.metadata.channel,
      sourceUrl: script.metadata.source.url,
      sourceName: script.metadata.source.domain,
    },
    script
  );
  await writeFile(join(outputDir, "publish.md"), publishMd, "utf8");

  // Extract cover frame if video exists
  const coverPath = join(outputDir, "cover.png");
  if (existsSync(videoPath)) {
    try {
      await extractCoverFrame(videoPath, coverPath, 1.0);
      log.info(`  Cover thumbnail: ${coverPath}`);
    } catch (coverErr: any) {
      log.warn(`  Could not extract cover frame: ${coverErr.message}`);
    }
  }

  console.log("\n=== Result ===");
  console.log(`Video:   ${videoPath}`);
  console.log(`Audio:   ${voiceMp3}  (cho CapCut)`);
  console.log(`Script:  ${join(outputDir, "script.txt")}  (cho CapCut auto-caption)`);
  console.log(`Publish: ${join(outputDir, "publish.md")}`);
  console.log(`Cover:   ${coverPath}`);
  console.log(`Tong thoi luong: ${totalAudioSec.toFixed(2)}s`);
}
