import type { EntityId } from "@the-machine/core";
import type {
  ProviderAdapterOptions,
  ProviderAdapter,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderHealth,
} from "../types.js";
import { openAIChatCompletion, providerHealth } from "../http.js";

export function createLocalAdapter(
  id: EntityId,
  name: string,
  endpoint: string,
  _model: string,
  opts: ProviderAdapterOptions = {},
): ProviderAdapter {
  return {
    id,
    name,
    tier: "local" as const,

    async complete(req: ProviderCompletionRequest): Promise<ProviderCompletionResponse> {
      return openAIChatCompletion(endpoint, req, opts);
    },

    async health(): Promise<ProviderHealth> {
      return providerHealth(endpoint, opts);
    },
  };
}
