import type {
  ProviderRequest,
  ProviderResponse,
  ProviderListResponse,
} from "../contracts/provider.js";
import type { EntityId, ProviderTier } from "@the-machine/core";

export interface ProviderHandler {
  get(req: ProviderRequest): ProviderResponse | null;
  list(): ProviderListResponse;
  register(
    id: EntityId,
    name: string,
    tier: ProviderTier,
    endpoint: string,
    models: string[],
    timeoutMs: number,
  ): ProviderResponse;
}

export function createProviderHandler(): ProviderHandler {
  const providers = new Map<string, ProviderResponse>();

  return {
    get(req: ProviderRequest): ProviderResponse | null {
      if (req.providerId) return providers.get(req.providerId) ?? null;
      const all = Array.from(providers.values());
      return all[0] ?? null;
    },

    list(): ProviderListResponse {
      return { providers: Array.from(providers.values()) };
    },

    register(
      id: EntityId,
      name: string,
      tier: ProviderTier,
      endpoint: string,
      models: string[],
      timeoutMs: number,
    ): ProviderResponse {
      const provider: ProviderResponse = {
        id,
        name,
        tier,
        endpoint,
        models,
        timeoutMs,
        healthy: true,
      };
      providers.set(id, provider);
      return provider;
    },
  };
}
