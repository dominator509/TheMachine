import { describe, it, expect } from "vitest";
import {
  createProvider,
  createOpenAIAdapter,
  createAnthropicAdapter,
  createLocalAdapter,
} from "@the-machine/providers";
import type { EntityId } from "@the-machine/core";
import type { ProviderFetch } from "@the-machine/providers";

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(data), { status, statusText: ok ? "OK" : "Error" });
}

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  return new Headers(headers).get(name);
}

describe("provider adapters", () => {
  it("openai adapter posts chat completions with bearer authentication", async () => {
    const calls: { url: string | URL; init?: RequestInit }[] = [];
    const fetchImpl: ProviderFetch = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        id: "chatcmpl-1",
        model: "gpt-4",
        choices: [{ message: { content: "real openai response" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
    };
    const adapter = createOpenAIAdapter(
      "openai-1" as EntityId,
      "test-openai",
      "http://localhost:8080/v1",
      "gpt-4",
      { apiKey: "sk-test-value", fetchImpl },
    );
    const res = await adapter.complete({
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(res.content).toBe("real openai response");
    expect(res.usage?.completionTokens).toBe(5);
    expect(String(calls[0]?.url)).toBe("http://localhost:8080/v1/chat/completions");
    expect(JSON.parse(String(calls[0]?.init?.body)).messages[0].content).toBe("Hello");
    expect(headerValue(calls[0]?.init?.headers, "authorization")).toBe("Bearer sk-test-value");
    expect(headerValue(calls[0]?.init?.headers, "x-api-key")).toBeNull();
  });

  it("openai adapter health uses fetch result", async () => {
    const adapter = createOpenAIAdapter(
      "openai-1" as EntityId,
      "test-openai",
      "http://localhost:8080",
      "gpt-4",
      { fetchImpl: async () => new Response("ok") },
    );
    const health = await adapter.health();
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("anthropic adapter uses x-api-key rather than bearer authentication", async () => {
    const fetchImpl: ProviderFetch = async (url, init) => {
      expect(String(url)).toBe("http://localhost:8080/v1/messages");
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0].content).toBe("Hi");
      expect(headerValue(init?.headers, "x-api-key")).toBe("anthropic-test-key");
      expect(headerValue(init?.headers, "authorization")).toBeNull();
      expect(headerValue(init?.headers, "anthropic-version")).toBe("2023-06-01");
      return jsonResponse({
        id: "msg-1",
        model: "claude-3",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "real anthropic response" }],
        usage: { input_tokens: 8, output_tokens: 6 },
      });
    };
    const adapter = createAnthropicAdapter(
      "anthropic-1" as EntityId,
      "test-anthropic",
      "http://localhost:8080",
      "claude-3",
      { apiKey: "anthropic-test-key", fetchImpl },
    );
    const res = await adapter.complete({
      model: "claude-3",
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(res.content).toBe("real anthropic response");
    expect(res.usage?.completionTokens).toBe(6);
  });

  it("anthropic health probes preserve provider-specific authentication", async () => {
    const adapter = createAnthropicAdapter(
      "anthropic-1" as EntityId,
      "test-anthropic",
      "http://localhost:8080",
      "claude-3",
      {
        apiKey: "anthropic-health-key",
        fetchImpl: async (_url, init) => {
          expect(headerValue(init?.headers, "x-api-key")).toBe("anthropic-health-key");
          expect(headerValue(init?.headers, "authorization")).toBeNull();
          return new Response("ok");
        },
      },
    );
    expect((await adapter.health()).healthy).toBe(true);
  });

  it("local adapter uses OpenAI-compatible chat completions", async () => {
    const adapter = createLocalAdapter(
      "local-1" as EntityId,
      "test-local",
      "http://localhost:11434/v1",
      "llama-3",
      {
        fetchImpl: async () =>
          jsonResponse({
            id: "local-1",
            model: "llama-3",
            choices: [{ message: { content: "local response" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          }),
      },
    );
    const res = await adapter.complete({
      model: "llama-3",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(res.content).toBe("local response");
  });

  it("factory forwards provider options", async () => {
    const adapter = createProvider(
      "openai",
      "p-1" as EntityId,
      "openai-prod",
      "https://api.openai.test/v1",
      "gpt-4",
      {
        fetchImpl: async () =>
          jsonResponse({
            id: "chatcmpl-2",
            model: "gpt-4",
            choices: [{ message: { content: "factory response" }, finish_reason: "stop" }],
          }),
      },
    );
    expect(adapter.name).toBe("openai-prod");
    expect(adapter.tier).toBe("cloud");
    const res = await adapter.complete({
      model: "gpt-4",
      messages: [{ role: "user", content: "test" }],
    });
    expect(res.content).toBe("factory response");
  });

  it("adapter exposes id and name", () => {
    const adapter = createProvider(
      "openai",
      "p-1" as EntityId,
      "test",
      "http://localhost",
      "model",
      { fetchImpl: async () => jsonResponse({ choices: [] }) },
    );
    expect(adapter.id).toBe("p-1");
  });
});
