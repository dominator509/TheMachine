// Shared client factory — creates real handler instances and composes into ServiceClient.
// Both CLI and desktop can use this factory to get a fully wired client.

import { PLATFORM_NAME } from "@the-machine/core";
import { createUI } from "@the-machine/ui-components";
import type { UIRegistry } from "@the-machine/ui-components";
import { createHealthHandler } from "../handlers/healthHandler.js";
import { createWorkspaceHandler } from "../handlers/workspaceHandler.js";
import { createRepoHandler } from "../handlers/repoHandler.js";
import { createPlanHandler } from "../handlers/planHandler.js";
import { createRunHandler } from "../handlers/runHandler.js";
import { createValidationHandler } from "../handlers/validationHandler.js";
import { createProviderHandler } from "../handlers/providerHandler.js";
import { createMCPHandler } from "../handlers/mcpHandler.js";
import { createPluginHandler } from "../handlers/pluginHandler.js";
import { createProductionApprovalHandler } from "../handlers/productionApprovalHandler.js";
import { createReadinessHandler } from "../handlers/readinessHandler.js";
import { createServiceClient } from "./ServiceClient.js";
import { ServiceStore } from "../persistence/store.js";
import type { ServiceClient } from "./ServiceClient.js";
import type { ProductionApproval } from "../contracts/productionApproval.js";
import type {
  HealthHandler,
  WorkspaceHandler,
  RepoHandler,
  PlanHandler,
  RunHandler,
  ValidationHandler,
  ProviderHandler,
  MCPHandler,
  PluginHandler,
  ProductionApprovalHandler,
  ReadinessHandler,
} from "../handlers/index.js";

const START_TIME = Date.now();

export interface ClientFactoryOptions {
  platform?: string;
  version?: string;
  health?: HealthHandler;
  workspace?: WorkspaceHandler;
  repo?: RepoHandler;
  plan?: PlanHandler;
  run?: RunHandler;
  validation?: ValidationHandler;
  provider?: ProviderHandler;
  mcp?: MCPHandler;
  plugin?: PluginHandler;
  approval?: ProductionApprovalHandler;
  readiness?: ReadinessHandler;
  ui?: UIRegistry;
  store?: ServiceStore;
  dbPath?: string;
  productionApproval?: ProductionApproval;
}

/**
 * Create a fully wired ServiceClient with real handler implementations.
 * Accepts optional overrides for any handler — useful for test injection.
 */
export function createDefaultClient(opts: ClientFactoryOptions = {}): ServiceClient {
  const platform = opts.platform ?? PLATFORM_NAME;
  const version = opts.version ?? "0.1.0";
  const store = opts.store ?? new ServiceStore(opts.dbPath);
  const provider = opts.provider ?? createProviderHandler();
  const mcp = opts.mcp ?? createMCPHandler();
  const plugin = opts.plugin ?? createPluginHandler();
  const approval = opts.approval ?? createProductionApprovalHandler(opts.productionApproval ?? null);
  const ui = opts.ui ?? createUI();

  return createServiceClient({
    health: opts.health ?? createHealthHandler(platform, version, START_TIME),
    workspace: opts.workspace ?? createWorkspaceHandler(),
    repo: opts.repo ?? createRepoHandler(),
    plan: opts.plan ?? createPlanHandler(store),
    run: opts.run ?? createRunHandler(store),
    validation: opts.validation ?? createValidationHandler(store),
    provider,
    mcp,
    plugin,
    approval,
    readiness:
      opts.readiness ??
      createReadinessHandler({ providers: provider, mcp, plugins: plugin, ui, approval }),
  });
}
