---
name: audio-polish
description: BGM với ducking, từ điển phát âm, chuyển cảnh, preset độ dài, safe-zone và cấu hình branding. Dùng ở M5.
---

# Âm thanh, motion, preset

- BGM: lặp/cắt theo độ dài video, fade in/out, ducking khi có giọng (FFmpeg `sidechaincompress` hoặc tương đương). Không đóng gói nhạc có bản quyền; hướng dẫn nguồn nhạc miễn phí và ghi giấy phép.
- Lexicon: `config/lexicon.json` áp vào `voiceText` trước TTS (không đổi chữ hiển thị); có test; so khớp theo từ nguyên, không phân biệt hoa thường.
- Transition: mặc định `cut` để tương thích ngược; `fade`/`slide`/`zoom` có `duration`; cảnh vẫn tính thời lượng = audio + khoảng nghỉ đã có.
- Preset (`short_30`, `news_45`, `review_60`): số cảnh/số từ mục tiêu; ngoài khoảng chỉ cảnh báo.
- Safe-zone TikTok: cấu hình lề; chế độ vẽ lưới khi preview.
- Branding: `config/brand.json` thay cho giá trị mặc định của tác giả gốc; thiếu cấu hình thì không hiển thị thẻ follow hoặc dùng placeholder trung tính.
- Kiểm tra mức âm bằng `ffmpeg`/`ffprobe` trong một test tích hợp ngắn.

