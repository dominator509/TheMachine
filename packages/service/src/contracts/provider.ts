// Provider configuration schemas.

import type { EntityId, ProviderTier } from "@the-machine/core";

export interface ProviderRequest {
  readonly workspaceId: EntityId;
  readonly providerId?: EntityId;
}

export interface ProviderResponse {
  readonly id: EntityId;
  readonly name: string;
  readonly tier: ProviderTier;
  readonly endpoint: string;
  readonly models: string[];
  readonly timeoutMs: number;
  readonly healthy: boolean;
}

export interface ProviderListResponse {
  readonly providers: ProviderResponse[];
}
