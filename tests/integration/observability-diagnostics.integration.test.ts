// Integration tests for observability diagnostics module — redacted diagnostic bundle export.
import { describe, it, expect } from "vitest";
import {
  createDiagnosticBundle,
  exportDiagnosticBundle,
  type DiagnosticConfig,
  type DiagnosticBundle,
} from "@the-machine/observability";

describe("DiagnosticBundle (integration)", () => {
  const defaultConfig: DiagnosticConfig = {
    platform: "The Machine",
    version: "0.1.0",
    startTime: Date.now() - 3600000, // 1 hour ago
    nodeVersion: "v20.11.0",
    platformArch: "linux/x64",
    osInfo: "linux x64",
    providerCount: 0,
    mcpServerCount: 0,
    pluginCount: 0,
  };

  it("should create a diagnostic bundle with system, version, and profiles sections", () => {
    const bundle = createDiagnosticBundle(defaultConfig);

    expect(bundle.platform).toBe("The Machine");
    expect(bundle.version).toBe("0.1.0");
    expect(bundle.uptimeMs).toBeGreaterThan(0);
    expect(bundle.nodeVersion).toBe("v20.11.0");
    expect(bundle.platformArch).toBe("linux/x64");
    expect(bundle.osInfo).toBe("linux x64");

    const labels = bundle.sections.map((s) => s.label);
    expect(labels).toContain("system");
    expect(labels).toContain("version");
    expect(labels).toContain("profiles");
  });

  it("should include correct data in system section", () => {
    const bundle = createDiagnosticBundle(defaultConfig);
    const system = bundle.sections.find((s) => s.label === "system");
    expect(system).toBeDefined();
    expect(system!.data.nodeVersion).toBe("v20.11.0");
    expect(system!.data.platformArch).toBe("linux/x64");
    expect(system!.data.osInfo).toBe("linux x64");
  });

  it("should include correct data in version section", () => {
    const bundle = createDiagnosticBundle(defaultConfig);
    const version = bundle.sections.find((s) => s.label === "version");
    expect(version).toBeDefined();
    expect(version!.data.platform).toBe("The Machine");
    expect(version!.data.version).toBe("0.1.0");
    expect(version!.data.uptimeMs).toBeGreaterThan(0);
    expect(typeof version!.data.generatedAt).toBe("string");
  });

  it("should include profile counts in profiles section", () => {
    const bundle = createDiagnosticBundle(defaultConfig);
    const profiles = bundle.sections.find((s) => s.label === "profiles");
    expect(profiles).toBeDefined();
    expect(profiles!.data.providerCount).toBe(0);
    expect(profiles!.data.mcpServerCount).toBe(0);
    expect(profiles!.data.pluginCount).toBe(0);
  });

  it("should reflect configured profile counts", () => {
    const config: DiagnosticConfig = {
      ...defaultConfig,
      providerCount: 2,
      mcpServerCount: 1,
      pluginCount: 3,
    };
    const bundle = createDiagnosticBundle(config);
    const profiles = bundle.sections.find((s) => s.label === "profiles");
    expect(profiles!.data.providerCount).toBe(2);
    expect(profiles!.data.mcpServerCount).toBe(1);
    expect(profiles!.data.pluginCount).toBe(3);
  });

  it("should not redact clean data", () => {
    const bundle = createDiagnosticBundle(defaultConfig);
    expect(bundle.redactionApplied).toBe(false);
  });

  it("should redact API keys in extraData", () => {
    const bundle = exportDiagnosticBundle(defaultConfig, {
      apiKey: "sk-testABCDEF1234567890ABCDEF1234567890ABCDEF12",
      token: "ghp_testABCDEF1234567890ABCDEF1234567890ABCDEF",
    });

    expect(bundle.redactionApplied).toBe(true);
    const extra = bundle.sections.find((s) => s.label === "extra");
    expect(extra).toBeDefined();
    expect(extra!.redacted).toBe(true);
    expect(extra!.data.apiKey as string).not.toContain("ABCDEF1234567890");
    expect(extra!.data.token as string).toContain("[REDACTED");
  });

  it("should redact secrets in nested objects", () => {
    const bundle = exportDiagnosticBundle(defaultConfig, {
      credentials: {
        password: "supersecret123!@#",
        username: "admin",
      },
    });

    expect(bundle.redactionApplied).toBe(true);
    const extra = bundle.sections.find((s) => s.label === "extra");
    expect(extra).toBeDefined();
    expect(extra!.redacted).toBe(true);
    expect(extra!.data.credentials).toBe("[REDACTED]");
  });

  it("should redact plain string values that look like secrets", () => {
    const bundle = exportDiagnosticBundle(defaultConfig, {
      description: "Using key sk-test1234567890abcdef for API access",
    });

    expect(bundle.redactionApplied).toBe(true);
    const extra = bundle.sections.find((s) => s.label === "extra");
    expect(extra).toBeDefined();
    const desc = extra!.data.description as string;
    expect(desc).toContain("[REDACTED");
    expect(desc).not.toContain("sk-test1234567890abcdef");
  });

  it("should redact secrets in arrays", () => {
    const bundle = exportDiagnosticBundle(defaultConfig, {
      tokens: ["ghp_testABCDEF1234567890ABCDEF1234567890ABCDEF", "safe-token-value"],
    });

    expect(bundle.redactionApplied).toBe(true);
    const extra = bundle.sections.find((s) => s.label === "extra");
    expect(extra).toBeDefined();
    expect(extra!.data.tokens).toBe("[REDACTED]");
  });

  it("should produce a JSON-serializable bundle", () => {
    const bundle = createDiagnosticBundle(defaultConfig);
    const json = JSON.stringify(bundle);
    expect(json).toContain('"generatedAt"');
    expect(json).toContain('"platform"');
    expect(json).toContain('"version"');
    expect(json).toContain('"uptimeMs"');
    expect(json).toContain('"redactionApplied"');
    expect(json).toContain('"sections"');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("should include extra section only when extraData is provided", () => {
    const withoutExtra = exportDiagnosticBundle(defaultConfig);
    expect(withoutExtra.sections.map((s) => s.label)).not.toContain("extra");

    const withExtra = exportDiagnosticBundle(defaultConfig, { note: "test" });
    expect(withExtra.sections.map((s) => s.label)).toContain("extra");
  });

  it("should report redactionApplied=false for non-sensitive extraData", () => {
    const bundle = exportDiagnosticBundle(defaultConfig, {
      note: "Everything is fine",
      count: 42,
    });

    expect(bundle.redactionApplied).toBe(false);
    const extra = bundle.sections.find((s) => s.label === "extra");
    expect(extra).toBeDefined();
    expect(extra!.redacted).toBe(false);
  });
});
