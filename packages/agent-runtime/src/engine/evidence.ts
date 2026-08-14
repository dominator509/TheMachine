import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { diffFromBase } from "./git.js";
import { RunStateStore } from "./state.js";
import type {
  MachinePlan,
  RunManifest,
  ValidationResult,
} from "./types.js";

const SECRET_NAME_PATTERN = /(api.?key|token|secret|password|credential|private.?key)/i;
const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}\b/gi,
  /\bgh[opurs]_[A-Za-z0-9]{20,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
] as const;

export interface EvidenceBundleResult {
  readonly directory: string;
  readonly checksums: Readonly<Record<string, string>>;
}

export interface EvidenceVerification {
  readonly valid: boolean;
  readonly missing: readonly string[];
  readonly mismatched: readonly string[];
}

function sha256(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function knownSecretValues(): string[] {
  return Object.entries(process.env)
    .filter(([name, value]) => SECRET_NAME_PATTERN.test(name) && (value?.length ?? 0) >= 8)
    .map(([, value]) => value as string)
    .sort((left, right) => right.length - left.length);
}

export function redactEvidenceText(contents: string): string {
  let redacted = contents;
  for (const pattern of SECRET_VALUE_PATTERNS) redacted = redacted.replace(pattern, "[REDACTED]");
  for (const value of knownSecretValues()) redacted = redacted.split(value).join("[REDACTED]");
  redacted = redacted.replace(
    /("?(?:api.?key|token|secret|password|credential|authorization)"?\s*[:=]\s*)"?[^"\s,}]+"?/gi,
    "$1[REDACTED]",
  );
  return redacted;
}

function writeEvidenceFile(directory: string, name: string, contents: string): void {
  writeFileSync(join(directory, name), redactEvidenceText(contents), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

function allValidations(manifest: RunManifest): ValidationResult[] {
  return Object.values(manifest.taskStates).flatMap((task) =>
    task.attempts.flatMap((attempt) => attempt.validations),
  );
}

function summaryMarkdown(manifest: RunManifest): string {
  const taskRows = manifest.taskOrder.map((taskId) => {
    const state = manifest.taskStates[taskId];
    return `| ${taskId} | ${state?.status ?? "unknown"} | ${String(state?.attempts.length ?? 0)} | ${state?.checkpoint ?? "—"} |`;
  });
  const failure = manifest.failure
    ? `\n## Failure\n\n- Category: ${manifest.failure.category}\n- Message: ${manifest.failure.message}\n`
    : "";
  return [
    `# The Machine evidence — ${manifest.runId}`,
    "",
    `- Plan: ${manifest.planId}`,
    `- Plan digest: \`${manifest.planDigest}\``,
    `- Status: **${manifest.status}**`,
    `- Repository: ${manifest.repositoryPath}`,
    `- Base commit: \`${manifest.baseCommit}\``,
    `- Run branch: \`${manifest.branch}\``,
    `- Created: ${manifest.createdAt}`,
    `- Completed: ${manifest.completedAt ?? "not completed"}`,
    "",
    "## Tasks",
    "",
    "| Task | Status | Attempts | Checkpoint |",
    "| --- | --- | ---: | --- |",
    ...taskRows,
    failure,
    "",
    "## Integrity",
    "",
    "Every file in this directory except `checksums.sha256` is listed in that checksum manifest.",
    "Worker output and structured records are redacted before this bundle is written.",
    "",
  ].join("\n");
}

function finalPatch(manifest: RunManifest): string {
  if (!existsSync(manifest.worktreePath)) return "";
  try {
    return diffFromBase(manifest.worktreePath, manifest.baseCommit);
  } catch (error) {
    return `# Unable to generate final patch\n# ${error instanceof Error ? error.message : String(error)}\n`;
  }
}

export function writeEvidenceBundle(input: {
  readonly store: RunStateStore;
  readonly manifest: RunManifest;
  readonly plan: MachinePlan;
}): EvidenceBundleResult {
  const directory = join(input.store.runDirectory(input.manifest.runId), "evidence");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const events = input.store.readEvents(input.manifest.runId);
  const approvals = input.store.readApprovals(input.manifest.runId);

  writeEvidenceFile(directory, "summary.md", summaryMarkdown(input.manifest));
  writeEvidenceFile(directory, "manifest.json", `${JSON.stringify(input.manifest, null, 2)}\n`);
  writeEvidenceFile(directory, "plan.snapshot.json", `${JSON.stringify(input.plan, null, 2)}\n`);
  writeEvidenceFile(
    directory,
    "events.jsonl",
    events.map((event) => JSON.stringify(event)).join("\n") + (events.length > 0 ? "\n" : ""),
  );
  writeEvidenceFile(directory, "approvals.json", `${JSON.stringify(approvals, null, 2)}\n`);
  writeEvidenceFile(
    directory,
    "policy-decisions.json",
    `${JSON.stringify(input.manifest.policyDecisions, null, 2)}\n`,
  );
  writeEvidenceFile(
    directory,
    "validations.json",
    `${JSON.stringify(allValidations(input.manifest), null, 2)}\n`,
  );
  writeEvidenceFile(directory, "patch.diff", finalPatch(input.manifest));

  const files = readdirSync(directory)
    .filter((name) => name !== "checksums.sha256" && statSync(join(directory, name)).isFile())
    .sort();
  const checksums: Record<string, string> = {};
  for (const name of files) checksums[name] = sha256(readFileSync(join(directory, name)));
  const manifest = files.map((name) => `${checksums[name]}  ${name}`).join("\n");
  writeFileSync(join(directory, "checksums.sha256"), `${manifest}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  return { directory, checksums };
}

export function verifyEvidenceBundle(directory: string): EvidenceVerification {
  const checksumPath = join(directory, "checksums.sha256");
  if (!existsSync(checksumPath)) {
    return { valid: false, missing: ["checksums.sha256"], mismatched: [] };
  }
  const missing: string[] = [];
  const mismatched: string[] = [];
  const lines = readFileSync(checksumPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})\s{2}(.+)$/.exec(line);
    if (!match) {
      mismatched.push(line);
      continue;
    }
    const expected = match[1] ?? "";
    const name = match[2] ?? "";
    if (basename(name) !== name || name.includes("..")) {
      mismatched.push(name);
      continue;
    }
    const filePath = join(directory, name);
    if (!existsSync(filePath)) {
      missing.push(name);
      continue;
    }
    if (sha256(readFileSync(filePath)) !== expected) mismatched.push(name);
  }
  return {
    valid: missing.length === 0 && mismatched.length === 0,
    missing,
    mismatched,
  };
}
