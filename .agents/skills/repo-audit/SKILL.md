---
name: repo-audit
description: Kiểm tra hiện trạng thật của repo Auto_GenVid (luồng, schema, template, TTS, tài liệu mâu thuẫn) trước khi mở rộng. Dùng ở M0 hoặc khi cần hiểu lại mã.
---

# Audit repo

1. Chạy `npm install`, `npx tsc --noEmit`, `npm test`; ghi kết quả và thời gian.
2. Lập cây `src/` và đọc: `pipeline.ts`, `config.ts`, `rerender.ts`, thư mục `render/`, `tts/`, `audio/`, `assets/`, file schema Zod, `.claude/skills/create-news-video/SKILL.md`.
3. Theo dõi một lần chạy: `npm run pipeline -- tests/fixtures/sample-script-no-image.json` (Edge TTS). Ghi từng bước, file đầu ra, thời gian.
4. Đối chiếu từng khẳng định trong README với mã (template thật là gì, TTS nào xuất SRT, có BGM không, đường dẫn schema, số test).
5. Viết `docs/audit.md`: sơ đồ luồng (mermaid), bảng module, schema hiện tại, kết luận cho từng mâu thuẫn kèm đường dẫn file/dòng.

Chỉ nêu điều đã xác minh; suy đoán phải ghi rõ là suy đoán. Không đổi hành vi code trong bước audit.
