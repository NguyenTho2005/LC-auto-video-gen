import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ScriptSchema, type Script } from "../render/script-schema.js";
import { createLlmProvider } from "./llm-provider.js";
import { fetchSourceContent } from "./source-fetcher.js";
import { SYSTEM_PROMPT } from "./prompts/system-prompt.js";
import { buildUserPrompt, buildRetryPrompt } from "./prompts/user-prompt.js";
import { factCheckScript } from "./fact-checker.js";
import type { GenerateScriptResult, LLMProvider, ScriptPreset, SourceContent } from "./types.js";
import { log } from "../utils/logger.js";
import { toSlug } from "../utils/slug.js";

/**
 * Strips markdown code fence blocks if LLM accidentally outputs them.
 */
export function cleanLlmJson(raw: string): string {
  let text = raw.trim();
  // Remove markdown code fences: ```json ... ``` or ``` ... ```
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "");
    text = text.replace(/```\s*$/i, "");
  }
  return text.trim();
}

/**
 * Generates markdown review content for user verification.
 */
export function buildReviewMarkdown(
  script: Script,
  sources: SourceContent,
  preset: ScriptPreset,
  factCheck: ReturnType<typeof factCheckScript>,
): string {
  const totalWords = script.scenes.reduce((acc, s) => acc + s.voiceText.split(/\s+/).length, 0);
  const estSeconds = (totalWords / 2.7).toFixed(1);

  let warningSection = "";
  if (factCheck.flaggedNumbers.length > 0) {
    warningSection = `
> [!WARNING] CẢNH BÁO SỐ LIỆU CHƯA XÁC MINH (${factCheck.flaggedNumbers.length} số)
> Các con số dưới đây xuất hiện trong kịch bản nhưng KHÔNG tìm thấy trong bài viết gốc. Vui lòng kiểm tra lại trước khi render:
${factCheck.flaggedNumbers
  .map(
    (f) =>
      `- Cảnh **${f.sceneId}**: Con số \`${f.number}\` trong ngữ cảnh "${f.context}"`,
  )
  .join("\n")}
`;
  } else {
    warningSection = `> [!NOTE] Tất cả ${factCheck.totalChecked} con số trong kịch bản đã được xác thực khớp với nguồn!`;
  }

  const scenesTable = script.scenes
    .map((s, idx) => {
      const template = s.templateData.template;
      const preview =
        template === "spec-table"
          ? (s.templateData as any).specs.map((sp: any) => `${sp.label}: ${sp.value}`).join(", ")
          : template === "pros-cons"
          ? `Pros: ${(s.templateData as any).pros.join("; ")}`
          : template === "verdict-score"
          ? `Score: ${(s.templateData as any).score}/${(s.templateData as any).scale}`
          : template === "price-tag"
          ? `Price: ${(s.templateData as any).price}`
          : JSON.stringify(s.templateData).slice(0, 60);

      return `| ${idx + 1} | \`${s.id}\` | \`${s.type}\` | \`${template}\` | ${s.voiceText} | ${preview} |`;
    })
    .join("\n");

  return `# Báo cáo Duyệt Kịch bản: ${script.metadata.title}

- **Nguồn bài viết:** [${sources.domain}](${sources.url})
- **Preset:** \`${preset}\` | **Số cảnh:** ${script.scenes.length}
- **Tổng số từ:** ~${totalWords} từ | **Thời lượng ước tính:** ~${estSeconds} giây

${warningSection}

---

## Chi tiết từng cảnh

| # | ID | Loại | Template | Voice Text (Đọc bằng TTS) | Nội dung hiển thị trên màn hình |
|---|---|---|---|---|---|
${scenesTable}

---

## Hướng dẫn bước tiếp theo
1. Kiểm tra kỹ nội dung và các con số trên bảng.
2. Nếu cần sửa, chỉnh sửa trực tiếp file \`script.json\` trong thư mục này.
3. Chạy lệnh sau để tiến hành render video thành phẩm:
\`\`\`bash
npm run pipeline -- <thư mục>/script.json
\`\`\`
`.trim();
}

export interface GenerateScriptOptions {
  input: string;
  preset?: ScriptPreset;
  outputDir?: string;
  llmProvider?: LLMProvider;
  channelName?: string;
}

/**
 * Main script generator pipeline with LLM calling, Zod validation, retry loop, and fact-checking.
 */
export async function generateScript(opts: GenerateScriptOptions): Promise<GenerateScriptResult> {
  const {
    input,
    preset = "news_short",
    llmProvider = createLlmProvider(),
    channelName = "Auto News Video",
  } = opts;

  // 1. Fetch source content
  log.info(`[1/4] Fetching source content from: ${input}`);
  const sources = await fetchSourceContent(input);

  // 2. Prepare output directory
  const slug = toSlug(sources.title).slice(0, 30);
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const outDir = opts.outputDir || join("output", `${slug}-${timestamp}`);
  await mkdir(outDir, { recursive: true });

  // 3. Call LLM with retry mechanism (max 2 retries = 3 attempts total)
  log.info(`[2/4] Generating script with LLM (${llmProvider.name})...`);
  const initialUserPrompt = buildUserPrompt(sources, preset, channelName);

  let currentPrompt = initialUserPrompt;
  let parsedScript: Script | null = null;
  let lastRawResponse = "";
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        log.warn(`  Retry attempt ${attempt}/${MAX_RETRIES} due to validation error...`);
      }

      lastRawResponse = await llmProvider.generate(SYSTEM_PROMPT, currentPrompt);
      const cleaned = cleanLlmJson(lastRawResponse);
      const parsedJson = JSON.parse(cleaned);

      // Validate with ScriptSchema
      const validated = ScriptSchema.parse(parsedJson);
      parsedScript = validated;
      break; // Success!
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.warn(`  Attempt ${attempt + 1} failed: ${errMsg}`);

      if (attempt < MAX_RETRIES) {
        currentPrompt = buildRetryPrompt(initialUserPrompt, lastRawResponse, errMsg);
      } else {
        throw new Error(
          `Failed to generate valid script after ${MAX_RETRIES + 1} attempts. Last error: ${errMsg}`,
        );
      }
    }
  }

  if (!parsedScript) {
    throw new Error("Unexpected error: script was not generated");
  }

  // 4. Fact check numbers against source content
  log.info(`[3/4] Fact-checking numbers against source content...`);
  const factCheck = factCheckScript(parsedScript, sources.content);
  log.info(
    `  Fact check: ${factCheck.verifiedNumbers.length} verified, ${factCheck.flaggedNumbers.length} flagged out of ${factCheck.totalChecked} numbers.`,
  );

  // 5. Generate and write artifacts
  log.info(`[4/4] Writing script.json, sources.json, script.review.md to ${outDir}...`);
  const reviewMarkdown = buildReviewMarkdown(parsedScript, sources, preset, factCheck);

  await writeFile(join(outDir, "script.json"), JSON.stringify(parsedScript, null, 2), "utf8");
  await writeFile(join(outDir, "sources.json"), JSON.stringify(sources, null, 2), "utf8");
  await writeFile(join(outDir, "script.review.md"), reviewMarkdown, "utf8");

  log.info(`Script generation completed: ${outDir}`);

  return {
    script: parsedScript,
    sources,
    factCheck,
    reviewMarkdown,
    outputDir: outDir,
  };
}
