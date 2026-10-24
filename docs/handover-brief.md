# Context Handover Brief — Auto_GenVid (Mở rộng theo PRD2)

> **Dành cho AI Agent tiếp nhận dự án.**  
> Ngày cập nhật: 24/10/2026.  
> Trạng thái hiện tại: **Đã hoàn thành 100% Milestone M0 (Audit & Baseline) và Milestone M1 (Caption & SRT)** trên nhánh `feat/m1-captions`.

---

## 1. Mục tiêu chính của dự án

- **Bản chất dự án:** Mở rộng repository nguồn mở **Auto_GenVid** (`https://github.com/MaiPhuc1506/Auto_GenVid.git`, bản fork từ `Cuongyd196/auto-video-gen`, gốc `hoquanghai/Auto-Create-Video`, giấy phép **MIT**).
- **Mục tiêu sản phẩm:** Tạo công cụ tự động hoá toàn diện từ một chủ đề / URL bài báo / file `.txt` thành **video ngắn định dạng dọc 9:16 (1080×1920 30fps/60fps)** tối ưu cho **TikTok, YouTube Shorts, Facebook Reels**.
- **Tính năng cốt lõi:**
  - Tổng hợp giọng đọc tiếng Việt qua nhiều TTS providers (Edge TTS miễn phí, LucyLab voice cloning, Vbee, ElevenLabs).
  - Ghép hiệu ứng âm thanh SFX tự động và sắp tới là BGM có ducking theo giọng nói.
  - Render đồ hoạ chuyển động (Motion Graphics) bằng công nghệ web: HTML5, CSS3, GSAP animation và chụp frame bằng Puppeteer/HyperFrames, encode bằng FFmpeg.
  - Phụ đề karaoke hiển thị theo từng từ (word-level sync), nhập/xuất file SRT chuẩn UTF-8.
  - Lộ trình phát triển qua 8 milestone: **M0 → M7** (quy định chi tiết tại [`PRD2.md`](../PRD2.md)).
  - **Quy tắc bất di bất dịch:** Làm việc **trực tiếp trên TypeScript/Node.js**, KHÔNG viết lại bằng ngôn ngữ khác, giữ nguyên bản quyền/ghi công tác giả gốc và đảm bảo **tương thích ngược 100%** với các file `script.json` phiên bản cũ.

---

## 2. Kiến trúc & Công nghệ đang sử dụng

### 2.1. Tech Stack
- **Ngôn ngữ & Runtime:** TypeScript strict, Node.js ≥ 22 (đang chạy Node `v24.20.0`, npm `11.19.0`), ESM (`"type": "module"`).
- **Video Rendering Engine:**
  - [`HyperFrames`](https://hyperframes.heygen.com) (`^0.4.34`): Điều khiển Chromium qua Puppeteer chụp frame độ phân giải cao và gọi FFmpeg encode ra video MP4.
  - [`GSAP`](https://gsap.com/) (`^3.14.2`): Quản lý timeline animation mượt mà cho các phần tử DOM.
  - [`FFmpeg`](https://ffmpeg.org/): Nối audio, mix SFX, encode video H.264/AAC.
- **Validation & Data Schema:** [`Zod`](https://zod.dev/) (`^4.3.6`) định nghĩa `ScriptSchema` và 6 template layout.
- **Kiểm thử (Test Runner):** [`Vitest`](https://vitest.dev/) (`^4.1.5`) với 15 test suites (**77/77 tests passed**, mock HTTP qua `nock`).
- **Phụ thuộc âm thanh:** `edge-tts-universal`, `axios`, `dotenv`, `p-limit`.

### 2.2. Cấu trúc thư mục chính
```text
AUTO_GEN_VIDEO/
├── PRD2.md                 # ★ NGUỒN SỰ THẬT DUY NHẤT VỀ YÊU CẦU & KỸ THUẬT
├── PRD.md                  # Tài liệu yêu cầu gốc (US-1..US-11)
├── AGENTS.md               # Quy tắc bắt buộc cho AI Agent khi lập trình
├── CLAUDE.md               # Quy tắc cho Claude Code
├── .agents/skills/         # Bộ 10 skills cho Google Antigravity IDE
├── .claude/skills/         # Bộ 10 skills cho Anthropic Claude Code
├── docs/
│   ├── audit.md            # Báo cáo audit hiện trạng & giải quyết mâu thuẫn (M0)
│   └── handover-brief.md   # Bản tóm tắt chuyển giao này (cập nhật sau mỗi MS)
├── src/
│   ├── cli.ts              # Điểm vào CLI: npm run pipeline -- <script.json>
│   ├── pipeline.ts         # Điều phối luồng 8 bước từ kịch bản ra video MP4
│   ├── captions/           # Module Caption & SRT (M1)
│   │   ├── types.ts        # Định nghĩa TimedWord, CaptionCue, formatSrtTime, parseSrtTime
│   │   ├── srt.ts          # generateSrt, parseSrt (chịu BOM, CRLF, multi-line)
│   │   ├── grouper.ts      # Gom 2–6 từ/cue, min duration 0.4s, ngắt dấu câu
│   │   ├── estimator.ts    # Fallback phân bổ ký tự cho provider không có timestamp
│   │   └── import-cli.ts   # npm run captions:import -- <output-dir> <file.srt>
│   ├── config.ts           # Đọc & validate biến môi trường (.env.local)
│   ├── server.ts           # Server Express xem trước composition
│   ├── render/
│   │   ├── script-schema.ts      # Zod schema cho ScriptSchema (kèm captions tùy chọn)
│   │   ├── html-composer.ts      # Sinh DOM HTML, CSS, nhúng timeline GSAP & captions
│   │   ├── hyperframes-runner.ts # Wrapper gọi hyperframes CLI
│   │   └── templates/            # base.html.tmpl, animations.js, styles.css, styles.light-pro.css
│   ├── tts/                # Edge TTS, LucyLab, ElevenLabs, Vbee clients (hỗ trợ TtsTimingResult)
│   ├── assets/             # audio-tools.ts (FFmpeg), sfx-selector.ts, image-fetcher.ts
│   └── utils/              # logger.ts, slug.ts, script-generator.ts
├── tests/                  # 15 file Vitest (*.test.ts)
└── output/                 # Thư mục chứa video thành phẩm theo slug
```

---

## 3. Những việc đã hoàn thành

### 3.1. Thiết lập Agent Kit (Bước 1 — nhánh `chore/agent-kit`)
- Tạo quy tắc [`AGENTS.md`](../AGENTS.md) và [`CLAUDE.md`](../CLAUDE.md) theo mục B2 của `PRD2.md`.
- Tạo đầy đủ 9 skills mới vào cả hai thư mục `.claude/skills/` và `.agents/skills/` (`repo-audit`, `schema-evolution`, `hyperframes-templates`, `captions-timing`, `media-assets`, `llm-script`, `audio-polish`, `web-timeline-editor`, `qa-verify`), giữ nguyên skill `create-news-video`.
- Đã commit trên nhánh `chore/agent-kit` (`ff39bc3`).

### 3.2. Milestone M0 — Audit và Baseline (Bước 3 — nhánh `feat/m0-audit`)
- **Tài liệu Audit:** Hoàn thành [`docs/audit.md`](audit.md) làm rõ luồng chạy và giải quyết triệt để 5 điểm mâu thuẫn tài liệu:
  1. *Tên template:* Mã nguồn thực tế có đúng 6 templates: `hook`, `comparison`, `stat-hero`, `feature-list`, `callout`, `outro`.
  2. *Hỗ trợ SRT:* Cả Edge TTS và LucyLab đều tạo được SRT cho từng cảnh; ElevenLabs và Vbee không có SRT.
  3. *Đường dẫn Schema:* Schema duy nhất nằm tại `src/render/script-schema.ts`.
  4. *Số lượng Unit Tests:* Chính xác là 60 tests passed ở baseline.
  5. *BGM vs SFX:* Hiện tại chỉ có SFX; tính năng BGM + ducking sẽ phát triển ở M5.
- **Đồng bộ tài liệu:** Đã cập nhật chính xác [`README.md`](../README.md), [`README.full.md`](../README.full.md), [`README.en.md`](../README.en.md).
- **Baseline kiểm thử & Render thực tế:**
  - `npx tsc --noEmit`: 0 lỗi.
  - `npm test`: 11/11 files passed, 60/60 tests passed.
  - Render pipeline mẫu baseline: `output/baseline-test/video.mp4` (1080×1920, H.264/AAC).

### 3.3. Milestone M1 — Caption và SRT (Bước 4 — nhánh `feat/m1-captions`)
- **Trích xuất nguồn thời gian (Word Timings):**
  - Edge TTS: Tận dụng `WordBoundary` của `edge-tts-universal` (chuyển đổi đơn vị ticks 100ns sang ms, độ lệch 0ms ≤ 150ms).
  - LucyLab: Tự động phân tích file SRT tải về từ server.
  - ElevenLabs / Vbee: Bộ ước lượng tỷ lệ theo ký tự (`estimateWordTimings`), gắn cờ `accuracy: "low"`.
- **Bộ gom từ thành Cue (`src/captions/grouper.ts`):**
  - Gom 2–6 từ/cue, tối đa 2 dòng, ngắt theo dấu câu, tối thiểu ~400ms/cue, căn chỉnh offset chính xác theo thời điểm bắt đầu cảnh trong video.
- **Hiển thị Motion Graphics bằng HTML/CSS/GSAP:**
  - Tích hợp lớp Caption vào `src/render/html-composer.ts` và `src/render/templates/animations.js`.
  - Hiệu ứng highlight chữ đang nói (active word pop-up & glow), nằm trong vùng an toàn TikTok (safe-zone cách đáy ~20%).
  - Hỗ trợ đầy đủ cho cả hai theme: `styles.css` (dark-neon với chữ trắng viền đen, highlight vàng neon) và `styles.light-pro.css` (chữ xanh đậm viền trắng, highlight xanh dương).
- **Xuất & Nhập SRT:**
  - Tự động xuất `captions.srt` và `captions.json` toàn bộ video chuẩn UTF-8 sau khi hoàn thành audio.
  - Lệnh CLI `npm run captions:import -- <output-dir> <file.srt>` cho phép ghi đè phụ đề thủ công, hỗ trợ UTF-8 BOM, CRLF, cue nhiều dòng và tự động cập nhật lại `index.html`.
- **Tương thích ngược & Schema:**
  - Mở rộng `ScriptSchema` với trường tùy chọn `captions?: { enabled: boolean; style: string }`.
  - Kịch bản cũ v1 không có trường này vẫn chạy bình thường (mặc định tắt caption nếu không chỉ định).
- **Kết quả nghiệm thu M1:**
  - `npx tsc --noEmit`: 0 lỗi.
  - `npm test`: 15 test files, **77/77 tests passed 100%**.
  - Render video mẫu thành công: `output/m1-sample/video.mp4` (106.4 MB, 31.0s, 1080×1920 30fps H.264, audio AAC stereo 48000Hz, ffprobe kiểm tra đạt chuẩn).

---

## 4. Trạng thái hiện tại của dự án

- **Nhánh Git hiện tại:** `feat/m1-captions`.
- **Trạng thái mã nguồn:** Biên dịch sạch 0 lỗi TypeScript, 77/77 tests Vitest pass.
- **Tiêu chí chấp nhận M1:** Đạt 100% cả 5 tiêu chí:
  1. Caption nhìn thấy được, bật/tắt được theo cấu hình script.
  2. Độ lệch cue so với từ đọc ≤ 150 ms (thực tế 0 ms trên WordBoundary).
  3. Round-trip cue → SRT → cue giữ nguyên số lượng và thời gian (dung sai ≤ 1 ms).
  4. Parse tốt tiếng Việt có dấu, UTF-8 BOM, CRLF, cue nhiều dòng.
  5. Script cũ không có `captions` vẫn parse và render như trước (tương thích ngược hoàn toàn).

---

## 5. Bước tiếp theo cần làm ngay (Immediate Next Step: Milestone M2)

Nhiệm vụ tiếp theo là **Milestone M2 (Media thật: Ảnh/Video/Screenshot cho từng cảnh)** theo đúng prompt **P-M2** trong `PRD2.md` Mục B4:

1. **Khởi tạo nhánh làm việc mới:**
   ```bash
   git checkout -b feat/m2-media
   ```
2. **Kỹ năng bắt buộc phải đọc trước:**
   - [`.agents/skills/media-assets/SKILL.md`](../.agents/skills/media-assets/SKILL.md)
   - [`.agents/skills/schema-evolution/SKILL.md`](../.agents/skills/schema-evolution/SKILL.md)
   - [`.agents/skills/qa-verify/SKILL.md`](../.agents/skills/qa-verify/SKILL.md)
3. **Các hạng mục cần làm ở M2:**
   - Trường `media` tùy chọn trong mỗi cảnh của schema: `type` (`image` | `video` | `screenshot`), `src`, `fit` (`cover` | `contain`), `fx` (`none` | `kenburns`), `credit`, `license`.
   - `StockProvider` (Pexels / Pixabay) kèm `FakeStockProvider` cho kiểm thử; test bằng `nock`, không gọi API thật.
   - Chụp màn hình URL bài báo bằng Puppeteer (sẵn có qua HyperFrames/Chromium).
   - Tải về `output/<slug>/media/`, ghi `media.json` (nguồn, giấy phép, tác giả).
   - Hiệu ứng Ken Burns cho ảnh tĩnh; cảnh không có media hoặc lỗi tải tự động rơi về nền mặc định, không làm hỏng video.
   - Cờ `og:image` chỉ dùng khi bật rõ ràng kèm cảnh báo bản quyền.
4. **Quy trình nghiệm thu:**
   - Chạy `npx tsc --noEmit` và `npm test`.
   - Render video mẫu có media và kiểm tra thông số bằng `ffprobe`.
   - Cập nhật tiếp vào `docs/handover-brief.md`.
