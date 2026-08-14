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

  it("exposes an auditable safety and installation descriptor for every preset", () => {
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
    }
  });

  it("probes configured executables without a shell", async () => {
    for (const name of executableVariables) process.env[name] = process.execPath;
    const probes = await probeWorkers(createBuiltinWorkers());
    expect(probes).toHaveLength(4);
    for (const probe of probes) {
      expect(probe.available).toBe(true);
      expect(probe.executable).toBe(process.execPath);
      expect(probe.version).toMatch(/^v?\d+\./);
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
