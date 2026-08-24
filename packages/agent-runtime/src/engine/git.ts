import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { buildSafeEnvironment } from "../process.js";

const GIT_OUTPUT_LIMIT = 32 * 1024 * 1024;

export interface GitResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunWorktree {
  readonly repositoryPath: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly baseRef: string;
  readonly baseCommit: string;
}

export interface StagedPatch {
  readonly changedFiles: readonly string[];
  readonly patch: string;
  readonly patchBytes: number;
  readonly ignoredFiles?: readonly string[];
  readonly unsafeSymlinks?: readonly string[];
}

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly result: GitResult;

  constructor(args: readonly string[], result: GitResult) {
    super(`git ${args.join(" ")} failed (${String(result.exitCode)}): ${result.stderr.trim()}`);
    this.name = "GitCommandError";
    this.args = args;
    this.result = result;
  }
}

export function runGit(cwd: string, args: readonly string[], allowFailure = false): GitResult {
  const result = spawnSync("git", [...args], {
    cwd: resolve(cwd),
    env: buildSafeEnvironment([], {
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
      GIT_PAGER: "cat",
    }),
    encoding: "utf-8",
    shell: false,
    windowsHide: true,
    maxBuffer: GIT_OUTPUT_LIMIT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const normalized: GitResult = {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: `${result.stderr ?? ""}${result.error ? `${result.stderr ? "\n" : ""}${result.error.message}` : ""}`,
  };
  if (!allowFailure && normalized.exitCode !== 0) throw new GitCommandError(args, normalized);
  return normalized;
}

export function getRepositoryRoot(requestedPath: string): string {
  const candidate = resolve(requestedPath);
  const result = runGit(candidate, ["rev-parse", "--show-toplevel"]);
  const root = result.stdout.trim();
  if (root.length === 0) throw new Error(`Not a Git repository: ${candidate}`);
  return resolve(root);
}

export function defaultWorktreeRoot(repositoryPath: string): string {
  const root = getRepositoryRoot(repositoryPath);
  return join(dirname(root), `.${basename(root)}.machine-worktrees`);
}

function validRunSegment(runId: string): string {
  const safe = runId.replace(/[^A-Za-z0-9._-]/g, "-");
  if (safe.length === 0) throw new Error(`Invalid run ID: ${runId}`);
  return safe;
}

function branchExists(repositoryPath: string, branch: string): boolean {
  return (
    runGit(repositoryPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], true)
      .exitCode === 0
  );
}

export function createRunWorktree(
  repositoryPath: string,
  runId: string,
  baseRef = "HEAD",
  requestedWorktreeRoot?: string,
): RunWorktree {
  const root = getRepositoryRoot(repositoryPath);
  const baseCommit = runGit(root, ["rev-parse", "--verify", `${baseRef}^{commit}`]).stdout.trim();
  const worktreeRoot = resolve(requestedWorktreeRoot ?? defaultWorktreeRoot(root));
  mkdirSync(worktreeRoot, { recursive: true, mode: 0o700 });
  const safeRunId = validRunSegment(runId);
  const worktreePath = join(worktreeRoot, safeRunId);
  const branch = `machine/${safeRunId}`;

  if (existsSync(worktreePath)) {
    const actualRoot = getRepositoryRoot(worktreePath);
    if (actualRoot !== resolve(worktreePath)) {
      throw new Error(`Existing path is not the expected run worktree: ${worktreePath}`);
    }
    return { repositoryPath: root, worktreePath, branch, baseRef, baseCommit };
  }

  if (branchExists(root, branch)) {
    runGit(root, ["worktree", "add", "--force", worktreePath, branch]);
  } else {
    runGit(root, ["worktree", "add", "-b", branch, worktreePath, baseRef]);
  }
  return { repositoryPath: root, worktreePath, branch, baseRef, baseCommit };
}

function parseNullSeparated(output: string): string[] {
  return output
    .split("\0")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => value.replaceAll("\\", "/"));
}

function listIgnoredFiles(worktreePath: string): string[] {
  return parseNullSeparated(
    runGit(worktreePath, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"])
      .stdout,
  );
}

function pathEscapes(rootPath: string, candidatePath: string): boolean {
  const rel = relative(resolve(rootPath), resolve(candidatePath));
  return rel.startsWith("..") || isAbsolute(rel);
}

function unsafeSymlinks(worktreePath: string, changedFiles: readonly string[]): string[] {
  const unsafe: string[] = [];
  for (const filePath of changedFiles) {
    const absolutePath = resolve(worktreePath, filePath);
    try {
      if (!lstatSync(absolutePath).isSymbolicLink()) continue;
      const target = readlinkSync(absolutePath);
      const resolvedTarget = resolve(dirname(absolutePath), target);
      const relativeTarget = relative(resolve(worktreePath), resolvedTarget).replaceAll("\\", "/");
      if (
        pathEscapes(worktreePath, resolvedTarget) ||
        relativeTarget === ".git" ||
        relativeTarget.startsWith(".git/") ||
        relativeTarget === ".machine" ||
        relativeTarget.startsWith(".machine/")
      ) {
        unsafe.push(filePath.replaceAll("\\", "/"));
      }
    } catch {
      // Deleted and broken paths are represented in the Git patch and do not expose a live target.
    }
  }
  return unsafe.sort();
}

export function stageAndInspect(worktreePath: string): StagedPatch {
  runGit(worktreePath, ["add", "-A", "--", "."]);
  const changedFiles = parseNullSeparated(
    runGit(worktreePath, ["diff", "--cached", "--name-only", "-z", "HEAD"]).stdout,
  );
  const ignoredFiles = listIgnoredFiles(worktreePath);
  const unsafeLinks = unsafeSymlinks(worktreePath, changedFiles);
  const patch = runGit(worktreePath, [
    "diff",
    "--cached",
    "--binary",
    "--no-ext-diff",
    "HEAD",
  ]).stdout;

  // Ignored and untracked residue is never allowed to influence policy, validation, or a
  // later fallback worker. Capture it for policy evidence, then remove it before execution continues.
  if (ignoredFiles.length > 0) runGit(worktreePath, ["clean", "-ffdx"]);

  return {
    changedFiles,
    patch,
    patchBytes: Buffer.byteLength(patch, "utf-8"),
    ignoredFiles,
    unsafeSymlinks: unsafeLinks,
  };
}

export function resetWorktree(worktreePath: string): void {
  runGit(worktreePath, ["reset", "--hard", "HEAD"]);
  runGit(worktreePath, ["clean", "-ffdx"]);
}

export function worktreeIsClean(worktreePath: string): boolean {
  return (
    runGit(worktreePath, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout.trim()
      .length === 0 && listIgnoredFiles(worktreePath).length === 0
  );
}

export function currentCommit(worktreePath: string): string {
  return runGit(worktreePath, ["rev-parse", "HEAD"]).stdout.trim();
}

export function commitCheckpoint(worktreePath: string, message: string): string {
  const staged = runGit(worktreePath, ["diff", "--cached", "--quiet", "HEAD"], true);
  if (staged.exitCode === 0) return currentCommit(worktreePath);
  runGit(worktreePath, [
    "-c",
    "user.name=The Machine",
    "-c",
    "user.email=machine@localhost",
    "commit",
    "--no-gpg-sign",
    "-m",
    message,
  ]);
  return currentCommit(worktreePath);
}

export function diffFromBase(worktreePath: string, baseCommit: string): string {
  return runGit(worktreePath, ["diff", "--binary", "--no-ext-diff", `${baseCommit}..HEAD`]).stdout;
}

export function removeRunWorktree(worktree: RunWorktree): void {
  runGit(worktree.repositoryPath, ["worktree", "remove", "--force", worktree.worktreePath], true);
  rmSync(worktree.worktreePath, { recursive: true, force: true });
  runGit(worktree.repositoryPath, ["worktree", "prune"], true);
}
