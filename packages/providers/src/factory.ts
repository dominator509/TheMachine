// Provider factory: select and create the right adapter.

import type { EntityId } from "@the-machine/core";
import type { ProviderAdapter, ProviderAdapterOptions } from "./types.js";
import { createOpenAIAdapter } from "./adapters/openai.js";
import { createAnthropicAdapter } from "./adapters/anthropic.js";
import { createLocalAdapter } from "./adapters/local.js";

export type ProviderKind = "openai" | "anthropic" | "local";

/** Create a provider adapter based on kind. */
export function createProvider(
  kind: ProviderKind,
  id: EntityId,
  name: string,
  endpoint: string,
  model: string,
  opts: ProviderAdapterOptions = {},
): ProviderAdapter {
  switch (kind) {
    case "openai":
      return createOpenAIAdapter(id, name, endpoint, model, opts);
    case "anthropic":
      return createAnthropicAdapter(id, name, endpoint, model, opts);
    case "local":
      return createLocalAdapter(id, name, endpoint, model, opts);
  }
}
