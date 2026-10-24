import express, { Request, Response } from "express";
import { config } from "dotenv";
config({ path: ".env.local" });

import { readdir, readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import axios from "axios";
import { runPipeline } from "./pipeline.js";
import { loadConfig } from "./config.js";
import { toSlug } from "./utils/slug.js";
import { generateScriptFromContent } from "./utils/script-generator.js";
import { addLogListener, log } from "./utils/logger.js";
import { ScriptSchema, type Script } from "./render/script-schema.js";
import {
  migrateV1toV2,
  buildTimelineState,
  timelineStateToScript,
} from "./timeline/index.js";
import { getDurationSec, concatWithSilence } from "./assets/audio-tools.js";
import { createTtsClient } from "./tts/index.js";
import { applyLexicon } from "./tts/lexicon.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const PUBLIC_DIR = join(PROJECT_ROOT, "public");
const OUTPUT_DIR = join(PROJECT_ROOT, "output");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(PUBLIC_DIR));

interface Job {
  id: string;
  slug: string;
  outputDir: string;
  status: "running" | "completed" | "failed";
  step: number;
  totalSteps: number;
  stepMessage: string;
  logs: string[];
  error?: string;
  videoUrl?: string;
  caption?: string;
  clients: Response[];
}

const jobs = new Map<string, Job>();

// Broadcast SSE event
function broadcastToJob(job: Job, event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of job.clients) {
    try {
      client.write(payload);
    } catch {
      // client disconnected
    }
  }
}

// Hook global logger
addLogListener((entry) => {
  for (const job of jobs.values()) {
    if (job.status === "running") {
      const line = `[${entry.timestamp}] ${entry.step ? `[${entry.step}/${entry.total}] ` : ""}${entry.msg}`;
      job.logs.push(line);
      if (entry.step) {
        job.step = entry.step;
        job.totalSteps = entry.total || 8;
        job.stepMessage = entry.msg;
      }
      broadcastToJob(job, "progress", {
        step: job.step,
        totalSteps: job.totalSteps,
        stepMessage: job.stepMessage,
        log: line,
      });
    }
  }
});

// ── API: Config ─────────────────────────────────────────────────────────────
app.get("/api/config", (req, res) => {
  try {
    const cfg = loadConfig();
    res.json({
      ttsProvider: cfg.ttsProvider,
      edgeTtsVoice: cfg.edgeTtsVoice,
      edgeTtsVoices: [
        { id: "vi-VN-NamMinhNeural", label: "Nam Minh (Nam - Giọng chuẩn miền Bắc)", gender: "Nam" },
        { id: "vi-VN-HoaiMyNeural", label: "Hoài My (Nữ - Giọng chuẩn miền Bắc)", gender: "Nữ" },
      ],
      providers: [
        { id: "edge-tts", name: "Microsoft Edge TTS (Miễn phí 100%, 0đ)", free: true },
        { id: "lucylab", name: "LucyLab Voice Clone", free: false },
        { id: "vbee", name: "Vbee Báo chí", free: false },
        { id: "elevenlabs", name: "ElevenLabs Studio", free: false },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Extract URL ─────────────────────────────────────────────────────────
app.post("/api/extract-url", async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "URL không hợp lệ. Phải bắt đầu bằng http:// hoặc https://" });
  }

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace("www.", "");

    // 1. Specialized GitHub Repo Handler
    if (domain === "github.com") {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = parts[1];
        const title = `${repo} — Công cụ AI mã nguồn mở của ${owner}`;

        // Fetch raw README to get real article text without React JSON bloat
        let readme = "";
        for (const branch of ["main", "master"]) {
          try {
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
            const rawRes = await axios.get(rawUrl, { timeout: 8000 });
            if (rawRes.data && typeof rawRes.data === "string") {
              readme = rawRes.data;
              break;
            }
          } catch {}
        }

        // Clean markdown: remove code blocks, tags, badges, tables
        const cleanMarkdown = readme
          .replace(/```[\s\S]*?```/g, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/!\[.*?\]\(.*?\)/g, " ")
          .replace(/\[(.*?)\]\(.*?\)/g, "$1")
          .replace(/[#*`_~|]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        const sentences = cleanMarkdown
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 25 && s.length < 200 && !s.includes("http") && !s.includes("git clone"));

        const content = sentences.slice(0, 4).join(". ") || `${repo} là giải pháp công nghệ mã nguồn mở đột phá vừa được công bố trên GitHub.`;
        const ogImage = `https://opengraph.githubassets.com/1/${owner}/${repo}`;

        return res.json({
          title,
          domain: "github.com",
          ogImage,
          content,
          paragraphCount: sentences.length,
        });
      }
    }

    // 2. Standard Web Article Handler
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      timeout: 15000,
    });

    let html: string = typeof response.data === "string" ? response.data : String(response.data);

    // Strip script, style, svg, nav, footer, header
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
    html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
    html = html.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ");
    html = html.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ");
    html = html.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ");

    // Extract title
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = (ogTitleMatch ? ogTitleMatch[1] : titleTagMatch ? titleTagMatch[1] : urlObj.pathname)
      .replace(/ - [^|]+$/i, "")
      .replace(/ \| [^|]+$/i, "")
      .trim();

    // Extract og:image
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    const ogImage = ogImageMatch ? ogImageMatch[1] : null;

    // Extract clean text paragraphs
    const paragraphs: string[] = [];
    const pMatches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    for (const match of pMatches) {
      const cleanP = match[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
      if (cleanP.length > 40 && cleanP.length < 300 && !cleanP.includes("javascript:") && !cleanP.includes("{")) {
        paragraphs.push(cleanP);
      }
    }

    const content = paragraphs.slice(0, 4).join("\n\n");

    res.json({
      title,
      domain,
      ogImage,
      content: content || title,
      paragraphCount: paragraphs.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Không thể đọc URL: ${err.message}` });
  }
});

// ── API: Generate Script ────────────────────────────────────────────────────
app.post("/api/generate-script", async (req, res) => {
  try {
    const { title, content, url, domain, image, channel, voiceProvider, voiceId, speed } = req.body;
    if (!title) return res.status(400).json({ error: "Tiêu đề không được để trống" });

    const script = await generateScriptFromContent({
      title,
      content: content || title,
      url,
      domain,
      image,
      channel: channel || "Công Nghệ 24h",
      voiceProvider,
      voiceId,
      speed,
    });

    res.json(script);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Start Pipeline Render ──────────────────────────────────────────────
app.post("/api/render", async (req, res) => {
  try {
    let scriptData = req.body.script;

    // If script not sent directly, generate from input
    if (!scriptData) {
      const { title, content, url, domain, image, channel, voiceId, voiceProvider } = req.body;
      if (!title) return res.status(400).json({ error: "Cần cung cấp title hoặc script" });

      scriptData = await generateScriptFromContent({
        title,
        content: content || title,
        url,
        domain,
        image,
        channel,
        voiceProvider,
        voiceId,
      });
    }

    // Validate script schema
    const validatedScript = ScriptSchema.parse(scriptData);

    // Create unique slug & output directory
    const slug = toSlug(validatedScript.metadata.title);
    const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
    const outputDir = join(OUTPUT_DIR, `${slug}-${timestamp}`);
    await mkdir(outputDir, { recursive: true });

    // Save script.json
    const scriptPath = join(outputDir, "script.json");
    await writeFile(scriptPath, JSON.stringify(validatedScript, null, 2), "utf8");

    // Initialize job
    const jobId = `${slug}-${timestamp}`;
    const job: Job = {
      id: jobId,
      slug: `${slug}-${timestamp}`,
      outputDir,
      status: "running",
      step: 1,
      totalSteps: 8,
      stepMessage: "Khởi động quy trình...",
      logs: [`[${new Date().toLocaleTimeString()}] Bắt đầu render video: ${validatedScript.metadata.title}`],
      clients: [],
    };
    jobs.set(jobId, job);

    // Run pipeline asynchronously
    (async () => {
      try {
        await runPipeline(scriptPath);

        // Generate caption.txt for TikTok
        const captionLine = `${validatedScript.metadata.title}! Xem ngay để không bỏ lỡ xu hướng công nghệ mới. 🔥`;
        const hashtags = "#congnghe #thuthuat #cuongit #xuhuong";
        const captionText = `${captionLine}\n\n${hashtags}`;
        await writeFile(join(outputDir, "caption.txt"), captionText, "utf8");

        job.status = "completed";
        job.videoUrl = `/api/videos/${job.slug}/file/video.mp4`;
        job.caption = captionText;

        broadcastToJob(job, "completed", {
          slug: job.slug,
          videoUrl: job.videoUrl,
          caption: captionText,
        });
      } catch (err: any) {
        job.status = "failed";
        job.error = err.message || String(err);
        broadcastToJob(job, "failed", { error: job.error });
      }
    })();

    res.json({
      jobId,
      slug: job.slug,
      outputDir,
      message: "Pipeline đã được khởi chạy thành công",
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── API: SSE Progress Stream ────────────────────────────────────────────────
app.get("/api/progress/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).send("Job not found");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  job.clients.push(res);

  // Send current state immediately
  res.write(
    `event: initial\ndata: ${JSON.stringify({
      step: job.step,
      totalSteps: job.totalSteps,
      status: job.status,
      logs: job.logs,
      videoUrl: job.videoUrl,
      caption: job.caption,
    })}\n\n`
  );

  req.on("close", () => {
    job.clients = job.clients.filter((c) => c !== res);
  });
});

// ── API: List Videos ────────────────────────────────────────────────────────
app.get("/api/videos", async (req, res) => {
  try {
    if (!existsSync(OUTPUT_DIR)) {
      return res.json([]);
    }

    const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
    const videoList = [];

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const folder = join(OUTPUT_DIR, ent.name);
        const scriptFile = join(folder, "script.json");
        const videoFile = join(folder, "video.mp4");
        const captionFile = join(folder, "caption.txt");
        const voiceFile = join(folder, "voice.mp3");

        let title = ent.name;
        let scriptData = null;
        let caption = null;

        if (existsSync(scriptFile)) {
          try {
            scriptData = JSON.parse(await readFile(scriptFile, "utf8"));
            title = scriptData.metadata?.title || title;
          } catch {}
        }

        if (existsSync(captionFile)) {
          try {
            caption = await readFile(captionFile, "utf8");
          } catch {}
        }

        const hasVideo = existsSync(videoFile);
        let videoSize = 0;
        let mtime = new Date(0);

        if (hasVideo) {
          const stats = await stat(videoFile);
          videoSize = stats.size;
          mtime = stats.mtime;
        } else if (existsSync(scriptFile)) {
          const stats = await stat(scriptFile);
          mtime = stats.mtime;
        }

        videoList.push({
          slug: ent.name,
          title,
          hasVideo,
          hasAudio: existsSync(voiceFile),
          videoSizeMb: (videoSize / (1024 * 1024)).toFixed(1),
          videoUrl: hasVideo ? `/api/videos/${ent.name}/file/video.mp4` : null,
          audioUrl: existsSync(voiceFile) ? `/api/videos/${ent.name}/file/voice.mp3` : null,
          caption,
          mtime,
          sceneCount: scriptData?.scenes?.length || 0,
        });
      }
    }

    // Sort newest first
    videoList.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

    res.json(videoList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: File Streaming with Range support ───────────────────────────────────
app.get("/api/videos/:slug/file/:filename", async (req, res) => {
  const { slug, filename } = req.params;
  const filePath = join(OUTPUT_DIR, slug, filename);

  if (!existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  const statData = await stat(filePath);
  const fileSize = statData.size;
  const range = req.headers.range;

  const contentType =
    filename.endsWith(".mp4") ? "video/mp4"
    : filename.endsWith(".mp3") ? "audio/mpeg"
    : filename.endsWith(".txt") ? "text/plain; charset=utf-8"
    : filename.endsWith(".json") ? "application/json"
    : filename.endsWith(".html") ? "text/html; charset=utf-8"
    : "application/octet-stream";

  if (range && filename.endsWith(".mp4")) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const fileStream = createReadStream(filePath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": contentType,
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
    });
    createReadStream(filePath).pipe(res);
  }
});

// ── API: Delete video folder ────────────────────────────────────────────────
app.delete("/api/videos/:slug", async (req, res) => {
  const { slug } = req.params;
  const targetDir = join(OUTPUT_DIR, slug);
  if (!existsSync(targetDir)) return res.status(404).json({ error: "Thư mục không tồn tại" });

  try {
    await rm(targetDir, { recursive: true, force: true });
    res.json({ success: true, message: "Đã xoá video thành công" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Cancel Job (M6) ───────────────────────────────────────────────────
app.post("/api/jobs/:jobId/cancel", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: "Không tìm thấy job" });

  if (job.status === "running") {
    job.status = "failed";
    job.error = "Đã huỷ bởi người dùng";
    broadcastToJob(job, "failed", { error: job.error });
  }
  res.json({ success: true, message: "Đã gửi tín hiệu huỷ tiến trình render" });
});

// ── API: List Projects (M6) ────────────────────────────────────────────────
app.get("/api/projects", async (req, res) => {
  try {
    if (!existsSync(OUTPUT_DIR)) return res.json([]);
    const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
    const projects = [];

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const folder = join(OUTPUT_DIR, ent.name);
      const scriptFile = join(folder, "script.json");
      if (!existsSync(scriptFile)) continue;

      let title = ent.name;
      let schemaVersion = 1;
      let sceneCount = 0;
      let mtime = new Date(0);

      try {
        const raw = JSON.parse(await readFile(scriptFile, "utf8"));
        title = raw.metadata?.title || title;
        schemaVersion = raw.schemaVersion || 1;
        sceneCount = raw.scenes?.length || 0;
      } catch {}

      try {
        const st = await stat(scriptFile);
        mtime = st.mtime;
      } catch {}

      projects.push({
        slug: ent.name,
        title,
        schemaVersion,
        sceneCount,
        hasVideo: existsSync(join(folder, "video.mp4")),
        hasAudio: existsSync(join(folder, "voice.mp3")),
        hasCaptions: existsSync(join(folder, "captions.json")),
        mtime,
      });
    }

    projects.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Get Project Detail & Timeline State (M6) ───────────────────────────
app.get("/api/projects/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const folder = join(OUTPUT_DIR, slug);
    const scriptFile = join(folder, "script.json");

    if (!existsSync(scriptFile)) {
      return res.status(404).json({ error: "Không tìm thấy script.json trong project" });
    }

    const raw = JSON.parse(await readFile(scriptFile, "utf8"));
    const script = ScriptSchema.parse(raw);

    // Thu thập thời lượng thật của các scene audio nếu có
    const audioDurations: Record<string, number> = {};
    const voiceDir = join(folder, "voice");
    if (existsSync(voiceDir)) {
      for (const scene of script.scenes) {
        const sceneAudioPath = join(voiceDir, `scene-${scene.id}.mp3`);
        if (existsSync(sceneAudioPath)) {
          try {
            audioDurations[scene.id] = await getDurationSec(sceneAudioPath);
          } catch {}
        }
      }
    }

    // Đọc captions nếu có
    let captionCues = undefined;
    const captionsFile = join(folder, "captions.json");
    if (existsSync(captionsFile)) {
      try {
        captionCues = JSON.parse(await readFile(captionsFile, "utf8"));
      } catch {}
    }

    // Đọc media.json nếu có
    let media = null;
    const mediaFile = join(folder, "media.json");
    if (existsSync(mediaFile)) {
      try {
        media = JSON.parse(await readFile(mediaFile, "utf8"));
      } catch {}
    }

    // Đọc sources.json nếu có
    let sources = null;
    const sourcesFile = join(folder, "sources.json");
    if (existsSync(sourcesFile)) {
      try {
        sources = JSON.parse(await readFile(sourcesFile, "utf8"));
      } catch {}
    }

    // Nâng cấp và dựng Timeline State
    const scriptV2 = migrateV1toV2(script, audioDurations);
    const timelineState = buildTimelineState(scriptV2, audioDurations, captionCues);

    res.json({
      slug,
      script: scriptV2,
      timelineState,
      sources,
      media,
      hasVideo: existsSync(join(folder, "video.mp4")),
      hasAudio: existsSync(join(folder, "voice.mp3")),
      videoUrl: existsSync(join(folder, "video.mp4")) ? `/api/videos/${slug}/file/video.mp4` : null,
      audioUrl: existsSync(join(folder, "voice.mp3")) ? `/api/videos/${slug}/file/voice.mp3` : null,
      previewUrl: existsSync(join(folder, "index.html")) ? `/api/videos/${slug}/file/index.html` : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Save Project Script (M6) ──────────────────────────────────────────
app.post("/api/projects/:slug/script", async (req, res) => {
  try {
    const { slug } = req.params;
    const folder = join(OUTPUT_DIR, slug);
    const scriptFile = join(folder, "script.json");

    if (!existsSync(folder)) {
      return res.status(404).json({ error: "Project folder not found" });
    }

    const validated = ScriptSchema.parse(req.body.script);
    await writeFile(scriptFile, JSON.stringify(validated, null, 2), "utf8");

    res.json({ success: true, script: validated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── API: Re-TTS for a single Scene (M6) ────────────────────────────────────
app.post("/api/projects/:slug/re-tts/:sceneId", async (req, res) => {
  try {
    const { slug, sceneId } = req.params;
    const folder = join(OUTPUT_DIR, slug);
    const scriptFile = join(folder, "script.json");

    if (!existsSync(scriptFile)) {
      return res.status(404).json({ error: "Không tìm thấy project" });
    }

    const raw = JSON.parse(await readFile(scriptFile, "utf8"));
    const script = ScriptSchema.parse(raw);
    const scene = script.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ error: `Không tìm thấy scene có id '${sceneId}'` });
    }

    const cfg = loadConfig();
    const voiceDir = join(folder, "voice");
    await mkdir(voiceDir, { recursive: true });

    const sceneAudioPath = join(voiceDir, `scene-${sceneId}.mp3`);
    if (existsSync(sceneAudioPath)) {
      await rm(sceneAudioPath, { force: true });
    }

    // 1. Áp dụng Lexicon nếu có
    const processedText = applyLexicon(scene.voiceText);

    // 2. Gọi TTS Client
    const ttsClient = createTtsClient(cfg);
    await ttsClient.generate(processedText, sceneAudioPath);

    // 3. Tính duration mới của scene
    const newDuration = await getDurationSec(sceneAudioPath);

    // 4. Ghép lại toàn bộ voice scenes thành voice.mp3 nếu các file khác đều có
    const audioFiles: string[] = [];
    for (const sc of script.scenes) {
      const p = join(voiceDir, `scene-${sc.id}.mp3`);
      if (existsSync(p)) {
        audioFiles.push(p);
      }
    }

    if (audioFiles.length === script.scenes.length) {
      const voiceMp3 = join(folder, "voice.mp3");
      await concatWithSilence(audioFiles, 0.3, voiceMp3);
    }

    // 5. Cập nhật duration vào script.timeline
    if (!script.timeline) {
      script.timeline = { scenes: {}, captionCues: [] };
    }
    if (!script.timeline.scenes) {
      script.timeline.scenes = {};
    }
    if (!script.timeline.scenes[sceneId]) {
      script.timeline.scenes[sceneId] = {};
    }
    script.timeline.scenes[sceneId].duration = Math.round(newDuration * 1000) / 1000;
    script.schemaVersion = 2;

    await writeFile(scriptFile, JSON.stringify(script, null, 2), "utf8");

    res.json({
      success: true,
      sceneId,
      newDuration: Math.round(newDuration * 1000) / 1000,
      audioUrl: `/api/videos/${slug}/file/voice.mp3`,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Re-TTS thất bại: ${err.message}` });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🎬 Auto Video Gen Web Dashboard is running!`);
  console.log(`👉 Open: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
