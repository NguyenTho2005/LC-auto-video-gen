import axios, { AxiosError } from "axios";
import type { LLMProvider } from "./types.js";
import { log } from "../utils/logger.js";

/**
 * Mask sensitive API keys for safe logging.
 */
export function maskApiKey(key?: string): string {
  if (!key) return "[none]";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey || process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || "";
    this.model = opts?.model || process.env.LLM_MODEL || "claude-3-5-haiku-20241022";
    this.baseUrl = opts?.baseUrl || "https://api.anthropic.com";

    if (!this.apiKey) {
      log.warn("AnthropicProvider initialized without API key (LLM_API_KEY or ANTHROPIC_API_KEY)");
    }
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/messages`,
        {
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        },
        {
          headers: {
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          timeout: 60000,
        },
      );

      const content = response.data?.content?.[0]?.text;
      if (typeof content !== "string") {
        throw new Error("Invalid response format from Anthropic API: missing text content");
      }
      return content;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.message;
        throw new Error(`Anthropic API error (${status}): ${msg}`);
      }
      throw err;
    }
  }
}

export class OpenAiProvider implements LLMProvider {
  readonly name = "openai";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
    this.model = opts?.model || process.env.LLM_MODEL || "gpt-4o-mini";
    this.baseUrl = (opts?.baseUrl || process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

    if (!this.apiKey) {
      log.warn("OpenAiProvider initialized without API key (LLM_API_KEY or OPENAI_API_KEY)");
    }
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const url = this.baseUrl.endsWith("/chat/completions") ? this.baseUrl : `${this.baseUrl}/chat/completions`;
      const response = await axios.post(
        url,
        {
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("Invalid response format from OpenAI API: missing message content");
      }
      return content;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.message;
        throw new Error(`OpenAI API error (${status}): ${msg}`);
      }
      throw err;
    }
  }
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey || process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || "";
    this.model = opts?.model || process.env.LLM_MODEL || "gemini-2.0-flash";
    this.baseUrl = (
      opts?.baseUrl ||
      process.env.LLM_BASE_URL ||
      "https://generativelanguage.googleapis.com/v1beta/openai"
    ).replace(/\/$/, "");

    if (!this.apiKey) {
      log.warn("GeminiProvider initialized without API key (GEMINI_API_KEY or LLM_API_KEY)");
    }
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const url = this.baseUrl.endsWith("/chat/completions")
        ? this.baseUrl
        : `${this.baseUrl}/chat/completions`;
      const response = await axios.post(
        url,
        {
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("Invalid response format from Gemini API: missing message content");
      }
      return content;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.message;
        throw new Error(`Gemini API error (${status}): ${msg}`);
      }
      throw err;
    }
  }
}

export interface FakeLlmResponseConfig {
  /** Array of responses to return sequentially per call */
  responses?: string[];
  /** Default response if responses array is empty or exhausted */
  defaultResponse?: string;
  /** Function dynamically generating response from prompt */
  generator?: (system: string, user: string, callCount: number) => string;
}

export class FakeLLMProvider implements LLMProvider {
  readonly name = "fake";
  public callCount = 0;
  public history: Array<{ system: string; user: string }> = [];
  private responses: string[];
  private defaultResponse: string;
  private generator?: (system: string, user: string, callCount: number) => string;

  constructor(cfg?: FakeLlmResponseConfig) {
    this.responses = [...(cfg?.responses ?? [])];
    this.defaultResponse = cfg?.defaultResponse ?? "{}";
    this.generator = cfg?.generator;
  }

  setResponses(responses: string[]) {
    this.responses = [...responses];
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    this.callCount++;
    this.history.push({ system: systemPrompt, user: userPrompt });

    if (this.generator) {
      return this.generator(systemPrompt, userPrompt, this.callCount);
    }

    if (this.responses.length > 0) {
      return this.responses.shift()!;
    }

    return this.defaultResponse;
  }
}

const DEFAULT_FAKE_SCRIPT = JSON.stringify({
  schemaVersion: 2,
  captions: { enabled: true, style: "tiktok-bold" },
  metadata: {
    title: "Bản tin công nghệ tự động",
    source: { url: "https://example.com/tech-news", domain: "example.com", image: null },
    channel: "Auto News Video",
    useOgImage: false,
  },
  voice: { provider: "edge-tts", voiceId: "vi-VN-NamMinhNeural", speed: 1.0 },
  scenes: [
    {
      id: "hook",
      type: "hook",
      voiceText: "Đột phá công nghệ mới vừa được công bố với hiệu năng vượt trội tám mươi hai phẩy bảy phần trăm.",
      templateData: { template: "hook", headline: "ĐỘT PHÁ CÔNG NGHỆ", subhead: "Hiệu năng tăng 82.7%" },
    },
    {
      id: "body-1",
      type: "body",
      voiceText: "Hệ thống sở hữu tốc độ xử lý nhanh hơn hai lần thế hệ trước.",
      templateData: { template: "stat-hero", value: "82.7%", label: "Tăng trưởng hiệu năng" },
    },
    {
      id: "body-2",
      type: "body",
      voiceText: "Các tính năng mới bao gồm tối ưu hoá thông minh và tiết kiệm năng lượng.",
      templateData: { template: "feature-list", title: "Tính năng nổi bật", bullets: ["Tối ưu hoá thông minh", "Tiết kiệm năng lượng"] },
    },
    {
      id: "body-3",
      type: "body",
      voiceText: "Đây được xem là bước ngoặt lớn trong ngành công nghiệp trí tuệ nhân tạo.",
      templateData: { template: "callout", statement: "Bước ngoặt lớn của ngành AI", tag: "ĐÁNH GIÁ" },
    },
    {
      id: "outro",
      type: "outro",
      voiceText: "Hãy theo dõi kênh để cập nhật những công nghệ mới nhất.",
      templateData: { template: "outro", ctaTop: "THEO DÕI NGAY", channelName: "Auto News Video", source: "example.com" },
    },
  ],
});

/**
 * Factory function to create the appropriate LLM provider based on config or env.
 */
export function createLlmProvider(opts?: {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): LLMProvider {
  const provider = (
    opts?.provider ||
    process.env.LLM_PROVIDER ||
    (process.env.GEMINI_API_KEY ? "gemini" : "openai")
  ).toLowerCase().trim();

  if (provider === "fake") {
    return new FakeLLMProvider({ defaultResponse: DEFAULT_FAKE_SCRIPT });
  }

  if (provider === "anthropic" || provider === "claude") {
    return new AnthropicProvider(opts);
  }

  if (provider === "gemini" || provider === "google") {
    return new GeminiProvider(opts);
  }

  return new OpenAiProvider(opts);
}
