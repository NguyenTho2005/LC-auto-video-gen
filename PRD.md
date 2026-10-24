# PRD — TechReel Studio (tên tạm)

> Tool tạo video review và tin tức công nghệ định dạng dọc 9:16 để đăng TikTok.
> Tài liệu này gồm 2 phần: **Phần A – PRD** (sản phẩm cần làm gì) và **Phần B – Agent Kit** (rules, skills, prompts để giao cho AI agent tự xây dựng và nâng cấp).

---

# PHẦN A — PRD

## 1. Tổng quan

**Mục tiêu:** Từ một chủ đề, URL bài báo hoặc file SRT, người dùng tạo được video TikTok hoàn chỉnh (giọng đọc, caption, hình/clip nền, nhạc) trong vài phút, và có thể tinh chỉnh bằng timeline editor trước khi xuất.

**Người dùng chính:** Creator cá nhân làm kênh review/tin công nghệ tiếng Việt, ưu tiên làm nhanh, chi phí thấp, chạy local.

**Repo tham khảo:** https://github.com/MaiPhuc1506/Auto_GenVid — agent phải phân tích repo này trước (xem Prompt P0) và tái sử dụng ý tưởng/kiến trúc hợp lý, không copy mù quáng.

**Non-goals (không làm ở phiên bản đầu):**
- Không tự động đăng lên TikTok (chỉ xuất file).
- Không dựng video bằng text-to-video AI.
- Không làm multi-user / cloud / thanh toán.
- Không làm hiệu ứng chuyển cảnh phức tạp (chỉ cut, fade, zoom nhẹ).

## 2. Vấn đề cần giải quyết

- Làm video tin công nghệ thủ công mất nhiều giờ: viết kịch bản, thu giọng, tìm hình, căn caption.
- Công cụ auto hiện có thường không cho chỉnh sửa sau khi sinh, nên kết quả khó dùng.
- Caption tiếng Việt hay lệch thời gian hoặc lỗi font.

## 3. User stories

| ID | Là creator, tôi muốn… | Để… |
|---|---|---|
| US-1 | nhập chủ đề hoặc URL bài báo và nhận kịch bản chia cảnh | không phải viết từ đầu |
| US-2 | sửa kịch bản trước khi tạo giọng | tránh thông tin sai do LLM bịa |
| US-3 | chọn giọng Edge TTS tiếng Việt, tốc độ, cao độ và nghe thử | giọng hợp phong cách kênh |
| US-4 | caption tự khớp giọng đọc, ngắt dòng kiểu TikTok | video dễ xem |
| US-5 | import file SRT có sẵn để làm caption, hoặc tạo giọng đọc từ SRT | dùng lại kịch bản/phụ đề có sẵn |
| US-6 | xuất caption ra file SRT | dùng ở nơi khác hoặc chỉnh bằng tool khác |
| US-7 | kéo thả, cắt, tách clip trên timeline | tinh chỉnh nhịp video |
| US-8 | tự tìm clip/ảnh nền theo từ khoá cảnh, hoặc upload của tôi | không mất thời gian tìm |
| US-9 | xem preview nhanh độ phân giải thấp | kiểm tra trước khi render |
| US-10 | xuất mp4 1080×1920 | đăng thẳng lên TikTok |
| US-11 | lưu và mở lại project | làm tiếp sau |

## 4. Phạm vi theo giai đoạn

| Giai đoạn | Nội dung | Điều kiện hoàn thành |
|---|---|---|
| **M1 – MVP CLI** | chủ đề → LLM → TTS → caption tự động → FFmpeg ra mp4 | chạy 1 lệnh ra video 9:16 có tiếng và caption |
| **M2 – Caption/SRT** | xuất/nhập SRT, style ASS, highlight từ đang đọc | SRT xuất ra mở được bằng player; SRT nhập vào hiển thị đúng |
| **M3 – Assets** | upload ảnh/video, tải stock theo từ khoá, tự crop 9:16 | mỗi cảnh có hình/clip nền |
| **M4 – Timeline editor** | UI timeline đọc/ghi `project.json` | sửa trên UI và render ra đúng như preview |
| **M5 – Hoàn thiện** | preset style, hàng đợi render, lưu project, nguồn tin RSS | xem mục Acceptance Criteria |

## 5. Yêu cầu chức năng

### FR-1 Nguồn tin (`sources/`)
- Lấy bài từ danh sách RSS cấu hình được (ví dụ The Verge, GSMArena, Tinhte, VnExpress Số hóa).
- Nhận URL bài báo và trích văn bản chính (title, nội dung, ảnh đại diện, ngày đăng).
- Lưu nguồn gốc (URL, tên báo) vào project để ghi credit trong caption/mô tả.

### FR-2 Sinh kịch bản (`script/`)
- Gọi LLM qua interface `LLMProvider` (cấu hình bằng biến môi trường; không hard-code một nhà cung cấp).
- Output bắt buộc là JSON theo schema ở mục 8.2, validate bằng pydantic; nếu sai thì tự retry tối đa 2 lần.
- Preset: `news_short` (30–45s), `review_60s`, `top_list`.
- Prompt hệ thống yêu cầu: chỉ dùng thông tin có trong nguồn, không tự bịa thông số, câu hook ở 3 giây đầu, văn nói tự nhiên tiếng Việt.
- Người dùng xem và sửa kịch bản trước khi sang bước TTS.

### FR-3 Giọng đọc (`tts/`)
- Dùng thư viện `edge-tts`, giọng mặc định `vi-VN-HoaiMyNeural`, có `vi-VN-NamMinhNeural`.
- Tham số: `rate`, `pitch`, `volume`.
- Lấy timestamp từng từ (WordBoundary) để căn caption; lưu cùng file audio.
- Cache theo hash (text + voice + rate + pitch) để không gọi lại.
- Đặt sau interface `TTSProvider` để thay thế khi Edge TTS thay đổi.
- Có retry/backoff khi lỗi mạng; báo lỗi rõ ràng.

### FR-4 Caption và SRT (`captions/`)
- Tự tạo cue từ timestamp từ: mỗi cue 2–6 từ, tối đa ~32 ký tự/dòng, tối đa 2 dòng.
- Import SRT → track caption; có tuỳ chọn "tạo giọng đọc từ SRT" (mỗi cue một đoạn TTS, ghép theo thời gian cue).
- Export track caption → `.srt` chuẩn (UTF-8, dấu thời gian `HH:MM:SS,mmm`).
- Style ASS: font hỗ trợ tiếng Việt, viền, bóng, màu, vị trí vùng an toàn; tuỳ chọn highlight từ đang đọc.

### FR-5 Assets (`assets/`)
- Upload ảnh/video cục bộ.
- Tải stock từ Pexels/Pixabay API theo `visual_keywords` của cảnh (cần API key của người dùng).
- Tự crop/scale về 9:16 (`cover`), hỗ trợ hiệu ứng Ken Burns nhẹ cho ảnh tĩnh.
- Lưu metadata nguồn và giấy phép của asset tải về.

### FR-6 Timeline (`timeline/`)
- Mô hình dữ liệu ở mục 8.1; mọi thao tác chỉ sửa mô hình, UI render từ mô hình.
- Track: video, audio (giọng), audio (nhạc nền), caption, (tuỳ chọn) text overlay.
- Thao tác: thêm/xoá clip, kéo di chuyển, trim đầu/đuôi, split tại playhead, ripple delete, snap vào cue/đầu-cuối clip, zoom timeline, undo/redo (command pattern).
- Preview proxy 540×960, phát đồng bộ với audio.

### FR-7 Render (`render/`)
- Dựng bằng FFmpeg từ `project.json`: 1080×1920, 30fps, H.264 + AAC.
- Burn caption bằng ASS; mix giọng + nhạc nền (ducking nhạc khi có giọng).
- Chạy nền, báo tiến độ phần trăm, huỷ được.
- Có chế độ `--draft` (540×960, preset nhanh).

### FR-8 Project (`project/`)
- Lưu/mở `project.json` kèm thư mục `assets/` và `cache/`.
- Có trường `schema_version` và hàm migrate khi đổi schema.

## 6. Yêu cầu phi chức năng

- **Nền tảng:** Windows/macOS/Linux; Python 3.11+; cần FFmpeg trong PATH (kiểm tra lúc khởi động và báo lỗi thân thiện).
- **Hiệu năng:** video 45s render full dưới ~3 phút trên laptop thông thường; draft dưới ~1 phút.
- **Độ tin cậy:** lỗi một cảnh không làm hỏng cả project; có thể chạy lại từng bước (script/TTS/render).
- **Bảo mật:** API key đọc từ `.env`, không commit; log không in key.
- **Chất lượng mã:** type hints, `ruff` + `mypy`, test bằng `pytest`, mỗi module có test.
- **Tiếng Việt:** toàn bộ pipeline xử lý Unicode (NFC), font hỗ trợ dấu.
- **Pháp lý/nội dung:** chỉ dùng asset có giấy phép phù hợp; ghi nguồn tin; nhắc người dùng gắn nhãn nội dung AI theo chính sách TikTok.

## 7. Kiến trúc và cấu trúc thư mục

```
techreel/
├─ pyproject.toml
├─ .env.example
├─ AGENTS.md                  # rules cho agent (xem Phần B)
├─ .claude/skills/            # skills (xem Phần B)
├─ src/techreel/
│  ├─ core/        # config, logging, errors, models (pydantic)
│  ├─ sources/     # rss.py, article.py
│  ├─ script/      # provider.py, prompts/, generate.py
│  ├─ tts/         # provider.py, edge.py, cache.py
│  ├─ captions/    # build.py, srt_io.py, ass.py
│  ├─ assets/      # local.py, pexels.py, crop.py
│  ├─ timeline/    # model.py, ops.py, history.py
│  ├─ render/      # ffmpeg_graph.py, runner.py
│  ├─ project/     # store.py, migrate.py
│  ├─ cli.py       # typer CLI
│  └─ ui/          # M4: PySide6 (hoặc web)
├─ tests/
└─ examples/
```

**Nguyên tắc kiến trúc:**
1. `project.json` là nguồn sự thật duy nhất; UI và renderer chỉ đọc/ghi nó.
2. Mỗi dịch vụ ngoài (LLM, TTS, stock) nằm sau một interface để thay thế và mock khi test.
3. Mỗi bước pipeline chạy độc lập, kết quả cache được, chạy lại được.
4. Không để logic nghiệp vụ trong UI.

**Chọn UI (M4):** PySide6 (desktop, chạy local, tích hợp tốt với core Python). Phương án thay thế: FastAPI + React nếu muốn timeline kéo thả đẹp hơn. Agent phải chốt lựa chọn trong một ADR ngắn (`docs/adr-ui.md`) trước khi làm M4.

## 8. Đặc tả dữ liệu

### 8.1 `project.json`

```json
{
  "schema_version": 1,
  "meta": {"title": "", "source_url": "", "created_at": ""},
  "canvas": {"w": 1080, "h": 1920, "fps": 30},
  "tracks": [
    {"id": "v1", "type": "video", "clips": [
      {"id": "c1", "src": "assets/a.mp4", "start": 0.0,
       "in": 2.0, "out": 6.5, "fit": "cover", "fx": []}
    ]},
    {"id": "voice", "type": "audio", "clips": [
      {"id": "a1", "src": "cache/tts/ab12.mp3", "start": 0.0, "volume": 1.0}
    ]},
    {"id": "bgm", "type": "audio", "clips": [
      {"id": "m1", "src": "assets/bgm.mp3", "start": 0.0, "volume": 0.15, "duck": true}
    ]},
    {"id": "cap", "type": "caption", "style": "tiktok_bold", "cues": [
      {"id": "q1", "start": 0.0, "end": 1.2, "text": "iPhone mới có gì hot?"}
    ]}
  ],
  "tts": {"voice": "vi-VN-HoaiMyNeural", "rate": "+10%", "pitch": "+0Hz"}
}
```

Đơn vị thời gian: giây (float). Mọi đường dẫn là tương đối so với thư mục project.

### 8.2 Schema kịch bản từ LLM

```json
{
  "title": "string",
  "hook": "string",
  "scenes": [
    {
      "id": 1,
      "narration": "Câu đọc tiếng Việt, văn nói",
      "on_screen_text": "string | null",
      "visual_keywords": ["smartphone", "camera close up"],
      "est_seconds": 5.0
    }
  ],
  "cta": "string",
  "sources": [{"name": "string", "url": "string"}]
}
```

## 9. Acceptance Criteria

1. `techreel make --topic "..." --preset news_short` tạo ra `out.mp4` 1080×1920, có giọng và caption, không cần can thiệp.
2. Caption khớp giọng: độ lệch giữa cue và từ được đọc ≤ 150 ms (kiểm tra bằng test trên timestamp).
3. `export-srt` rồi `import-srt` cho ra cùng số cue và cùng thời gian (round-trip test).
4. SRT nhập vào có dấu tiếng Việt hiển thị đúng sau khi render (không lỗi font).
5. Project lưu ra rồi mở lại giống hệt (round-trip test cho `project.json`).
6. Timeline: split/trim/ripple delete/undo/redo có test đơn vị cho từng thao tác; render sau khi sửa khớp mô hình.
7. Mất mạng hoặc hết quota LLM/TTS thì báo lỗi rõ, không crash, không để project hỏng.
8. `pytest`, `ruff`, `mypy` chạy sạch trên CI cục bộ.
9. README có hướng dẫn cài đặt, ví dụ lệnh, và ảnh/GIF demo.

## 10. Rủi ro và giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Edge TTS là API không chính thức, có thể đổi/ngưng | interface `TTSProvider`, cache, sẵn phương án dự phòng (ví dụ Piper hoặc nhà cung cấp trả phí) |
| LLM bịa thông số kỹ thuật | chỉ dùng nội dung nguồn, bước người dùng duyệt kịch bản, ghi nguồn |
| Bản quyền ảnh/clip | ưu tiên stock có giấy phép, ảnh press kit, ảnh tự chụp; lưu metadata giấy phép |
| Lệch caption/giọng | căn bằng timestamp từ TTS, test dung sai |
| Lỗi font tiếng Việt khi burn ASS | đóng gói font hỗ trợ tiếng Việt, truyền `fontsdir` cho FFmpeg |
| Timeline UI tốn công | làm mô hình + thao tác + test trước, UI sau |
| Chính sách TikTok thay đổi | nhắc gắn nhãn AI, kiểm tra chính sách hiện hành trước khi đăng |

---

# PHẦN B — AGENT KIT

## B1. Cách dùng

1. Tạo repo mới, copy file này vào thư mục gốc (`PRD.md`).
2. Tạo `AGENTS.md` (hoặc `CLAUDE.md`) bằng nội dung ở **B2**.
3. Tạo các skill ở **B3**, mỗi skill là một file `.claude/skills/<tên>/SKILL.md`. Với agent khác Claude Code, đặt cùng nội dung vào thư mục tài liệu mà agent đọc được (ví dụ `docs/skills/`) và dặn agent đọc chúng.
4. Dán lần lượt các prompt ở **B4** (P0 → P1 → …). Mỗi prompt làm xong, chạy test rồi mới sang prompt tiếp theo.

## B2. `AGENTS.md`

````markdown
# Quy tắc cho agent — TechReel Studio

Nguồn sự thật về yêu cầu: `PRD.md`. Đọc nó trước khi làm bất cứ việc gì.

## Nguyên tắc
- Làm theo từng milestone (M1…M5) trong PRD; không nhảy cóc, không làm thêm ngoài phạm vi.
- `project.json` là nguồn sự thật duy nhất; UI và renderer chỉ đọc/ghi nó.
- Mọi dịch vụ ngoài (LLM, TTS, stock) nằm sau interface và có bản mock cho test.
- Python 3.11+, type hints đầy đủ, pydantic v2 cho model, typer cho CLI.
- Mỗi tính năng đi kèm test (`pytest`). Trước khi báo hoàn thành phải chạy `pytest`, `ruff check`, `mypy` và dán kết quả.
- Không commit API key; dùng `.env` và cập nhật `.env.example`.
- Không bịa API/thư viện: nếu không chắc về chữ ký hàm của thư viện (ví dụ `edge-tts`), đọc tài liệu hoặc mã nguồn của đúng phiên bản đã cài rồi mới viết.
- Quyết định kiến trúc lớn ghi vào `docs/adr-XXXX.md` (ngắn, nêu lựa chọn và lý do).
- Khi gặp điểm PRD mơ hồ: chọn phương án đơn giản nhất, ghi giả định vào `docs/assumptions.md`, rồi tiếp tục; chỉ dừng hỏi khi không thể tiến tiếp.

## Cách báo cáo cuối mỗi nhiệm vụ
1. Đã làm gì (file đã tạo/sửa).
2. Cách chạy thử (lệnh cụ thể).
3. Kết quả test/lint/type-check.
4. Việc còn tồn đọng và giả định đã dùng.
````

## B3. Skills

### Skill 1 — `project-analysis`

````markdown
---
name: project-analysis
description: Phân tích một repo tham khảo (cây thư mục, luồng xử lý, dependency, điểm mạnh/yếu) và đề xuất phần nào nên tái sử dụng. Dùng khi cần học từ repo có sẵn trước khi thiết kế hoặc nâng cấp.
---

# Phân tích repo tham khảo

## Quy trình
1. Clone repo (`git clone <url> /tmp/ref`) hoặc đọc mã nguồn được cung cấp. Không sửa repo gốc.
2. Lập cây thư mục (`tree -L 3` hoặc tương đương) và đọc README, file cấu hình, dependency.
3. Tìm điểm vào (main/cli/app) và theo dõi luồng chính từ đầu vào đến file video đầu ra.
4. Với mỗi bước (kịch bản, TTS, caption, ghép video, render) ghi: file nào, thư viện nào, cách làm gì.
5. Ghi điểm mạnh, điểm yếu, nợ kỹ thuật, ràng buộc cứng (đường dẫn hard-code, key hard-code, chỉ chạy một OS…).

## Đầu ra
Viết `docs/reference-analysis.md` gồm: sơ đồ luồng (mermaid), bảng "tái sử dụng / viết lại / bỏ" cho từng thành phần kèm lý do, danh sách rủi ro, và ánh xạ sang các FR trong PRD.

## Lưu ý
- Chỉ nêu điều đã xác minh trong mã; chỗ nào suy đoán phải ghi rõ là suy đoán.
- Kiểm tra giấy phép của repo trước khi đề xuất copy mã.
````

### Skill 2 — `script-llm`

````markdown
---
name: script-llm
description: Sinh kịch bản video công nghệ dạng JSON theo cảnh bằng LLM, có validate schema và retry. Dùng khi làm hoặc sửa module script/.
---

# Sinh kịch bản bằng LLM

## Yêu cầu
- Interface `LLMProvider.generate(system: str, user: str) -> str`; có ít nhất một provider thật và một `FakeProvider` cho test.
- Cấu hình qua biến môi trường (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`); không hard-code.
- Output phải parse được thành model pydantic `Script` (xem PRD mục 8.2).

## Prompt hệ thống (tiếng Việt, đặt trong `script/prompts/`)
- Chỉ dùng thông tin có trong nội dung nguồn; thiếu thông tin thì bỏ qua, không bịa số liệu/thông số.
- 3 giây đầu là câu hook; văn nói tự nhiên, câu ngắn, không dùng từ khó đọc.
- Mỗi cảnh 3–8 giây, tổng thời lượng theo preset.
- Chỉ trả JSON, không kèm giải thích hay markdown fence.

## Quy trình xử lý
1. Dựng prompt từ nguồn + preset.
2. Gọi LLM, loại bỏ code fence nếu có, `json.loads`.
3. Validate bằng pydantic; nếu lỗi, retry tối đa 2 lần kèm thông báo lỗi validate cho LLM.
4. Kiểm tra độ dài narration ước tính (số từ ÷ tốc độ đọc) so với `est_seconds`.

## Test
- Dùng `FakeProvider` trả JSON mẫu: kiểm tra parse thành công, retry khi JSON sai, báo lỗi khi sai quá số lần cho phép.
````

### Skill 3 — `tts-edge`

````markdown
---
name: tts-edge
description: Tạo giọng đọc bằng edge-tts kèm timestamp từng từ, có cache và retry. Dùng khi làm hoặc sửa module tts/.
---

# Edge TTS

## Yêu cầu
- Interface `TTSProvider.synthesize(text, voice, rate, pitch) -> TTSResult(audio_path, words)`, trong đó `words` là danh sách `(start_sec, dur_sec, text)`.
- Implement `EdgeTTSProvider` bằng thư viện `edge-tts`. Giọng mặc định `vi-VN-HoaiMyNeural`; có `vi-VN-NamMinhNeural`.
- Cache theo hash của (text, voice, rate, pitch); trùng hash thì dùng lại file và timestamp.
- Retry với backoff khi lỗi mạng; ném lỗi riêng `TTSError` có thông điệp dễ hiểu.

## Lưu ý kỹ thuật
- Timestamp từ sự kiện `WordBoundary`: offset/duration tính theo đơn vị 100 ns (chia 1e7 để ra giây).
- Phiên bản `edge-tts` mới có thể mặc định `SentenceBoundary`; truyền tham số boundary tường minh để lấy từng từ nếu phiên bản đó hỗ trợ.
- Không chắc về API của phiên bản đã cài thì đọc `help(edge_tts.Communicate)` hoặc mã nguồn, không đoán.
- Chạy bất đồng bộ (`asyncio`) nhưng bọc thành hàm đồng bộ cho CLI.

## Test
- Test cache bằng `FakeTTSProvider` (đếm số lần gọi).
- Test chuyển đổi đơn vị thời gian bằng dữ liệu WordBoundary giả.
- Một test tích hợp đánh dấu `@pytest.mark.network`, mặc định bị bỏ qua.
````

### Skill 4 — `captions-srt`

````markdown
---
name: captions-srt
description: Tạo caption từ timestamp TTS, import/export SRT, sinh file ASS có style TikTok. Dùng khi làm hoặc sửa module captions/.
---

# Caption và SRT

## Tạo cue từ timestamp từ
- Gom 2–6 từ liên tiếp thành một cue, tối đa ~32 ký tự/dòng, tối đa 2 dòng.
- Ngắt cue ở dấu câu khi có thể; cue ngắn nhất 0.4 s, dài nhất 3 s.
- Chuẩn hoá Unicode (NFC) cho toàn bộ text.

## SRT
- Export: UTF-8, đánh số từ 1, thời gian `HH:MM:SS,mmm --> HH:MM:SS,mmm`.
- Import: chịu được BOM, CRLF, dòng trống thừa, cue nhiều dòng; báo lỗi rõ khi sai định dạng thời gian.
- Có thể dùng thư viện `srt` hoặc tự viết parser nhỏ; nếu tự viết thì phải có test.
- Tuỳ chọn "SRT → giọng đọc": mỗi cue một đoạn TTS, ghép theo thời gian cue; nếu audio dài hơn cue thì cảnh báo và gợi ý tăng `rate` hoặc kéo dài cue.

## ASS (burn vào video)
- Dùng font hỗ trợ tiếng Việt (ví dụ Be Vietnam Pro hoặc Montserrat), đóng gói cùng project và truyền `fontsdir` cho FFmpeg.
- Style mặc định `tiktok_bold`: chữ trắng, viền đen dày, căn giữa, nằm trong vùng an toàn (tránh ~20% đáy và cạnh phải).
- Tuỳ chọn highlight từ đang đọc bằng thẻ karaoke (`\k`) dựa trên timestamp từ.

## Test
- Round-trip: cues → SRT → cues giữ nguyên số lượng và thời gian (dung sai 1 ms).
- SRT mẫu có BOM/CRLF/tiếng Việt có dấu parse đúng.
- Cue không chồng lấn nhau và không vượt tổng thời lượng.
````

### Skill 5 — `timeline-model`

````markdown
---
name: timeline-model
description: Mô hình dữ liệu và thao tác chỉnh sửa timeline (split, trim, move, ripple delete, undo/redo) tách khỏi UI. Dùng khi làm hoặc sửa module timeline/ hoặc UI timeline.
---

# Mô hình timeline

## Nguyên tắc
- Mô hình (`timeline/model.py`) thuần dữ liệu, không phụ thuộc UI hoặc FFmpeg.
- Mọi chỉnh sửa là một `Command` có `do()` và `undo()`; lịch sử lưu trong `history.py`.
- Thời gian dùng giây (float), làm tròn theo khung hình (1/fps) khi snap.

## Thao tác bắt buộc
`add_clip`, `remove_clip`, `move_clip`, `trim_in`, `trim_out`, `split_at(t)`, `ripple_delete`, `set_volume`, `edit_cue_text`, `move_cue`, `undo`, `redo`.

## Quy tắc
- Không cho clip cùng track chồng lấn (trừ track overlay); thao tác gây chồng lấn phải bị từ chối hoặc tự đẩy.
- `trim` không được làm `out <= in`; `split_at` ngoài khoảng clip thì không làm gì.
- Snap vào: đầu/cuối clip khác, cue caption, playhead (ngưỡng ~0.1 s).

## UI (M4)
- UI chỉ gọi các `Command`, rồi vẽ lại từ mô hình. Không để logic sửa dữ liệu trong widget.
- Preview dùng proxy 540×960, đồng bộ theo audio clock.
- Chốt lựa chọn công nghệ UI trong `docs/adr-ui.md` trước khi viết UI.

## Test
- Mỗi thao tác một test; mỗi thao tác kiểm tra cả `undo`.
- Test thuộc tính (nếu dùng `hypothesis`): sau chuỗi thao tác ngẫu nhiên, không có clip chồng lấn và mọi thời gian ≥ 0.
````

### Skill 6 — `ffmpeg-render`

````markdown
---
name: ffmpeg-render
description: Dựng video 9:16 từ project.json bằng FFmpeg (ghép clip, crop cover, mix audio, burn ASS, ducking, tiến độ). Dùng khi làm hoặc sửa module render/.
---

# Render bằng FFmpeg

## Yêu cầu đầu ra
1080×1920, 30 fps, H.264 (`libx264`, `yuv420p`) + AAC; chế độ draft 540×960 với preset nhanh.

## Quy trình
1. Kiểm tra `ffmpeg` và `ffprobe` có trong PATH lúc khởi động; thiếu thì báo hướng dẫn cài.
2. Đọc `project.json`, dựng filter graph bằng hàm thuần (`ffmpeg_graph.py`) để dễ test, chưa gọi FFmpeg.
3. Mỗi clip video: `trim`, `setpts`, `scale` + `crop` kiểu cover về 9:16; ảnh tĩnh dùng `zoompan` nhẹ.
4. Audio: mix giọng + nhạc nền; ducking nhạc bằng `sidechaincompress` khi `duck: true`.
5. Burn phụ đề: `ass=<file>:fontsdir=<dir>`.
6. Chạy FFmpeg bằng `subprocess`, đọc `-progress pipe:1` để báo phần trăm; hỗ trợ huỷ.

## Lưu ý
- Escape đường dẫn trong filter (đặc biệt Windows và khoảng trắng); ưu tiên truyền đường dẫn tương đối hoặc file filter script.
- Không nối chuỗi lệnh shell; truyền danh sách đối số.
- Giữ file tạm trong `cache/`, xoá khi xong.

## Test
- Test hàm dựng graph bằng so sánh với kết quả mong đợi (không cần chạy FFmpeg).
- Test tích hợp nhỏ: render project mẫu 3 giây, dùng `ffprobe` kiểm tra kích thước, fps, thời lượng, có luồng audio.
````

### Skill 7 — `qa-verify`

````markdown
---
name: qa-verify
description: Kiểm tra chất lượng trước khi báo hoàn thành một milestone (test, lint, type-check, kiểm tra acceptance criteria, chạy thử end-to-end). Dùng cuối mỗi nhiệm vụ.
---

# Kiểm tra trước khi báo hoàn thành

1. Chạy `pytest -q`, `ruff check .`, `mypy src` và dán kết quả thật vào báo cáo (không tóm tắt chung chung).
2. Đối chiếu từng Acceptance Criteria liên quan trong `PRD.md` mục 9: đạt / chưa đạt / chưa kiểm tra, kèm bằng chứng (lệnh, file đầu ra).
3. Chạy thử end-to-end bằng dữ liệu mẫu trong `examples/`; kiểm tra file đầu ra bằng `ffprobe` khi có video.
4. Kiểm tra không có API key trong mã hoặc log; `.env.example` đã cập nhật.
5. Cập nhật README và `docs/assumptions.md` nếu có thay đổi hành vi hoặc giả định mới.
6. Liệt kê rõ phần chưa làm hoặc còn rủi ro. Không tuyên bố "xong" nếu còn tiêu chí chưa đạt.
````

## B4. Prompts

> Dán từng prompt cho agent, theo thứ tự. Thay các giá trị trong `[...]` nếu cần.

### P0 — Phân tích repo tham khảo

````text
Đọc `PRD.md` và `AGENTS.md` ở thư mục gốc. Sau đó dùng skill `project-analysis` để phân tích repo tham khảo:
https://github.com/MaiPhuc1506/Auto_GenVid.git

Yêu cầu:
- Clone về thư mục tạm, không sửa repo gốc.
- Viết `docs/reference-analysis.md`: sơ đồ luồng (mermaid), bảng "tái sử dụng / viết lại / bỏ" cho từng thành phần kèm lý do, rủi ro, và ánh xạ sang các FR trong PRD.
- Kiểm tra giấy phép của repo; nếu không rõ giấy phép thì chỉ lấy ý tưởng, không copy mã.
- Phân biệt rõ điều đã xác minh trong mã với điều suy đoán.
- Nếu không truy cập được repo, dừng và báo cho tôi thay vì đoán nội dung.
Chưa viết code sản phẩm ở bước này.
````

### P1 — Khung dự án và M1 (MVP CLI)

````text
Đọc `PRD.md`, `AGENTS.md`, `docs/reference-analysis.md` và các skill `script-llm`, `tts-edge`, `captions-srt`, `ffmpeg-render`, `qa-verify`.

Nhiệm vụ: hoàn thành milestone M1.
1. Dựng khung dự án theo PRD mục 7 (pyproject, `src/techreel`, `tests`, `.env.example`, ruff/mypy/pytest).
2. Cài đặt: core models (pydantic), `LLMProvider` + `FakeProvider`, `TTSProvider` + `EdgeTTSProvider` + cache, dựng cue từ timestamp, ghi ASS, render FFmpeg draft và full.
3. CLI: `techreel make --topic "..." --preset news_short --out out.mp4`; thêm `--script-only` để dừng sau bước kịch bản cho tôi duyệt.
4. Ví dụ chạy được trong `examples/` dùng `FakeProvider` (chạy không cần mạng/API key).
5. Test đơn vị cho từng module; một test tích hợp render 3 giây kiểm tra bằng `ffprobe`.

Hoàn thành khi acceptance criteria 1, 2 và 8 trong PRD mục 9 đạt. Dùng skill `qa-verify` và báo cáo theo mẫu trong `AGENTS.md`.
````

### P2 — M2 (Caption/SRT)

````text
Đọc `PRD.md`, `AGENTS.md` và skill `captions-srt`, `qa-verify`.

Nhiệm vụ: hoàn thành milestone M2.
- Thêm lệnh `techreel export-srt <project>` và `techreel import-srt <project> <file.srt>`.
- Thêm `techreel srt-to-voice <file.srt>`: tạo giọng đọc từ từng cue và ghép theo thời gian cue; cảnh báo khi audio dài hơn cue.
- Style ASS `tiktok_bold`, có tuỳ chọn highlight từ đang đọc; đóng gói font hỗ trợ tiếng Việt và truyền `fontsdir`.
- Test round-trip SRT (có BOM, CRLF, tiếng Việt có dấu), test cue không chồng lấn.

Hoàn thành khi acceptance criteria 3 và 4 đạt. Chạy `qa-verify` và báo cáo.
````

### P3 — M3 (Assets)

````text
Đọc `PRD.md`, `AGENTS.md` và `qa-verify`.

Nhiệm vụ: hoàn thành milestone M3.
- Upload ảnh/video cục bộ vào project (copy vào `assets/`, ghi metadata).
- `StockProvider` + `PexelsProvider` (API key từ `.env`) + `FakeStockProvider` cho test; tải theo `visual_keywords` của từng cảnh, lưu nguồn và giấy phép.
- Tự crop/scale về 9:16 kiểu cover; ảnh tĩnh có Ken Burns nhẹ.
- Tự gán asset vào track video theo thời lượng từng cảnh.
- Xử lý lỗi: không tìm thấy asset thì dùng nền màu/gradient mặc định, không làm hỏng project.

Có test cho phần gán asset theo cảnh và phần crop. Chạy `qa-verify` và báo cáo.
````

### P4 — M4 (Timeline editor)

````text
Đọc `PRD.md`, `AGENTS.md` và skill `timeline-model`, `ffmpeg-render`, `qa-verify`.

Nhiệm vụ: hoàn thành milestone M4, theo thứ tự:
1. Viết `docs/adr-ui.md` chốt công nghệ UI (mặc định PySide6; nêu lý do nếu chọn khác).
2. Cài đặt đầy đủ mô hình + Command + undo/redo trong `timeline/` và test từng thao tác (chưa làm UI).
3. Làm UI: nhiều track, kéo thả, trim, split tại playhead, ripple delete, snap, zoom, chỉnh text cue caption, panel thuộc tính (volume, fit), preview proxy 540×960 đồng bộ audio, nút Render.
4. UI chỉ gọi Command, không tự sửa dữ liệu; lưu/mở `project.json`.

Hoàn thành khi acceptance criteria 5 và 6 đạt. Quay một GIF ngắn thao tác trên UI để vào README. Chạy `qa-verify` và báo cáo.
````

### P5 — M5 (Hoàn thiện)

````text
Đọc `PRD.md`, `AGENTS.md` và `qa-verify`.

Nhiệm vụ: hoàn thành milestone M5.
- Nguồn tin: RSS cấu hình trong file YAML + nhận URL bài báo (trích title/nội dung/ảnh), lưu nguồn vào project để ghi credit.
- Preset kịch bản: `news_short`, `review_60s`, `top_list`.
- Preset style caption/giọng đọc, lưu và chọn lại được.
- Hàng đợi render chạy nền, hiển thị tiến độ, huỷ được.
- Hoàn thiện xử lý lỗi (mất mạng, hết quota, thiếu FFmpeg) với thông báo thân thiện.
- README: cài đặt, ví dụ lệnh, ảnh/GIF demo, mục "Lưu ý bản quyền và nhãn nội dung AI".

Hoàn thành khi toàn bộ acceptance criteria trong PRD mục 9 đạt. Chạy `qa-verify` và báo cáo.
````

### P6 — Nâng cấp một tính năng

````text
Đọc `PRD.md`, `AGENTS.md`, mã hiện tại và các skill liên quan.

Tôi muốn nâng cấp: [mô tả tính năng, ví dụ: "thêm hiệu ứng zoom theo nhịp giọng đọc" / "thêm provider TTS dự phòng" / "thêm xuất thêm tỉ lệ 1:1"].

Làm theo thứ tự:
1. Cập nhật `PRD.md`: thêm user story, yêu cầu chức năng (FR mới) và acceptance criteria cho tính năng này.
2. Nêu ngắn gọn phương án thiết kế và tác động lên `project.json` (nếu đổi schema thì tăng `schema_version` và viết migrate).
3. Cài đặt kèm test; không phá vỡ test cũ.
4. Chạy `qa-verify` và báo cáo theo mẫu trong `AGENTS.md`.
Nếu có điểm mơ hồ, chọn phương án đơn giản nhất và ghi giả định vào `docs/assumptions.md`.
````

### P7 — Review và refactor

````text
Đọc `PRD.md`, `AGENTS.md` và mã nguồn hiện tại. Đóng vai reviewer khó tính.

Nhiệm vụ:
1. Rà soát toàn bộ `src/` theo: đúng PRD, ranh giới module (không có logic nghiệp vụ trong UI), xử lý lỗi, bảo mật (API key, shell injection khi gọi FFmpeg), hiệu năng render, độ phủ test.
2. Liệt kê vấn đề theo mức độ (cao/trung bình/thấp) kèm file và dòng cụ thể trong `docs/review.md`.
3. Sửa các vấn đề mức cao và trung bình, mỗi vấn đề một commit nhỏ có test.
4. Chạy `qa-verify`; báo cáo những gì đã sửa và những gì cố ý để lại.
Không đổi hành vi công khai (CLI, `project.json`) trừ khi có migrate và ghi rõ trong báo cáo.
````

### P8 — Sửa lỗi

````text
Đọc `AGENTS.md`. Tôi gặp lỗi sau:

[dán log lỗi / mô tả hiện tượng / các bước tái hiện]

Làm theo thứ tự:
1. Tái hiện lỗi bằng một test thất bại (viết test trước).
2. Tìm nguyên nhân gốc và giải thích ngắn gọn (không chỉ vá triệu chứng).
3. Sửa tối thiểu, test mới phải pass và không làm hỏng test cũ.
4. Chạy `qa-verify` và báo cáo.
````

---

**Gợi ý thực tế khi giao việc cho agent:** giao từng prompt một, đọc kết quả và chạy thử video thật sau mỗi milestone rồi mới sang bước kế. Lỗi tích luỹ qua nhiều milestone khó sửa hơn nhiều so với lỗi phát hiện sớm.
