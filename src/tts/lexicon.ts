import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger.js";

export type LexiconMap = Record<string, string>;

let cachedLexicon: LexiconMap | null = null;

/**
 * Loads the lexicon dictionary from config/lexicon.json (cached).
 */
export function loadLexicon(configPath?: string): LexiconMap {
  if (cachedLexicon && !configPath) return cachedLexicon;

  const p = configPath || join(process.cwd(), "config", "lexicon.json");
  if (existsSync(p)) {
    try {
      const data = JSON.parse(readFileSync(p, "utf8"));
      if (typeof data === "object" && data !== null) {
        if (!configPath) cachedLexicon = data;
        return data;
      }
    } catch (err: unknown) {
      log.warn(`Failed to parse lexicon file ${p}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {};
}

/**
 * Resets the in-memory lexicon cache (used for unit tests).
 */
export function resetLexiconCache() {
  cachedLexicon = null;
}

/**
 * Applies lexicon pronunciation dictionary to voiceText before sending to TTS.
 * Case-insensitive match on whole word boundaries using a single-pass regex
 * to prevent cascading replacements (e.g. iPhone -> ai phôn -> ây ai phôn).
 */
export function applyLexicon(text: string, customLexicon?: LexiconMap): string {
  if (!text) return "";
  const dict = customLexicon || loadLexicon();
  const keys = Object.keys(dict).filter((k) => k.trim().length > 0);
  if (keys.length === 0) return text;

  // Sort keys by length descending so longer phrases match first (e.g. "OpenAI" before "AI")
  keys.sort((a, b) => b.length - a.length);

  // Build case-insensitive lookup map for fast normalized retrieval
  const lookup = new Map<string, string>();
  for (const k of keys) {
    lookup.set(k.toLowerCase(), dict[k]);
  }

  // Create combined regex: \b(term1|term2|...)\b
  const pattern = keys
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const regex = new RegExp(`\\b(${pattern})\\b`, "gi");

  return text.replace(regex, (matched) => {
    return lookup.get(matched.toLowerCase()) ?? matched;
  });
}
