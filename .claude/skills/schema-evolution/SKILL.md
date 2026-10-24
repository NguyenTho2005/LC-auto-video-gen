---
name: schema-evolution
description: Thêm trường/template mới vào schema Zod của script.json mà không phá tương thích ngược, có migrate và fixture hồi quy. Dùng khi sửa schema.
---

# Mở rộng schema an toàn

- Mọi trường mới là `optional()` với mặc định tương đương hành vi cũ. Template mới là biến thể mới trong discriminated union, không đổi biến thể cũ.
- `schemaVersion` thiếu = v1. Viết hàm `migrate(v1 → v2)` thuần, có test.
- Giữ nguyên fixture cũ trong `tests/fixtures/`; thêm fixture mới cho từng tính năng. Test hồi quy: fixture cũ vẫn parse và render như trước.
- Thông báo lỗi Zod phải đủ rõ để LLM/người dùng sửa được (đường dẫn trường + lý do).
- Kiểu TypeScript suy từ Zod (`z.infer`), không khai báo trùng.
- Sau khi đổi schema: cập nhật skill `create-news-video` (để LLM biết trường mới), tài liệu README liên quan và `.env.example` nếu có.
