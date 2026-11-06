# Dùng ZeroTTS trên Auto Gen

Máy hiện tại đã cài model và chạy thử thành công. Mở lại hoặc tải lại http://localhost:3002/ để nhận giao diện mới.

1. Chọn **ZeroTTS**, chọn giọng **Quang Minh** trước. Có thể đổi sang một trong tám giọng đã tích hợp.
2. Giữ chế độ từ điển phát âm. Nhập một đoạn có các tên riêng cần kiểm tra, rồi bấm **Nghe thử**.
3. Dán link GitHub, chọn thời lượng và template như workflow hiện tại, sau đó tạo kịch bản.
4. Ở phần kiểm tra phát âm, giữ chữ tiếng Anh nguyên bản trên màn hình, chỉ chỉnh cách đọc trong từ điển của video nếu cần. OpenDesign đã đặt là `ô bình đi zai`, Agent là `ây chình`, DevPeek36 là `đép bít ba sáu`.
5. Nghe thử rồi render. Bản video đã render từ trước không tự thay giọng; phải render bản mới.

ZeroTTS không cần API key. Gemini vẫn phụ trách kịch bản/hook theo cấu hình hiện có. Nếu engine lỗi, web báo lỗi thay vì tự đổi sang giọng khác.

## Lần đầu / máy mới

```sh
npm run zerotts:setup
```

Script tạo venv Python riêng (`.zerotts-venv`) và tải **model ~1,7 GB một lần** vào `.zerotts-models/` (gitignored). Có thể đặt `ZEROTTS_BOOTSTRAP_PYTHON` nếu máy có Python ở đường dẫn khác. Cổng 7821 là worker nội bộ (chỉ loopback); giao diện vẫn dùng cổng 3002.

> **Loopback / sandbox:** ZeroTTS và ASR dùng cổng loopback. Trong sandbox cô lập mạng, worker báo “chưa khởi động được” — hãy chạy kiểm thử thật ngoài sandbox (mở loopback). Không commit model/venv vào git.

## Vận hành (M9)

- **Khởi động an toàn đa tiến trình:** worker bind cổng trước khi nạp model; `/health` báo `loading|ready`. Hai tiến trình cùng gọi → chỉ **một** worker chạy, tiến trình còn lại chờ khi `loading`, không spawn lần hai. Port bị dịch vụ lạ chiếm → báo rõ `port-busy`, **không kill** tiến trình lạ (đổi `ZEROTTS_PORT` hoặc dừng dịch vụ đó).
- **Chẩn đoán 5 tình huống** (hiển thị trong `/api/studio/options` + UI): chưa cài / đang nạp model (~x giây) / không kết nối được loopback / port bị chiếm / synthesis lỗi. Đuôi `worker.log` (.zerotts-runtime/, mode 0600) chỉ chứa trạng thái máy, không chứa văn bản đọc.
- **Âm lượng:** đầu ra ZeroTTS được chuẩn hoá loudness (EBU loudnorm, ~−16 LUFS, true peak ≤ −1,5 dBTP) ngay sau khi đổi WAV→MP3 và đưa vào fingerprint cache. Edge/ElevenLabs giữ hành vi cũ trừ khi bật cờ `voice.normalizeLoudness: true` trong script.json (hoặc `VOICE_NORMALIZE_LOUDNESS=1`).
- **Word timing thật:** sau khi tổng hợp từng cảnh, hệ thống chạy ASR cục bộ (M8, PhoWhisper-small) trên audio đã đọc để lấy timing từng từ (`accuracy:"high"`), rồi căn chỉnh về văn bản hiển thị. ASR không khả dụng → quay về `estimateWordTimings` (`low`), không lỗi. Đặt `ZEROTTS_WORD_TIMING=off` để tắt.
- **Hiệu năng:** `ZEROTTS_THREADS` (mặc định `min(8, lõi CPU)`); worker cache theo đoạn câu nên sửa một câu không đọc lại cả cảnh; timeout tổng hợp theo độ dài văn bản (không cố định 300s); worker tự thoát sau `ZEROTTS_IDLE_SEC` giây rảnh (mặc định 900) để nhả RAM, lần gọi sau tự khởi động lại.
- **RTF kỳ vọng:** ~1,5–1,8 trên CPU 16 luồng không GPU (đo thật xem `docs/zerotts-validation.md`).

Tên riêng tiếng Anh mới vẫn nên nghe thử và bổ sung từ điển khi cần; ZeroTTS không thay thế bước kiểm tra phát âm.
