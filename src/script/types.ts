import type { Script } from "../render/script-schema.js";

export type ScriptPreset = "news_short" | "review_60" | "top_list";

export interface LLMProvider {
  readonly name: string;
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
}

export interface SourceContent {
  title: string;
  content: string;
  url: string;
  domain: string;
  ogImage: string | null;
}

export interface FlaggedNumber {
  sceneId: string;
  number: string;
  context: string;
  reason: "not_in_source" | "mismatched_value";
}

export interface FactCheckResult {
  verifiedNumbers: string[];
  flaggedNumbers: FlaggedNumber[];
  totalChecked: number;
}

export interface GenerateScriptResult {
  script: Script;
  sources: SourceContent;
  factCheck: FactCheckResult;
  reviewMarkdown: string;
  outputDir: string;
}
