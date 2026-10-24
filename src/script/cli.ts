import { generateScript } from "./generator.js";
import type { ScriptPreset } from "./types.js";
import { log } from "../utils/logger.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npm run script -- <url|file.md|"chủ đề"> [options]

Options:
  --preset <preset>   Kịch bản: news_short | review_60 | top_list (mặc định: news_short)
  --out <dir>         Thư mục đầu ra (mặc định: output/<slug>-<timestamp>)
  --yes, -y           Bỏ qua bước dừng chờ duyệt kịch bản (chạy tự động)
  --help, -h          Hiển thị trợ giúp này

Ví dụ:
  npm run script -- https://vnexpress.net/bai-viet-123.html --preset news_short
  npm run script -- docs/bai-viet.txt --preset review_60 --out output/my-review
`);
    process.exit(0);
  }

  let input = "";
  let preset: ScriptPreset = "news_short";
  let outputDir: string | undefined;
  let autoYes = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--preset") {
      preset = (args[++i] as ScriptPreset) || "news_short";
    } else if (arg === "--out") {
      outputDir = args[++i];
    } else if (arg === "--yes" || arg === "-y") {
      autoYes = true;
    } else if (!arg.startsWith("-") && !input) {
      input = arg;
    }
  }

  if (!input) {
    log.error("Thiếu tham số đầu vào (URL, đường dẫn file hoặc chủ đề).");
    process.exit(1);
  }

  try {
    const result = await generateScript({
      input,
      preset,
      outputDir,
    });

    console.log("\n" + "=".repeat(60));
    console.log("✓ KỊCH BẢN ĐÃ ĐƯỢC TẠO THÀNH CÔNG");
    console.log("=".repeat(60));
    console.log(`- Thư mục đầu ra:  ${result.outputDir}`);
    console.log(`- Kịch bản JSON:   ${result.outputDir}/script.json`);
    console.log(`- Nguồn bài viết:  ${result.outputDir}/sources.json`);
    console.log(`- Báo cáo duyệt:   ${result.outputDir}/script.review.md`);
    console.log(`- Số cảnh tạo ra:  ${result.script.scenes.length}`);
    console.log(`- Kiểm tra số:     ${result.factCheck.verifiedNumbers.length} đã xác thực, ${result.factCheck.flaggedNumbers.length} cảnh báo`);

    if (result.factCheck.flaggedNumbers.length > 0) {
      console.log("\n⚠️ CẢNH BÁO SỐ LIỆU CẦN DUYỆT:");
      for (const f of result.factCheck.flaggedNumbers) {
        console.log(`  * [${f.sceneId}] Số "${f.number}" không tìm thấy trong văn bản nguồn`);
      }
    }

    if (!autoYes) {
      console.log("\n🛑 BƯỚC DUYỆT KỊCH BẢN:");
      console.log("  Hệ thống đã dừng lại để bạn kiểm tra nội dung trước khi render.");
      console.log(`  1. Mở xem file: ${result.outputDir}/script.review.md`);
      console.log("  2. Chỉnh sửa kịch bản nếu cần: script.json");
      console.log(`  3. Chạy lệnh sau để render video thành phẩm:`);
      console.log(`     npm run pipeline -- ${result.outputDir}/script.json\n`);
    } else {
      console.log("\n[--yes] Đã bỏ qua bước dừng chờ duyệt. Sẵn sàng render.");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Thất bại khi tạo kịch bản: ${msg}`);
    process.exit(1);
  }
}

main();
