# Context Handover Brief — Auto_GenVid (Mở rộng theo PRD2)

> **Dành cho AI Agent tiếp nhận dự án.**  
> Ngày cập nhật: 24/10/2026.  
> Trạng thái hiện tại: **Đã hoàn thành 100% Milestone M0 (Audit), M1 (Caption & SRT), M2 (Media thật), M3 (Template review & Themes), M4 (LLM Script & Duyệt kịch bản)** trên nhánh `feat/m4-llm-script`.

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

### 3.5. Milestone M3 — Template review & Themes (nhánh `feat/m3-review-templates`)
- **Mở rộng Schema Zod:** Bổ sung 6 templates mới vào `TemplateData` trong [`src/render/script-schema.ts`](../src/render/script-schema.ts) với validation chặt chẽ:
  - `spec-table`: Tên sản phẩm + tối đa 6 dòng thông số (label/value).
  - `pros-cons`: Hai cột ưu điểm (pros) và nhược điểm (cons), tối đa 4 ý/cột.
  - `verdict-score`: Chấm điểm sản phẩm (0-10 hoặc 0-100), thang điểm, nhãn kết luận và câu tóm tắt.
  - `price-tag`: Giá bán nổi bật, tên sản phẩm, biến thể và ghi chú đại lý.
  - `image-gallery`: Trưng bày 1-3 hình ảnh sản phẩm kèm chú thích.
  - `phone-mockup`: Khung điện thoại dọc 9:16 có dynamic island chứa ảnh screenshot ứng dụng/website.
- **HTML Composer & GSAP Animation:**
  - Viết 6 hàm render inner trong [`src/render/html-composer.ts`](../src/render/html-composer.ts).
  - Cập nhật dispatcher và 6 hàm entrance animation trong [`src/render/templates/animations.js`](../src/render/templates/animations.js) với hiệu ứng stagger, scale pop-in, shimmer sweep.
- **Styling hoàn chỉnh cho cả hai theme:**
  - Cập nhật [`src/render/templates/styles.css`](../src/render/templates/styles.css) (dark-neon).
  - Cập nhật [`src/render/templates/styles.light-pro.css`](../src/render/templates/styles.light-pro.css) (light-pro).
  - Tôn trọng lề an toàn TikTok safe-zone và xử lý xuống dòng/cắt chữ tiếng Việt chuẩn xác.
- **Cập nhật Skill Hướng dẫn AI Agent:**
  - Cập nhật hướng dẫn lựa chọn template review trong [`.agents/skills/create-news-video/SKILL.md`](../.agents/skills/create-news-video/SKILL.md) và [`.claude/skills/create-news-video/SKILL.md`](../.claude/skills/create-news-video/SKILL.md).
- **Kết quả nghiệm thu M3:**
  - `npx tsc --noEmit`: 0 lỗi.
  - `npm test`: 19 test files, **106/106 tests passed 100%** (bao gồm 20 tests mới cho Zod schema validation & render composer).
  - Render video mẫu thực tế: `output/m3-sample/video.mp4` (149.1 MB, 40.4s, 1080×1920 30fps H.264, audio AAC stereo 48000Hz, ffprobe kiểm tra đạt chuẩn).
  - Trích xuất 6 frame ảnh chụp mẫu độ phân giải 1080×1920 tại `output/m3-sample/frames/`.

### 3.6. Milestone M4 — LLM trong code và duyệt kịch bản (nhánh `feat/m4-llm-script`)
- **LLM Provider Interface & Implementations:**
  - Định nghĩa interface `LLMProvider` trong [`src/script/types.ts`](../src/script/types.ts).
  - Triển khai `AnthropicProvider` (Claude 3.5 Haiku/Sonnet), `OpenAiProvider` (OpenAI hoặc tương thích OpenAI: Groq, DeepSeek, Ollama), và `FakeLLMProvider` phục vụ kiểm thử tự động không gọi mạng.
  - Factory `createLlmProvider` tự động chọn provider dựa trên biến môi trường (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`).
  - Bảo mật tuyệt đối: Hàm `maskApiKey` và lớp provider không bao giờ in API key vào log.
- **Trích xuất nội dung nguồn (`src/script/source-fetcher.ts`):**
  - Hỗ trợ cả 3 nguồn đầu vào: URL bài báo web (tự bóc tách HTML, title, meta og:image, làm sạch text), file cục bộ (.txt, .md), hoặc chuỗi chủ đề trực tiếp.
- **Prompt hệ thống tiếng Việt chuyên sâu (`src/script/prompts/`):**
  - Ràng buộc cấu trúc 5-8 cảnh, hook 3s đầu, văn phong nói tự nhiên.
  - Tự động phiên âm số/đơn vị đọc chuẩn cho TTS trong `voiceText` (vd "GPT 5.5" -> "GPT năm chấm năm", "82.7%" -> "tám mươi hai phẩy bảy phần trăm").
  - Đa dạng hoá template phù hợp nội dung và lựa chọn preset (`news_short`, `review_60`, `top_list`).
- **Kiểm tra và đối chiếu số liệu (`src/script/fact-checker.ts`):**
  - Trích xuất toàn bộ số nguyên, số thập phân, đơn vị (MP, GB, Hz, mAh, đ) và cụm số phát âm từ `voiceText` và `templateData`.
  - Đối chiếu chuẩn hoá với nội dung bài viết gốc, phát hiện chính xác các số bịa đặt (hallucinated numbers) mà không bị nhầm lẫn substring.
- **Quy trình duyệt kịch bản & Lệnh CLI (`npm run script`):**
  - Hỗ trợ cơ chế retry tự động tối đa 2 lần khi LLM trả JSON không hợp lệ, kèm feedback lỗi cụ thể.
  - Tự động sinh `script.json`, `sources.json`, và `script.review.md`.
  - Tự động dừng để người dùng duyệt kịch bản và cảnh báo số liệu trước khi render (hỗ trợ cờ `--yes` để bỏ qua khi chạy CI/automation).
- **Kết quả nghiệm thu M4:**
  - `npx tsc --noEmit`: 0 lỗi.
  - `npm test`: 22 test files, **125/125 tests passed 100%** (thêm 19 tests cho LLM providers, fact checker, và generator pipeline).
  - Chạy thử nghiệm CLI: `LLM_PROVIDER=fake npm run script` hoạt động chuẩn xác, sinh đầy đủ 3 file và hiển thị cảnh báo số liệu chuẩn xác.

---

## 4. Trạng thái hiện tại của dự án

- **Nhánh Git hiện tại:** `feat/m4-llm-script`.
- **Trạng thái mã nguồn:** 0 lỗi TypeScript, 125/125 tests Vitest passed.
- **Tiêu chí chấp nhận M4:** Đạt 100%:
  1. Chạy `npm run script` với `FakeLLMProvider` sinh `script.json` hợp lệ đạt chuẩn `ScriptSchema`.
  2. Cơ chế retry hoạt động ổn định khi LLM trả JSON sai cấu trúc.
  3. Số bịa đặt không có trong bài viết gốc bị hệ thống phát hiện và gắn cờ cảnh báo trong `script.review.md`.
  4. Tuyệt đối không có API key xuất hiện trong console hay log.

---

## 5. Bước tiếp theo cần làm ngay (Immediate Next Step: Milestone M5)

Nhiệm vụ tiếp theo là **Milestone M5 (Audio polish, motion, preset)** theo đúng prompt **P-M5** trong `PRD2.md` Mục B4:

1. **Khởi tạo nhánh làm việc mới:**
   ```bash
   git checkout -b feat/m5-audio-motion
   ```
2. **Kỹ năng bắt buộc phải đọc trước:**
   - [`.agents/skills/audio-polish/SKILL.md`](../.agents/skills/audio-polish/SKILL.md)
   - [`.agents/skills/hyperframes-templates/SKILL.md`](../.agents/skills/hyperframes-templates/SKILL.md)
   - [`.agents/skills/qa-verify/SKILL.md`](../.agents/skills/qa-verify/SKILL.md)
3. **Các hạng mục cần làm ở M5:**
   - **BGM & Ducking:** Trường `bgm` (`src`, `volume`, `duck`) trong `script.json`. Tự động lặp/cắt theo độ dài video, fade in/out và tự động ducking (giảm âm lượng BGM khi có giọng nói qua FFmpeg `sidechaincompress`). Thư mục `assets/bgm/` kèm nhạc mẫu miễn phí bản quyền.
   - **Từ điển phát âm (Lexicon):** File `config/lexicon.json` (ví dụ `"iPhone": "ai phôn"`), áp dụng tự động vào `voiceText` trước khi gọi TTS. Không thay đổi chữ hiển thị trên màn hình.
   - **Chuyển cảnh (Transitions):** Trường `transition` mỗi cảnh (`cut` mặc định, `fade`, `slide`, `zoom`, kèm `duration`). Giữ mặc định `cut` để tương thích ngược.
   - **Preset độ dài:** `short_30`, `news_45`, `review_60` (số cảnh, số từ mục tiêu, khoảng thời lượng cảnh báo).
   - **TikTok Safe-zone & Branding:** Cấu hình lề an toàn TikTok cho caption/nội dung quan trọng; cấu hình branding trong `config/brand.json` (tên kênh, handle, avatar, màu, theme) thay cho giá trị tác giả gốc.
4. **Quy trình nghiệm thu:**
   - Chạy `npx tsc --noEmit` và `npm test`.
   - Render video mẫu có BGM và kiểm tra mức âm lượng bằng `ffprobe`/`ffmpeg`.
   - Cập nhật tiếp vào `docs/handover-brief.md`.
