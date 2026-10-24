---
name: hyperframes-templates
description: Thêm hoặc sửa template HTML/CSS/GSAP trong lớp render HyperFrames, đảm bảo deterministic, đúng 9:16, đúng cả hai theme. Dùng ở M3, M5.
---

# Template HyperFrames

- Đọc tài liệu HyperFrames đúng phiên bản trong `package.json` và code `src/render/` (composer, templates, `animations.js`, hai file CSS theme) trước khi viết.
- Mỗi template mới gồm: Zod schema, hàm dựng HTML trong composer, hàm animation vào cảnh, CSS cho CẢ `dark-neon` và `light-pro` (dùng chung tên class), fixture, test composer.
- Deterministic: không `Math.random()`, không dùng thời gian thực; hiệu ứng dựa trên timeline GSAP.
- Văn bản tiếng Việt: kiểm tra dấu, chuỗi dài, co chữ/cắt có quy tắc; không để tràn khung.
- Kiểm tra bằng cách render một frame (hoặc video 3 giây) và xem ảnh chụp; ghi lại trong báo cáo.
- Tôn trọng safe-zone TikTok (cấu hình ở M5): không đặt nội dung quan trọng vào ~20% đáy và cạnh phải.
- Không đổi hành vi template cũ trừ khi có yêu cầu rõ.
