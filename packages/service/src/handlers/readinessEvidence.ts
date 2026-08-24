import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { ExecutedReadinessEvidence, ReadinessEvidenceSource } from "./readinessHandler.js";

interface ReadinessEvidenceDocument {
  readonly schemaVersion: number;
  readonly candidateSha: string;
  readonly overall: string;
  readonly subsystems: Readonly<Record<string, unknown>>;
}

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function invalidEvidence(
  subsystem: string,
  expectedCandidateSha: string,
  reason: string,
): ExecutedReadinessEvidence {
  return {
    subsystem,
    candidateSha: expectedCandidateSha,
    passed: false,
    checkCount: 0,
    evidenceDigest: `invalid:${sha256(reason)}`,
    completedAt: new Date(0).toISOString(),
  };
}

function validRecord(value: unknown, subsystem: string): value is ExecutedReadinessEvidence {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Partial<ExecutedReadinessEvidence>;
  return (
    record.subsystem === subsystem &&
    typeof record.candidateSha === "string" &&
    typeof record.passed === "boolean" &&
    typeof record.checkCount === "number" &&
    Number.isInteger(record.checkCount) &&
    record.checkCount >= 0 &&
    typeof record.evidenceDigest === "string" &&
    record.evidenceDigest.length > 0 &&
    typeof record.completedAt === "string" &&
    Number.isFinite(Date.parse(record.completedAt))
  );
}

function verifyChecksum(evidencePath: string, contents: Buffer): void {
  const checksumPath = join(dirname(evidencePath), "READINESS_EVIDENCE.sha256");
  if (!existsSync(checksumPath)) throw new Error("readiness checksum sidecar is missing");
  const line = readFileSync(checksumPath, "utf-8").trim();
  const match = /^([a-f0-9]{64})\s{2}(.+)$/.exec(line);
  if (!match) throw new Error("readiness checksum sidecar is malformed");
  if (match[2] !== basename(evidencePath)) {
    throw new Error("readiness checksum sidecar names a different evidence file");
  }
  if (match[1] !== sha256(contents)) throw new Error("readiness evidence checksum mismatch");
}

/**
 * Load the evidence emitted by tools/readiness/production-readiness-check.mjs.
 * A missing file leaves readiness pending. A present but corrupt or stale file
 * produces a failed record instead of silently falling back to optimistic state.
 */
export function createFileReadinessEvidenceSource(
  evidencePath: string,
  expectedCandidateSha: string,
): ReadinessEvidenceSource {
  const absolutePath = resolve(evidencePath);
  if (expectedCandidateSha.trim().length === 0) {
    throw new Error("Expected candidate SHA is required for readiness evidence.");
  }

  return {
    expectedCandidateSha,
    get(subsystem: string): ExecutedReadinessEvidence | null {
      if (!existsSync(absolutePath)) return null;
      try {
        const contents = readFileSync(absolutePath);
        verifyChecksum(absolutePath, contents);
        const document = JSON.parse(contents.toString("utf-8")) as ReadinessEvidenceDocument;
        if (document.schemaVersion !== 1) throw new Error("unsupported readiness evidence schema");
        if (document.candidateSha !== expectedCandidateSha) {
          return invalidEvidence(
            subsystem,
            document.candidateSha,
            `candidate mismatch: ${document.candidateSha}`,
          );
        }
        const record = document.subsystems[subsystem];
        if (!validRecord(record, subsystem)) {
          throw new Error(`missing or invalid subsystem record: ${subsystem}`);
        }
        return record;
      } catch (error) {
        return invalidEvidence(
          subsystem,
          expectedCandidateSha,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };
}
