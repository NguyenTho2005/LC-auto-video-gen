# ZeroTTS validation

## Checks completed

- `npx tsc --noEmit`: exit 0.
- `npm test`: 41 files, 213 tests passed. An initial run hit a 5-second timeout in the existing FFmpeg upload test while many workers shared resources with the local model. Vitest now uses at most two workers; the complete run passed in 42.01 seconds without raising test timeouts.
- `node --check public/studio.js`: exit 0.
- Python worker syntax compilation with the installed Python 3.12: exit 0.
- `git diff --check`: exit 0.
- New provider tests mock the synthesis boundary and cover bundled voice validation, authenticated request, audio conversion, invalid WAV, HTTP failure and voice/model cache identity.

## Real synthesis and web interaction

Installed `zerotts==0.1.5` in the isolated environment and loaded the pinned model successfully on this Mac. All eight bundled voices were present. The first load required copying model files out of Hub symlinks so ONNX external data could resolve correctly.

Generated `output/zerotts-validation/quangminh-sample.mp3` using the actual local engine. ffprobe duration: 6.121063 seconds. The exact original and spoken text are recorded in `sample-text.json` beside the audio. Spoken substitutions include `âu bình đi zai`, `ây chình`, and `đép bít ba sáu`.

Opened the local web in a separate test browser tab, confirmed ZeroTTS/Quang Minh selected, entered a short OpenDesign/Agent preview and clicked Nghe thử. The player appeared and the interface reported playback. Screenshot: `output/zerotts-validation/studio.png`. These checks verify generation and playback, not a human judgement that all pronunciation is perfect.

## Real full video

Ran `npm run pipeline -- output/opendesign-zerotts-20261026/script.json` with eight scenes and actual Quang Minh synthesis. Final `output/opendesign-zerotts-20261026/video.mp4`:

```json
{"video":{"codec":"h264","width":1080,"height":1920},"audio":{"codec":"aac"},"duration":"60.000000"}
```

Inspected the extracted frame at 8 seconds (`output/zerotts-validation/video-frame.png`): DevPeek36 logo is visible and the asset label is compact `GitHub · nexu-io/open-design`, with no raw image URL banner. The renderer reported non-blocking lint suggestions and two 404 resource messages; the final MP4 passed format checks and the inspected frame contained the intended screenshot asset. Full visual and subjective pronunciation review remains with the user.

The rendered project has explicit corrected pronunciation overrides and a new title: `OpenDesign · ZeroTTS · phát âm đã chỉnh`. Earlier MP4 files remain unchanged.

## M9 — hardening (2026-11-06, nhánh feat/m9-zerotts-hardening)

### A9.1 — Hai tiến trình cùng gọi khi chưa có worker (đo thật, ngoài sandbox)
- Dừng worker cũ, xoá `worker.lock`/`worker.pid`, truncate `worker.log`, chạy đồng thời 2 tiến trình `tsx m9-race.ts` (mỗi tiến trình gọi `ensureZeroWorker()`).
- Kết quả: cả hai `OK http://127.0.0.1:7821`, đúng **một** worker python đang chạy (ps), pidfile khớp PID đó, `worker.log` chỉ có `loading` → `ready`, **không có** `Address already in use` (LOG-CLEAN).
- Bug race thật bắt được trong lúc đo: caller thứ hai thấy `ECONNREFUSED` thoáng qua (worker chưa bind xong) liền spawn lần hai → sửa `waitReady` với `transientRefused=true` khi chờ lock; có test hồi quy "transient refused" trong `src/tts/zerotts-hardening.test.ts`.
- Worker mới: bind port trước khi nạp model, `/health` báo `loading|ready` + `elapsedSec`; port bận → exit code 3 + dòng `ZeroTTS status: port-busy:<port>` (không echo thông điệp OS, không kill tiến trình lạ).

### A9.2 — Chuẩn hoá loudness 8 giọng (đo thật bằng ffmpeg)
Cùng một câu mẫu qua ZeroTTS + loudnorm 2-pass (I=−16, TP=−1,5), đo `ffmpeg volumedetect`:

| Giọng | mean_volume (dB) | max_volume (dB) | thời gian tổng hợp |
|---|---|---|---|
| quangminh | −16,4 | −1,8 | 5,7s |
| tiendat | −16,1 | −1,8 | 5,0s |
| giahuy | −16,3 | −1,7 | 7,2s |
| huuduc | −15,7 | −1,8 | 6,6s |
| maichi | −16,0 | −1,8 | 5,6s |
| baotrang | −16,3 | −1,8 | 5,7s |
| kimoanh | −15,8 | −1,8 | 7,6s |
| hamy | −15,7 | −3,0 | 8,1s |

- Chênh `mean_volume`: **0,7 dB** (≤ 2 dB ✓); đỉnh cao nhất **−1,7 dBTP** (≤ −1 dB ✓).
- Trước M9, mean âm lượng lệch −15,8 dB (huuduc) … −25,3 dB (hamy) theo khảo sát PRD — nay đã khép về ~−16 dB.

### A9.3 — Word timing thật qua ASR (đo thật)
- `cachedSpeech` với ZeroTTS (quangminh), câu 25 từ: ASR PhoWhisper-small trên audio đã đọc → `accuracy:"high"`, 37 từ có timing thật, `timing-quality.json` của video mẫu ghi `wordAccuracy:"high"`.
- Từ đầu tiên: `xin@0-200 chào@200-360 các@360-480 bạn@480-720 …` — tuần tự, không chồng lấn; kiểm tra ≥10 mốc thủ công trên words.json cho thấy highlight khớp thứ tự đọc.
- Khi ASR lỗi/không cài: quay về `estimateWordTimings` (`low`), không lỗi — có test bằng FakeAsrClient + ASR lỗi giả lập.

### A9.4 — Render mẫu ZeroTTS
- (đang đo — xem bảng dưới sau khi render lại với script ~320 từ)

### Hiệu năng
- `ZEROTTS_THREADS` mặc định `min(8, lõi CPU)`; worker cache theo đoạn (LRU 256 MB) nên sửa một câu không đọc lại cả cảnh.
- Timeout tổng hợp theo độ dài văn bản (`len×150ms`, tối thiểu 60s) thay vì cố định 300s.
- Worker tự thoát sau `ZEROTTS_IDLE_SEC` giây rảnh (mặc định 900); lần gọi sau tự khởi động lại.
- Tiến độ theo cảnh/ETA trong job log: `TTS cảnh 1/5 (scene-hook) xong — 29s, ETA còn ~116s`.
- RTF tổng hợp thuần ZeroTTS ~5–8s cho câu mẫu ~10s audio; ASR timing one-shot cộng thêm ~30s/cảnh lần đầu (nạp model mỗi lần, do kiến trúc one-shot từ M8).
- Script mẫu 5 cảnh, ~407 từ, giọng quangminh, `renderSettings.workers=1` (máy 15 GB RAM).
- Lần render đầu với 157 từ chỉ ra 32,3s và lần hai 276 từ ra 56,7s (ZeroTTS đọc nhanh ~300 từ/phút) — đã mở rộng script và render lại.
- Kết quả cuối: `/tmp/opencode/m9-a94/video.mp4`, **ffprobe 1080×1920 + audio, 82,1s**, 22,0 MB.
- Thời gian tổng hợp TTS+ASR: 187s cho 5 cảnh (log `TTS cảnh 1/5 … 5/5` + ETA); tổng render pipeline 427s.
- `timing-quality.json`: `wordAccuracy:"high"` ở 3/5 cảnh, `"low"` ở 2/5 cảnh (align nội suy một số từ ASR nghe lệch — timing vẫn neo ASR, không phải ước lượng đều); highlight từng từ chỉ bật khi `high` theo thiết kế.

### A9.5 — Chẩn đoán 5 tình huống (test)
`src/tts/zerotts-hardening.test.ts` bao phủ: chưa cài (`not-installed`) / đang nạp (`loading`, chờ thay vì spawn lần hai) / không kết nối loopback (`unreachable`, lock stale bị phá một lần) / port bị chiếm bởi dịch vụ lạ (`port-busy`, không spawn, không kill) / synthesis lỗi (`synthesis-error`). `/api/studio/options` trả `status` + `detail` + `loadingSec` tương ứng; UI `studio.js` hiển thị hint riêng cho từng trạng thái.
