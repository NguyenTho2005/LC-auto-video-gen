---
name: captions-timing
description: Tạo caption đồng bộ từng từ từ timestamp TTS, lớp caption HTML trong composition, xuất/nhập SRT. Dùng ở M1.
---

# Caption và SRT

- Nguồn thời gian: word-boundary của `edge-tts-universal` (đọc API của đúng phiên bản đã cài; đơn vị thời gian có thể là 100 ns); SRT của provider nếu có (LucyLab); dự phòng chia theo ký tự cho provider không có timestamp, gắn nhãn "độ chính xác thấp".
- Gom 2–6 từ/cue, tối đa 2 dòng, chuẩn hoá Unicode NFC, cue ngắn nhất ~0.4 s. Offset theo thời điểm bắt đầu của từng cảnh trong video (cộng khoảng nghỉ giữa cảnh).
- Hiển thị bằng lớp HTML/CSS/GSAP trong composition: highlight từ đang đọc, nằm trong safe-zone, font hỗ trợ tiếng Việt (đóng gói cục bộ nếu có thể).
- SRT: UTF-8, đánh số từ 1, `HH:MM:SS,mmm --> HH:MM:SS,mmm`. Parser chịu BOM, CRLF, cue nhiều dòng, báo lỗi rõ khi sai.
- Test: round-trip cue → SRT → cue (dung sai 1 ms); độ lệch cue ≤ 150 ms trên dữ liệu timestamp giả; cue không chồng lấn và không vượt tổng thời lượng.

