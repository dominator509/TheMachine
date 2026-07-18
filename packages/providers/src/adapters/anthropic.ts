// Anthropic-compatible provider adapter (fake transport).

import type { EntityId } from "@the-machine/core";
import type {
  ProviderAdapter,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderHealth,
} from "../types.js";

export function createAnthropicAdapter(
  id: EntityId,
  name: string,
  _endpoint: string,
  _model: string,
): ProviderAdapter {
  return {
    id,
    name,
    tier: "cloud" as const,

    // eslint-disable-next-line @typescript-eslint/require-await
    async complete(req: ProviderCompletionRequest): Promise<ProviderCompletionResponse> {
      const lastMsg = req.messages[req.messages.length - 1];
      return {
        id: `anthropic-fake-${String(Date.now())}`,
        model: req.model,
        content: `[Anthropic fake response to: ${lastMsg?.content.slice(0, 40) ?? ""}]`,
        finishReason: "stop",
        usage: { promptTokens: 8, completionTokens: 6 },
      };
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async health(): Promise<ProviderHealth> {
      return { healthy: true, latencyMs: 8 };
    },
  };
}
