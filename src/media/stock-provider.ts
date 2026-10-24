import axios from "axios";

export interface StockSearchResult {
  id: string;
  url: string;
  previewUrl: string;
  photographer?: string;
  source: "pexels" | "pixabay" | "fake";
  license: string;
}

export interface StockProvider {
  searchPhotos(query: string, limit?: number): Promise<StockSearchResult[]>;
  searchVideos(query: string, limit?: number): Promise<StockSearchResult[]>;
}

/**
 * Pexels stock provider.
 * API Reference: https://www.pexels.com/api/documentation/
 */
export class PexelsProvider implements StockProvider {
  constructor(private apiKey: string) {}

  async searchPhotos(query: string, limit = 5): Promise<StockSearchResult[]> {
    if (!this.apiKey) {
      throw new Error("Pexels API key is required");
    }

    const resp = await axios.get("https://api.pexels.com/v1/search", {
      params: { query, per_page: limit, orientation: "portrait" },
      headers: { Authorization: this.apiKey },
      timeout: 10000,
    });

    const photos = resp.data.photos || [];
    return photos.map((p: any) => ({
      id: String(p.id),
      url: p.src.large2x || p.src.large || p.src.original,
      previewUrl: p.src.medium || p.src.small,
      photographer: p.photographer,
      source: "pexels" as const,
      license: "Pexels License (Free to use, attribution appreciated)",
    }));
  }

  async searchVideos(query: string, limit = 5): Promise<StockSearchResult[]> {
    if (!this.apiKey) {
      throw new Error("Pexels API key is required");
    }

    const resp = await axios.get("https://api.pexels.com/videos/search", {
      params: { query, per_page: limit, orientation: "portrait" },
      headers: { Authorization: this.apiKey },
      timeout: 10000,
    });

    const videos = resp.data.videos || [];
    return videos.map((v: any) => {
      // Pick best HD or portrait video file
      const files = v.video_files || [];
      const bestFile =
        files.find((f: any) => f.quality === "hd" && f.width <= 1080) ||
        files[0] ||
        {};
      return {
        id: String(v.id),
        url: bestFile.link || "",
        previewUrl: v.image || "",
        photographer: v.user?.name,
        source: "pexels" as const,
        license: "Pexels License (Free to use, attribution appreciated)",
      };
    });
  }
}

/**
 * Pixabay stock provider.
 * API Reference: https://pixabay.com/api/docs/
 */
export class PixabayProvider implements StockProvider {
  constructor(private apiKey: string) {}

  async searchPhotos(query: string, limit = 5): Promise<StockSearchResult[]> {
    if (!this.apiKey) {
      throw new Error("Pixabay API key is required");
    }

    const resp = await axios.get("https://pixabay.com/api/", {
      params: {
        key: this.apiKey,
        q: query,
        per_page: limit,
        orientation: "vertical",
        image_type: "photo",
      },
      timeout: 10000,
    });

    const hits = resp.data.hits || [];
    return hits.map((h: any) => ({
      id: String(h.id),
      url: h.largeImageURL || h.webformatURL,
      previewUrl: h.webformatURL || h.previewURL,
      photographer: h.user,
      source: "pixabay" as const,
      license: "Pixabay Content License (Free for commercial and non-commercial use)",
    }));
  }

  async searchVideos(query: string, limit = 5): Promise<StockSearchResult[]> {
    if (!this.apiKey) {
      throw new Error("Pixabay API key is required");
    }

    const resp = await axios.get("https://pixabay.com/api/videos/", {
      params: {
        key: this.apiKey,
        q: query,
        per_page: limit,
      },
      timeout: 10000,
    });

    const hits = resp.data.hits || [];
    return hits.map((h: any) => {
      const v = h.videos || {};
      const file = v.medium || v.large || v.small || {};
      return {
        id: String(h.id),
        url: file.url || "",
        previewUrl: `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg`,
        photographer: h.user,
        source: "pixabay" as const,
        license: "Pixabay Content License (Free for commercial and non-commercial use)",
      };
    });
  }
}

/**
 * Deterministic Fake Stock Provider for testing.
 * Always returns mock data without network calls.
 */
export class FakeStockProvider implements StockProvider {
  constructor(private mockResults?: StockSearchResult[]) {}

  async searchPhotos(query: string, limit = 5): Promise<StockSearchResult[]> {
    if (this.mockResults) return this.mockResults.slice(0, limit);
    return Array.from({ length: Math.min(limit, 2) }, (_, i) => ({
      id: `fake-photo-${i + 1}`,
      url: `https://mock.stock.internal/photo-${i + 1}-${encodeURIComponent(query)}.jpg`,
      previewUrl: `https://mock.stock.internal/preview-${i + 1}.jpg`,
      photographer: `Test Photographer ${i + 1}`,
      source: "fake" as const,
      license: "CC0 Public Domain (Fake Mock)",
    }));
  }

  async searchVideos(query: string, limit = 5): Promise<StockSearchResult[]> {
    if (this.mockResults) return this.mockResults.slice(0, limit);
    return Array.from({ length: Math.min(limit, 2) }, (_, i) => ({
      id: `fake-video-${i + 1}`,
      url: `https://mock.stock.internal/video-${i + 1}-${encodeURIComponent(query)}.mp4`,
      previewUrl: `https://mock.stock.internal/video-thumb-${i + 1}.jpg`,
      photographer: `Test Videographer ${i + 1}`,
      source: "fake" as const,
      license: "CC0 Public Domain (Fake Mock)",
    }));
  }
}

