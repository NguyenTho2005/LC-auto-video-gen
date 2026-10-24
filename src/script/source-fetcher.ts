import { existsSync, readFileSync } from "node:fs";
import axios from "axios";
import type { SourceContent } from "./types.js";
import { log } from "../utils/logger.js";

/**
 * Strips HTML tags and script/style tags from an HTML string.
 */
export function extractCleanTextFromHtml(html: string): string {
  // Remove script and style blocks
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Normalize whitespace
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Extracts title and og:image from HTML.
 */
export function extractMetaFromHtml(html: string): { title: string; ogImage: string | null } {
  let title = "";
  const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (ogTitleMatch) {
    title = ogTitleMatch[1].trim();
  } else {
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTagMatch) {
      title = titleTagMatch[1].trim();
    }
  }

  let ogImage: string | null = null;
  const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    ogImage = ogImageMatch[1].trim();
  }

  return { title, ogImage };
}

/**
 * Fetches content from an input string (URL, local file, or raw topic).
 */
export async function fetchSourceContent(input: string): Promise<SourceContent> {
  const trimmed = input.trim();

  // 1. URL mode
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    log.info(`Fetching source content from URL: ${trimmed}`);
    const urlObj = new URL(trimmed);
    const domain = urlObj.hostname.replace(/^www\./, "");

    const response = await axios.get(trimmed, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const html = String(response.data);
    const { title: metaTitle, ogImage } = extractMetaFromHtml(html);
    const cleanContent = extractCleanTextFromHtml(html);
    const title = metaTitle || cleanContent.slice(0, 80) || "Tin tức công nghệ";

    return {
      title,
      content: cleanContent,
      url: trimmed,
      domain,
      ogImage,
    };
  }

  // 2. Local file mode
  if (existsSync(trimmed)) {
    log.info(`Reading source content from local file: ${trimmed}`);
    const raw = readFileSync(trimmed, "utf8");
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const title = lines[0] ? lines[0].slice(0, 80) : "Tài liệu kịch bản";
    const content = lines.slice(1).join("\n") || lines[0] || "";

    return {
      title,
      content,
      url: trimmed,
      domain: "local",
      ogImage: null,
    };
  }

  // 3. Raw topic / prompt mode
  log.info(`Using raw topic as source: ${trimmed.slice(0, 50)}...`);
  return {
    title: trimmed.slice(0, 80),
    content: trimmed,
    url: "manual",
    domain: "manual",
    ogImage: null,
  };
}
