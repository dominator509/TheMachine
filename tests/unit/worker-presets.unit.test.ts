import { afterEach, describe, expect, it } from "vitest";
import {
  createAgenticRuntime,
  createBuiltinWorkers,
  createFunctionWorker,
  describeWorker,
  probeWorkers,
} from "@the-machine/agent-runtime";

const executableVariables = [
  "MACHINE_CODEX_BIN",
  "MACHINE_CLAUDE_BIN",
  "MACHINE_AIDER_BIN",
  "MACHINE_OPENHANDS_BIN",
] as const;
const originalEnvironment = Object.fromEntries(
  executableVariables.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  for (const name of executableVariables) {
    const original = originalEnvironment[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

describe("first-class worker presets", () => {
  it("registers Codex, Claude Code, Aider, and OpenHands by default", () => {
    const runtime = createAgenticRuntime();
    const ids = runtime.listWorkers().map((worker) => worker.id);
    expect(ids).toEqual(expect.arrayContaining(["codex", "claude-code", "aider", "openhands"]));
  });

  it("exposes an auditable safety and invocation descriptor for every preset", () => {
    const descriptors = createBuiltinWorkers().map(describeWorker);
    expect(descriptors.map((descriptor) => descriptor.id)).toEqual([
      "codex",
      "claude-code",
      "aider",
      "openhands",
    ]);
    for (const descriptor of descriptors) {
      expect(descriptor.builtIn).toBe(true);
      expect(descriptor.executable.length).toBeGreaterThan(0);
      expect(descriptor.documentationUrl).toMatch(/^https:\/\//);
      expect(descriptor.safetyNotes.length).toBeGreaterThan(0);
      expect(descriptor.supportedPlatforms.length).toBeGreaterThan(0);
      expect(descriptor.invocationTemplate.length).toBeGreaterThan(0);
    }
  });

  it("uses the current Codex exec contract and removes fabricated flags", () => {
    const descriptor = createBuiltinWorkers()
      .map(describeWorker)
      .find((item) => item.id === "codex");
    expect(descriptor?.invocationTemplate).toEqual([
      "exec",
      "--json",
      "--color",
      "never",
      "--ephemeral",
      "--skip-git-repo-check",
      "--full-auto",
      "-C",
      "{workspace}",
      "{prompt}",
    ]);
    expect(descriptor?.invocationTemplate).not.toContain("--ignore-rules");
    expect(descriptor?.invocationTemplate).not.toContain("--approve-for-me");
    expect(descriptor?.invocationTemplate).not.toContain("--cd");
  });

  it("uses documented scripting flags for Aider and OpenHands", () => {
    const descriptors = createBuiltinWorkers().map(describeWorker);
    const aider = descriptors.find((item) => item.id === "aider");
    expect(aider?.invocationTemplate).toContain("--yes");
    expect(aider?.invocationTemplate).not.toContain("--yes-always");
    expect(aider?.invocationTemplate).not.toContain("--disable-playwright");
    expect(aider?.invocationTemplate).not.toContain("--skip-sanity-check-repo");

    const openhands = descriptors.find((item) => item.id === "openhands");
    expect(openhands?.invocationTemplate).toEqual([
      "--headless",
      "--json",
      "--override-with-envs",
      "--file",
      "{promptFile}",
    ]);
  });

  it("does not mistake an unrelated executable with a version flag for an installed worker", async () => {
    for (const name of executableVariables) process.env[name] = process.execPath;
    const probes = await probeWorkers(createBuiltinWorkers());
    expect(probes).toHaveLength(4);
    for (const probe of probes) {
      expect(probe.available).toBe(false);
      expect(probe.executable).toBe(process.execPath);
      expect(probe.version).toMatch(/^v?\d+\./);
      expect(probe.message).toContain("unexpected identity");
    }
  });

  it("lets an embedding application intentionally override a built-in worker ID", () => {
    const custom = createFunctionWorker("codex", () => undefined);
    const runtime = createAgenticRuntime({ workers: [custom] });
    const selected = runtime.listWorkers().find((worker) => worker.id === "codex");
    expect(selected).toBe(custom);
    expect(describeWorker(selected as typeof custom).builtIn).toBe(false);
  });
});
