# Context Handover Brief — Auto_GenVid (Mở rộng theo PRD2)

> **Dành cho AI Agent tiếp nhận dự án.**  
> Ngày cập nhật: 24/10/2026.  
> Trạng thái hiện tại: **Đã hoàn thành 100% Milestone M0 (Audit), M1 (Caption & SRT), M2 (Media thật)** trên nhánh `feat/m2-media`.

---

## 1. Mục tiêu chính của dự án

- **Bản chất dự án:** Mở rộng repository nguồn mở **Auto_GenVid** (`https://github.com/MaiPhuc1506/Auto_GenVid.git`, bản fork từ `Cuongyd196/auto-video-gen`, gốc `hoquanghai/Auto-Create-Video`, giấy phép **MIT**).
- **Mục tiêu sản phẩm:** Tạo công cụ tự động hoá toàn diện từ một chủ đề / URL bài báo / file `.txt` thành **video ngắn định dạng dọc 9:16 (1080×1920 30fps/60fps)** tối ưu cho **TikTok, YouTube Shorts, Facebook Reels**.
- **Tính năng cốt lõi:**
  - Tổng hợp giọng đọc tiếng Việt qua nhiều TTS providers (Edge TTS miễn phí, LucyLab voice cloning, Vbee, ElevenLabs).
  - Ghép hiệu ứng âm thanh SFX tự động và sắp tới là BGM có ducking theo giọng nói.
  - Render đồ hoạ chuyển động (Motion Graphics) bằng công nghệ web: HTML5, CSS3, GSAP animation và chụp frame bằng Puppeteer/HyperFrames, encode bằng FFmpeg.
  - Phụ đề karaoke hiển thị theo từng từ (word-level sync), nhập/xuất file SRT chuẩn UTF-8.
  - Quản lý media thật: ảnh/video stock (Pexels, Pixabay), chụp ảnh màn hình bài báo tự động qua Puppeteer, hiệu ứng Ken Burns mượt mà và quản lý credit/license trong `media.json`.
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
- **Kiểm thử (Test Runner):** [`Vitest`](https://vitest.dev/) (`^4.1.5`) với 18 test suites (**86/86 tests passed**, mock HTTP qua `nock`).
- **Phụ thuộc âm thanh & mạng:** `edge-tts-universal`, `puppeteer-core`, `axios`, `dotenv`, `p-limit`.

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
│   ├── media/              # Module Quản lý Media Assets (M2)
│   │   ├── stock-provider.ts  # StockProvider (Pexels, Pixabay, FakeStockProvider)
│   │   ├── screenshot.ts      # Chụp ảnh URL web tự động bằng Puppeteer
│   │   └── media-manager.ts   # Tải media, quản lý crop/fit/fx, xuất media.json
│   ├── config.ts           # Đọc & validate biến môi trường (.env.local)
│   ├── server.ts           # Server Express xem trước composition
│   ├── render/
│   │   ├── script-schema.ts      # Zod schema cho ScriptSchema (captions & media tùy chọn)
│   │   ├── html-composer.ts      # Sinh DOM HTML, CSS, nhúng timeline GSAP & captions & media
│   │   ├── hyperframes-runner.ts # Wrapper gọi hyperframes CLI
│   │   └── templates/            # base.html.tmpl, animations.js, styles.css, styles.light-pro.css
│   ├── tts/                # Edge TTS, LucyLab, ElevenLabs, Vbee clients
│   ├── assets/             # audio-tools.ts (FFmpeg), sfx-selector.ts, image-fetcher.ts
│   └── utils/              # logger.ts, slug.ts, script-generator.ts
├── tests/                  # 18 file Vitest (*.test.ts)
└── output/                 # Thư mục chứa video thành phẩm theo slug
```

---

## 3. Những việc đã hoàn thành

### 3.1. Thiết lập Agent Kit (Bước 1 — nhánh `chore/agent-kit`)
- Tạo quy tắc [`AGENTS.md`](../AGENTS.md) và [`CLAUDE.md`](../CLAUDE.md) theo mục B2 của `PRD2.md`.
- Tạo đầy đủ 9 skills mới vào cả hai thư mục `.claude/skills/` và `.agents/skills/` (`repo-audit`, `schema-evolution`, `hyperframes-templates`, `captions-timing`, `media-assets`, `llm-script`, `audio-polish`, `web-timeline-editor`, `qa-verify`), giữ nguyên skill `create-news-video`.
- Đã commit trên nhánh `chore/agent-kit` (`ff39bc3`).

### 3.2. Milestone M0 — Audit và Baseline (Bước 3 — nhánh `feat/m0-audit`)
- **Tài liệu Audit:** Hoàn thành [`docs/audit.md`](audit.md) làm rõ luồng chạy và giải quyết triệt để 5 điểm mâu thuẫn tài liệu (tên template, SRT, schema path, số lượng tests, BGM vs SFX).
- **Đồng bộ tài liệu:** Đã cập nhật chính xác [`README.md`](../README.md), [`README.full.md`](../README.full.md), [`README.en.md`](../README.en.md).
- **Baseline kiểm thử & Render thực tế:** `npx tsc --noEmit` (0 lỗi), `npm test` (60/60 tests passed), render baseline `output/baseline-test/video.mp4` thành công.

### 3.3. Milestone M1 — Caption và SRT (Bước 4 — nhánh `feat/m1-captions`)
- **Trích xuất nguồn thời gian (Word Timings):** WordBoundary của Edge TTS (độ lệch 0ms ≤ 150ms), LucyLab SRT parser, fallback phân bổ theo ký tự cho ElevenLabs/Vbee.
- **Bộ gom từ thành Cue (`src/captions/grouper.ts`):** 2–6 từ/cue, tối đa 2 dòng, ngắt dấu câu, min ~400ms, offset video chuẩn xác.
- **Hiển thị Motion Graphics bằng HTML/CSS/GSAP:** Caption layer với active-word pop-up & glow, safe-zone TikTok (~20% từ đáy), hỗ trợ cả `dark-neon` và `light-pro`.
- **Xuất & Nhập SRT:** Tự động xuất `captions.srt` & `captions.json`; lệnh CLI `npm run captions:import -- <output-dir> <file.srt>`.
- **Kết quả:** 15 test files, **77/77 tests passed**, render mẫu `output/m1-sample/video.mp4` (106.4 MB, 31.0s, 1080×1920 30fps).

### 3.4. Milestone M2 — Media thật (Bước 5 — nhánh `feat/m2-media`)
- **Schema Zod:** Thêm trường `media` tùy chọn cho mỗi cảnh: `type` (`image` | `video` | `screenshot`), `src`, `fit` (`cover` | `contain`), `fx` (`none` | `kenburns`), `credit`, `license`. Thêm `useOgImage: boolean` (mặc định false).
- **Stock Provider Interface:** [`src/media/stock-provider.ts`](../src/media/stock-provider.ts) gồm `PexelsProvider`, `PixabayProvider`, và `FakeStockProvider` cho unit test (không gọi API thật).
- **Chụp ảnh màn hình URL:** [`src/media/screenshot.ts`](../src/media/screenshot.ts) tự động tìm kiếm Chromium của HyperFrames và chụp ảnh độ nét cao tỉ lệ 9:16 bằng `puppeteer-core`.
- **Quản lý Media Asset & Bản quyền:** [`src/media/media-manager.ts`](../src/media/media-manager.ts) tải/sao chép media về `output/<slug>/media/`, tự động sinh manifest bản quyền `media.json`. Cảnh không có media hoặc lỗi tải tự động rơi về nền gradient mặc định.
- **Hiển thị & Animation:** DOM media layer trong [`src/render/html-composer.ts`](../src/render/html-composer.ts), hiệu ứng Ken Burns mượt mà và huy hiệu nguồn credit góc màn hình.
- **Kết quả nghiệm thu M2:**
  - `npx tsc --noEmit`: 0 lỗi.
  - `npm test`: 18 test files, **86/86 tests passed 100%**.
  - Render video mẫu có media: `output/m2-sample/video.mp4` (106.8 MB, 31.0s, 1080×1920 30fps H.264, audio AAC stereo 48000Hz, ffprobe kiểm tra đạt chuẩn).

---

## 4. Trạng thái hiện tại của dự án

- **Nhánh Git hiện tại:** `feat/m2-media`.
- **Trạng thái mã nguồn:** 0 lỗi TypeScript, 86/86 tests Vitest passed.
- **Tiêu chí chấp nhận M2:** Đạt 100%:
  1. Cảnh có media hiển thị đúng 9:16 (`cover`/`contain`), hiệu ứng Ken Burns mượt không giật.
  2. File `media.json` đầy đủ thông tin nguồn, tác giả, giấy phép.
  3. Cờ `og:image` chỉ bật khi có yêu cầu rõ ràng, có cảnh báo bản quyền.
  4. Script cũ không có media vẫn render bình thường (tương thích ngược hoàn toàn).

---

## 5. Bước tiếp theo cần làm ngay (Immediate Next Step: Milestone M3)

Nhiệm vụ tiếp theo là **Milestone M3 (Template review & Themes)** theo đúng prompt **P-M3** trong `PRD2.md` Mục B4:

1. **Khởi tạo nhánh làm việc mới:**
   ```bash
   git checkout -b feat/m3-review-templates
   ```
2. **Kỹ năng bắt buộc phải đọc trước:**
   - [`.agents/skills/hyperframes-templates/SKILL.md`](../.agents/skills/hyperframes-templates/SKILL.md)
   - [`.agents/skills/schema-evolution/SKILL.md`](../.agents/skills/schema-evolution/SKILL.md)
   - [`.agents/skills/qa-verify/SKILL.md`](../.agents/skills/qa-verify/SKILL.md)
3. **Các hạng mục cần làm ở M3:**
   - Bổ sung 6 templates mới vào discriminated union trong `src/render/script-schema.ts`:
     - `spec-table`: Tên sản phẩm + tối đa 6 dòng thông số (nhãn/giá trị).
     - `pros-cons`: Hai cột ưu/nhược (mỗi cột tối đa 4 ý).
     - `verdict-score`: Điểm (0–10 hoặc 0–100), nhãn kết luận, 1 câu tóm tắt.
     - `price-tag`: Giá, phiên bản/biến thể, ghi chú nơi bán.
     - `image-gallery`: 1–3 ảnh sản phẩm, chú thích.
     - `phone-mockup`: Ảnh/screenshot đặt trong khung điện thoại.
   - Viết HTML composer, timeline GSAP animation, CSS cho cả hai theme (`styles.css` và `styles.light-pro.css`).
   - Cập nhật skill `create-news-video` để LLM biết khi nào chọn template mới.
   - Thêm fixture mẫu trong `tests/fixtures/`.
   - Viết test Vitest và kiểm tra chụp frame kiểm chứng ở cả hai theme.
4. **Quy trình nghiệm thu:**
   - Chạy `npx tsc --noEmit` và `npm test`.
   - Render video mẫu và kiểm tra thông số bằng `ffprobe`.
   - Cập nhật tiếp vào `docs/handover-brief.md`.
