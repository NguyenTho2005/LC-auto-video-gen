# Context Handover Brief — Auto_GenVid (Mở rộng theo PRD2)

> **Dành cho AI Agent tiếp nhận dự án.**  
> Ngày lập: 24/10/2026.  
> Trạng thái hiện tại: **Đã hoàn thành 100% Milestone M0 (Audit & Baseline)** trên nhánh `feat/m0-audit`.

---

## 1. Mục tiêu chính của dự án

- **Bản chất dự án:** Mở rộng repository nguồn mở **Auto_GenVid** (`https://github.com/MaiPhuc1506/Auto_GenVid.git`, bản fork từ `Cuongyd196/auto-video-gen`, gốc `hoquanghai/Auto-Create-Video`, giấy phép **MIT**).
- **Mục tiêu sản phẩm:** Tạo công cụ tự động hoá toàn diện từ một chủ đề / URL bài báo / file `.txt` thành **video ngắn định dạng dọc 9:16 (1080×1920 30fps/60fps)** tối ưu cho **TikTok, YouTube Shorts, Facebook Reels**.
- **Tính năng cốt lõi:**
  - Tổng hợp giọng đọc tiếng Việt qua nhiều TTS providers (Edge TTS miễn phí, LucyLab voice cloning, Vbee, ElevenLabs).
  - Ghép hiệu ứng âm thanh SFX tự động và sắp tới là BGM có ducking theo giọng nói.
  - Render đồ hoạ chuyển động (Motion Graphics) bằng công nghệ web: HTML5, CSS3, GSAP animation và chụp frame bằng Puppeteer/HyperFrames, encode bằng FFmpeg.
  - Hỗ trợ phụ đề karaoke hiển thị theo từng từ (word-level sync), nhập/xuất file SRT chuẩn UTF-8.
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
- **Kiểm thử (Test Runner):** [`Vitest`](https://vitest.dev/) (`^4.1.5`) với 11 test suites (60 tests passed, mock HTTP qua `nock`).
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
│   └── handover-brief.md   # Bản tóm tắt chuyển giao này
├── src/
│   ├── cli.ts              # Điểm vào CLI: npm run pipeline -- <script.json>
│   ├── pipeline.ts         # Điều phối luồng 8 bước từ kịch bản ra video MP4
│   ├── config.ts           # Đọc & validate biến môi trường (.env.local)
│   ├── server.ts           # Server Express xem trước composition
│   ├── render/
│   │   ├── script-schema.ts      # Zod schema cho ScriptSchema & 6 templates
│   │   ├── html-composer.ts      # Sinh DOM HTML, CSS, nhúng timeline GSAP
│   │   ├── hyperframes-runner.ts # Wrapper gọi hyperframes CLI
│   │   └── templates/            # HTML mẫu cho 6 template
│   ├── tts/                # Edge TTS, LucyLab, ElevenLabs, Vbee clients
│   ├── assets/             # audio-tools.ts (FFmpeg), sfx-selector.ts, image-fetcher.ts
│   └── utils/              # logger.ts, slug.ts, script-generator.ts
├── tests/                  # 11 file Vitest (*.test.ts)
└── output/                 # Thư mục chứa video thành phẩm theo slug
```

---

## 3. Những việc đã hoàn thành

### 3.1. Thiết lập Agent Kit (Bước 1)
- Tạo quy tắc [`AGENTS.md`](../AGENTS.md) và [`CLAUDE.md`](../CLAUDE.md) theo mục B2 của `PRD2.md`.
- Tạo đầy đủ 9 skills mới vào cả hai thư mục `.claude/skills/` và `.agents/skills/` (`repo-audit`, `schema-evolution`, `hyperframes-templates`, `captions-timing`, `media-assets`, `llm-script`, `audio-polish`, `web-timeline-editor`, `qa-verify`), giữ nguyên skill `create-news-video`.
- Đã commit trên nhánh `chore/agent-kit` (`ff39bc3`).

### 3.2. Milestone M0 — Audit và Baseline (Bước 3)
- **Tài liệu Audit:** Hoàn thành [`docs/audit.md`](audit.md) làm rõ luồng chạy và giải quyết triệt để 5 điểm mâu thuẫn tài liệu:
  1. *Tên template:* Mã nguồn thực tế có đúng 6 templates: `hook`, `comparison`, `stat-hero`, `feature-list`, `callout`, `outro` (không phải tên cũ trong README).
  2. *Hỗ trợ SRT:* Cả Edge TTS và LucyLab đều tạo được SRT cho từng cảnh; ElevenLabs và Vbee không có SRT.
  3. *Đường dẫn Schema:* Schema duy nhất nằm tại `src/render/script-schema.ts`.
  4. *Số lượng Unit Tests:* Chính xác là **60 tests passed** (không phải 54).
  5. *BGM vs SFX:* Hiện tại chỉ có SFX; tính năng BGM + ducking sẽ phát triển ở M5.
- **Đồng bộ tài liệu:** Đã cập nhật chính xác [`README.md`](../README.md), [`README.full.md`](../README.full.md), [`README.en.md`](../README.en.md).
- **Baseline kiểm thử & Render thực tế:**
  - `npx tsc --noEmit`: 0 lỗi, thực thi trong 1.25s.
  - `npm test`: 11/11 files passed, **60/60 tests passed** trong 3.7s.
  - Render pipeline mẫu thành công: `output/baseline-test/video.mp4` (102 MB, 30.2s, 1080×1920, H.264/AAC stereo 48000Hz, xác thực bằng `ffprobe`).
- **Trạng thái Git:** Commit hoàn chỉnh trên nhánh `feat/m0-audit` (`14bec63`, `d967f05`, `41bdab8`), working tree sạch 100%.

*(Lưu ý: Toàn bộ code Python thực hiện thử nghiệm trước đó theo PRD cũ đã được lưu trữ an toàn tại nhánh `python-stack`).*

---

## 4. Trạng thái hiện tại của dự án

- **Nhánh Git hiện tại:** `feat/m0-audit`.
- **Trạng thái working tree:** Sạch hoàn toàn (`git status` báo `nothing to commit, working tree clean`).
- **Trạng thái code:** Không có file nào đang sửa dở, không có lỗi biên dịch TypeScript, không có test nào bị fail.
- **Tiêu chí chấp nhận của M0:** Đạt 100% theo quy định trong `PRD2.md`.

---

## 5. Bước tiếp theo cần làm ngay (Immediate Next Steps)

Nhiệm vụ tiếp theo là **Milestone M1 (Caption và SRT)** theo đúng prompt **P-M1** trong `PRD2.md` Mục B4:

1. **Khởi tạo nhánh làm việc:**
   ```bash
   git checkout -b feat/m1-captions
   ```
2. **Kỹ năng liên quan cần đọc trước khi viết mã:**
   - [`.agents/skills/captions-timing/SKILL.md`](../.agents/skills/captions-timing/SKILL.md)
   - [`.agents/skills/schema-evolution/SKILL.md`](../.agents/skills/schema-evolution/SKILL.md)
   - [`.agents/skills/hyperframes-templates/SKILL.md`](../.agents/skills/hyperframes-templates/SKILL.md)
   - [`.agents/skills/qa-verify/SKILL.md`](../.agents/skills/qa-verify/SKILL.md)
3. **Các hạng mục công việc cụ thể của M1:**
   - **Nguồn thời gian phụ đề:**
     - Tận dụng sự kiện `WordBoundary` của `edge-tts-universal` (lưu ý: kiểm tra đơn vị ticks 100ns hay milliseconds trong `node_modules/edge-tts-universal`).
     - Với LucyLab: Phân tích file SRT trả về.
     - Với ElevenLabs/Vbee (không có timestamp): Chia đều theo tỉ lệ số ký tự trên tổng thời lượng cảnh và đánh dấu `accuracy: "low"`.
   - **Lớp hiển thị Caption trong composition:**
     - Thêm lớp HTML/CSS/GSAP hiển thị caption vào `src/render/html-composer.ts` và các file CSS (`styles.dark-neon.css`, `styles.light-pro.css`).
     - Quy chuẩn: Mỗi cue 2–6 từ, tối đa 2 dòng, highlight từ đang nói, nằm trong vùng an toàn TikTok (cách đáy ~20%), chuẩn hóa Unicode NFC, font tiếng Việt (`Be Vietnam Pro` đóng gói cục bộ).
   - **Mở rộng schema Zod (`src/render/script-schema.ts`):**
     - Thêm trường tùy chọn `captions?: { enabled: boolean; style: string }` vào `ScriptSchema`.
     - Đảm bảo kịch bản cũ không có trường này vẫn render bình thường (tương thích ngược).
   - **Xuất & Nhập file SRT:**
     - Xuất `captions.srt` toàn bộ video (UTF-8, timestamp chuẩn `HH:MM:SS,mmm`).
     - Thêm script CLI `npm run captions:import -- <output-dir> <file.srt>` cho phép người dùng ghi đè phụ đề thủ công.
   - **Kiểm thử tự động:**
     - Test độ lệch cue ≤ 150 ms trên mock timestamp.
     - Test round-trip SRT (cue → SRT → cue) với dung sai ≤ 1 ms.
     - Test xử lý tiếng Việt có dấu, BOM UTF-8, CRLF, cue nhiều dòng.
     - Test hồi quy đảm bảo các fixture cũ vẫn parse và chạy tốt.
4. **Quy trình hoàn thành:**
   - Chạy `npx tsc --noEmit` và `npm test`.
   - Render video mẫu kiểm tra bằng mắt (caption khớp giọng, không tràn khung) và kiểm tra bằng `ffprobe`.
   - Báo cáo kết quả theo mẫu 5 phần quy định trong `AGENTS.md`.
