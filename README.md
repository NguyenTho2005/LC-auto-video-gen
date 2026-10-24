<a id="top"></a>

<div align="center">

# 🎬 Auto Video Gen v2.0 (Auto_GenVid)

### 🚀 Biến URL bài báo & Repo GitHub thành Video ngắn 9:16 chuyên nghiệp

**1 câu lệnh với AI Coding · 0đ Voice (Edge TTS) · Không cần edit thủ công · Sẵn sàng đăng TikTok, Reels, Shorts**

[![Stars](https://img.shields.io/github/stars/Cuongyd196/auto-video-gen?style=for-the-badge&logo=github&color=yellow)](https://github.com/Cuongyd196/auto-video-gen/stargazers)
[![Forks](https://img.shields.io/github/forks/Cuongyd196/auto-video-gen?style=for-the-badge&logo=github&color=blue)](https://github.com/Cuongyd196/auto-video-gen/network/members)
[![License](https://img.shields.io/github/license/Cuongyd196/auto-video-gen?style=for-the-badge&color=green)](LICENSE)
[![Node](https://img.shields.io/badge/node-22%2B-brightgreen?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-154%20passed-success?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)

[**📖 Tài liệu chi tiết (Full Docs)**](README.full.md) · [**🇬🇧 English Docs**](README.en.md) · [**📺 Xem Demo**](https://youtube.com/shorts/X8P_5tsHy4o) · [**🚀 Cài đặt nhanh**](#-cài-đặt--bắt-đầu-nhanh) · [**⚙️ Cơ chế hoạt động**](#-cơ-chế-hoạt-động-how-it-works)

</div>

> 💡 **Bạn cần tài liệu kiến trúc & chuyển giao?**
> Xem [👉 docs/handover-brief.md](docs/handover-brief.md) để biết đầy đủ lộ trình từ Milestone M0 đến M7, kiến trúc Headless Timeline, và các quyết định kỹ thuật ADR.

---

## 🌟 Các tính năng nổi bật (v2.0)

- 🎙️ **Giọng đọc tiếng Việt tự nhiên (0đ):** Mặc định sử dụng Microsoft Edge TTS (`vi-VN-NamMinhNeural`, `vi-VN-HoaiMyNeural`), hỗ trợ LucyLab, ElevenLabs, Vbee.
- 🔤 **Phụ đề Karaoke từng từ (Word-level Sync):** Hiệu ứng chữ đổi màu và glow theo đúng giọng nói, tự động xuất/nhập file chuẩn `captions.srt`.
- 🖼️ **Media thật & Chụp ảnh bài báo:** Tự động tìm ảnh/video stock (Pexels, Pixabay), chụp screenshot website bằng Puppeteer, hiệu ứng Ken Burns mượt mà và quản lý bản quyền `media.json`.
- 🎨 **12 Template Motion Graphics đỉnh cao:** Hỗ trợ 2 theme (`dark-neon` và `light-pro`), bao gồm cả bộ template review sản phẩm công nghệ (bảng thông số, ưu nhược điểm, điểm số, giá bán, gallery ảnh, phone mockup).
- 🤖 **Sinh kịch bản tự động bằng LLM ngay trong code:** Tự động gọi Claude/OpenAI, lọc số liệu lạ so với nguồn, xuất `script.review.md` trước khi render.
- 🎵 **Audio Polish & BGM Ducking:** Nhạc nền tự động dìm âm lượng (sidechain compression) khi có giọng đọc và đẩy lên ở khoảng nghỉ; từ điển phát âm Lexicon chống đọc sai phiên âm tiếng Anh/tên riêng.
- ⏱️ **Web UI Studio & Timeline Editor (M6):** Giao diện web đa track (Visual Scenes, Voice, Captions, BGM), Live Preview 9:16 đồng bộ GSAP timeline, các lệnh Command Pattern (Undo, Redo, Split, Ripple Delete, Snap), nút Re-TTS từng cảnh riêng lẻ và thanh tiến độ render thời gian thực (SSE).
- 📰 **Thu thập tin tức RSS & Hàng đợi Batch (M7):** Tự động quét RSS từ VnExpress, Tuổi Trẻ, GenK... và tạo video hàng loạt với cơ chế cô lập lỗi.
- 🚀 **Publish Kit đầy đủ:** Tự động trích xuất frame ảnh bìa `cover.png` và checklist `publish.md` (caption, 4 hashtag, ghi công nguồn, nhãn nội dung AI bắt buộc).

---

## ⚙️ Cơ chế hoạt động (How It Works)

```text
[URL bài báo / RSS Feed / Văn bản]
         │
         ▼ (Bước 1: LLM tạo kịch bản & Kiểm tra số liệu)
[script.json + sources.json + script.review.md]
         │
         ├───► [Xử lý Media thật / Stock / Screenshot / Ken Burns] (Bước 2)
         │
         ├───► [Từ điển phát âm Lexicon -> Thu âm TTS từng cảnh: voice/scene-*.mp3] (Bước 3)
         │          │ (Tái sử dụng nếu đã có sẵn - Idempotent Caching)
         │          ▼
         ├───► [Nối audio + Mix SFX + Mix BGM có Ducking tự động: voice.mp3] (Bước 4)
         │
         ├───► [Gom timestamp thành Cues -> Xuất captions.srt & captions.json] (Bước 5)
         │
         ▼
[Sinh HTML Composition: index.html + styles.css + animations.js] (Bước 6)
         │ (Bố cục 9:16 bằng HTML5/CSS3/GSAP, nhúng Captions & Media)
         ▼
[HyperFrames Renderer: Puppeteer chụp frame + FFmpeg Encode] (Bước 7)
         │
         ▼
[Hoàn tất sản phẩm: video.mp4 (1080x1920) + cover.png + publish.md] (Bước 8)
```

---

## 📐 Danh sách 12 Template Motion Graphics

| Template | Nhóm | Mục đích sử dụng | Dữ liệu chính (`templateData`) |
|---|---|---|---|
| 🚨 **`hook`** | Cơ bản | Cảnh mở đầu giật gân, giữ chân người xem 3 giây đầu | `headline`, `subhead`, `bgSrc`, `kenBurns` |
| 🔀 **`comparison`** | Cơ bản | So sánh 2 thông số hoặc 2 phương án đối lập | `left`, `right` (label, value, winner) |
| 📊 **`stat-hero`** | Cơ bản | Nhấn mạnh con số thống kê hoặc dung lượng pin/camera lớn | `value`, `label`, `context` |
| 📋 **`feature-list`** | Cơ bản | Danh sách điểm nhấn, gạch đầu dòng tính năng | `title`, `bullets` (mảng 1–4 dòng), `icon` |
| 💬 **`callout`** | Cơ bản | Tuyên bố mạnh mẽ, câu trích dẫn hoặc giá bán | `statement`, `tag` |
| 🎬 **`outro`** | Cơ bản | Thẻ follow kênh TikTok và nguồn tin trích dẫn | `ctaTop`, `channelName`, `source` |
| 📑 **`spec-table`** | Review | Bảng thông số cấu hình phần cứng (RAM, CPU, Pin...) | `productName`, `specs` (label, value) |
| ⚖️ **`pros-cons`** | Review | Cột ưu điểm (Pros) và nhược điểm (Cons) trực quan | `title`, `pros`, `cons` |
| 🏆 **`verdict-score`** | Review | Điểm đánh giá tổng kết (thang 10 hoặc 100) kèm tóm tắt | `productName`, `score`, `verdict`, `summary` |
| 🏷️ **`price-tag`** | Review | Nhãn giá bán sản phẩm nổi bật với tag khuyến mãi | `productName`, `price`, `variant`, `note` |
| 🖼️ **`image-gallery`** | Review | Trưng bày bộ sưu tập 2–3 góc chụp sản phẩm | `title`, `images` (src, caption) |
| 📱 **`phone-mockup`** | Review | Khung mô phỏng điện thoại chạy ảnh chụp màn hình | `title`, `screenSrc`, `caption` |

---

## 🚀 Cài đặt & Bắt đầu nhanh

### 1. Yêu cầu hệ thống
- **Node.js**: Phiên bản 22 trở lên (`node --version`).
- **FFmpeg & FFprobe**: Đã cài đặt và có trong `PATH`.
  - *Ubuntu/Linux:* `sudo apt update && sudo apt install -y ffmpeg`
  - *macOS:* `brew install ffmpeg`
  - *Windows:* `winget install Gyan.FFmpeg`

### 2. Cài đặt mã nguồn

```bash
git clone https://github.com/Cuongyd196/auto-video-gen.git
cd auto-video-gen

# Cài đặt dependencies
npm install

# Kiểm tra TypeScript và kiểm thử toàn bộ hệ thống
npx tsc --noEmit
npm test
```

### 3. Cấu hình môi trường

```bash
cp .env.example .env.local
```
*(Mặc định đã chạy Edge TTS 0đ miễn phí, không bắt buộc phải có API key để render).*

---

## 💻 Hướng dẫn sử dụng (How To Use)

### 1. Sử dụng Giao diện Web Studio & Timeline Editor (Khuyên dùng)

Khởi động giao diện web cục bộ:
```bash
npm run web
# hoặc: npm start
```
Mở trình duyệt truy cập `http://localhost:3000`:
- **Chế độ Tạo Video Mới:** Dán link bài báo / link GitHub, bấm "Bắt Đầu Tạo Video Ngay".
- **Chế độ Timeline Editor:** Xem trước video tỉ lệ 9:16 trong khung điện thoại, tua playhead theo thời gian thực, kéo dãn cắt gọt clip trên Timeline đa track, sửa lời thoại và bấm **Re-TTS riêng cho từng cảnh**.

---

### 2. Thu thập tin tức RSS và tạo video hàng loạt (M7)

```bash
# 1. Quét danh sách bài viết mới từ các nguồn RSS (VnExpress, Tuổi Trẻ, GenK...)
npm run ingest -- --list

# 2. Chọn một bài cụ thể theo số thứ tự để làm video:
npm run ingest -- --pick 1

# 3. Chạy hàng đợi Batch tự động tạo video cho 3 bài liên tiếp:
npm run ingest -- --batch 3
```

---

### 3. Tạo kịch bản tự động bằng LLM trong dòng lệnh (M4)

```bash
# Từ URL bài báo
npm run script -- https://vnexpress.net/... --preset news_45 --out output/tin-moi

# Từ file văn bản cục bộ
npm run script -- path/to/article.txt --preset review_60 --out output/review-sp

# Bỏ qua bước xác nhận số liệu để render tự động:
npm run script -- "Đánh giá chip M5" --yes
```

---

### 4. Chạy Pipeline Render kịch bản có sẵn

```bash
npm run pipeline -- tests/fixtures/sample-script-no-image.json
```

**Thành phẩm tạo ra trong thư mục `output/<slug>/`:**
- 🎬 `video.mp4`: Video dọc 1080×1920 30fps H.264/AAC.
- 🖼️ `cover.png`: Ảnh bìa thumbnail dọc 9:16 cho TikTok.
- 📋 `publish.md`: Checklist và nội dung bài đăng TikTok kèm 4 hashtag và nhãn AI.
- 💬 `captions.srt` & `captions.json`: File phụ đề chuẩn hóa.
- 🎙️ `voice.mp3`: File âm thanh giọng đọc đã mix BGM và SFX hoàn chỉnh.

---

### 5. Nhập phụ đề SRT từ bên ngoài (M1)

```bash
npm run captions:import -- output/<slug> path/to/custom.srt
```

---

## 🧪 Kiểm thử và Đảm bảo chất lượng (QA)

Repository được bảo vệ bởi bộ kiểm thử tự động toàn diện:
- `npx tsc --noEmit`: 0 lỗi TypeScript strict mode.
- `npm test`: **26 test suites, 154 unit & integration tests PASS 100%**.
- Tích hợp GitHub Actions CI tự động kiểm tra code trên mỗi nhánh.

---

## 📄 Bản quyền (License)

Dự án phát hành theo giấy phép [MIT](LICENSE). Giữ nguyên ghi công tác giả gốc `Cuongyd196` và `hoquanghai`.
Cung cấp giải pháp tự động hóa video nguồn mở cho cộng đồng sáng tạo nội dung Việt Nam.
