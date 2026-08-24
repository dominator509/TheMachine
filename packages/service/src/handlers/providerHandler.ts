import type {
  ProviderRequest,
  ProviderResponse,
  ProviderListResponse,
} from "../contracts/provider.js";
import type { ReleaseDecision } from "../contracts/releaseDecision.js";
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
    releaseDecision?: ReleaseDecision,
  ): ProviderResponse;
  recordHealth(
    providerId: EntityId,
    healthy: boolean,
    evidence: string,
    checkedAt?: string,
  ): ProviderResponse | null;
  acceptRelease(providerId: EntityId, decision: ReleaseDecision): ProviderResponse | null;
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
      releaseDecision?: ReleaseDecision,
    ): ProviderResponse {
      const provider: ProviderResponse = {
        id,
        name,
        tier,
        endpoint,
        models,
        timeoutMs,
        healthy: false,
        ...(releaseDecision ? { releaseDecision } : {}),
      };
      providers.set(id, provider);
      return provider;
    },

    recordHealth(providerId, healthy, evidence, checkedAt): ProviderResponse | null {
      const provider = providers.get(providerId);
      if (!provider) return null;
      if (evidence.trim().length === 0) {
        throw new Error("Provider health evidence must not be empty.");
      }
      const updated: ProviderResponse = {
        ...provider,
        healthy,
        healthCheckedAt: checkedAt ?? new Date().toISOString(),
        healthEvidence: evidence,
      };
      providers.set(providerId, updated);
      return updated;
    },

    acceptRelease(providerId: EntityId, decision: ReleaseDecision): ProviderResponse | null {
      const provider = providers.get(providerId);
      if (!provider) return null;
      const updated: ProviderResponse = { ...provider, releaseDecision: decision };
      providers.set(providerId, updated);
      return updated;
    },
  };
}
