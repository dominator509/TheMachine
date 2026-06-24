import type {
  ProviderAdapterOptions,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderFetch,
  ProviderHealth,
} from "./types.js";

interface OpenAIChoice {
  readonly finish_reason?: string;
  readonly message?: { readonly content?: string };
}

interface OpenAIResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: OpenAIChoice[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
  };
}

interface AnthropicContent {
  readonly type?: string;
  readonly text?: string;
}

interface AnthropicResponse {
  readonly id?: string;
  readonly model?: string;
  readonly stop_reason?: string;
  readonly content?: AnthropicContent[];
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
  };
}

function joinUrl(endpoint: string, path: string): string {
  return `${endpoint.replace(/\/+$/, "")}${path}`;
}

function redactError(message: string): string {
  return message.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, "Bearer [REDACTED]");
}

function finishReason(value: string | undefined): "stop" | "length" | "error" {
  if (value === "length" || value === "max_tokens") return "length";
  if (value === "stop" || value === "end_turn") return "stop";
  return value === undefined ? "stop" : "error";
}

async function postJson(
  fetchImpl: ProviderFetch,
  url: string,
  body: unknown,
  opts: ProviderAdapterOptions,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...extraHeaders,
    };
    if (opts.apiKey) headers["authorization"] = `Bearer ${opts.apiKey}`;
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(redactError(message));
  } finally {
    clearTimeout(timeout);
  }
}

export async function openAIChatCompletion(
  endpoint: string,
  req: ProviderCompletionRequest,
  opts: ProviderAdapterOptions,
): Promise<ProviderCompletionResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const data = (await postJson(fetchImpl, joinUrl(endpoint, "/chat/completions"), {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature,
    max_tokens: req.maxTokens,
  }, opts)) as OpenAIResponse;
  return {
    id: data.id ?? `completion-${Date.now()}`,
    model: data.model ?? req.model,
    content: data.choices?.[0]?.message?.content ?? "",
    finishReason: finishReason(data.choices?.[0]?.finish_reason),
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

export async function anthropicCompletion(
  endpoint: string,
  req: ProviderCompletionRequest,
  opts: ProviderAdapterOptions,
): Promise<ProviderCompletionResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const data = (await postJson(
    fetchImpl,
    joinUrl(endpoint, "/v1/messages"),
    {
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      messages: req.messages.filter((m) => m.role !== "system"),
      system: req.messages.find((m) => m.role === "system")?.content,
      temperature: req.temperature,
    },
    opts,
    { "anthropic-version": "2023-06-01" },
  )) as AnthropicResponse;
  return {
    id: data.id ?? `completion-${Date.now()}`,
    model: data.model ?? req.model,
    content: data.content?.find((part) => part.type === "text" || part.text !== undefined)?.text ?? "",
    finishReason: finishReason(data.stop_reason),
    usage: {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
    },
  };
}

export async function providerHealth(
  endpoint: string,
  opts: ProviderAdapterOptions,
): Promise<ProviderHealth> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const started = Date.now();
  try {
    const response = await fetchImpl(endpoint, { method: "GET" });
    return { healthy: response.ok, latencyMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { healthy: false, latencyMs: Date.now() - started, error: redactError(message) };
  }
}
