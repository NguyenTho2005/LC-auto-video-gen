#!/usr/bin/env node
import { loadFeedsConfig, fetchFeedItems } from "./feed-collector.js";
import { BatchQueue } from "./batch-queue.js";

async function main() {
  const args = process.argv.slice(2);
  const isList = args.includes("--list");
  const localFile = args.indexOf("--file") !== -1 ? args[args.indexOf("--file") + 1] : null;
  const pickIndex = args.indexOf("--pick") !== -1 ? parseInt(args[args.indexOf("--pick") + 1], 10) : null;
  const batchCount = args.indexOf("--batch") !== -1 ? parseInt(args[args.indexOf("--batch") + 1], 10) : null;

  console.log("\n=======================================================");
  console.log("📰 Auto_GenVid — RSS Ingest & Batch Video Generator");
  console.log("=======================================================\n");

  let items = [];
  if (localFile) {
    const { readFileSync } = await import("node:fs");
    const { parseRssFeed, filterDuplicateItems } = await import("./feed-collector.js");
    console.log(`Đang đọc file RSS cục bộ: ${localFile}...`);
    const xml = readFileSync(localFile, "utf-8");
    items = filterDuplicateItems(parseRssFeed(xml, "LocalFeed"));
  } else {
    const sources = loadFeedsConfig();
    console.log(`Đang quét ${sources.length} nguồn cấp tin tức RSS...`);
    items = await fetchFeedItems(sources);
  }
  console.log(`Thu thập được ${items.length} bài viết mới (đã loại bỏ trùng lặp).\n`);

  if (isList || (!pickIndex && !batchCount)) {
    console.log("DANH SÁCH BÀI VIẾT MỚI NHẤT:");
    console.log("-------------------------------------------------------");
    items.slice(0, 15).forEach((item, idx) => {
      console.log(`[${idx + 1}] [${item.sourceName || "News"}] ${item.title}`);
      console.log(`    🔗 ${item.link}`);
    });
    console.log("-------------------------------------------------------");
    console.log("\nCách sử dụng:");
    console.log("  npm run ingest -- --pick <số thứ tự>    # Tạo video cho 1 bài");
    console.log("  npm run ingest -- --batch <số lượng>   # Tự động tạo video cho N bài liên tiếp");
    console.log("  npm run ingest -- --list               # Liệt kê danh sách tin tức");
    return;
  }

  const queue = new BatchQueue();

  if (pickIndex !== null) {
    if (pickIndex < 1 || pickIndex > items.length) {
      console.error(`Lỗi: Chỉ số bài viết phải nằm trong khoảng 1 đến ${items.length}`);
      process.exit(1);
    }
    const chosen = items[pickIndex - 1];
    console.log(`Bắt đầu xử lý bài viết [${pickIndex}]: "${chosen.title}"...\n`);
    const res = await queue.process([chosen]);
    console.log("\nKết quả:", res.completed > 0 ? "✅ Hoàn tất thành công!" : "❌ Thất bại");
    return;
  }

  if (batchCount !== null) {
    console.log(`Bắt đầu chạy hàng đợi Batch Queue cho ${batchCount} bài viết...\n`);
    const res = await queue.process(items, { maxJobs: batchCount });
    console.log("\n=======================================================");
    console.log(`Kết quả Batch Queue: Hoàn tất ${res.completed}/${res.total} bài (Thất bại: ${res.failed})`);
    console.log("=======================================================\n");
  }
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
