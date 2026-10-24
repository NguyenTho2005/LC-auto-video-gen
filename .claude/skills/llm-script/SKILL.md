---
name: llm-script
description: Sinh script.json bằng LLM ngay trong code (interface provider, validate Zod, retry), kiểm tra số liệu so với nguồn, bước duyệt. Dùng ở M4.
---

# LLM tạo kịch bản

- `LLMProvider.generate(system, user) → string`; provider thật chọn bằng `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`; `FakeLLMProvider` cho test.
- Prompt hệ thống (tiếng Việt, đặt trong `src/script/prompts/`): chỉ dùng thông tin trong nguồn, không bịa thông số, hook 3 giây đầu, văn nói, số/đơn vị viết dạng đọc được trong `voiceText`, chọn template theo nội dung.
- Quy trình: lấy nguồn → gọi LLM → bỏ code fence → `JSON.parse` → Zod validate → nếu lỗi thì retry tối đa 2 lần kèm thông báo lỗi.
- Kiểm tra số liệu: mọi con số trong `voiceText`/`templateData` phải có trong văn bản nguồn (so khớp sau chuẩn hoá); số lạ bị gắn cờ trong `script.review.md`.
- Lệnh `npm run script` dừng sau khi ghi `script.json`, `sources.json`, `script.review.md`; chỉ `npm run pipeline` mới render; cờ `--yes` bỏ qua dừng.
- Không in key; không ghi toàn bộ nội dung nguồn vào log.
