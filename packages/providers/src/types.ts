// Base provider types — shared across all adapters.

import type { EntityId, ProviderTier } from "@the-machine/core";

/** A single message in a conversation. */
export interface ProviderMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/** Request sent to a provider. */
export interface ProviderCompletionRequest {
  readonly model: string;
  readonly messages: ProviderMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
}

/** Response from a provider. */
export interface ProviderCompletionResponse {
  readonly id: string;
  readonly model: string;
  readonly content: string;
  readonly finishReason: "stop" | "length" | "error";
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
}

/** Health check result for a provider. */
export interface ProviderHealth {
  readonly healthy: boolean;
  readonly latencyMs: number;
  readonly error?: string;
}

/** Base provider adapter interface. */
export interface ProviderAdapter {
  readonly id: EntityId;
  readonly name: string;
  readonly tier: ProviderTier;

  /** Send a completion request. */
  complete(req: ProviderCompletionRequest): Promise<ProviderCompletionResponse>;

  /** Check provider health. */
  health(): Promise<ProviderHealth>;
}
