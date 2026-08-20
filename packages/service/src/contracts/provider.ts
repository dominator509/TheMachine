// Provider configuration schemas.

import type { EntityId, ProviderTier } from "@the-machine/core";
import type { ReleaseDecision } from "./releaseDecision.js";

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
  readonly healthCheckedAt?: string;
  readonly healthEvidence?: string;
  readonly releaseDecision?: ReleaseDecision;
}

export interface ProviderListResponse {
  readonly providers: ProviderResponse[];
}
