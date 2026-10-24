import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseRssFeed,
  filterDuplicateItems,
  normalizeUrl,
  decodeXmlEntities,
  loadFeedsConfig,
} from "./feed-collector.js";
import { generatePublishChecklist } from "./publish-kit.js";
import { BatchQueue } from "./batch-queue.js";
import type { FeedItem } from "./types.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("RSS Ingest & Batch Queue (M7)", () => {
  describe("parseRssFeed & utilities", () => {
    it("giải mã các XML/HTML entities thông dụng", () => {
      const decoded = decodeXmlEntities("&quot;Apple&quot; &amp; &lt;Google&gt; &#39;AI&#39;");
      expect(decoded).toBe('"Apple" & <Google> \'AI\'');
    });

    it("phân tích XML RSS 2.0 chứa CDATA và tiếng Việt", () => {
      const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
      <rss version="2.0">
        <channel>
          <title>VnExpress Số Hóa</title>
          <item>
            <title><![CDATA[Apple công bố MacBook Pro với chip M5]]></title>
            <link>https://vnexpress.net/apple-cong-bo-macbook-pro-m5-4800000.html?utm_source=rss</link>
            <guid>https://vnexpress.net/apple-cong-bo-macbook-pro-m5-4800000.html</guid>
            <pubDate>Thu, 24 Oct 2026 08:00:00 +0700</pubDate>
            <description><![CDATA[<a href="..."><img src="thumb.jpg" /></a>Dòng máy tính xách tay mới của Apple sở hữu chip M5 với hiệu năng đồ họa tăng gấp đôi.]]></description>
          </item>
          <item>
            <title>Samsung ra mắt Galaxy S27 Ultra</title>
            <link>https://vnexpress.net/samsung-galaxy-s27-ultra-4800001.html</link>
            <guid>https://vnexpress.net/samsung-galaxy-s27-ultra-4800001.html</guid>
            <description>Điện thoại tích hợp cảm biến 200MP và pin silicon-carbon.</description>
          </item>
        </channel>
      </rss>`;

      const items = parseRssFeed(sampleXml, "VnExpress");
      expect(items.length).toBe(2);
      expect(items[0].title).toBe("Apple công bố MacBook Pro với chip M5");
      expect(items[0].sourceName).toBe("VnExpress");
      expect(items[0].link).toContain("apple-cong-bo-macbook-pro-m5");
      expect(items[0].description).toBe("Dòng máy tính xách tay mới của Apple sở hữu chip M5 với hiệu năng đồ họa tăng gấp đôi.");

      expect(items[1].title).toBe("Samsung ra mắt Galaxy S27 Ultra");
    });

    it("chuẩn hoá URL loại bỏ tracking tokens (utm_*, ref, fbclid)", () => {
      const raw = "https://vnexpress.net/tin-tuc.html?utm_source=facebook&utm_medium=cpc&fbclid=12345&id=99";
      const cleaned = normalizeUrl(raw);
      expect(cleaned).toBe("https://vnexpress.net/tin-tuc.html?id=99");
    });

    it("lọc các bài viết trùng lặp URL hoặc tiêu đề", () => {
      const items: FeedItem[] = [
        {
          guid: "1",
          title: "Ra mắt chip M5",
          link: "https://news.com/m5?utm_source=rss",
        },
        {
          guid: "2",
          title: "Ra mắt chip M5", // trùng tiêu đề
          link: "https://news.com/m5-another-link",
        },
        {
          guid: "3",
          title: "Bài viết khác",
          link: "https://news.com/m5?utm_source=facebook", // trùng link gốc sau chuẩn hoá
        },
        {
          guid: "4",
          title: "Nội dung hoàn toàn mới",
          link: "https://news.com/new-article",
        },
      ];

      const filtered = filterDuplicateItems(items);
      expect(filtered.length).toBe(2);
      expect(filtered[0].title).toBe("Ra mắt chip M5");
      expect(filtered[1].title).toBe("Nội dung hoàn toàn mới");
    });

    it("đọc cấu hình feeds mặc định nếu không truyền file", () => {
      const feeds = loadFeedsConfig();
      expect(feeds.length).toBeGreaterThan(0);
      expect(feeds[0].url).toContain("http");
    });
  });

  describe("generatePublishChecklist (publish.md)", () => {
    it("tạo file publish checklist đầy đủ tiêu đề, hashtag và nhãn AI bắt buộc", () => {
      const checklist = generatePublishChecklist({
        suggestedTitle: "Apple ra mắt chip M5",
        channelName: "Công Nghệ 24h",
        sourceUrl: "https://vnexpress.net/m5",
        hashtags: ["#apple", "#m5", "#congnghe"],
      });

      expect(checklist).toContain("Apple ra mắt chip M5");
      expect(checklist).toContain("#apple #m5 #congnghe");
      expect(checklist).toContain("Nội dung do AI tạo"); // Yêu cầu chính sách TikTok
      expect(checklist).toContain("https://vnexpress.net/m5");
      expect(checklist).toContain("Pre-flight QA");
    });
  });

  describe("BatchQueue (Sequential execution & error isolation)", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "batch-queue-test-"));
    });

    afterEach(async () => {
      if (tmpDir) {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("chạy tuần tự các bài trong hàng đợi và tiếp tục khi gặp bài bị lỗi", async () => {
      const items: FeedItem[] = [
        {
          guid: "1",
          title: "Bài 1 Thành công",
          link: "https://example.com/1",
          description: "Mô tả bài 1",
        },
        {
          guid: "2",
          title: "Bài 2 Bị lỗi",
          link: "https://example.com/2",
          description: "Mô tả bài 2",
        },
        {
          guid: "3",
          title: "Bài 3 Thành công",
          link: "https://example.com/3",
          description: "Mô tả bài 3",
        },
      ];

      // Fake pipeline runner: giả lập bài số 2 bị ném lỗi
      const fakePipelineRunner = async (scriptPath: string) => {
        if (scriptPath.includes("bai-2-bi-loi")) {
          throw new Error("Simulated Pipeline Error on Article 2");
        }
      };

      const queue = new BatchQueue({
        outputBaseDir: tmpDir,
        pipelineRunner: fakePipelineRunner,
      });

      const result = await queue.process(items);

      expect(result.total).toBe(3);
      expect(result.completed).toBe(2);
      expect(result.failed).toBe(1);

      expect(result.jobs[0].status).toBe("completed");
      expect(result.jobs[1].status).toBe("failed");
      expect(result.jobs[1].error).toContain("Simulated Pipeline Error");
      expect(result.jobs[2].status).toBe("completed");
    });
  });
});
