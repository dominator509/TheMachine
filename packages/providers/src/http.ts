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

type AuthenticationStyle = "bearer" | "anthropic" | "none";

function joinUrl(endpoint: string, path: string): string {
  return `${endpoint.replace(/\/+$/, "")}${path}`;
}

function redactError(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, "Bearer [REDACTED]")
    .replace(/(x-api-key\s*[:=]\s*)[^\s,}]+/gi, "$1[REDACTED]");
}

function finishReason(value: string | undefined): "stop" | "length" | "error" {
  if (value === "length" || value === "max_tokens") return "length";
  if (value === "stop" || value === "end_turn") return "stop";
  return value === undefined ? "stop" : "error";
}

function authenticationHeaders(
  opts: ProviderAdapterOptions,
  style: AuthenticationStyle,
): Record<string, string> {
  if (!opts.apiKey || style === "none") return {};
  if (style === "anthropic") return { "x-api-key": opts.apiKey };
  return { authorization: `Bearer ${opts.apiKey}` };
}

async function postJson(
  fetchImpl: ProviderFetch,
  url: string,
  body: unknown,
  opts: ProviderAdapterOptions,
  authentication: AuthenticationStyle,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, opts.timeoutMs ?? 30_000);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authenticationHeaders(opts, authentication),
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`HTTP ${String(response.status)}: ${responseText.slice(0, 2_000)}`);
    }
    return await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(redactError(message), { cause: err });
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
  const data = (await postJson(
    fetchImpl,
    joinUrl(endpoint, "/chat/completions"),
    {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
    },
    opts,
    "bearer",
  )) as OpenAIResponse;
  return {
    id: data.id ?? `completion-${String(Date.now())}`,
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
      max_tokens: req.maxTokens ?? 1_024,
      messages: req.messages.filter((message) => message.role !== "system"),
      system: req.messages.find((message) => message.role === "system")?.content,
      temperature: req.temperature,
    },
    opts,
    "anthropic",
    { "anthropic-version": "2023-06-01" },
  )) as AnthropicResponse;
  return {
    id: data.id ?? `completion-${String(Date.now())}`,
    model: data.model ?? req.model,
    content:
      data.content?.find((part) => part.type === "text" || part.text !== undefined)?.text ?? "",
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
  authentication: AuthenticationStyle = "bearer",
): Promise<ProviderHealth> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: authenticationHeaders(opts, authentication),
      signal: controller.signal,
    });
    return { healthy: response.ok, latencyMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { healthy: false, latencyMs: Date.now() - started, error: redactError(message) };
  } finally {
    clearTimeout(timeout);
  }
}
