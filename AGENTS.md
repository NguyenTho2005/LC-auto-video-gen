# Quy tắc cho agent — Auto_GenVid (mở rộng)

Yêu cầu: đọc `PRD2.md` (ưu tiên) và `PRD.md` trước khi làm. Khi hai file mâu thuẫn về kỹ thuật, theo `PRD2.md`.

## Nguyên tắc
- Mở rộng repo hiện có (TypeScript/Node ≥ 22, ESM, Zod, Vitest, HyperFrames). KHÔNG viết lại bằng ngôn ngữ khác, KHÔNG đổi stack.
- Làm theo milestone M0…M7, mỗi milestone một nhánh `feat/<mX-tên>`, commit nhỏ. Không push thẳng `main`.
- Tương thích ngược: mọi trường/tính năng mới là tuỳ chọn, mặc định giữ hành vi cũ; `script.json` cũ phải chạy được. Mỗi milestone giữ fixture v1 trong test hồi quy.
- Đọc code trước khi sửa. Không đoán đường dẫn/tên hàm: xác minh bằng cách mở file. Không bịa API của thư viện (`hyperframes`, `edge-tts-universal`, `zod`…): đọc tài liệu hoặc mã nguồn của đúng phiên bản trong `node_modules`.
- Mọi dịch vụ ngoài (TTS, LLM, stock) nằm sau interface và có bản fake/mock cho test; test không gọi API thật (dùng `nock`).
- Không commit API key; dùng `.env.local`, cập nhật `.env.example`. Không in key ra log.
- Giữ nguyên `LICENSE` và phần ghi công tác giả gốc. Không đưa branding của người khác vào mặc định mới.
- Không thêm dependency nặng khi chưa cần; nêu lý do khi thêm.
- Quyết định lớn ghi vào `docs/adr-XXXX.md`. Điểm mơ hồ: chọn phương án đơn giản nhất, ghi vào `docs/assumptions.md`, tiếp tục; chỉ dừng hỏi khi không thể tiến tiếp.

## Trước khi báo hoàn thành (bắt buộc)
Chạy và dán kết quả THẬT: `npx tsc --noEmit`, `npm test`, và một lần render mẫu (kiểm tra bằng `ffprobe`: 1080×1920, có luồng audio, thời lượng hợp lý). Không tuyên bố xong nếu còn tiêu chí chấp nhận chưa đạt.

## Mẫu báo cáo
1. Đã làm gì (file tạo/sửa) 2. Cách chạy thử 3. Output tsc/test/ffprobe 4. Tiêu chí chấp nhận: đạt / chưa đạt / chưa kiểm tra (kèm bằng chứng) 5. Giả định và việc còn lại

