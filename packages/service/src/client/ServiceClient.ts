// Shared typed client for all service contracts.
// Composes handler interfaces into a single typed boundary
// that desktop and CLI apps consume.

import type { HealthHandler } from "../handlers/healthHandler.js";
import type { WorkspaceHandler } from "../handlers/workspaceHandler.js";
import type { RepoHandler } from "../handlers/repoHandler.js";
import type { PlanHandler } from "../handlers/planHandler.js";
import type { RunHandler } from "../handlers/runHandler.js";
import type { ValidationHandler } from "../handlers/validationHandler.js";
import type { ProviderHandler } from "../handlers/providerHandler.js";
import type { MCPHandler } from "../handlers/mcpHandler.js";
import type { PluginHandler } from "../handlers/pluginHandler.js";
import type { ProductionApprovalHandler } from "../handlers/productionApprovalHandler.js";
import type { ReadinessHandler } from "../handlers/readinessHandler.js";

export interface ServiceClient {
  readonly health: HealthHandler;
  readonly workspace: WorkspaceHandler;
  readonly repo: RepoHandler;
  readonly plan: PlanHandler;
  readonly run: RunHandler;
  readonly validation: ValidationHandler;
  readonly provider: ProviderHandler;
  readonly mcp: MCPHandler;
  readonly plugin: PluginHandler;
  readonly approval: ProductionApprovalHandler;
  readonly readiness: ReadinessHandler;
}

export function createServiceClient(opts: {
  health: HealthHandler;
  workspace: WorkspaceHandler;
  repo: RepoHandler;
  plan: PlanHandler;
  run: RunHandler;
  validation: ValidationHandler;
  provider: ProviderHandler;
  mcp: MCPHandler;
  plugin: PluginHandler;
  approval: ProductionApprovalHandler;
  readiness: ReadinessHandler;
}): ServiceClient {
  return { ...opts };
}
