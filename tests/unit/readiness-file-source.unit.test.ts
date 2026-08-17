import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileReadinessEvidenceSource } from "@the-machine/service";

const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) {
    const target = cleanup.pop();
    if (target) rmSync(target, { recursive: true, force: true });
  }
});

function writeEvidence(candidateSha = "candidate", tamper = false): string {
  const directory = mkdtempSync(join(tmpdir(), "machine-readiness-evidence-"));
  cleanup.push(directory);
  const evidencePath = join(directory, "READINESS_EVIDENCE.json");
  const document = {
    schemaVersion: 1,
    candidateSha,
    overall: "ready",
    subsystems: {
      core: {
        subsystem: "core",
        candidateSha,
        passed: true,
        checkCount: 3,
        evidenceDigest: "sha256:core",
        completedAt: new Date(0).toISOString(),
      },
    },
  };
  const contents = `${JSON.stringify(document, null, 2)}\n`;
  writeFileSync(evidencePath, tamper ? `${contents} ` : contents, "utf-8");
  const digest = createHash("sha256").update(contents).digest("hex");
  writeFileSync(
    join(directory, "READINESS_EVIDENCE.sha256"),
    `${digest}  READINESS_EVIDENCE.json\n`,
    "utf-8",
  );
  return evidencePath;
}

describe("file readiness evidence source", () => {
  it("loads checksum-verified evidence for the exact candidate", () => {
    const source = createFileReadinessEvidenceSource(writeEvidence(), "candidate");
    expect(source.get("core")).toEqual(
      expect.objectContaining({ candidateSha: "candidate", passed: true, checkCount: 3 }),
    );
  });

  it("turns a checksum mismatch into failed evidence", () => {
    const source = createFileReadinessEvidenceSource(writeEvidence("candidate", true), "candidate");
    expect(source.get("core")).toEqual(
      expect.objectContaining({ candidateSha: "candidate", passed: false, checkCount: 0 }),
    );
  });

  it("turns stale candidate evidence into a failure", () => {
    const source = createFileReadinessEvidenceSource(writeEvidence("old"), "current");
    expect(source.get("core")).toEqual(
      expect.objectContaining({ candidateSha: "old", passed: false }),
    );
  });

  it("returns pending null only when no evidence file exists", () => {
    const directory = mkdtempSync(join(tmpdir(), "machine-readiness-missing-"));
    cleanup.push(directory);
    const source = createFileReadinessEvidenceSource(
      join(directory, "READINESS_EVIDENCE.json"),
      "candidate",
    );
    expect(source.get("core")).toBeNull();
  });
});
