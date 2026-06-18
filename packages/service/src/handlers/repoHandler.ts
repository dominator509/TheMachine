import type { RepoRequest, RepoResponse } from "../contracts/repo.js";
import type { SemVer } from "@the-machine/core";

export interface RepoHandler {
  discover(req: RepoRequest): RepoResponse;
}

export function createRepoHandler(): RepoHandler {
  return {
    discover(req: RepoRequest): RepoResponse {
      // Simplified discovery — real implementation uses filesystem probing.
      const rootPath = req.rootPath ?? process.cwd();
      return {
        workspaceId: req.workspaceId,
        rootPath,
        packageManager: "pnpm",
        nodeVersion: "20.0.0" as SemVer,
        hasPackageJson: true,
        hasGit: true,
        branch: "main",
      };
    },
  };
}
