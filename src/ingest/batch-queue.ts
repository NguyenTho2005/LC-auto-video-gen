import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FeedItem, BatchJob, BatchQueueResult } from "./types.js";
import { toSlug } from "../utils/slug.js";
import { log } from "../utils/logger.js";
import { generateScriptFromContent } from "../utils/script-generator.js";
import { runPipeline } from "../pipeline.js";
import { generatePublishChecklist, extractCoverFrame } from "./publish-kit.js";

export type PipelineRunner = (scriptPath: string) => Promise<void>;

export interface BatchQueueOptions {
  outputBaseDir?: string;
  maxJobs?: number;
  pipelineRunner?: PipelineRunner; // for testing / mocking
  onProgress?: (job: BatchJob, index: number, total: number) => void;
}

export class BatchQueue {
  private outputBaseDir: string;
  private pipelineRunner: PipelineRunner;

  constructor(options?: BatchQueueOptions) {
    this.outputBaseDir = options?.outputBaseDir || join(process.cwd(), "output");
    this.pipelineRunner = options?.pipelineRunner || runPipeline;
  }

  /**
   * Process feed items sequentially.
   * If a job fails, record the error and continue to the next item.
   */
  async process(
    items: FeedItem[],
    options?: {
      maxJobs?: number;
      onProgress?: (job: BatchJob, index: number, total: number) => void;
    }
  ): Promise<BatchQueueResult> {
    const limit = options?.maxJobs ? Math.min(items.length, options.maxJobs) : items.length;
    const selectedItems = items.slice(0, limit);

    const jobs: BatchJob[] = selectedItems.map((item, idx) => ({
      id: `job-${idx + 1}-${toSlug(item.title).slice(0, 30)}`,
      item,
      status: "pending",
    }));

    let completedCount = 0;
    let failedCount = 0;

    log.info(`[BatchQueue] Starting batch queue with ${jobs.length} item(s)...`);

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      job.status = "running";
      job.startedAt = new Date().toISOString();
      options?.onProgress?.(job, i + 1, jobs.length);

      const slug = toSlug(job.item.title);
      const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
      const jobFolder = join(this.outputBaseDir, `feed-${slug.slice(0, 40)}-${timestamp}`);
      job.outputDir = jobFolder;

      log.info(`[BatchQueue] [${i + 1}/${jobs.length}] Processing: "${job.item.title}"`);

      try {
        await mkdir(jobFolder, { recursive: true });

        // 1. Generate Script
        const script = await generateScriptFromContent({
          title: job.item.title,
          content: job.item.description || job.item.title,
          url: job.item.link,
          domain: job.item.domain || "news",
          channel: "Tin Tức AI 24h",
        });

        const scriptPath = join(jobFolder, "script.json");
        await writeFile(scriptPath, JSON.stringify(script, null, 2), "utf8");
        job.scriptPath = scriptPath;

        // 2. Run Pipeline
        await this.pipelineRunner(scriptPath);

        // 3. Generate Publish Kit
        const publishMd = generatePublishChecklist(
          {
            suggestedTitle: job.item.title,
            sourceUrl: job.item.link,
            sourceName: job.item.sourceName,
          },
          script
        );
        await writeFile(join(jobFolder, "publish.md"), publishMd, "utf8");

        job.status = "completed";
        job.finishedAt = new Date().toISOString();
        completedCount++;
        log.info(`[BatchQueue] [${i + 1}/${jobs.length}] ✅ Succeeded: "${job.item.title}"`);
      } catch (err: any) {
        job.status = "failed";
        job.error = err.message || String(err);
        job.finishedAt = new Date().toISOString();
        failedCount++;
        log.warn(`[BatchQueue] [${i + 1}/${jobs.length}] ❌ Failed: "${job.item.title}": ${job.error}`);
        // Do not crash the entire queue — proceed to the next item
      }

      options?.onProgress?.(job, i + 1, jobs.length);
    }

    log.info(
      `[BatchQueue] Finished batch queue. Total: ${jobs.length}, Completed: ${completedCount}, Failed: ${failedCount}`
    );

    return {
      total: jobs.length,
      completed: completedCount,
      failed: failedCount,
      jobs,
    };
  }
}
