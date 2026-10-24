<a id="top"></a>

<div align="center">

# 🎬 Auto Video Gen (Auto_GenVid)

### 🚀 Biến URL bài báo & Repo GitHub thành Video ngắn 9:16 chuyên nghiệp

**1 câu lệnh với AI Coding · 0đ Voice (Edge TTS) · Không cần edit thủ công · Sẵn sàng đăng TikTok, Reels, Shorts**

[![Stars](https://img.shields.io/github/stars/Cuongyd196/auto-video-gen?style=for-the-badge&logo=github&color=yellow)](https://github.com/Cuongyd196/auto-video-gen/stargazers)
[![Forks](https://img.shields.io/github/forks/Cuongyd196/auto-video-gen?style=for-the-badge&logo=github&color=blue)](https://github.com/Cuongyd196/auto-video-gen/network/members)
[![License](https://img.shields.io/github/license/Cuongyd196/auto-video-gen?style=for-the-badge&color=green)](LICENSE)
[![Node](https://img.shields.io/badge/node-22%2B-brightgreen?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5%2B-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[**📖 Tài liệu chi tiết (Full Docs)**](README.full.md) · [**🇬🇧 English Docs**](README.en.md) · [**📺 Xem Demo**](https://youtube.com/shorts/X8P_5tsHy4o) · [**🚀 Cài đặt nhanh**](#-cài-đặt--bắt-đầu-nhanh) · [**⚙️ Cách hoạt động**](#-cơ-chế-hoạt-động-how-it-works)

</div>

> 💡 **Bạn cần tài liệu chuyên sâu?**
> Xem [👉 README.full.md](README.full.md) để biết đầy đủ kiến trúc, Zod JSON Schema, bảng tính chi phí và xử lý sự cố.

---

## 🎥 Xem Demo Video Hoàn Thiện

Toàn bộ video dưới đây được tạo **100% tự động** từ kịch bản text — Voice TTS + Visuals HTML/CSS + Hiệu ứng SFX, không qua bước edit video thủ công:

| 🕸️ Demo CodeGraph | 🖥️ Demo OpenScreen |
| :---: | :---: |
| [![CodeGraph Demo](https://img.youtube.com/vi/X8P_5tsHy4o/0.jpg)](https://youtube.com/shorts/X8P_5tsHy4o) | [![OpenScreen Demo](https://img.youtube.com/vi/5noesbFXK0k/0.jpg)](https://youtube.com/shorts/5noesbFXK0k) |
| [📺 Xem Shorts](https://youtube.com/shorts/X8P_5tsHy4o) | [📺 Xem Shorts](https://youtube.com/shorts/5noesbFXK0k) |

🔗 Xem thêm tại: [Facebook Reels](https://www.facebook.com/reel/2549425188850979) · [TikTok @cuongit96](https://www.tiktok.com/@cuongit96/video/7661226482458561799)

---

## ⚙️ Cơ chế hoạt động (How It Works)

Hệ thống hoạt động theo pipeline tự động hóa 8 bước độc lập và lưu vết (idempotent), điều phối qua [`src/pipeline.ts`](src/pipeline.ts):

```text
[URL bài báo / Chủ đề / Text]
         │
         ▼ (Bước 1-2: AI Agent phân tích & chia cảnh)
[script.json + script.txt]
         │
         ├───► [Tải ảnh đại diện bài báo: images/bg.jpg] (Bước 3)
         │
         └───► [Tổng hợp giọng đọc TTS từng cảnh: voice/scene-*.mp3] (Bước 4)
                    │  (Tự động tái sử dụng nếu file audio đã tồn tại)
                    ▼
         [Ghép chuỗi audio + Mix hiệu ứng âm thanh SFX: voice.mp3] (Bước 5)
                    │
                    ▼
         [Sinh HTML Composition: index.html + styles.css + animations.js] (Bước 6)
                    │  (Layout 9:16 bằng HTML5, CSS3 và GSAP timeline)
                    ▼
         [HyperFrames Renderer: Puppeteer chụp frame + FFmpeg Encode] (Bước 7)
                    │
                    ▼
         [Video hoàn thiện: output/<slug>/video.mp4 (1080x1920 30fps)] (Bước 8)
```

### 📐 6 Template Motion Graphics dựng sẵn

Định nghĩa trong schema [`src/render/script-schema.ts`](src/render/script-schema.ts) và sinh mã tại [`src/render/html-composer.ts`](src/render/html-composer.ts):

| Template | Mục đích sử dụng | Dữ liệu chính (`templateData`) |
|---|---|---|
| 🚨 **`hook`** | Cảnh mở đầu thu hút người xem trong 3 giây đầu | `headline`, `subhead`, `bgSrc`, `kenBurns` |
| 🔀 **`comparison`** | So sánh 2 thông số hoặc 2 phương án đối lập | `left` (label, value), `right` (label, value, winner) |
| 📊 **`stat-hero`** | Nhấn mạnh một con số thống kê đột phá lớn | `value` (số to), `label`, `context` (ngữ cảnh) |
| 📋 **`feature-list`** | Danh sách điểm nhấn, gạch đầu dòng tính năng | `title`, `bullets` (mảng 1–4 dòng), `icon` |
| 💬 **`callout`** | Trích dẫn câu nói, phát biểu, nhận định nổi bật | `statement` (câu trích dẫn), `tag` |
| 🎬 **`outro`** | Thẻ kêu gọi bấm follow kênh TikTok + nguồn | `ctaTop`, `channelName`, `source` |

### ⚡ Cơ chế Idempotent Caching (Tiết kiệm chi phí & thời gian)

- Khi render lại hoặc đổi giao diện CSS/text, nếu file audio `voice/scene-<id>.mp3` đã có sẵn, pipeline sẽ **tự động tái sử dụng audio cũ** mà không gọi lại TTS API.
- Nếu muốn thu âm lại một cảnh cụ thể, bạn chỉ cần xóa file `.mp3` của cảnh đó trong thư mục `voice/` rồi chạy lại lệnh.

---

## 🚀 Cài đặt & Bắt đầu nhanh

### 1. Yêu cầu hệ thống

- **Node.js**: Phiên bản 22 trở lên (`node --version`).
- **FFmpeg & FFprobe**: Cần có sẵn trong `PATH` máy tính.
  - *Ubuntu/Linux:* `sudo apt update && sudo apt install -y ffmpeg`
  - *macOS:* `brew install ffmpeg`
  - *Windows:* `winget install Gyan.FFmpeg`

### 2. Cài đặt mã nguồn

```bash
# Clone repository
git clone https://github.com/Cuongyd196/auto-video-gen.git
cd auto-video-gen

# Cài đặt các gói phụ thuộc
npm install

# Kiểm tra môi trường & kiểm thử
npx tsc --noEmit  # Biên dịch TypeScript kiểm tra lỗi
npm test          # Toàn bộ 60 unit tests phải PASS
```

### 3. Thiết lập biến môi trường

```bash
cp .env.example .env.local
```

> 💡 **Mặc định dự án sử dụng Edge TTS hoàn toàn miễn phí 0đ, không cần API Key!** Bạn có thể render video ngay lập tức mà không cần tài khoản hay thẻ tín dụng.

---

## 💻 Cách sử dụng (How To Use)

### 👉 Cách 1: Tự động hoàn toàn bằng AI Agent (Khuyên dùng)

Dự án hỗ trợ sẵn bộ Skill cho Coding Agent:

#### Trong Google Antigravity IDE:
Tại khung trò chuyện của agent, gõ lệnh:
```text
/create-news-video https://vnexpress.net/bai-viet-cong-nghe-moi
```

#### Trong Claude Code:
Mở terminal và gõ:
```bash
claude
# Tại dấu nhắc lệnh, gõ:
/create-news-video https://vnexpress.net/bai-viet-cong-nghe-moi
```

**Quy trình AI tự động thực hiện:**
1. Trích xuất nội dung từ bài báo hoặc file `.txt`.
2. Tạo kịch bản chuẩn ngữ âm tiếng Việt, chọn 5–8 cảnh với template trực quan phù hợp.
3. Chạy pipeline: tổng hợp voice + ghép SFX + HyperFrames render MP4.
4. Xuất video hoàn thiện cùng file `caption.txt` chứa sẵn hashtag cho TikTok.

---

### 👉 Cách 2: Chạy trực tiếp từ dòng lệnh (CLI)

Bạn có thể chạy pipeline với file kịch bản có sẵn:

```bash
# Render kịch bản mẫu có sẵn
npm run pipeline -- tests/fixtures/sample-script-no-image.json
```

**Hoặc tạo một video mới:**
1. Tạo thư mục chứa video: `mkdir -p output/tin-cong-nghe`
2. Tạo file `output/tin-cong-nghe/script.json` (tham khảo cấu trúc trong `tests/fixtures/sample-script-no-image.json`).
3. Khởi chạy pipeline:
   ```bash
   npm run pipeline -- output/tin-cong-nghe/script.json
   ```

**Kết quả sau khi hoàn thành:**
- 🎬 `output/<slug>/video.mp4`: Video hoàn thiện 1080×1920 (chuẩn 9:16, 30fps).
- 🎙️ `output/<slug>/voice.mp3`: File âm thanh đã ghép hoàn chỉnh (có thể nhập vào CapCut).
- 📝 `output/<slug>/script.txt`: Nội dung kịch bản văn bản.
- 💬 `output/<slug>/voice/*.srt`: Các file phụ đề SRT cho từng cảnh.

---

### 👉 Cách 3: Chế độ Rerender (Sửa giao diện, giữ nguyên giọng đọc)

Nếu bạn chỉ chỉnh sửa CSS, font chữ, bố cục template hoặc thêm hiệu ứng mà **không muốn thu âm lại giọng đọc (tránh tốn chi phí và thời gian)**:

```bash
npm run rerender -- output/<slug>
```
Lệnh này sẽ dùng lại toàn bộ audio trong thư mục `voice/` và chỉ thực hiện render lại phần hình ảnh qua HyperFrames.

---

### 👉 Cách 4: Chạy máy chủ xem trước nội bộ (Web Server)

Để kiểm tra giao diện và layout qua trình duyệt:

```bash
npm run serve
# hoặc
npm run web
```
Truy cập `http://localhost:3000` để xem trực tiếp các composition.

---

## 🎙️ Lựa chọn & Cấu hình giọng đọc (TTS)

Thiết lập biến `TTS_PROVIDER` trong file `.env.local`:

| Nhà cung cấp | Giá trị `TTS_PROVIDER` | Chi phí | Đặc điểm |
| :--- | :--- | :--- | :--- |
| **Edge TTS** *(Mặc định)* | `edge-tts` | **0đ (Miễn phí)** | Giọng đọc tự nhiên của Microsoft Edge (`vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural`), không cần API key. |
| **LucyLab** | `lucylab` | ~25k / 1M ký tự | Voice cloning tiếng Việt chất lượng cao, tự động xuất kèm phụ đề SRT. |
| **Vbee** | `vbee` | Theo gói Vbee | Giọng đọc truyền cảm, phong cách phát thanh viên đài truyền hình Việt Nam. |
| **ElevenLabs** | `elevenlabs` | Trả phí ElevenLabs | Giọng đọc điện ảnh chuẩn studio quốc tế. |

**Tùy chỉnh giọng Edge TTS trong `.env.local`:**
```dotenv
TTS_PROVIDER=edge-tts
EDGE_TTS_VOICE=vi-VN-HoaiMyNeural   # Hoặc vi-VN-NamMinhNeural
EDGE_TTS_RATE=+0%                  # Tốc độ đọc: +10%, -5%...
EDGE_TTS_PITCH=+0Hz                # Cao độ
```

---

## 🎨 Tùy biến Theme & Nhận diện kênh TikTok

### 1. Chọn Theme màu video
Chỉnh sửa trong `.env.local`:
- `VIDEO_THEME=dark-neon`: Nền tối công nghệ, điểm nhấn neon tím/xanh ngọc (mặc định).
- `VIDEO_THEME=light-pro`: Nền sáng hiện đại, thanh lịch cho tin tức kinh doanh, giáo dục.

### 2. Tùy biến thẻ Outro TikTok (Kênh của bạn)
```dotenv
TIKTOK_DISPLAY_NAME="Kênh Công Nghệ"
TIKTOK_HANDLE="@congnghe24h"
TIKTOK_AVATAR_URL="https://example.com/avatar.jpg"
```

---

## 📂 Cấu trúc thư mục dự án

```text
auto-video-gen/
├── .agents/skills/        # Skill cho Google Antigravity IDE
├── .claude/skills/        # Skill cho Anthropic Claude Code
├── src/
│   ├── cli.ts             # Điểm vào dòng lệnh (CLI entrypoint)
│   ├── pipeline.ts        # Điều phối luồng xử lý 8 bước
│   ├── config.ts          # Đọc & validate cấu hình .env.local
│   ├── server.ts          # Web server phục vụ xem trước composition
│   ├── render/
│   │   ├── script-schema.ts      # Schema Zod định nghĩa kịch bản & 6 template
│   │   ├── html-composer.ts      # Tạo DOM HTML, CSS và GSAP timeline
│   │   ├── hyperframes-runner.ts # Gọi engine HyperFrames render MP4
│   │   └── templates/            # File HTML mẫu cho 6 template
│   ├── tts/               # Các client kết nối TTS (Edge TTS, LucyLab, Vbee, ElevenLabs)
│   ├── assets/
│   │   ├── audio-tools.ts        # Tiện ích FFmpeg cắt nối âm thanh
│   │   ├── sfx-selector.ts       # Bộ chọn hiệu ứng âm thanh SFX tự động
│   │   └── image-fetcher.ts      # Tải ảnh đại diện og:image
│   └── utils/             # Tiện ích logger, tạo slug...
├── tests/                 # 60 Unit tests với Vitest
├── output/                # Thư mục chứa các dự án video thành phẩm
├── README.md              # 📖 Hướng dẫn sử dụng nhanh
├── README.full.md         # 📚 Hướng dẫn kỹ thuật chuyên sâu
└── LICENSE                # Giấy phép nguồn mở MIT
```

---

## 🧪 Kiểm thử và chất lượng mã nguồn

```bash
# Kiểm tra tĩnh kiểu dữ liệu (Strict TypeScript)
npx tsc --noEmit

# Chạy toàn bộ 60 unit tests
npm test
```

---

## 📜 License & Lời cảm ơn

- Dự án phát hành theo giấy phép nguồn mở [MIT](LICENSE).
- Phát triển mở rộng từ dự án gốc của tác giả [Ho Quang Hai](https://github.com/hoquanghai/Auto-Create-Video).
- Bản cập nhật & duy trì bởi [CuongIT](https://www.facebook.com/cuongit96).
