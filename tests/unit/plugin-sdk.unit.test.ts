import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPluginContext,
  createPluginHostAPI,
  createPluginRegistry,
  createSandboxedExecutor,
  getPlugin,
  invokePluginHook,
  listPlugins,
  loadPluginPackages,
  pluginPackageToManifest,
  registerPlugin,
  unregisterPlugin,
} from "@the-machine/plugin-sdk";
import type { PluginManifest } from "@the-machine/core";

const cleanup: string[] = [];
const SAMPLE_MANIFEST: PluginManifest = {
  id: "plugin-test" as never,
  name: "Test Plugin",
  version: "1.0.0" as never,
  entryPoint: "index.js",
  permissions: [{ resource: "log", actions: ["read"], allowed: true }],
};

afterEach(() => {
  while (cleanup.length > 0) {
    const target = cleanup.pop();
    if (target) rmSync(target, { recursive: true, force: true });
  }
});

function plugin(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "machine-plugin-test-"));
  cleanup.push(directory);
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(directory, name), contents, "utf-8");
  }
  return directory;
}

function instance(entryPoint: string) {
  return {
    manifest: { ...SAMPLE_MANIFEST, entryPoint },
    hooks: {},
    enabled: true,
  };
}

function context(directory: string) {
  return { pluginId: String(SAMPLE_MANIFEST.id), pluginDir: directory, config: {} };
}

describe("plugin registry and host contracts", () => {
  it("registers immutably, lists, retrieves, overwrites, and unregisters", () => {
    const empty = createPluginRegistry();
    const first = registerPlugin(empty, SAMPLE_MANIFEST, {});
    const second = registerPlugin(first, { ...SAMPLE_MANIFEST, name: "Updated" }, {});
    expect(empty.plugins.size).toBe(0);
    expect(listPlugins(second)).toHaveLength(1);
    expect(getPlugin(second, SAMPLE_MANIFEST.id)?.manifest.name).toBe("Updated");
    expect(unregisterPlugin(second, SAMPLE_MANIFEST.id).plugins.size).toBe(0);
    expect(unregisterPlugin(empty, "missing" as never).plugins.size).toBe(0);
  });

  it("loads no packages from a missing directory and maps package metadata", () => {
    expect(loadPluginPackages("/definitely/not/a/plugin/directory")).toEqual([]);
    expect(
      pluginPackageToManifest({
        name: "plugin-package",
        version: "2.0.0" as never,
        description: "fixture",
        main: "start.js",
        machine: { plugin: true, permissions: [] },
      }),
    ).toEqual(expect.objectContaining({ name: "plugin-package", entryPoint: "start.js" }));
    expect(
      pluginPackageToManifest({
        name: "minimal",
        version: "1.0.0" as never,
        machine: { plugin: true },
      }).entryPoint,
    ).toBe("index.js");
  });

  it("creates a host context and isolates synchronous hook failures", () => {
    const api = createPluginHostAPI({ dbUrl: "sqlite://test" });
    const registry = registerPlugin(createPluginRegistry(), SAMPLE_MANIFEST, {
      onExecute: (input: unknown) => input,
      onLoad: () => {
        throw new Error("hook crashed");
      },
    });
    const registration = getPlugin(registry, SAMPLE_MANIFEST.id);
    if (!registration) throw new Error("registration missing");
    const pluginContext = createPluginContext(registration, api);
    expect(pluginContext.pluginName).toBe("Test Plugin");
    expect(api.getConfig("dbUrl")).toBe("sqlite://test");
    expect(invokePluginHook(registration, "onExecute", pluginContext, "input")).toEqual(
      expect.objectContaining({ success: true, output: "input" }),
    );
    expect(invokePluginHook(registration, "onLoad", pluginContext)).toEqual(
      expect.objectContaining({ success: false, error: expect.stringContaining("hook crashed") }),
    );
  });
});

describe("plugin trust boundary", () => {
  it("disables third-party execution by default", async () => {
    const directory = plugin({ "plugin.mjs": "export function onExecute(){ return 'ran'; }" });
    const result = await createSandboxedExecutor().executeOnExecute(
      instance(join(directory, "plugin.mjs")),
      context(directory),
      {},
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("third-party plugin execution is disabled"),
      }),
    );
  });

  it("runs an explicitly trusted subprocess hook", async () => {
    const directory = plugin({
      "plugin.mjs":
        "export function onExecute(ctx,input){ return {id:ctx.pluginId,value:input.value}; }",
    });
    const result = await createSandboxedExecutor({
      isolation: "trusted-subprocess",
    }).executeOnExecute(instance(join(directory, "plugin.mjs")), context(directory), {
      value: "ok",
    });
    expect(result).toEqual({ success: true, output: { id: "plugin-test", value: "ok" } });
  });

  it("denies trusted-subprocess reads outside approved roots", async () => {
    const outside = plugin({ "secret.txt": "do-not-read" });
    const directory = plugin({
      "plugin.mjs":
        "import {readFileSync} from 'node:fs'; export function onExecute(ctx,input){ return readFileSync(input.path,'utf8'); }",
    });
    const result = await createSandboxedExecutor({
      isolation: "trusted-subprocess",
    }).executeOnExecute(instance(join(directory, "plugin.mjs")), context(directory), {
      path: join(outside, "secret.txt"),
    });
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("onExecute failed"),
      }),
    );
  });

  it("denies trusted-subprocess writes by default", async () => {
    const directory = plugin({
      "plugin.mjs":
        "import {writeFileSync} from 'node:fs'; export function onExecute(){ writeFileSync('created.txt','blocked'); }",
    });
    const result = await createSandboxedExecutor({
      isolation: "trusted-subprocess",
    }).executeOnExecute(instance(join(directory, "plugin.mjs")), context(directory), {});
    expect(result.success).toBe(false);
    expect(existsSync(join(directory, "created.txt"))).toBe(false);
  });

  it("bounds execution time and output", async () => {
    const slowDirectory = plugin({
      "plugin.mjs":
        "export async function onExecute(){ await new Promise(r=>setTimeout(r,250)); return 'late'; }",
    });
    expect(
      await createSandboxedExecutor({
        isolation: "trusted-subprocess",
        timeoutMs: 50,
      }).executeOnExecute(instance(join(slowDirectory, "plugin.mjs")), context(slowDirectory), {}),
    ).toEqual({ success: false, error: "onExecute timed out after 50ms" });

    const noisyDirectory = plugin({
      "plugin.mjs": "export function onExecute(){ console.log('x'.repeat(5000)); return 'done'; }",
    });
    expect(
      await createSandboxedExecutor({
        isolation: "trusted-subprocess",
        maxOutputBytes: 1_000,
      }).executeOnExecute(
        instance(join(noisyDirectory, "plugin.mjs")),
        context(noisyDirectory),
        {},
      ),
    ).toEqual(
      expect.objectContaining({ success: false, error: expect.stringContaining("output limit") }),
    );
  });

  it("captures trusted-subprocess errors and keeps in-process trust explicit", async () => {
    const failingDirectory = plugin({
      "plugin.mjs": "export function onLoad(){ throw new Error('subprocess boom'); }",
    });
    expect(
      await createSandboxedExecutor({ isolation: "trusted-subprocess" }).executeOnLoad(
        instance(join(failingDirectory, "plugin.mjs")),
        context(failingDirectory),
      ),
    ).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("subprocess boom"),
      }),
    );

    const trustedDirectory = plugin({
      "plugin.mjs": "export function onExecute(){ return 'trusted'; }",
    });
    expect(
      await createSandboxedExecutor({ isolation: "trusted-in-process" }).executeOnExecute(
        instance(join(trustedDirectory, "plugin.mjs")),
        context(trustedDirectory),
        {},
      ),
    ).toEqual({ success: true, output: "trusted" });
  });
});
