import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { verifyEvidenceBundle, type EvidenceVerification } from "./evidence.js";
import { diffFromBase, getRepositoryRoot } from "./git.js";
import { RunStateStore } from "./state.js";
import type { ApprovalRecord, MachinePlan, RunEvent, RunManifest } from "./types.js";

export interface RunArtifact {
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly size: number;
  readonly modifiedAt: string;
}

export interface RunConsoleSnapshot {
  readonly manifest: RunManifest;
  readonly plan: MachinePlan;
  readonly events: readonly RunEvent[];
  readonly approvals: readonly ApprovalRecord[];
  readonly diff: string;
  readonly artifacts: readonly RunArtifact[];
  readonly evidenceVerification: EvidenceVerification | null;
  readonly capturedAt: string;
}

function storeFor(repositoryPath: string, stateRoot?: string): RunStateStore {
  const repository = getRepositoryRoot(repositoryPath);
  return new RunStateStore(resolve(stateRoot ?? join(repository, ".machine")));
}

function evidencePatch(manifest: RunManifest): string {
  const evidenceDirectory = manifest.evidencePath;
  if (!evidenceDirectory) return "";
  const patchPath = join(evidenceDirectory, "patch.diff");
  return existsSync(patchPath) ? readFileSync(patchPath, "utf-8") : "";
}

export function readRunDiff(manifest: RunManifest): string {
  if (existsSync(manifest.worktreePath)) {
    try {
      return diffFromBase(manifest.worktreePath, manifest.baseCommit);
    } catch {
      // A finalized evidence bundle remains the fallback source of truth.
    }
  }
  return evidencePatch(manifest);
}

function collectArtifacts(root: string, directory: string, output: RunArtifact[]): void {
  if (!existsSync(directory) || output.length >= 10_000) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (output.length >= 10_000) break;
    const absolutePath = join(directory, entry.name);
    const metadata = statSync(absolutePath);
    output.push({
      path: relative(root, absolutePath).replaceAll("\\", "/"),
      kind: entry.isDirectory() ? "directory" : "file",
      size: entry.isFile() ? metadata.size : 0,
      modifiedAt: metadata.mtime.toISOString(),
    });
    if (entry.isDirectory()) collectArtifacts(root, absolutePath, output);
  }
}

export function listRunArtifacts(
  runId: string,
  repositoryPath = process.cwd(),
  stateRoot?: string,
): RunArtifact[] {
  const store = storeFor(repositoryPath, stateRoot);
  const root = store.runDirectory(runId);
  const output: RunArtifact[] = [];
  collectArtifacts(root, root, output);
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

export function readRunEvents(
  runId: string,
  repositoryPath = process.cwd(),
  stateRoot?: string,
  afterSequence = 0,
): RunEvent[] {
  return storeFor(repositoryPath, stateRoot)
    .readEvents(runId)
    .filter((event) => event.sequence > afterSequence);
}

export function loadRunConsoleSnapshot(
  runId: string,
  repositoryPath = process.cwd(),
  stateRoot?: string,
  afterSequence = 0,
): RunConsoleSnapshot {
  const store = storeFor(repositoryPath, stateRoot);
  const manifest = store.loadManifest(runId);
  const evidenceVerification =
    manifest.evidencePath && existsSync(manifest.evidencePath)
      ? verifyEvidenceBundle(manifest.evidencePath)
      : null;
  return {
    manifest,
    plan: store.loadPlanSnapshot(runId),
    events: store.readEvents(runId).filter((event) => event.sequence > afterSequence),
    approvals: store.readApprovals(runId),
    diff: readRunDiff(manifest),
    artifacts: listRunArtifacts(runId, repositoryPath, stateRoot),
    evidenceVerification,
    capturedAt: new Date().toISOString(),
  };
}
