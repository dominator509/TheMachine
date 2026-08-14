// Workspace and repository-profile entities.
// No infrastructure imports.

import type { EntityId, SemVer, ActivityStatus } from "./types.js";

/** Local The Machine state scope — one per repository. */
export interface Workspace {
  readonly id: EntityId;
  readonly path: string;
  readonly status: ActivityStatus;
  readonly activeExecPlanId: EntityId | null;
}

/** Package managers that The Machine can identify without executing project code. */
export type RepositoryPackageManager = "pnpm" | "npm" | "yarn" | "bun" | "unknown";

/** Discovered repository metadata. */
export interface RepositoryProfile {
  readonly rootPath: string;
  readonly packageManager: RepositoryPackageManager;
  readonly nodeVersion: SemVer;
  readonly hasPackageJson: boolean;
  readonly hasGit: boolean;
  readonly branch: string | null;
}

/** Repository-local docs, specs, ExecPlans, scripts, and checklists. */
export interface BlueprintPack {
  readonly workspaceId: EntityId;
  readonly execPlans: EntityId[];
  readonly specs: EntityId[];
  readonly scripts: string[];
  readonly checklists: string[];
}
