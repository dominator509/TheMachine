// Repository profile schemas.

import type { EntityId, RepositoryPackageManager, SemVer } from "@the-machine/core";

export interface RepoRequest {
  readonly workspaceId: EntityId;
  readonly rootPath?: string;
}

export interface RepoResponse {
  readonly workspaceId: EntityId;
  readonly rootPath: string;
  readonly packageManager: RepositoryPackageManager;
  readonly nodeVersion: SemVer;
  readonly hasPackageJson: boolean;
  readonly hasGit: boolean;
  readonly branch: string | null;
}
