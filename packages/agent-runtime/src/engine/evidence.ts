import { createHash, createPublicKey, sign as signData, verify as verifyData } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { diffFromBase } from "./git.js";
import { RunStateStore } from "./state.js";
import type { MachinePlan, RunManifest, ValidationResult } from "./types.js";

const SECRET_NAME_PATTERN = /(api.?key|token|secret|password|credential|private.?key)/i;
const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}\b/gi,
  /\bgh[opurs]_[A-Za-z0-9]{20,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
] as const;
const CHECKSUM_FILE = "checksums.sha256";
const SIGNATURE_FILE = "checksums.sig";

export interface EvidenceBundleResult {
  readonly directory: string;
  readonly checksums: Readonly<Record<string, string>>;
  readonly signature: "created" | "missing";
}

export interface EvidenceVerification {
  readonly valid: boolean;
  readonly missing: readonly string[];
  readonly mismatched: readonly string[];
  readonly unexpected: readonly string[];
  readonly duplicateEntries: readonly string[];
  readonly signature: "verified" | "missing" | "untrusted" | "invalid";
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
    `Every payload file in this directory is listed in \`${CHECKSUM_FILE}\`.`,
    `An optional \`${SIGNATURE_FILE}\` signs the checksum manifest when a trusted Ed25519 key is configured.`,
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

function maybeSignChecksumManifest(
  directory: string,
  checksumManifest: string,
): "created" | "missing" {
  const privateKey = process.env["MACHINE_EVIDENCE_SIGNING_KEY"];
  if (!privateKey) return "missing";
  const signature = signData(null, Buffer.from(checksumManifest, "utf-8"), privateKey);
  writeFileSync(join(directory, SIGNATURE_FILE), `${signature.toString("base64")}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  return "created";
}

export function writeEvidenceBundle(input: {
  readonly store: RunStateStore;
  readonly manifest: RunManifest;
  readonly plan: MachinePlan;
}): EvidenceBundleResult {
  const directory = join(input.store.runDirectory(input.manifest.runId), "evidence");
  rmSync(directory, { recursive: true, force: true });
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
    .filter((name) => name !== CHECKSUM_FILE && name !== SIGNATURE_FILE)
    .filter((name) => statSync(join(directory, name)).isFile())
    .sort();
  const checksums: Record<string, string> = {};
  for (const name of files) checksums[name] = sha256(readFileSync(join(directory, name)));
  const checksumManifest = `${files.map((name) => `${checksums[name]}  ${name}`).join("\n")}\n`;
  writeFileSync(join(directory, CHECKSUM_FILE), checksumManifest, {
    encoding: "utf-8",
    mode: 0o600,
  });
  const signature = maybeSignChecksumManifest(directory, checksumManifest);
  return { directory, checksums, signature };
}

function signatureStatus(
  directory: string,
  checksumManifest: string,
): EvidenceVerification["signature"] {
  const signaturePath = join(directory, SIGNATURE_FILE);
  if (!existsSync(signaturePath)) return "missing";
  const verificationKey = process.env["MACHINE_EVIDENCE_VERIFY_KEY"];
  const signingKey = process.env["MACHINE_EVIDENCE_SIGNING_KEY"];
  if (!verificationKey && !signingKey) return "untrusted";
  try {
    const key = verificationKey ?? createPublicKey(signingKey as string);
    const signature = Buffer.from(readFileSync(signaturePath, "utf-8").trim(), "base64");
    return verifyData(null, Buffer.from(checksumManifest, "utf-8"), key, signature)
      ? "verified"
      : "invalid";
  } catch {
    return "invalid";
  }
}

export function verifyEvidenceBundle(directory: string): EvidenceVerification {
  const checksumPath = join(directory, CHECKSUM_FILE);
  if (!existsSync(checksumPath)) {
    return {
      valid: false,
      missing: [CHECKSUM_FILE],
      mismatched: [],
      unexpected: [],
      duplicateEntries: [],
      signature: "missing",
    };
  }

  const missing: string[] = [];
  const mismatched: string[] = [];
  const duplicateEntries: string[] = [];
  const checksumManifest = readFileSync(checksumPath, "utf-8");
  const expectedNames = new Set<string>();
  for (const line of checksumManifest.split("\n").filter((entry) => entry.trim().length > 0)) {
    const match = /^([a-f0-9]{64})\s{2}(.+)$/.exec(line);
    if (!match) {
      mismatched.push(line);
      continue;
    }
    const expected = match[1] ?? "";
    const name = match[2] ?? "";
    if (
      basename(name) !== name ||
      name.includes("..") ||
      name === CHECKSUM_FILE ||
      name === SIGNATURE_FILE
    ) {
      mismatched.push(name);
      continue;
    }
    if (expectedNames.has(name)) {
      duplicateEntries.push(name);
      continue;
    }
    expectedNames.add(name);
    const filePath = join(directory, name);
    if (!existsSync(filePath)) {
      missing.push(name);
      continue;
    }
    if (sha256(readFileSync(filePath)) !== expected) mismatched.push(name);
  }

  const unexpected = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== CHECKSUM_FILE && entry.name !== SIGNATURE_FILE)
    .filter((entry) => !entry.isFile() || !expectedNames.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const signature = signatureStatus(directory, checksumManifest);
  const invalidSignature = signature === "invalid";

  return {
    valid:
      missing.length === 0 &&
      mismatched.length === 0 &&
      unexpected.length === 0 &&
      duplicateEntries.length === 0 &&
      !invalidSignature,
    missing,
    mismatched,
    unexpected,
    duplicateEntries,
    signature,
  };
}
