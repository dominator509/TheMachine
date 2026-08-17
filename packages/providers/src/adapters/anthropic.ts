import type { EntityId } from "@the-machine/core";
import type {
  ProviderAdapterOptions,
  ProviderAdapter,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderHealth,
} from "../types.js";
import { anthropicCompletion, providerHealth } from "../http.js";

export function createAnthropicAdapter(
  id: EntityId,
  name: string,
  endpoint: string,
  _model: string,
  opts: ProviderAdapterOptions = {},
): ProviderAdapter {
  return {
    id,
    name,
    tier: "cloud" as const,

    async complete(req: ProviderCompletionRequest): Promise<ProviderCompletionResponse> {
      return anthropicCompletion(endpoint, req, opts);
    },

    async health(): Promise<ProviderHealth> {
      return providerHealth(endpoint, opts, "anthropic");
    },
  };
}
