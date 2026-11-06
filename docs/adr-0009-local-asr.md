# ADR-0009 — ASR cục bộ cho M8 (Audio → SRT)

Ngày: 2026-11-06 · Trạng thái: chấp nhận · Milestone: M8 (nhánh `feat/m8-audio-to-srt`)

## Bối cảnh
Creative Mode hiện cần người dùng dán kịch bản hoặc SRT vì không có thành phần nghe được audio
(xem khảo sát §1.1 docs/PRD.md). Cần ASR chạy local, ưu tiên tiếng Việt, ra word timestamps.

## Quyết định
- **Engine**: `faster-whisper==1.2.1` (CTranslate2, MIT) trong venv riêng `.asr-venv`
  (cách tách như `.zerotts-venv`). Ghim thêm `av<19` (PyAV 19 đổi API `open()` làm
  faster-whisper 1.2.1 crash giữa chừng) và `soundfile<0.14` (self-test nạp model).
- **Model mặc định**: `qbsmlabs/PhoWhisper-small` (CT2 conversion của `vinai/PhoWhisper-small`,
  license **BSD-3-Clause**, revision ghim `644a8705b6981de92b10659b105763bdb39b61ef`,
  tải ~0.97 GB). Được người dùng chọn ngày 2026-11-06 vì chạy trên CPU 16 luồng không GPU.
- **Tuỳ chọn chất lượng cao**: `kiendt/PhoWhisper-large-ct2` (MIT, revision
  `abceb098c94235c16414dda9e1aada82ebcf6288`, model.bin ~3.07 GB) qua `ASR_MODEL`.
- **Dự phòng Whisper gốc**: `Systran/faster-whisper-medium` (MIT, sha
  `08e178d48790749d25932bbc082711ddcfdfbc4f`) và `Systran/faster-whisper-large-v3` (MIT, sha
  `edaa852ec7e145841d8ffdb056a99866b5f0a478`).
- **Kiến trúc worker**: **tiến trình one-shot** `scripts/asr_worker.py` cho mỗi lần transcribe
  (spawn, nhận đường dẫn audio qua argv, in JSON ra stdout, log lên stderr), khác ZeroTTS
  (HTTP daemon). Lý do: ASR là tác vụ batch theo file, tần suất thấp; one-shot loại trừ hẳn
  lớp vấn đề race/ngã port/pidfile/health-check mà ZeroTTS phải xử lý ở M9; tiến trình chết
  không để lại trạng thái.
- **Chọn device an toàn**: `auto` **không** tin `get_cuda_device_count()` — máy có driver/NVML
  nhưng thiếu `libcublas.so.12`, lỗi chỉ lộ giữa chừng transcribe. Worker nạp model rồi
  transcribe 1 giây im lặng; lỗi CUDA → fallback `cpu/int8` ngay từ đầu.
- **Cache**: `.asr-cache/<sha256(audio)+revision+language>.json` (gitignored); ghi xong mới
  resolve để tránh race trả kết quả trước khi cache được nhớ.
- **Tham số transcribe**: `language=vi`, `word_timestamps=True`, `vad_filter=True`,
  `condition_on_previous_text=False`, `beam_size=5`, `hallucination_silence_threshold=2`.
  Đã thử và **loại**: `hotwords` (WER tệ hơn: 18.15% so 17.54%),
  `no_speech_threshold=0.45 + log_prob_threshold=-0.9 + VAD ngắn` (tệ hơn: 19.08%, xé đoạn),
  `log_prob_threshold=-0.9` đơn lẻ (không đổi kết quả).
- **Load model**: `WhisperModel(repo, download_root=.asr-models)`; repo chỉ được chọn từ
  bảng ghim trong worker (chống path injection), client không gửi được model path.

## Kết quả đo thật (PhoWhisper-small, CPU int8, RTF ≈ 0.5 — audio 93.8s / 46.9s)
Chuẩn đối chiếu: Edge TTS `vi-VN-NamMinhNeural` đọc script 325 từ, có WordBoundary thật.

| Chỉ số | Giá trị | Mục tiêu PRD |
|---|---|---|
| WER ASR thô ↔ script | **17.5%** | ≤ 12% (A8.1) |
| WER loại trừ thuật ngữ Anh bị Edge TTS đọc kiểu phiên âm Việt | ≈ 8% | — |
| Chữ hiển thị sau align (chữ = kịch bản, timing = ASR) | **100%** | 100% (A8.1) |
| Lệch center-word (timing ASR ↔ Edge chuẩn) ≤150 ms | **93.5%** | ≥ 90% (A8.2) |
| Độ trễ nhận dạng | 0.5× thời lượng | — |

Phân tích 57 sai số đếm được: 19 lỗi do thuật ngữ tiếng Anh mà Edge TTS đọc theo phiên âm
Việt ("git"→"ghiết", "commit"→"cornish", "bisect"→"buýt sét", "reflog"→"dép lốp",
"stash"→"sờ tát", "cherry-pick"→"cheryl pitt") — audio phát âm đúng như vậy, ASR không sai;
cộng một khối ảo giác ~15 từ trong ~0.8 giây im lặng cuối bài (WhisperSmall điển hình,
chưa có cách chắn tổng quát không phá segment thật).

## Bị loại
- `quocphu/PhoWhisper-ct2-FasterWhisper`: không khai báo license → vi phạm quy tắc
  "license/nguồn model không rõ".
- Daemon HTTP cho ASR: lời giải cho vấn đề không tồn tại (xem kiến trúc).
- ASR đám mây: non-goal trong PRD v3.
- Glossary qua `hotwords`: đo trên dữ liệu thật cho kết quả tệ hơn (xem Kết quả đo).
