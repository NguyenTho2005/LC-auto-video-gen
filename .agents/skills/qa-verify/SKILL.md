---
name: qa-verify
description: Kiểm tra trước khi báo hoàn thành một milestone (tsc, test, hồi quy script cũ, render mẫu, ffprobe, tiêu chí chấp nhận). Dùng cuối mỗi nhiệm vụ.
---

# Kiểm tra hoàn thành

1. Chạy `npx tsc --noEmit` và `npm test`; dán output thật.
2. Hồi quy: chạy fixture v1 cũ, xác nhận render như trước (hoặc khác ở điểm nào và vì sao được chấp nhận).
3. Render mẫu cho tính năng mới; `ffprobe` kiểm tra 1080×1920, có luồng audio, thời lượng; xem một frame ảnh chụp khi liên quan đến hiển thị.
4. Đối chiếu từng tiêu chí chấp nhận của milestone trong `PRD2.md`: đạt / chưa đạt / chưa kiểm tra, kèm lệnh và đường dẫn tệp làm bằng chứng.
5. Kiểm tra: không có API key trong mã/log; `.env.example` đã cập nhật; README/`docs` cập nhật; `LICENSE` nguyên vẹn.
6. Liệt kê rõ việc còn lại và giả định. Không tuyên bố "xong" nếu còn tiêu chí chưa đạt.

