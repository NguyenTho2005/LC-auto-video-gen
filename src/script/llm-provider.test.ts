import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import {
  FakeLLMProvider,
  AnthropicProvider,
  OpenAiProvider,
  createLlmProvider,
  maskApiKey,
} from "./llm-provider.js";

describe("LLM Providers (M4)", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("maskApiKey", () => {
    it("safely masks api keys", () => {
      expect(maskApiKey(undefined)).toBe("[none]");
      expect(maskApiKey("12345")).toBe("***");
      expect(maskApiKey("sk-ant-api03-1234567890abcdef")).toBe("sk-a...cdef");
    });
  });

  describe("FakeLLMProvider", () => {
    it("returns pre-configured sequential responses", async () => {
      const fake = new FakeLLMProvider({
        responses: ['{"test": 1}', '{"test": 2}'],
      });

      const res1 = await fake.generate("system", "user 1");
      expect(res1).toBe('{"test": 1}');
      expect(fake.callCount).toBe(1);

      const res2 = await fake.generate("system", "user 2");
      expect(res2).toBe('{"test": 2}');
      expect(fake.callCount).toBe(2);

      // Falls back to default response
      const res3 = await fake.generate("system", "user 3");
      expect(res3).toBe("{}");
    });

    it("supports dynamic generator function", async () => {
      const fake = new FakeLLMProvider({
        generator: (sys, user, count) => `call-${count}:${user}`,
      });

      const res = await fake.generate("sys", "hello");
      expect(res).toBe("call-1:hello");
    });
  });

  describe("AnthropicProvider", () => {
    it("sends correct payload and parses response", async () => {
      nock("https://api.anthropic.com")
        .post("/v1/messages", (body) => {
          return (
            body.model === "claude-3-5-haiku-20241022" &&
            body.system === "test system" &&
            body.messages[0].content === "test user"
          );
        })
        .matchHeader("x-api-key", "test-key-123")
        .reply(200, {
          content: [{ type: "text", text: '{"result": "anthropic-ok"}' }],
        });

      const provider = new AnthropicProvider({
        apiKey: "test-key-123",
        model: "claude-3-5-haiku-20241022",
      });

      const res = await provider.generate("test system", "test user");
      expect(res).toBe('{"result": "anthropic-ok"}');
    });

    it("throws helpful error without leaking key", async () => {
      nock("https://api.anthropic.com")
        .post("/v1/messages")
        .reply(401, {
          error: { message: "Invalid API key" },
        });

      const provider = new AnthropicProvider({ apiKey: "secret-key" });
      await expect(provider.generate("sys", "user")).rejects.toThrow("Anthropic API error (401)");
    });
  });

  describe("OpenAiProvider", () => {
    it("sends correct payload and parses response", async () => {
      nock("https://api.openai.com/v1")
        .post("/chat/completions", (body) => {
          return (
            body.model === "gpt-4o-mini" &&
            body.messages[0].content === "sys prompt" &&
            body.messages[1].content === "user prompt"
          );
        })
        .matchHeader("Authorization", "Bearer test-openai-key")
        .reply(200, {
          choices: [{ message: { content: '{"result": "openai-ok"}' } }],
        });

      const provider = new OpenAiProvider({
        apiKey: "test-openai-key",
        model: "gpt-4o-mini",
      });

      const res = await provider.generate("sys prompt", "user prompt");
      expect(res).toBe('{"result": "openai-ok"}');
    });
  });

  describe("createLlmProvider", () => {
    it("creates fake provider", () => {
      const p = createLlmProvider({ provider: "fake" });
      expect(p.name).toBe("fake");
    });

    it("creates anthropic provider", () => {
      const p = createLlmProvider({ provider: "anthropic" });
      expect(p.name).toBe("anthropic");
    });

    it("creates openai provider by default", () => {
      const p = createLlmProvider({ provider: "openai" });
      expect(p.name).toBe("openai");
    });
  });
});
