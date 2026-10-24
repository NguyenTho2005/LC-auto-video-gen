# ADR-0001: Kiến trúc Web UI và Timeline Editor (Milestone M6)

- **Trạng thái:** Được chấp thuận (Accepted)
- **Ngày:** 24/10/2026
- **Tác giả:** Antigravity AI Engineering Team

---

## 1. Bối cảnh (Context & Problem)

Auto_GenVid cần một giao diện web cục bộ (Local Web UI) cho phép người sáng tạo nội dung:
1. Xem trước (Live Preview) bố cục video dọc 9:16 đồng bộ chính xác âm thanh và đồ hoạ chuyển động (GSAP).
2. Chỉnh sửa kịch bản theo trục thời gian (Timeline Editor) với các thao tác chuyên nghiệp: kéo thả, trim, split, xoá, ripple delete, snap vào ranh giới cảnh/phụ đề.
3. Hỗ trợ hoàn tác (Undo) và làm lại (Redo) chuẩn xác theo Command Pattern.
4. Tương thích hai chiều với file `script.json` (schemaVersion: 2 với khối `timeline` tuỳ chọn), có khả năng mở lại project cũ từ thư mục `output/` qua hàm `migrateV1toV2`.
5. Tạo lại giọng đọc (Re-TTS) cho từng cảnh riêng lẻ mà không phải tạo lại toàn bộ video.
6. Render video thành phẩm có thanh tiến độ thời gian thực (SSE) và hỗ trợ huỷ bỏ.

---

## 2. Quyết định kỹ thuật (Decision)

### 2.1. Kiến trúc Backend (Local Server)
- **Công nghệ:** Tái sử dụng và mở rộng server Express hiện có tại `src/server.ts`, chạy trực tiếp bằng `tsx src/server.ts` trên Node.js ≥ 22.
- **Lý do:**
  - Không phát sinh dependency nặng mới.
  - Tái sử dụng 100% các module core TypeScript hiện có (`src/pipeline.ts`, `src/render/html-composer.ts`, `src/assets/audio-tools.ts`, `src/tts/`).
  - Hỗ trợ Server-Sent Events (SSE) để truyền phát nhật ký tiến độ render thời gian thực.

### 2.2. Kiến trúc Mô hình Dữ liệu Độc lập (Headless Timeline Model)
- **Thư mục:** `src/timeline/`
- **Nguyên tắc phân tách:**
  - Mô hình dữ liệu timeline là **thuần logic (pure TypeScript)**, không phụ thuộc vào DOM, React hay Express.
  - Áp dụng triệt để **Command Pattern**: Mọi thao tác chỉnh sửa (`MoveScene`, `TrimScene`, `SplitScene`, `RippleDelete`, `EditCue`, `SetBgm`) đều được đóng gói thành các đối tượng Command có hai phương thức `execute(state)` và `undo(state)`.
  - Quản lý lịch sử bằng `TimelineHistory` với hai ngăn xếp `undoStack` và `redoStack`.
  - UI (giao diện) chỉ có nhiệm vụ lắng nghe trạng thái và gửi lệnh (dispatch command), tuyệt đối không tự ý đột biến dữ liệu.
- **Quy tắc biên tập:**
  - Các clip trên cùng một track không được chồng lấn (non-overlapping).
  - Thao tác `trim` không cho phép thời lượng clip ≤ 0 (ngưỡng tối thiểu 0.2s).
  - Hỗ trợ hít (snapping) vào đầu/cuối cảnh lân cận, cue phụ đề và playhead với ngưỡng dung sai 0.1s.

### 2.3. Giải pháp Preview trực tiếp trong trình duyệt
- **Kiểm chứng HyperFrames & GSAP:**
  - Video composition của HyperFrames được viết bằng HTML5, CSS3 và GSAP timeline.
  - Trong trình duyệt, server phục vụ file `index.html` của composition qua thẻ `<iframe>`.
  - Để tua (scrubbing) video, UI giao tiếp qua `postMessage` hoặc truy cập trực tiếp `iframe.contentWindow.__timelines["news-video"].seek(time)`.
  - Âm thanh được đồng bộ bằng thẻ `<audio src="voice.mp3">` trong iframe, tự động play/pause/seek khớp với timeline GSAP mà không cần phải render proxy video bằng FFmpeg, mang lại trải nghiệm 60fps mượt mà và tức thì.

### 2.4. Di chuyển dữ liệu (Migration v1 → v2)
- Kịch bản `script.json` v1 không có khối `timeline`.
- Hàm `migrateV1toV2(scriptV1)` tự động tính toán thời lượng audio của từng cảnh, xây dựng track cảnh, track giọng, track BGM và track caption đầy đủ, nâng cấp `schemaVersion: 2` mà vẫn bảo tồn nguyên vẹn dữ liệu gốc.

---

## 3. Hệ quả (Consequences)

- **Ưu điểm:**
  - Toàn bộ nghiệp vụ timeline có thể viết Unit Test độc lập 100% bằng Vitest mà không cần mở trình duyệt.
  - Zero build step: Khởi động tức thì với `npm run web` hoặc `npm run serve`.
  - Preview trung thực 1:1 với kết quả render cuối cùng của HyperFrames vì cùng dùng chung file `index.html`.
- **Hạn chế:**
  - Khi xem preview trên trình duyệt không có GPU tăng tốc, một số hiệu ứng glow nặng có thể cần tắt bớt trong chế độ xem trước (được xử lý qua CSS).
