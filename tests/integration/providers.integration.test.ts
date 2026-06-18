import { describe, it, expect } from "vitest";
import {
  createProvider,
  createOpenAIAdapter,
  createAnthropicAdapter,
  createLocalAdapter,
} from "@the-machine/providers";
import type { EntityId } from "@the-machine/core";

describe("provider adapters", () => {
  it("openai adapter completes without network", async () => {
    const adapter = createOpenAIAdapter(
      "openai-1" as EntityId,
      "test-openai",
      "http://localhost:8080",
      "gpt-4",
    );
    const res = await adapter.complete({
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(res.finishReason).toBe("stop");
    expect(res.content).toContain("[OpenAI fake response");
  });

  it("openai adapter health check returns healthy", async () => {
    const adapter = createOpenAIAdapter(
      "openai-1" as EntityId,
      "test-openai",
      "http://localhost:8080",
      "gpt-4",
    );
    const health = await adapter.health();
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("anthropic adapter completes without network", async () => {
    const adapter = createAnthropicAdapter(
      "anthropic-1" as EntityId,
      "test-anthropic",
      "http://localhost:8080",
      "claude-3",
    );
    const res = await adapter.complete({
      model: "claude-3",
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(res.finishReason).toBe("stop");
    expect(res.content).toContain("[Anthropic fake response");
    expect(res.usage?.completionTokens).toBe(6);
  });

  it("local adapter completes without network", async () => {
    const adapter = createLocalAdapter(
      "local-1" as EntityId,
      "test-local",
      "http://localhost:8080",
      "llama-3",
    );
    const res = await adapter.complete({
      model: "llama-3",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ],
    });
    expect(res.finishReason).toBe("stop");
    expect(res.content).toContain("[Local model fake response");
  });

  it("factory creates openai adapter", async () => {
    const adapter = createProvider(
      "openai",
      "p-1" as EntityId,
      "openai-prod",
      "https://api.openai.com",
      "gpt-4",
    );
    expect(adapter.name).toBe("openai-prod");
    expect(adapter.tier).toBe("cloud");
    const health = await adapter.health();
    expect(health.healthy).toBe(true);
  });

  it("factory creates anthropic adapter", async () => {
    const adapter = createProvider(
      "anthropic",
      "p-2" as EntityId,
      "anthropic-prod",
      "https://api.anthropic.com",
      "claude-3",
    );
    expect(adapter.tier).toBe("cloud");
    const res = await adapter.complete({
      model: "claude-3",
      messages: [{ role: "user", content: "test" }],
    });
    expect(res.model).toBe("claude-3");
  });

  it("factory creates local adapter", async () => {
    const adapter = createProvider(
      "local",
      "p-3" as EntityId,
      "local-llm",
      "http://localhost:11434",
      "llama-3",
    );
    expect(adapter.tier).toBe("local");
    const res = await adapter.complete({
      model: "llama-3",
      messages: [{ role: "user", content: "hello" }],
    });
    expect(res.finishReason).toBe("stop");
  });

  it("adapter exposes id and name", () => {
    const adapter = createProvider(
      "openai",
      "p-1" as EntityId,
      "test",
      "http://localhost",
      "model",
    );
    expect(adapter.id).toBe("p-1");
  });
});
