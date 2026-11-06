# Prompt cho AI agent — M8 / M9 / M10

Dùng kèm `docs/PRD.md` (PRD v3). Dán nguyên khối vào agent. Mỗi prompt độc lập; chạy theo thứ tự M8 → M9 → M10 hoặc dùng P-ALL.

Lưu ý môi trường đã kiểm chứng: ZeroTTS/ASR cần mở cổng loopback; **trong sandbox cô lập mạng sẽ báo "chưa khởi động được"**, hãy chạy kiểm thử thật ngoài sandbox (xin quyền người dùng nếu cần). Máy mẫu: 16 luồng CPU, không GPU.

---

## P-START — Khởi động (dán trước mỗi phiên)

```
Bạn làm việc trong repo /home/tho/AutoGen_ver2 (TypeScript/Node ≥22, ESM, Zod, Vitest, HyperFrames).
Đọc theo thứ tự: AGENTS.md, docs/PRD.md (PRD v3, ưu tiên cho M8–M10), PRD2.md, PRD.md, docs/assumptions.md,
docs/adr-zerotts.md, docs/huong-dan-zerotts.md, docs/zerotts-validation.md.
Đọc các skill: repo-audit, captions-timing, schema-evolution, hyperframes-templates, qa-verify (thư mục .agents/skills).
Quy tắc cứng: không đổi stack/ngôn ngữ; mọi trường mới là tuỳ chọn và script.json cũ phải chạy; dịch vụ ngoài nằm sau
interface và có fake, test không gọi mạng/không tải model thật; không commit key/model/venv (thêm vào .gitignore);
không bịa API thư viện — mở mã nguồn/tài liệu đúng phiên bản; quyết định lớn ghi docs/adr-XXXX.md; điểm mơ hồ chọn
phương án đơn giản nhất, ghi docs/assumptions.md và tiếp tục.
Một milestone = một nhánh feat/<mX-tên>, commit nhỏ, không push main.
Trước khi báo xong BẮT BUỘC chạy và dán kết quả THẬT: npx tsc --noEmit, npm test, và một lần render mẫu kiểm bằng
ffprobe (1080×1920, có audio, thời lượng hợp lý). Báo cáo theo mẫu 5 mục trong AGENTS.md; mỗi tiêu chí chấp nhận ghi
đạt / chưa đạt / chưa kiểm tra kèm bằng chứng. Không tuyên bố xong khi còn tiêu chí chưa đạt.
Trước khi code: chạy `git status`; hiện working tree có thay đổi chưa commit (creative-builder.ts, routes.ts,
public/app.js, index.html, server.ts...). Không revert; commit chúng thành một commit riêng trên nhánh mới nếu chúng
liên quan, hoặc hỏi người dùng.
```

---

## P-M8 — Audio → SRT (ASR cục bộ)

```
Nhiệm vụ: làm M8 trong docs/PRD.md (nhánh feat/m8-audio-to-srt). Mục tiêu: upload MP3/WAV, KHÔNG cần SRT và KHÔNG cần
dán kịch bản, vẫn ra SRT + timing từng từ và dựng được video Creative Mode.

Bước 0 (xác minh, ghi vào docs/asr-validation.md):
- Xác nhận hiện trạng: grep không có whisper/ASR; đọc src/captions/audio-aligner.ts, spoken-alignment.ts, estimator.ts,
  src/studio/creative-builder.ts, routes.ts, uploads.ts, public/app.js (khối Creative Mode).
- Chọn engine: faster-whisper trong venv riêng .asr-venv (giống .zerotts-venv). Mở trang model PhoWhisper bản
  CTranslate2 và trang faster-whisper để XÁC NHẬN tên repo model, license, kích thước, revision; ghim revision. Nếu
  PhoWhisper-ct2 không dùng được hợp pháp/ổn định, dùng Whisper (large-v3 hoặc medium) và ghi lý do vào docs/adr-0009-local-asr.md.
  Nêu rõ dung lượng tải với người dùng trước khi tải model.

Triển khai:
1. src/asr/types.ts: interface AsrClient, AsrResult (segments, words có probability). src/asr/fake-asr-client.ts cho test.
2. scripts/asr_worker.py (+ scripts/setup-asr.sh, npm script "asr:setup" và "asr"): đọc audio, language=vi,
   word_timestamps=true, vad_filter=true, condition_on_previous_text=false, chống lặp/hallucination, in JSON ra stdout.
   Không nhận đường dẫn model/URL từ client; cache .asr-cache theo sha256(audio)+revision+options (gitignore).
3. src/asr/faster-whisper-client.ts: spawn worker, timeout theo độ dài audio, huỷ được, lỗi rõ ràng (chưa cài / model
   chưa tải / hết thời gian / audio hỏng). Không log nội dung nhạy cảm.
4. src/asr/to-captions.ts: AsrResult → CaptionCue[] (accuracy "high" khi có word timing); tách cue ≤2 dòng, ~32 ký tự/dòng
   (cấu hình), generateSrt từ src/captions/srt.ts.
5. Căn chỉnh theo kịch bản: nếu có scriptText thì chữ hiển thị = kịch bản, thời gian = ASR (mở rộng spoken-alignment.ts /
   alignSpokenWords); cảnh báo khi độ khớp thấp (tái dùng calculateTextOverlap + mismatchWarning).
6. audio-aligner.ts: thêm nguồn "asr-words" ưu tiên hơn acoustic; highlightMode "accurate-only" khi timing cao. Không đổi
   hành vi khi không có ASR.
7. Route POST /api/studio/transcribe (uploadId, scriptText?, language?) → {srt, cues, words, durationSec, quality}; lỗi luôn
   JSON (xem middleware JSON error trong src/server.ts); tiến độ qua job/SSE như /api/progress.
8. UI Creative Mode (public/index.html, public/app.js): nút "Tạo SRT từ audio"; tự chạy ASR nếu thiếu SRT và kịch bản;
   hiển thị/sửa cue trước khi dựng; ghi rõ nguồn và chất lượng. Mọi fetch dùng parseJsonResponse.
9. Test (vitest, không model thật, không mạng): fake ASR, to-captions, căn chỉnh theo kịch bản, route (supertest/fetch như
   routes.test.ts), lỗi worker/timeout/file hỏng, hồi quy fixture v1.

Nghiệm thu: A8.1–A8.5 trong docs/PRD.md. Cần audio tiếng Việt thật ≥60s: tạo bằng Edge TTS (có WordBoundary làm
chuẩn đối chiếu) và ghi WER + sai lệch thời gian vào docs/asr-validation.md. Render mẫu từ audio KHÔNG SRT, dán ffprobe.
Báo cáo theo mẫu 5 mục.
```

---

## P-M9 — ZeroTTS: độ tin cậy, âm lượng, word timing

```
Nhiệm vụ: làm M9 trong docs/PRD.md (nhánh feat/m9-zerotts-hardening). Yêu cầu M8 đã merge (hoặc làm mục 1–3,5–6 trước).

Bối cảnh đã đo (xác minh lại, ghi vào docs/zerotts-validation.md): 8/8 giọng chạy được; RTF ≈1,5–1,8 CPU; worker tuần tự;
mean volume lệch −15,8 dB (huuduc, đỉnh −0,2) … −25,3 dB (hamy); không có word timing → highlight caption lệch; race spawn
worker giữa nhiều tiến trình gây "Address already in use" (xem .zerotts-runtime/worker.log); lỗi khởi động không phân biệt nguyên nhân.

Triển khai (đọc src/tts/zerotts-client.ts, zerotts-settings.ts, scripts/zerotts_worker.py, src/studio/voice.ts trước):
1. Khởi động an toàn đa tiến trình: lock/pidfile + /health có trạng thái loading|ready; chờ khi loading, không spawn lần hai;
   port bị chiếm bởi dịch vụ lạ → báo rõ, không kill tiến trình lạ. Test với worker HTTP giả (race, loading, port bận).
2. Lỗi chẩn đoán: chưa cài / đang nạp / không kết nối loopback / port bị chiếm / synthesis lỗi; hiện trong
   /api/studio/options và UI; đọc đuôi worker.log nhưng không lộ văn bản đọc/token.
3. Chuẩn hóa loudness cho đầu ra ZeroTTS (loudnorm ≈ −16 LUFS, TP ≤ −1,5 dBTP) sau bước ffmpeg→MP3; thêm vào fingerprint
   cache (src/studio/voice.ts speechFingerprint); cờ chung voice.normalizeLoudness cho provider khác, mặc định giữ nguyên.
4. Word timing thật: sau mỗi cảnh chạy AsrClient (M8) với văn bản đã đọc để có timing từ, accuracy "high", rồi
   alignSpokenWords về văn bản hiển thị. Không có ASR → giữ estimateWordTimings (low), không lỗi.
5. Hiệu năng: ZEROTTS_THREADS (mặc định min(8, lõi vật lý)); cache theo đoạn câu; tiến độ theo cảnh/ETA trong stepMessage;
   timeout theo độ dài văn bản; worker tự thoát khi rảnh (cấu hình). Đo lại RTF và ghi số thật.
6. Cập nhật docs/huong-dan-zerotts.md (1,7 GB, tải lần đầu, loopback/sandbox, RTF) và .env.example (ZEROTTS_THREADS,
   idle timeout). Không commit model/venv.

Nghiệm thu A9.1–A9.5: dán kết quả ffmpeg volumedetect/ebur128 của 8 giọng, log chứng minh một worker duy nhất khi hai tiến
trình gọi đồng thời, ffprobe video render ZeroTTS ≥60s, thời gian tổng hợp thật. Báo cáo theo mẫu 5 mục.
```

---

## P-M10 — Template: lấp đầy, dễ đọc, kiểm tra tự động

```
Nhiệm vụ: làm M10 trong docs/PRD.md (nhánh feat/m10-template-polish). Dùng skill hyperframes-templates.

Khảo sát trước (ghi số đo vào docs/template-qa.md): render lại script của
output/weftcut-weftcut-20261101232313-ba72dc9e (templatePack reference), trích frame ở 2,15,30,50,70,90s bằng ffmpeg;
đo bounding box khối nội dung (.ref-composition) so với vùng an toàn, và cỡ chữ nhỏ nhất của nội dung đọc được. Xác nhận các
vấn đề: neo top:289px/max-height:1040px gây khoảng trống; chữ 18–29px; stat-hero/data-flow thưa/nhiều khung nhỏ; caption sát
vùng UI TikTok; highlight sai khi accuracy low. Đọc src/render/html-composer.ts, reference-scenes.ts, reference-design.ts,
templates/styles.reference.css, animations.js, studio/creative-planner.ts.

Triển khai (mọi thay đổi deterministic, đúng 9:16, đúng theme sáng/tối; trường mới tuỳ chọn, script cũ giữ nguyên hình):
1. Bố cục theo vùng an toàn: căn giữa khối nội dung theo chiều dọc; cảnh thưa tự phóng to (≤1,25×); cảnh dày thu nhỏ nhưng
   không dưới ngưỡng chữ (chính ≥34px, phụ ≥28px, nhãn ≥24px); thiếu chỗ thì rút gọn (condenseVisualText) hoặc tách cảnh.
2. Biến thể lớn cho stat-hero/callout/comparison; data-flow ≤4 nút lớn, đường nối rõ.
3. creative-planner: tránh ≥3 cảnh liên tiếp cùng template, ưu tiên screenshot/logo thật.
4. Caption: nâng khỏi vùng UI TikTok theo safe-zone M5; chỉ highlight từng từ khi accuracy high (hoặc người dùng bật estimated).
5. Bộ kiểm tra bố cục tự động: mỗi template × 4 mức nội dung (ngắn/dài/cực dài/trống) × 2 theme → render PNG
   (output/template-qa/) → assert: không tràn vùng an toàn, lấp đầy ≥~55% chiều cao vùng an toàn, không chữ nhỏ hơn ngưỡng, không
   đè caption. Thất bại → test đỏ. Giữ snapshot hồi quy fixture v1.
6. Preview "xem thử bố cục" dùng cùng logic.

Nghiệm thu A10.1–A10.4: dán bảng đo TRƯỚC/SAU, ảnh các frame so sánh, kết quả test bố cục, tsc, npm test, ffprobe video
render mẫu. Báo cáo theo mẫu 5 mục; nêu rõ thay đổi nào làm khác hình video cũ để người dùng duyệt.
```

---

## P-ALL — Chạy liền M8→M10 có chốt chặn

```
Làm lần lượt M8, M9, M10 theo docs/PRD.md và docs/agent-prompts-m8-m10.md (P-M8, P-M9, P-M10), mỗi milestone một nhánh.
Sau MỖI milestone: chạy npx tsc --noEmit, npm test, render mẫu + ffprobe, dán kết quả thật, báo cáo 5 mục, rồi DỪNG chờ
người dùng xác nhận trước khi sang milestone kế tiếp. Nếu một tiêu chí chấp nhận chưa đạt, sửa cho đến khi đạt hoặc nêu rõ
lý do chưa đạt; không chuyển tiếp. Nếu thiếu quyền (tải model, mở loopback ngoài sandbox), dừng và hỏi.
```

---

## P-BUGFIX — Sửa lỗi nhỏ

```
Lỗi: <mô tả + log + bước tái hiện>. Tái hiện bằng test thất bại trước, sửa nguyên nhân gốc (không che lỗi), thêm test hồi
quy, chạy tsc + npm test, dán kết quả thật. Không đổi hành vi ngoài phạm vi lỗi.
```

