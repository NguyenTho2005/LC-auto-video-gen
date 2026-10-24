import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import {
  PexelsProvider,
  PixabayProvider,
  FakeStockProvider,
} from "./stock-provider.js";

describe("Stock Providers (M2)", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("FakeStockProvider", () => {
    it("returns deterministic mock photo and video results without network", async () => {
      const provider = new FakeStockProvider();
      const photos = await provider.searchPhotos("artificial intelligence", 2);
      expect(photos).toHaveLength(2);
      expect(photos[0].source).toBe("fake");
      expect(photos[0].url).toContain("mock.stock.internal/photo-1-artificial%20intelligence.jpg");
      expect(photos[0].license).toContain("CC0");

      const videos = await provider.searchVideos("technology", 1);
      expect(videos).toHaveLength(1);
      expect(videos[0].source).toBe("fake");
      expect(videos[0].url).toContain("mock.stock.internal/video-1-technology.mp4");
    });
  });

  describe("PexelsProvider (mocked HTTP via nock)", () => {
    it("searches photos on Pexels and maps results correctly", async () => {
      nock("https://api.pexels.com")
        .get("/v1/search")
        .query({ query: "robots", per_page: "2", orientation: "portrait" })
        .matchHeader("Authorization", "test-pexels-key")
        .reply(200, {
          photos: [
            {
              id: 101,
              photographer: "Alice Smith",
              src: {
                large2x: "https://images.pexels.com/101-2x.jpg",
                large: "https://images.pexels.com/101-lg.jpg",
                medium: "https://images.pexels.com/101-med.jpg",
              },
            },
          ],
        });

      const provider = new PexelsProvider("test-pexels-key");
      const results = await provider.searchPhotos("robots", 2);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("101");
      expect(results[0].url).toBe("https://images.pexels.com/101-2x.jpg");
      expect(results[0].photographer).toBe("Alice Smith");
      expect(results[0].source).toBe("pexels");
    });
  });

  describe("PixabayProvider (mocked HTTP via nock)", () => {
    it("searches photos on Pixabay and maps results correctly", async () => {
      nock("https://pixabay.com")
        .get("/api/")
        .query({
          key: "test-pixabay-key",
          q: "smartphone",
          per_page: "2",
          orientation: "vertical",
          image_type: "photo",
        })
        .reply(200, {
          hits: [
            {
              id: 202,
              user: "Bob Jones",
              largeImageURL: "https://pixabay.com/photo-202-lg.jpg",
              webformatURL: "https://pixabay.com/photo-202-web.jpg",
            },
          ],
        });

      const provider = new PixabayProvider("test-pixabay-key");
      const results = await provider.searchPhotos("smartphone", 2);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("202");
      expect(results[0].url).toBe("https://pixabay.com/photo-202-lg.jpg");
      expect(results[0].photographer).toBe("Bob Jones");
      expect(results[0].source).toBe("pixabay");
    });
  });
});

