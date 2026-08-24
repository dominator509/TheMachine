import { describe, expect, it } from "vitest";
import { exportDiagnosticBundle } from "@the-machine/observability";

const config = {
  platform: "test",
  version: "0.3.0-alpha.1",
  startTime: Date.now(),
  nodeVersion: process.versions.node,
  platformArch: `${process.platform}-${process.arch}`,
  osInfo: "test",
};

function extraSection(bundle: ReturnType<typeof exportDiagnosticBundle>) {
  const section = bundle.sections.find((candidate) => candidate.label === "extra");
  if (!section) throw new Error("missing extra diagnostic section");
  return section;
}

describe("diagnostic redaction hardening", () => {
  it("never returns a raw secret after the recursion depth limit", () => {
    let nested: Record<string, unknown> = { apiKey: "sk-abcdefghijklmnop1234567890" };
    for (let index = 0; index < 40; index += 1) nested = { child: nested };
    const serialized = JSON.stringify(extraSection(exportDiagnosticBundle(config, nested)).data);
    expect(serialized).not.toContain("abcdefghijklmnop");
    expect(serialized).toContain("TRUNCATED:DEPTH");
  });

  it("masks sensitive keys regardless of value shape", () => {
    const section = extraSection(
      exportDiagnosticBundle(config, {
        authorization: { nested: "opaque" },
        private_key: ["one", "two"],
        tokenMetadata: 12345,
      }),
    );
    expect(section.data).toEqual({
      authorization: "[REDACTED]",
      private_key: "[REDACTED]",
      tokenMetadata: "[REDACTED]",
    });
  });

  it("handles circular objects without throwing or leaking their contents", () => {
    const circular: Record<string, unknown> = { value: "safe" };
    circular["self"] = circular;
    const section = extraSection(exportDiagnosticBundle(config, circular));
    expect(section.data["self"]).toBe("[CIRCULAR]");
    expect(section.redacted).toBe(true);
  });

  it("bounds oversized arrays and strings", () => {
    const section = extraSection(
      exportDiagnosticBundle(config, {
        items: Array.from({ length: 1_100 }, (_, index) => index),
        message: "x".repeat(70_000),
      }),
    );
    const items = section.data["items"] as unknown[];
    expect(items).toHaveLength(1_001);
    expect(items.at(-1)).toContain("TRUNCATED");
    expect(String(section.data["message"])).toContain("TRUNCATED:STRING");
  });
});
