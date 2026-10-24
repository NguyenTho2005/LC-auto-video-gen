import type { ScriptPreset, SourceContent } from "../types.js";

export function buildUserPrompt(
  source: SourceContent,
  preset: ScriptPreset = "news_short",
  channelName = "Auto News Video",
): string {
  let presetInstruction = "";

  switch (preset) {
    case "news_short":
      presetInstruction = `
Preset: NEWS_SHORT (~30-45 giây, 5-6 cảnh)
- Cảnh 1: hook (tiêu đề tin tức nóng hổi, gây tò mò)
- Cảnh 2: stat-hero hoặc callout (số liệu hoặc phát ngôn quan trọng nhất)
- Cảnh 3-4: feature-list hoặc comparison (chi tiết sự kiện, bối cảnh, tác động)
- Cảnh cuối: outro (kêu gọi follow kênh để cập nhật tin mới)
`.trim();
      break;

    case "review_60":
      presetInstruction = `
Preset: REVIEW_60 (~60 giây, 6-8 cảnh)
- Cảnh 1: hook (câu hỏi hoặc khẳng định bất ngờ về sản phẩm)
- Cảnh 2: spec-table (bảng thông số kỹ thuật chính: chip, màn hình, pin, camera...)
- Cảnh 3: pros-cons (ưu và nhược điểm thực tế)
- Cảnh 4: verdict-score (chấm điểm thang 10 hoặc 100, kết luận)
- Cảnh 5: price-tag (giá bán và nơi phân phối)
- Cảnh 6 (tùy chọn): image-gallery hoặc phone-mockup (trải nghiệm thực tế)
- Cảnh cuối: outro (CTA theo dõi đánh giá tiếp theo)
`.trim();
      break;

    case "top_list":
      presetInstruction = `
Preset: TOP_LIST (~50-65 giây, 6-8 cảnh)
- Cảnh 1: hook (top danh sách hoặc bảng xếp hạng đáng chú ý)
- Cảnh 2..N-1: feature-list hoặc stat-hero (từng mục xếp hạng theo thứ tự)
- Cảnh cuối: outro (kêu gọi bình luận ý kiến cá nhân)
`.trim();
      break;
  }

  return `
YÊU CẦU: Hãy tạo kịch bản video JSON hoàn chỉnh từ bài viết dưới đây.

${presetInstruction}

THÔNG TIN BÀI VIẾT NGUỒN:
- Tiêu đề: ${source.title}
- Nguồn: ${source.domain} (${source.url})
- Kênh phát hành: ${channelName}

NỘI DUNG VĂN BẢN NGUỒN:
---
${source.content}
---

Hãy trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng schema và hướng dẫn của hệ thống.
`.trim();
}

export function buildRetryPrompt(
  originalUserPrompt: string,
  lastInvalidResponse: string,
  errorMessage: string,
): string {
  return `
KẾT QUẢ JSON BẠN VỪA TRẢ VỀ KHÔNG HỢP LỆ.
Lỗi cụ thể: ${errorMessage}

Hãy xem lại phản hồi trước đó của bạn:
---
${lastInvalidResponse.slice(0, 1000)}
---

YÊU CẦU SỬA LỖI:
1. Đảm bảo cấu trúc JSON hợp lệ 100%, không bị thiếu dấu ngoặc, dấu phẩy.
2. Đảm bảo đúng Zod ScriptSchema (từ 5 đến 8 cảnh, cảnh đầu type 'hook', cảnh cuối type 'outro').
3. CHỈ trả về đúng 1 chuỗi JSON hoàn chỉnh, không có markdown code fence hay chữ giải thích.

Hãy tạo lại JSON chính xác ngay dưới đây:
`.trim();
}
