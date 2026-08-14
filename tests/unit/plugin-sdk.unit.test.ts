import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  createSandboxedExecutor,
  createPluginRegistry,
  registerPlugin,
  unregisterPlugin,
  getPlugin,
  listPlugins,
  createPluginHostAPI,
  createPluginContext,
  invokePluginHook,
  loadPluginPackages,
  pluginPackageToManifest,
} from "@the-machine/plugin-sdk";
import type { PluginManifest } from "@the-machine/core";

const SAMPLE_MANIFEST: PluginManifest = {
  id: "plugin-test" as any,
  name: "Test Plugin",
  version: "1.0.0" as any,
  entryPoint: "index.js",
  permissions: [{ resource: "log", actions: ["read"], allowed: true }],
};

function withTempPlugin(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "machine-plugin-sandbox-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, "utf8");
  }
  return dir;
}

function sandboxInstance(entryPoint: string) {
  return {
    manifest: {
      ...SAMPLE_MANIFEST,
      entryPoint,
    },
    hooks: {},
    enabled: true,
  };
}

function sandboxContext(pluginDir: string) {
  return {
    pluginId: String(SAMPLE_MANIFEST.id),
    pluginDir,
    config: {},
  };
}

// ── Registry ────────────────────────────────────────────────────────────

describe("createPluginRegistry", () => {
  it("creates an empty registry", () => {
    const registry = createPluginRegistry();
    expect(registry.plugins.size).toBe(0);
  });
});

describe("registerPlugin", () => {
  it("registers a plugin with manifest and hooks", () => {
    const registry = createPluginRegistry();
    const updated = registerPlugin(registry, SAMPLE_MANIFEST, {});
    expect(updated.plugins.size).toBe(1);
    const reg = updated.plugins.get(SAMPLE_MANIFEST.id);
    expect(reg).toBeDefined();
    expect(reg!.manifest.name).toBe("Test Plugin");
    expect(reg!.loaded).toBe(false);
  });

  it("is immutable — does not mutate original registry", () => {
    const registry = createPluginRegistry();
    registerPlugin(registry, SAMPLE_MANIFEST, {});
    expect(registry.plugins.size).toBe(0);
  });

  it("overwrites a plugin with the same id", () => {
    const registry = createPluginRegistry();
    const first = registerPlugin(registry, SAMPLE_MANIFEST, {});
    const second = registerPlugin(first, { ...SAMPLE_MANIFEST, name: "Overwritten" }, {});
    expect(second.plugins.size).toBe(1);
    expect(second.plugins.get(SAMPLE_MANIFEST.id)!.manifest.name).toBe("Overwritten");
  });
});

describe("unregisterPlugin", () => {
  it("removes a registered plugin", () => {
    const registry = createPluginRegistry();
    const withPlugin = registerPlugin(registry, SAMPLE_MANIFEST, {});
    const without = unregisterPlugin(withPlugin, SAMPLE_MANIFEST.id);
    expect(without.plugins.size).toBe(0);
  });

  it("is a no-op when unregistering an unknown id", () => {
    const registry = createPluginRegistry();
    const result = unregisterPlugin(registry, "nonexistent" as any);
    expect(result.plugins.size).toBe(0);
  });
});

describe("getPlugin", () => {
  it("retrieves a registered plugin", () => {
    const registry = createPluginRegistry();
    const withPlugin = registerPlugin(registry, SAMPLE_MANIFEST, {});
    const found = getPlugin(withPlugin, SAMPLE_MANIFEST.id);
    expect(found).not.toBeNull();
    expect(found!.manifest.name).toBe("Test Plugin");
  });

  it("returns null for unknown id", () => {
    const registry = createPluginRegistry();
    expect(getPlugin(registry, "ghost" as any)).toBeNull();
  });
});

describe("listPlugins", () => {
  it("lists all registered plugins", () => {
    let registry = createPluginRegistry();
    registry = registerPlugin(registry, SAMPLE_MANIFEST, {});
    registry = registerPlugin(
      registry,
      { ...SAMPLE_MANIFEST, id: "plugin-2" as any, name: "Plugin 2" },
      {},
    );
    const all = listPlugins(registry);
    expect(all).toHaveLength(2);
  });

  it("returns empty array for empty registry", () => {
    const registry = createPluginRegistry();
    expect(listPlugins(registry)).toEqual([]);
  });
});

// ── Loader ──────────────────────────────────────────────────────────────

describe("loadPluginPackages", () => {
  it("returns empty array for nonexistent directory", () => {
    const result = loadPluginPackages("/nonexistent/plugins");
    expect(result).toEqual([]);
  });
});

describe("pluginPackageToManifest", () => {
  it("converts a plugin package to a manifest", () => {
    const manifest = pluginPackageToManifest({
      name: "my-plugin",
      version: "2.0.0" as any,
      description: "A test plugin",
      main: "start.js",
      machine: { plugin: true, permissions: [] },
    });
    expect(manifest.name).toBe("my-plugin");
    expect(manifest.version).toBe("2.0.0");
    expect(manifest.entryPoint).toBe("start.js");
  });

  it("defaults entryPoint to index.js", () => {
    const manifest = pluginPackageToManifest({
      name: "minimal",
      version: "1.0.0" as any,
      machine: { plugin: true },
    });
    expect(manifest.entryPoint).toBe("index.js");
  });
});

// ── Host API & Context ──────────────────────────────────────────────────

describe("createPluginHostAPI", () => {
  it("provides log and getConfig", () => {
    const api = createPluginHostAPI({ dbUrl: "sqlite://test" });
    expect(typeof api.log).toBe("function");
    expect(api.getConfig("dbUrl")).toBe("sqlite://test");
  });

  it("returns undefined for unknown config keys", () => {
    const api = createPluginHostAPI({});
    expect(api.getConfig("missing")).toBeUndefined();
  });
});

describe("createPluginContext", () => {
  it("creates a context for a registration", () => {
    const registry = createPluginRegistry();
    const withPlugin = registerPlugin(registry, SAMPLE_MANIFEST, {});
    const reg = getPlugin(withPlugin, SAMPLE_MANIFEST.id)!;
    const api = createPluginHostAPI({});
    const ctx = createPluginContext(reg, api);
    expect(ctx.pluginId).toBe(SAMPLE_MANIFEST.id);
    expect(ctx.pluginName).toBe("Test Plugin");
    expect(ctx.api).toBe(api);
  });
});

// ── Hook Execution ──────────────────────────────────────────────────────

describe("invokePluginHook", () => {
  it("invokes onLoad hook with context", () => {
    let loaded = false;
    const hooks = {
      onLoad: () => {
        loaded = true;
      },
    };
    const registry = createPluginRegistry();
    const withPlugin = registerPlugin(registry, SAMPLE_MANIFEST, hooks);
    const reg = getPlugin(withPlugin, SAMPLE_MANIFEST.id)!;
    const api = createPluginHostAPI({});
    const ctx = createPluginContext(reg, api);

    const result = invokePluginHook(reg, "onLoad", ctx);
    expect(result.success).toBe(true);
    expect(result.hook).toBe("onLoad");
    expect(loaded).toBe(true);
  });

  it("invokes onUnload hook with context", () => {
    let unloaded = false;
    const hooks = {
      onUnload: () => {
        unloaded = true;
      },
    };
    const registry = createPluginRegistry();
    const withPlugin = registerPlugin(registry, SAMPLE_MANIFEST, hooks);
    const reg = getPlugin(withPlugin, SAMPLE_MANIFEST.id)!;
    const api = createPluginHostAPI({});
    const ctx = createPluginContext(reg, api);

    const result = invokePluginHook(reg, "onUnload", ctx);
    expect(result.success).toBe(true);
    expect(unloaded).toBe(true);
  });

  it("invokes onConfigure hook with config argument", () => {
    let captured: Record<string, unknown> | undefined;
    const hooks = {
      onConfigure: (cfg: Record<string, unknown>) => {
        captured = cfg;
      },
    };
    const registry = createPluginRegistry();
    const withPlugin = registerPlugin(registry, SAMPLE_MANIFEST, hooks);
    const reg = getPlugin(withPlugin, SAMPLE_MANIFEST.id)!;
    const api = createPluginHostAPI({});
    const ctx = createPluginContext(reg, api);

    const result = invokePluginHook(reg, "onConfigure", ctx, { key: "value" });
    expect(result.success).toBe(true);
    expect(captured).toEqual({ key: "value" });
  });

  it("invokes onExecute hook with input", () => {
    let input: unknown;
    const hooks = {
      onExecute: (i: unknown) => {
        input = i;
        return "processed";
      },
    };
    const registry = createPluginRegistry();
    const withPlugin = registerPlugin(registry, SAMPLE_MANIFEST, hooks);
    const reg = getPlugin(withPlugin, SAMPLE_MANIFEST.id)!;
    const api = createPluginHostAPI({});
    const ctx = createPluginContext(reg, api);

    const result = invokePluginHook(reg, "onExecute", ctx, "hello");
    expect(result.success).toBe(true);
    expect(input).toBe("hello");
    expect(result.output).toBe("processed");
  });

  it("returns success when hook is not defined (missing hook)", () => {
    const registry = createPluginRegistry();
    const withPlugin = registerPlugin(registry, SAMPLE_MANIFEST, {});
    const reg = getPlugin(withPlugin, SAMPLE_MANIFEST.id)!;
    const api = createPluginHostAPI({});
    const ctx = createPluginContext(reg, api);

    const result = invokePluginHook(reg, "onLoad", ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBeUndefined();
  });

  it("captures errors thrown by hooks", () => {
    const hooks = {
      onLoad: () => {
        throw new Error("Hook crashed");
      },
    };
    const registry = createPluginRegistry();
    const withPlugin = registerPlugin(registry, SAMPLE_MANIFEST, hooks);
    const reg = getPlugin(withPlugin, SAMPLE_MANIFEST.id)!;
    const api = createPluginHostAPI({});
    const ctx = createPluginContext(reg, api);

    const result = invokePluginHook(reg, "onLoad", ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Hook crashed");
  });
});

// ── Subprocess Sandbox ──────────────────────────────────────────────────

describe("createSandboxedExecutor", () => {
  it("executes a third-party hook in a subprocess sandbox", async () => {
    const dir = withTempPlugin({
      "plugin.mjs": `
        export function onExecute(ctx, input) {
          return { pluginId: ctx.pluginId, value: input.value };
        }
      `,
    });
    const executor = createSandboxedExecutor();
    const result = await executor.executeOnExecute(
      sandboxInstance(join(dir, "plugin.mjs")),
      sandboxContext(dir),
      { value: "ok" },
    );

    expect(result).toEqual({ success: true, output: { pluginId: "plugin-test", value: "ok" } });
    rmSync(dir, { recursive: true, force: true });
  });

  it("denies sandboxed reads outside the plugin directory", async () => {
    const secretDir = mkdtempSync(join(tmpdir(), "machine-plugin-secret-"));
    const secretPath = join(secretDir, "secret.txt");
    writeFileSync(secretPath, "do-not-read", "utf8");
    const dir = withTempPlugin({
      "plugin.mjs": `
        import { readFileSync } from "node:fs";
        export function onExecute(ctx, input) {
          return readFileSync(input.path, "utf8");
        }
      `,
    });
    const executor = createSandboxedExecutor();
    const result = await executor.executeOnExecute(
      sandboxInstance(join(dir, "plugin.mjs")),
      sandboxContext(dir),
      { path: secretPath },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("onExecute failed");
    rmSync(dir, { recursive: true, force: true });
    rmSync(secretDir, { recursive: true, force: true });
  });

  it("denies sandboxed writes by default", async () => {
    const dir = withTempPlugin({
      "plugin.mjs": `
        import { writeFileSync } from "node:fs";
        export function onExecute() {
          writeFileSync("created.txt", "blocked");
          return "wrote";
        }
      `,
    });
    const executor = createSandboxedExecutor();
    const result = await executor.executeOnExecute(
      sandboxInstance(join(dir, "plugin.mjs")),
      sandboxContext(dir),
      {},
    );

    expect(result.success).toBe(false);
    expect(existsSync(join(dir, "created.txt"))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("times out long-running sandboxed hooks", async () => {
    const dir = withTempPlugin({
      "plugin.mjs": `
        export async function onExecute() {
          await new Promise((resolve) => setTimeout(resolve, 250));
          return "late";
        }
      `,
    });
    const executor = createSandboxedExecutor({ timeoutMs: 50 });
    const result = await executor.executeOnExecute(
      sandboxInstance(join(dir, "plugin.mjs")),
      sandboxContext(dir),
      {},
    );

    expect(result).toEqual({
      success: false,
      error: "onExecute timed out after 50ms",
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("captures errors from sandboxed hooks", async () => {
    const dir = withTempPlugin({
      "plugin.mjs": `
        export function onLoad() {
          throw new Error("sandbox boom");
        }
      `,
    });
    const executor = createSandboxedExecutor();
    const result = await executor.executeOnLoad(
      sandboxInstance(join(dir, "plugin.mjs")),
      sandboxContext(dir),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("sandbox boom");
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps trusted in-process execution available only by explicit policy", async () => {
    const dir = withTempPlugin({
      "plugin.mjs": `
        import { readFileSync } from "node:fs";
        export function onExecute(ctx) {
          return readFileSync(new URL("./plugin.mjs", import.meta.url), "utf8").includes("readFileSync");
        }
      `,
    });
    const executor = createSandboxedExecutor({ isolation: "trusted-in-process" });
    const result = await executor.executeOnExecute(
      sandboxInstance(join(dir, "plugin.mjs")),
      sandboxContext(dir),
      {},
    );

    expect(result).toEqual({ success: true, output: true });
    rmSync(dir, { recursive: true, force: true });
  });
});
