---
name: web-timeline-editor
description: Xây web UI và timeline editor (mô hình + thao tác + undo/redo tách khỏi UI, preview bằng HTML composition). Dùng ở M6.
---

# Web UI và timeline

1. Viết `docs/adr-ui.md` chốt công nghệ (đề xuất Vite + React + TS và server Node local dùng chung mã core). Kiểm chứng cách preview bằng HTML composition/tua GSAP với phiên bản HyperFrames đang dùng; nếu không khả thi, dùng render proxy độ phân giải thấp và ghi vào ADR.
2. Mô hình timeline thuần dữ liệu (không phụ thuộc UI/FFmpeg), thao tác là `Command` có `do/undo`: `addScene`, `removeScene`, `moveScene`, `trimScene`, `splitScene`, `rippleDelete`, `editCue`, `moveCue`, `setBgm`, `undo`, `redo`. Test từng thao tác và `undo`.
3. Quy tắc: các cảnh không chồng lấn trên cùng track; `trim` không làm thời lượng ≤ 0; snap vào đầu/cuối cảnh, cue, playhead (ngưỡng ~0.1 s); thời gian làm tròn theo khung hình.
4. `script.json` v2 (+ khối `timeline`) là nguồn sự thật; có `migrate` v1 → v2 và test. UI chỉ gọi `Command`, không tự sửa dữ liệu.
5. Chức năng: preview đồng bộ audio, sửa `voiceText`/`templateData`, chọn template/media/theme/preset, tạo lại giọng từng cảnh, render có tiến độ và huỷ, mở project trong `output/`.
6. Giữ CLI (`npm run pipeline`, `rerender`) hoạt động như cũ.

