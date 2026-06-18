// Domain barrel export.
// No infrastructure imports.

export type {
  EntityId,
  Label,
  SemVer,
  Timestamp,
  ActivityStatus,
  Severity,
  Priority,
} from "./types.js";

export type { Workspace, RepositoryProfile, BlueprintPack } from "./workspace.js";

export type {
  ExecPlanStatus,
  ExecPlan,
  Milestone,
  ExecPlanProgress,
  DecisionEntry,
  StopCondition,
} from "./execplan.js";
export { createExecPlan, activateExecPlan, completeExecPlan, stopExecPlan } from "./execplan.js";

export type { AgentRun, CommandRun, ValidationResult } from "./run.js";
export { createAgentRun, recordCommand, recordValidation } from "./run.js";

export type {
  ProviderTier,
  ProviderConfig,
  MCPConfig,
  MCPPermission,
  PluginManifest,
  PluginPermission,
  ReadinessGate,
  ReadinessCheck,
  SecretReference,
  IntegrationProfile,
} from "./integrations.js";
