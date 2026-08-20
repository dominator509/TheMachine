import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyEvidenceBundle } from "@the-machine/agent-runtime";

const cleanup: string[] = [];
const originalVerifyKey = process.env["MACHINE_EVIDENCE_VERIFY_KEY"];

afterEach(() => {
  while (cleanup.length > 0) {
    const target = cleanup.pop();
    if (target) rmSync(target, { recursive: true, force: true });
  }
  if (originalVerifyKey === undefined) delete process.env["MACHINE_EVIDENCE_VERIFY_KEY"];
  else process.env["MACHINE_EVIDENCE_VERIFY_KEY"] = originalVerifyKey;
});

function fixture(): { directory: string; manifest: string } {
  const directory = mkdtempSync(join(tmpdir(), "machine-evidence-"));
  cleanup.push(directory);
  const payload = "evidence\n";
  writeFileSync(join(directory, "payload.txt"), payload, "utf-8");
  const digest = createHash("sha256").update(payload).digest("hex");
  const manifest = `${digest}  payload.txt\n`;
  writeFileSync(join(directory, "checksums.sha256"), manifest, "utf-8");
  return { directory, manifest };
}

describe("evidence bundle integrity", () => {
  it("rejects unlisted files and directories", () => {
    const { directory } = fixture();
    writeFileSync(join(directory, "injected.txt"), "not listed\n", "utf-8");
    const result = verifyEvidenceBundle(directory);
    expect(result.valid).toBe(false);
    expect(result.unexpected).toContain("injected.txt");
  });

  it("rejects duplicate checksum entries", () => {
    const { directory, manifest } = fixture();
    writeFileSync(join(directory, "checksums.sha256"), `${manifest}${manifest}`, "utf-8");
    const result = verifyEvidenceBundle(directory);
    expect(result.valid).toBe(false);
    expect(result.duplicateEntries).toContain("payload.txt");
  });

  it("rejects payload tampering", () => {
    const { directory } = fixture();
    writeFileSync(join(directory, "payload.txt"), "tampered\n", "utf-8");
    const result = verifyEvidenceBundle(directory);
    expect(result.valid).toBe(false);
    expect(result.mismatched).toContain("payload.txt");
  });

  it("verifies an Ed25519 checksum-manifest signature against a trusted key", () => {
    const { directory, manifest } = fixture();
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signature = sign(null, Buffer.from(manifest, "utf-8"), privateKey).toString("base64");
    writeFileSync(join(directory, "checksums.sig"), `${signature}\n`, "utf-8");
    process.env["MACHINE_EVIDENCE_VERIFY_KEY"] = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const result = verifyEvidenceBundle(directory);
    expect(result.valid).toBe(true);
    expect(result.signature).toBe("verified");
  });

  it("marks a signature without a configured trust key as untrusted", () => {
    const { directory } = fixture();
    writeFileSync(join(directory, "checksums.sig"), "ZmFrZQ==\n", "utf-8");
    delete process.env["MACHINE_EVIDENCE_VERIFY_KEY"];
    delete process.env["MACHINE_EVIDENCE_SIGNING_KEY"];
    const result = verifyEvidenceBundle(directory);
    expect(result.valid).toBe(true);
    expect(result.signature).toBe("untrusted");
  });
});
