import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RepoRequest, RepoResponse } from "../contracts/repo.js";
import type { SemVer } from "@the-machine/core";

interface PackageManifest {
  readonly packageManager?: string;
}

function gitValue(rootPath: string, args: readonly string[]): string | null {
  const result = spawnSync("git", [...args], {
    cwd: rootPath,
    encoding: "utf-8",
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 && result.stdout.trim().length > 0
    ? result.stdout.trim()
    : null;
}

function knownPackageManager(
  value: string | undefined,
): RepoResponse["packageManager"] | null {
  return value === "pnpm" || value === "npm" || value === "yarn" || value === "bun"
    ? value
    : null;
}

function detectedPackageManager(
  rootPath: string,
  manifest: PackageManifest | null,
): RepoResponse["packageManager"] {
  const declared = knownPackageManager(manifest?.packageManager?.split("@")[0]);
  if (declared) return declared;
  if (existsSync(join(rootPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(rootPath, "yarn.lock"))) return "yarn";
  if (
    existsSync(join(rootPath, "bun.lock")) ||
    existsSync(join(rootPath, "bun.lockb"))
  )
    return "bun";
  if (existsSync(join(rootPath, "package-lock.json"))) return "npm";
  return "unknown";
}

function readManifest(filePath: string): PackageManifest | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as PackageManifest;
  } catch {
    return null;
  }
}

export interface RepoHandler {
  discover(req: RepoRequest): RepoResponse;
}

export function createRepoHandler(): RepoHandler {
  return {
    discover(req: RepoRequest): RepoResponse {
      const rootPath = resolve(req.rootPath ?? process.cwd());
      const packagePath = join(rootPath, "package.json");
      const manifest = readManifest(packagePath);
      const gitRoot = gitValue(rootPath, ["rev-parse", "--show-toplevel"]);
      const branch = gitRoot
        ? (gitValue(rootPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]) ??
          gitValue(rootPath, ["rev-parse", "--short", "HEAD"]) ??
          "detached")
        : "none";
      return {
        workspaceId: req.workspaceId,
        rootPath,
        packageManager: detectedPackageManager(rootPath, manifest),
        nodeVersion: process.versions.node as SemVer,
        hasPackageJson: existsSync(packagePath),
        hasGit: gitRoot !== null,
        branch,
      };
    },
  };
}
