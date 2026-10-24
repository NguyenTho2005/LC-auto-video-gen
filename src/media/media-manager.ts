import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import axios from "axios";
import type { Script, MediaSpecType } from "../render/script-schema.js";
import { StockProvider } from "./stock-provider.js";
import { captureUrlScreenshot } from "./screenshot.js";
import { log } from "../utils/logger.js";

export interface MediaAssetRecord {
  sceneId: string;
  type: "image" | "video" | "screenshot";
  originalSrc: string;
  localRelPath: string; // Relative to outputDir, e.g. "media/scene-hook.jpg"
  fit: "cover" | "contain";
  fx: "none" | "kenburns";
  credit?: string;
  license?: string;
  copyrightWarning?: string;
}

export interface MediaResolveResult {
  mediaRecords: MediaAssetRecord[];
  mediaMap: Record<string, MediaAssetRecord>;
}

/**
 * Download a remote image/video with size limits.
 */
async function downloadFile(url: string, destPath: string, maxBytes = 30 * 1024 * 1024): Promise<boolean> {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxContentLength: maxBytes,
    });
    const buffer = Buffer.from(response.data);
    await writeFile(destPath, buffer);
    return true;
  } catch (err: any) {
    log.warn(`Failed to download media file from ${url}: ${err.message}`);
    return false;
  }
}

/**
 * Process all media assets declared in script scenes and write media.json.
 */
export async function processSceneMedia(
  script: Script,
  outputDir: string,
  stockProvider?: StockProvider
): Promise<MediaResolveResult> {
  const mediaDir = join(outputDir, "media");
  await mkdir(mediaDir, { recursive: true });

  const mediaRecords: MediaAssetRecord[] = [];
  const mediaMap: Record<string, MediaAssetRecord> = {};

  for (const scene of script.scenes) {
    const spec = scene.media;
    if (!spec) continue;

    const destFileName = `scene-${scene.id}`;
    let resolvedRelPath: string | null = null;
    let credit = spec.credit;
    let license = spec.license;
    let copyrightWarning: string | undefined;

    // Case 1: Local file path
    if (existsSync(spec.src)) {
      const ext = extname(spec.src) || (spec.type === "video" ? ".mp4" : ".jpg");
      const destPath = join(mediaDir, `${destFileName}${ext}`);
      try {
        await copyFile(spec.src, destPath);
        resolvedRelPath = `media/${destFileName}${ext}`;
        log.info(`  scene ${scene.id}: copied local media -> ${resolvedRelPath}`);
      } catch (err: any) {
        log.warn(`  scene ${scene.id}: failed to copy ${spec.src}: ${err.message}`);
      }
    }
    // Case 2: Screenshot of a URL
    else if (spec.type === "screenshot" && (spec.src.startsWith("http://") || spec.src.startsWith("https://"))) {
      const destPath = join(mediaDir, `${destFileName}.jpg`);
      log.info(`  scene ${scene.id}: capturing screenshot of ${spec.src}...`);
      const r = await captureUrlScreenshot(spec.src, destPath);
      if (r.success) {
        resolvedRelPath = `media/${destFileName}.jpg`;
        credit = credit || `Screenshot of ${new URL(spec.src).hostname}`;
        license = license || "Fair Use / Screenshot citation";
        log.info(`  scene ${scene.id}: screenshot captured -> ${resolvedRelPath}`);
      } else {
        log.warn(`  scene ${scene.id}: ${r.reason} → using gradient fallback`);
      }
    }
    // Case 3: Stock query via StockProvider (e.g. "stock:artificial intelligence")
    else if (spec.src.startsWith("stock:") && stockProvider) {
      const query = spec.src.replace(/^stock:/, "").trim();
      log.info(`  scene ${scene.id}: searching stock media for "${query}"...`);
      try {
        if (spec.type === "video") {
          const results = await stockProvider.searchVideos(query, 1);
          if (results.length > 0) {
            const hit = results[0];
            const destPath = join(mediaDir, `${destFileName}.mp4`);
            const ok = await downloadFile(hit.url, destPath);
            if (ok) {
              resolvedRelPath = `media/${destFileName}.mp4`;
              credit = credit || hit.photographer || hit.source;
              license = license || hit.license;
            }
          }
        } else {
          const results = await stockProvider.searchPhotos(query, 1);
          if (results.length > 0) {
            const hit = results[0];
            const destPath = join(mediaDir, `${destFileName}.jpg`);
            const ok = await downloadFile(hit.url, destPath);
            if (ok) {
              resolvedRelPath = `media/${destFileName}.jpg`;
              credit = credit || hit.photographer || hit.source;
              license = license || hit.license;
            }
          }
        }
      } catch (err: any) {
        log.warn(`  scene ${scene.id}: stock search failed: ${err.message}`);
      }
    }
    // Case 4: Remote HTTP/HTTPS image or video URL
    else if (spec.src.startsWith("http://") || spec.src.startsWith("https://")) {
      const isVideo = spec.type === "video";
      const ext = extname(new URL(spec.src).pathname) || (isVideo ? ".mp4" : ".jpg");
      const destPath = join(mediaDir, `${destFileName}${ext}`);
      log.info(`  scene ${scene.id}: downloading media from ${spec.src}...`);
      const ok = await downloadFile(spec.src, destPath);
      if (ok) {
        resolvedRelPath = `media/${destFileName}${ext}`;
        credit = credit || new URL(spec.src).hostname;
        license = license || "Editorial / Source Attribution";
      } else {
        log.warn(`  scene ${scene.id}: download failed, using default background`);
      }
    }

    if (resolvedRelPath) {
      const record: MediaAssetRecord = {
        sceneId: scene.id,
        type: spec.type,
        originalSrc: spec.src,
        localRelPath: resolvedRelPath,
        fit: spec.fit,
        fx: spec.fx,
        credit,
        license,
        copyrightWarning,
      };
      mediaRecords.push(record);
      mediaMap[scene.id] = record;
    }
  }

  // Handle article og:image if useOgImage is explicitly enabled
  const ogImage = script.metadata.source.image;
  if (ogImage && script.metadata.useOgImage) {
    const destPath = join(mediaDir, "og-image.jpg");
    const ok = await downloadFile(ogImage, destPath);
    if (ok) {
      mediaRecords.push({
        sceneId: "__og_image__",
        type: "image",
        originalSrc: ogImage,
        localRelPath: "media/og-image.jpg",
        fit: "cover",
        fx: "none",
        credit: script.metadata.source.domain,
        license: "Editorial rights belong to publisher",
        copyrightWarning: "ATTENTION: og:image may be copyrighted by original publisher. Ensure fair use.",
      });
    }
  }

  // Save media.json manifest
  await writeFile(
    join(outputDir, "media.json"),
    JSON.stringify(mediaRecords, null, 2),
    "utf8"
  );
  log.info(`  Media: processed ${mediaRecords.length} asset(s) → media.json`);

  return { mediaRecords, mediaMap };
}

