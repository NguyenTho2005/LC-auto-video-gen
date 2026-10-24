---
name: media-assets
description: Tải/gắn ảnh, video, screenshot vào cảnh, lưu credit và giấy phép, có provider giả để test. Dùng ở M2.
---

# Media cho cảnh

- Interface `StockProvider` + `PexelsProvider`/`PixabayProvider` (key trong `.env.local`) + `FakeStockProvider`. Test bằng `nock`, không gọi API thật.
- Screenshot URL bằng Puppeteer (đã có qua HyperFrames); đặt timeout, chờ tải xong, viewport hợp lý, xử lý lỗi.
- Tải về `output/<slug>/media/`, ghi `media.json` (nguồn, tác giả, giấy phép, URL gốc). Không có media/lỗi tải → nền mặc định, video vẫn render.
- `og:image` chỉ dùng khi có cờ bật rõ ràng; ghi cảnh báo bản quyền vào `media.json`.
- Crop/scale về 9:16 (`cover`/`contain`); ảnh tĩnh có Ken Burns nhẹ, không giật, deterministic.
- Giới hạn kích thước/định dạng tải về; kiểm tra tệp hợp lệ trước khi dùng.
