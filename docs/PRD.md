# PRD v3 — Audio→SRT, ZeroTTS ổn định, template dựng hình (M8–M10)

> Bản cập nhật bổ sung cho `PRD.md` và `PRD2.md` ở thư mục gốc (khi mâu thuẫn kỹ thuật: PRD2 > PRD, và tài liệu này chỉ **thêm** M8–M10, không thay đổi M0–M7).
> Ngày khảo sát: 2026-11-06. Nhánh làm việc hiện tại: `feat/m5-voice-style-studio`. Quy tắc agent: `AGENTS.md` (TypeScript/Node ≥22, ESM, Zod, Vitest, HyperFrames; tương thích ngược; dịch vụ ngoài nằm sau interface và có fake; không commit key).

---

## 1. Kết quả khảo sát (bằng chứng thật, không suy đoán)

### 1.1 Audio → SRT: **chưa có**
- Không có thành phần ASR/STT nào: `package.json`, `.env.example`, `.venv`, `.zerotts-venv` không có whisper/faster-whisper/vosk.
- `src/captions/audio-aligner.ts` chỉ dùng FFmpeg `silencedetect` để tìm khoảng lặng rồi **phân phối câu có sẵn** vào các đoạn có tiếng (`distributeSentencesAcoustically`). Nó không nghe được nội dung nên cần người dùng cung cấp transcript hoặc SRT. Đây là lý do UI Creative Mode từng bắt buộc dán Voice Script.
- Hiện đã có (thay đổi trong working tree, chưa commit): nếu thiếu transcript mà có SRT thì lấy text từ SRT (`creative-builder.ts`, `routes.ts`). Nhưng **audio mà không có SRT thì vẫn không làm được**.
- Bằng chứng chất lượng SRT ngoài: `output/weftcut-weftcut-20261101232313-ba72dc9e/captions.srt` (SRT do công cụ ngoài tạo) có nhiều lỗi nghe nhầm tiếng Việt: "dựn video", "máng nguồn mở", "trình xưa", "kết ngối", "sử lý âm thanh", "Cloud" thay "Claude", "chúng mày". Các lỗi này hiện **hiện nguyên văn lên video**. `timing-quality.json` ghi `wordAccuracy: "low"`.

### 1.2 ZeroTTS: **có, dùng được, nhưng có 5 vấn đề**
Đã kiểm tra thực tế trên máy này (Linux, 16 luồng CPU, 15 GB RAM, không GPU), `zerotts==0.1.5`, model revision `c2bfbd67…` (1,7 GB, đã có trong `.zerotts-models`):

| Hạng mục | Kết quả đo |
|---|---|
| Nạp model | ~9 giây |
| Tổng hợp 1 câu 6,6s audio | 12,2 giây (RTF ≈ 1,8 — chậm hơn thời gian thực) |
| Qua đúng đường ứng dụng (`ZeroTtsClient` → worker loopback → ffmpeg MP3) | **OK**, 13,3 giây, MP3 hợp lệ |
| 8 giọng (`quangminh, tiendat, giahuy, huuduc, maichi, baotrang, kimoanh, hamy`) | **8/8 tạo được**, âm thanh khác nhau, không lỗi |
| 4 yêu cầu đồng thời | Worker xử lý tuần tự: 16s → 34s → 55s → 78s (tổng 77,7s) |
| Test đơn vị `zerotts-client.test.ts` | 3/3 pass (worker được mock) |

Vấn đề phát hiện:
1. **Âm lượng lệch lớn giữa các giọng**: mean volume từ −15,8 dB (`huuduc`, đỉnh −0,2 dB → nguy cơ clip khi trộn) đến −25,3 dB (`hamy`) — chênh ~9,5 dB. Chưa có chuẩn hóa loudness, ảnh hưởng ducking nhạc nền (M5) và nghe không đều giữa các cảnh/video.
2. **Không có word timing**: worker chỉ trả WAV. `cachedSpeechLocal` rơi về `estimateWordTimings` → `accuracy: "low"` → highlight từng từ trong caption **lệch** (đã thấy trong frame thật: tô sai "từng", "không", "có", "di"). Edge TTS có WordBoundary nên không bị.
3. **Tốc độ**: RTF 1,5–1,8 và tuần tự (khóa `lock` trong worker) → video 60 giây mất khoảng 100–110 giây chỉ để đọc; nhiều cảnh không chạy song song được; UI không có tiến độ theo cảnh/ETA. `intra_op_num_threads=4` cố định trong `load_model`.
4. **Race khi khởi động worker giữa nhiều tiến trình** (`ensureZeroWorker` chỉ có guard trong cùng một tiến trình; web server + CLI/pipeline cùng gọi sẽ spawn hai worker, tiến trình sau lỗi `OSError: Address already in use` — thấy trong `.zerotts-runtime/worker.log`). Health check 1,2s quá ngắn trong lúc model đang nạp.
5. **Không chạy được trong sandbox cô lập loopback** (kiểm tra bằng agent: báo "ZeroTTS chưa khởi động được"), chạy bình thường ngoài sandbox. Lỗi báo chưa phân biệt "chưa cài" / "đang nạp" / "bị chặn mạng loopback" / "port bị chiếm bởi dịch vụ khác".

Điểm tốt cần giữ: bind 127.0.0.1, token cục bộ, từ chối Origin, giới hạn kích thước, không fallback im lặng sang provider khác, cache theo (text đã đọc + voice + revision).

### 1.3 Template khi hiển thị video: **cần cải thiện**
Khảo sát frame thật của `weftcut-…232313` (9 cảnh, `templatePack: reference`, 1080×1920, 100s) tại t = 2, 15, 30, 50, 70, 90s:
1. **Khoảng trống dọc lớn**: `.ref-composition` neo cố định `top:289px; max-height:1040px`. Cảnh ít nội dung (feature-list, stat-hero, comparison) chỉ lấp ~⅓–½ vùng, để lại khoảng trống lớn giữa thẻ và caption (y≈1390). Bố cục lệch lên trên, không cân đối.
2. **Chữ trong thẻ quá nhỏ** so với canvas 1080 (phần mô tả phụ trong feature-list, nhãn "VÍ DỤ TỪ NGUỒN · CHƯA CHẠY KIỂM CHỨNG", chip nhỏ); khó đọc trên điện thoại khi xem ở kích thước thật. CSS có nhiều cỡ 18–29px cho nội dung chính.
3. **Thẻ gần như rỗng**: cảnh `stat-hero` "MIT" có thẻ lớn nhưng thông tin ít, trống phần dưới; cảnh `data-flow` nhiều khung nhỏ chồng nhau.
4. **Đơn điệu / lặp**: nhiều cảnh liên tiếp cùng dạng thẻ kính; thiếu nhấn thị giác (biểu tượng lớn, tỉ lệ chữ tương phản) giữa các cảnh.
5. **Caption**: nằm ở y≈1390 (gần vùng UI TikTok phía dưới ~380px); highlight sai do mục 1.2; nội dung caption lấy nguyên SRT nên mang lỗi chính tả ASR (mục 1.1).
6. Bố cục tự co chữ theo độ dài (`heading()`, `cell()`, `stat-hero`) nhưng **không có kiểm tra tự động** để chặn tràn/quá nhỏ/quá trống; chỉ có test chuỗi HTML.

---

## 2. Mục tiêu và non-goals (M8–M10)

**Mục tiêu**
- G1: Từ một file MP3/WAV (không cần SRT, không cần dán kịch bản) tạo được SRT + timing từng từ, chạy **local**, ưu tiên tiếng Việt, rồi dựng video bằng Creative Mode.
- G2: ZeroTTS ổn định, âm lượng nhất quán, có word timing thật, khởi động không tranh chấp, lỗi báo rõ nguyên nhân.
- G3: Template lấp đầy vùng an toàn cân đối, chữ đủ lớn, có kiểm tra tự động để không tái diễn.

**Non-goals**: không dùng dịch vụ ASR đám mây làm mặc định; không train/fine-tune model; không clone giọng; không viết lại pipeline; không đổi stack; không làm streaming real-time.

**Ràng buộc chung**: mọi trường mới tuỳ chọn, `script.json` cũ chạy như trước; test không tải model thật và không gọi mạng (dùng fake + `nock`); không commit model/venv/key (đã gitignore `.zerotts-*`, thêm `.asr-*`); quyết định lớn ghi `docs/adr-XXXX.md`; điểm mơ hồ ghi `docs/assumptions.md`.

---

## 3. Milestone

### M8 — Audio → SRT (ASR cục bộ)
Nhánh: `feat/m8-audio-to-srt`.

**Lựa chọn kỹ thuật (đề xuất, ghi ADR `docs/adr-0009-local-asr.md`)**
- Engine: `faster-whisper` (CTranslate2, MIT) trong venv riêng `.asr-venv` (giống cách `.zerotts-venv` tách biệt), chạy qua worker/CLI Python nhỏ `scripts/asr_worker.py`; Node gọi qua interface.
- Model mặc định: **PhoWhisper** bản CTranslate2 (tinh chỉnh cho tiếng Việt) — agent phải xác minh nguồn model, **license** và hash/revision cố định trước khi dùng; nếu không khả dụng thì dùng `large-v3`/`medium` của Whisper làm dự phòng có cấu hình (`ASR_MODEL`). Không tự suy đoán tên repo model: phải mở trang model/đọc tài liệu để xác nhận.
- CPU `int8` mặc định, tự dùng GPU nếu có (`ASR_DEVICE=auto`). Tham số: `language=vi`, `word_timestamps=true`, `vad_filter=true`, `condition_on_previous_text=false`, ngưỡng chống lặp/hallucination.

**Yêu cầu**
1. Interface `AsrClient { transcribe(audioPath, opts): Promise<AsrResult> }` với `AsrResult = { language, segments[{startMs,endMs,text}], words[{text,startMs,endMs,probability}] }`; bản `FakeAsrClient` cho test; bản `FasterWhisperClient` gọi worker. Không ghi key/đường dẫn nhạy cảm ra log.
2. Chuyển kết quả sang `CaptionCue[]` hiện có (`src/captions/types.ts`), `accuracy: "high"` khi có word timestamps; xuất SRT bằng `generateSrt`. Tách cue theo giới hạn ký tự/giây phù hợp TikTok (tối đa 2 dòng, ~32 ký tự/dòng — cấu hình được).
3. **Sửa lỗi chính tả bằng kịch bản**: nếu người dùng có sẵn Voice Script thì dùng **văn bản của kịch bản, thời gian của ASR** (căn chỉnh từ ASR ↔ từ kịch bản; tái dùng/ mở rộng `alignSpokenWords`/`spoken-alignment.ts`, `calculateTextOverlap`); cảnh báo khi độ khớp thấp (đã có `mismatchWarning`). Nếu không có kịch bản: giữ văn bản ASR nhưng có bước người dùng sửa trước khi dựng.
4. API: `POST /api/studio/transcribe` (nhận `uploadId` đã tải qua `/api/studio/uploads`, tuỳ chọn `scriptText`, `language`) trả `{ srt, cues, words, durationSec, quality }`; lỗi luôn JSON. Tác vụ dài: có tiến độ (SSE hoặc job id) và huỷ được; giới hạn 10 phút audio như `saveUpload`.
5. CLI: `npm run asr -- <audio> [--out file.srt] [--script file.txt]`; `npm run asr:setup` cài venv + tải model theo revision ghim (giống `zerotts:setup`), in dung lượng dự kiến.
6. UI Creative Mode: nút **"Tạo SRT từ audio"**; nếu chưa có SRT và chưa dán kịch bản, bấm tạo video sẽ tự chạy ASR; hiển thị transcript/cue có thể sửa (sửa chữ, gộp/tách cue) trước khi dựng; ghi rõ chất lượng (`wordAccuracy`, nguồn `asr`/`imported-srt`). Ô kịch bản vẫn tuỳ chọn.
7. `audio-aligner.ts`: thêm nguồn timing `"asr-words"` ưu tiên cao hơn `acoustic-speech-segments`; chế độ highlight `accurate-only` khi có word timing; giữ nguyên hành vi cũ khi không có ASR.
8. Cache theo `sha256(audio) + model revision + options`; đặt trong `.asr-cache/` (gitignore).

**Tiêu chí chấp nhận**
- A8.1: Với audio mẫu tiếng Việt ≥ 60s (fixture ngắn trong `tests/fixtures`, tổng hợp bằng Edge/ZeroTTS hoặc audio bản quyền cho phép), WER so với văn bản gốc được đo và ghi vào `docs/asr-validation.md` (mục tiêu đề xuất ≤ 12% không dùng kịch bản; sau căn chỉnh bằng kịch bản chữ hiển thị = kịch bản 100%).
- A8.2: Lệch thời gian từ so với audio gốc (kiểm tra thủ công ≥ 10 điểm mẫu hoặc so với Edge WordBoundary) ≤ 150 ms ở ≥ 90% từ.
- A8.3: Upload audio không SRT, không kịch bản → ra video render thật, `ffprobe`: 1080×1920, có audio, thời lượng khớp audio ±0,1s.
- A8.4: Test không cần model thật/mạng; có test cho fake ASR, chuyển cue, căn chỉnh theo kịch bản, lỗi worker, timeout, file hỏng.
- A8.5: Fixture v1 và các test cũ vẫn pass.

### M9 — ZeroTTS: độ tin cậy, âm lượng, word timing
Nhánh: `feat/m9-zerotts-hardening`.

**Yêu cầu**
1. **Khởi động an toàn đa tiến trình**: dùng lock file/`pidfile` trong `.zerotts-runtime` (hoặc cổng/`/health` có trạng thái `loading|ready`); health check chờ theo trạng thái `loading` thay vì spawn lần hai; không spawn khi đã có worker đúng revision; xử lý port bị chiếm bởi dịch vụ khác (báo rõ, không xoá tiến trình lạ).
2. **Lỗi chẩn đoán được**: phân biệt "chưa cài" / "đang nạp model (x giây)" / "không kết nối được loopback" / "port bị chiếm" / "synthesis lỗi"; hiển thị trong `/api/studio/options` và UI; đọc đuôi `worker.log` an toàn (không lộ văn bản đọc).
3. **Chuẩn hóa âm lượng**: sau khi đổi sang MP3, áp `loudnorm` (mục tiêu ~ −16 LUFS, true peak ≤ −1,5 dBTP) hoặc `dynaudnorm`+limiter cho **đầu ra ZeroTTS**; giữ nguyên hành vi Edge/ElevenLabs trừ khi bật cờ chung `voice.normalizeLoudness`. Đưa vào fingerprint cache.
4. **Word timing thật**: sau khi tổng hợp từng cảnh, chạy `AsrClient` (M8) ở chế độ forced/aligned với `scriptText` = văn bản đã đọc (đã qua lexicon) để lấy timing từng từ, `accuracy: "high"`; nếu ASR không khả dụng thì giữ `estimateWordTimings` và đánh dấu `low` (không đổi hành vi cũ). Căn chỉnh về văn bản hiển thị bằng `alignSpokenWords`.
5. **Hiệu năng**: cấu hình `ZEROTTS_THREADS` (mặc định = min(8, số lõi vật lý)); đo lại RTF; chia câu 12s như hiện tại nhưng tái dùng kết quả theo đoạn (cache theo đoạn) để sửa một câu không phải đọc lại cả cảnh; hiển thị tiến độ theo cảnh/ETA trong job (`stepMessage`); timeout theo độ dài văn bản thay vì cố định 300s; worker tự thoát sau thời gian rảnh (cấu hình) để nhả RAM.
6. **Tài liệu & kiểm thử**: cập nhật `docs/huong-dan-zerotts.md` (dung lượng 1,7 GB, lần đầu tải model, chạy ngoài sandbox cô lập mạng, RTF kỳ vọng); thêm `docs/zerotts-validation.md` mục kết quả mới. Test với worker giả (HTTP giả lập) cho race, trạng thái `loading`, port bị chiếm, chuẩn hóa loudness (đo bằng ffmpeg trên tín hiệu tổng hợp).

**Tiêu chí chấp nhận**
- A9.1: Hai tiến trình Node gọi tổng hợp cùng lúc khi chưa có worker → đúng **một** worker chạy, cả hai thành công, `worker.log` không có `Address already in use`.
- A9.2: 8 giọng cùng câu mẫu sau chuẩn hóa: chênh `mean_volume` ≤ 2 dB và đỉnh ≤ −1 dB (đo bằng `ffmpeg volumedetect`/`ebur128`, dán kết quả thật).
- A9.3: Caption của video dùng ZeroTTS có `accuracy: "high"` và highlight đúng từ (kiểm tra ≥ 10 mốc thủ công); khi tắt ASR thì quay về hành vi cũ không lỗi.
- A9.4: Render mẫu ≥ 60s bằng ZeroTTS: `ffprobe` 1080×1920 + audio, thời lượng hợp lý; ghi thời gian tổng hợp thực tế.
- A9.5: Lỗi báo đúng nguyên nhân cho 5 tình huống ở yêu cầu 2.

### M10 — Template: lấp đầy, dễ đọc, có kiểm tra tự động
Nhánh: `feat/m10-template-polish`. Dùng skill `hyperframes-templates`; mọi thay đổi phải **deterministic**, đúng 9:16 và đúng cả theme sáng/tối (đã có `styles.light-pro.css`).

**Yêu cầu**
1. **Cân bằng dọc**: thay neo cố định `top:289px` bằng bố cục theo "vùng an toàn" (trên: sau header ~ y≥200; dưới: trước vùng caption/UI TikTok). Nội dung được **căn giữa theo chiều dọc** trong vùng đó; cảnh ít nội dung tự **phóng to** (scale/gap/padding) tới giới hạn (đề xuất ≤ 1,25×) thay vì để trống; cảnh nhiều nội dung tự thu nhỏ nhưng không dưới ngưỡng chữ tối thiểu (xem mục 2).
2. **Ngưỡng chữ tối thiểu** (canvas 1080): nội dung chính ≥ 34px, mô tả phụ ≥ 28px, nhãn/chip ≥ 24px; thay các cỡ 18–23px đang dùng cho nội dung đọc được. Khi không đủ chỗ thì **rút gọn nội dung** (đã có `condenseVisualText`) hoặc tách cảnh, không thu nhỏ chữ.
3. **Cảnh rỗng/thưa**: `stat-hero`, `callout`, `comparison`: biến thể bố cục lớn hơn (số/biểu tượng lớn, nhãn phụ, thanh minh hoạ) để lấp thẻ; `data-flow`: tối đa 4 nút lớn, xếp dọc/đường nối rõ thay vì nhiều khung nhỏ.
4. **Đa dạng**: bộ chọn bố cục (`creative-planner.ts`) tránh 3 cảnh liên tiếp cùng template và cân bằng giữa chữ/hình; luôn ưu tiên tư liệu thật (screenshot/logo) khi có.
5. **Caption**: nâng caption lên ngoài vùng UI TikTok (đối chiếu `safe-zone` đã có ở M5: đáy ~380px, phải ~120px); chỉ highlight từng từ khi `accuracy: "high"` hoặc người dùng bật `estimated`; kích thước/độ tương phản đủ trên cả theme.
6. **Kiểm tra tự động bố cục** (mới): script dựng từng template với dữ liệu mẫu (ngắn/dài/cực dài/trống) → render khung hình bằng HyperFrames/headless thành PNG; kiểm tra: không tràn khỏi vùng an toàn, tỉ lệ lấp đầy khối nội dung ≥ ~55% chiều cao vùng an toàn, không phần tử có chữ nhỏ hơn ngưỡng, không chồng lên caption. Ảnh lưu `output/template-qa/`, thất bại → test đỏ. Đồng thời giữ snapshot hồi quy cho fixture v1.
7. Preview "xem thử bố cục" trong Studio dùng cùng logic mới.

**Tiêu chí chấp nhận**
- A10.1: Trên cùng nội dung `weftcut-…232313` (script.json) render lại: ở 6 mốc như khảo sát, khoảng trống giữa khối nội dung và caption giảm rõ rệt (đo bằng bounding box, ghi số trước/sau), không có chữ nội dung < 28px.
- A10.2: Bộ test bố cục tự động chạy cho mọi template × 4 mức nội dung × 2 theme và pass.
- A10.3: `script.json` cũ (không trường mới) vẫn render, hình ảnh không vỡ so với snapshot đã duyệt (hoặc thay đổi được ghi và người dùng duyệt).
- A10.4: Render mẫu: `ffprobe` 1080×1920, có audio, thời lượng khớp.

---

## 4. Thứ tự và phụ thuộc
M8 (ASR) → M9 (cần M8 cho word timing; các mục 1–3,5–6 làm độc lập được) → M10 (caption highlight phụ thuộc M8/M9). Mỗi milestone một nhánh `feat/<mX-tên>`, commit nhỏ, không push thẳng `main`.

## 5. Rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Model ASR tiếng Việt nặng/chậm trên CPU | int8, VAD, cache theo hash, mô hình nhỏ làm tuỳ chọn; ghi RTF thật |
| ASR nghe nhầm thuật ngữ tiếng Anh/tên riêng | Ưu tiên căn chỉnh theo kịch bản; từ điển `lexicon`; bước sửa tay trước khi dựng |
| License/nguồn model không rõ | Xác minh license + ghim revision trước khi thêm; ghi vào ADR và `assets/third-party/` |
| Tải model 1–3 GB | `asr:setup` rõ dung lượng; không tải khi test; thư mục gitignore |
| Thay đổi bố cục làm hỏng video cũ | Biến thể mới chỉ áp dụng khi cờ/ phiên bản mới; snapshot hồi quy |
| ZeroTTS chậm với video dài | Cache theo đoạn, tiến độ/ETA, cấu hình luồng |

## 6. Việc người dùng cần quyết định
1. Model ASR mặc định: PhoWhisper (chính xác tiếng Việt hơn, nên dùng nếu license cho phép) hay Whisper `large-v3` (đa ngôn ngữ, nặng hơn)?
2. Có chấp nhận chuẩn hóa loudness áp mặc định cho ZeroTTS không (đề xuất: có)?
3. Mức phóng to tối đa cho cảnh thưa (đề xuất 1,25×) và ngưỡng chữ tối thiểu ở mục M10.2.
