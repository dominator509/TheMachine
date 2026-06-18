// Repository profile schemas.

import type { EntityId, SemVer } from "@the-machine/core";

export interface RepoRequest {
  readonly workspaceId: EntityId;
  readonly rootPath?: string;
}

export interface RepoResponse {
  readonly workspaceId: EntityId;
  readonly rootPath: string;
  readonly packageManager: "pnpm" | "npm" | "yarn" | "unknown";
  readonly nodeVersion: SemVer;
  readonly hasPackageJson: boolean;
  readonly hasGit: boolean;
  readonly branch: string | null;
}
