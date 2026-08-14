// Sandboxed plugin execution hooks.
// Provides a safe execution environment for onLoad, onUnload, onConfigure, onExecute.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PluginContext, PluginInstance, PluginExecutionResult } from "./types.js";

export type PluginSandboxIsolation = "subprocess" | "trusted-in-process";

export interface PluginSandboxPolicy {
  readonly isolation?: PluginSandboxIsolation;
  readonly timeoutMs?: number;
  readonly nodePath?: string;
  readonly allowFsRead?: readonly string[];
  readonly allowFsWrite?: readonly string[];
}

/** A sandboxed executor that runs plugin hooks with error isolation. */
export interface PluginExecutor {
  /** Execute the onLoad hook for a plugin. */
  executeOnLoad(instance: PluginInstance, ctx: PluginContext): Promise<PluginExecutionResult>;

  /** Execute the onUnload hook for a plugin. */
  executeOnUnload(instance: PluginInstance, ctx: PluginContext): Promise<PluginExecutionResult>;

  /** Execute the onConfigure hook for a plugin. */
  executeOnConfigure(
    instance: PluginInstance,
    ctx: PluginContext,
    config: Record<string, unknown>,
  ): Promise<PluginExecutionResult>;

  /** Execute the onExecute hook for a plugin with input. */
  executeOnExecute(
    instance: PluginInstance,
    ctx: PluginContext,
    input: unknown,
  ): Promise<PluginExecutionResult>;
}

const RESULT_PREFIX = "__MACHINE_PLUGIN_SANDBOX_RESULT__";
const DEFAULT_TIMEOUT_MS = 3000;

const SANDBOX_RUNNER = `
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const RESULT_PREFIX = ${JSON.stringify(RESULT_PREFIX)};

function emit(result) {
  process.stdout.write(RESULT_PREFIX + JSON.stringify(result) + "\\n");
}

function jsonSafe(value) {
  if (value === undefined) return undefined;
  JSON.stringify(value);
  return value;
}

try {
  const request = JSON.parse(readFileSync(0, "utf8"));
  const mod = await import(pathToFileURL(request.entryPath).href);
  const hookFn = mod[request.hookName];

  if (typeof hookFn !== "function") {
    emit({ success: true });
  } else {
    const output = await hookFn(...request.args);
    emit({ success: true, output: jsonSafe(output) });
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  emit({ success: false, error: message });
}
`;

/**
 * Creates a sandboxed plugin executor.
 *
 * The default path is for third-party plugins: hooks run in a separate Node.js
 * process with the permission model enabled, no child-process/worker/addon
 * permissions, a scrubbed environment, plugin-directory scoped reads, and a
 * timeout. `trusted-in-process` exists only for first-party/test fixtures that
 * intentionally accept the weaker isolation boundary.
 */
export function createSandboxedExecutor(policy: PluginSandboxPolicy = {}): PluginExecutor {
  const hookCache = new Map<string, Record<string, unknown>>();
  const isolation = policy.isolation ?? "subprocess";

  async function loadHooks(instance: PluginInstance): Promise<Record<string, unknown>> {
    const pluginId = instance.manifest.id;
    const cached = hookCache.get(pluginId);
    if (cached) return cached;

    const entryPath = resolve(instance.manifest.entryPoint);
    if (!existsSync(entryPath)) {
      return {};
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const mod = await import(/* @vite-ignore */ entryPath);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      hookCache.set(pluginId, mod);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return mod;
    } catch {
      return {};
    }
  }

  async function runHook(
    instance: PluginInstance,
    ctx: PluginContext,
    hookName: string,
    args: unknown[],
  ): Promise<PluginExecutionResult> {
    if (isolation === "subprocess") {
      return runHookInSubprocess(instance, hookName, args, policy);
    }

    try {
      const mod = await loadHooks(instance);
      const hookFn = mod[hookName] as ((...a: unknown[]) => unknown) | undefined;

      if (typeof hookFn !== "function") {
        return { success: true, output: undefined };
      }

      const output = await hookFn(...args);
      return { success: true, output };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `${hookName} failed: ${message}` };
    }
  }

  return {
    async executeOnLoad(instance, ctx): Promise<PluginExecutionResult> {
      return runHook(instance, ctx, "onLoad", [ctx]);
    },

    async executeOnUnload(instance, ctx): Promise<PluginExecutionResult> {
      return runHook(instance, ctx, "onUnload", [ctx]);
    },

    async executeOnConfigure(instance, ctx, config): Promise<PluginExecutionResult> {
      return runHook(instance, ctx, "onConfigure", [ctx, config]);
    },

    async executeOnExecute(instance, ctx, input): Promise<PluginExecutionResult> {
      return runHook(instance, ctx, "onExecute", [ctx, input]);
    },
  };
}

async function runHookInSubprocess(
  instance: PluginInstance,
  hookName: string,
  args: unknown[],
  policy: PluginSandboxPolicy,
): Promise<PluginExecutionResult> {
  const entryPath = resolve(instance.manifest.entryPoint);
  if (!existsSync(entryPath)) {
    return { success: true, output: undefined };
  }

  const pluginDir = dirname(entryPath);
  const request = JSON.stringify({ entryPath, hookName, args });
  const timeoutMs = policy.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const nodePath = policy.nodePath ?? process.execPath;
  const allowFsRead = [pluginDir, ...(policy.allowFsRead ?? [])];
  const allowFsWrite = policy.allowFsWrite ?? [];
  const nodeArgs = [
    "--permission",
    "--no-addons",
    "--disallow-code-generation-from-strings",
    ...allowFsRead.map((path) => `--allow-fs-read=${resolve(path)}`),
    ...allowFsWrite.map((path) => `--allow-fs-write=${resolve(path)}`),
    "--input-type=module",
    "--eval",
    SANDBOX_RUNNER,
  ];

  return new Promise<PluginExecutionResult>((resolveResult) => {
    const child = spawn(nodePath, nodeArgs, {
      cwd: pluginDir,
      env: sandboxEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({ success: false, error: `${hookName} sandbox failed: ${err.message}` });
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) {
        resolveResult({
          success: false,
          error: `${hookName} timed out after ${String(timeoutMs)}ms`,
        });
        return;
      }
      resolveResult(parseSandboxResult(hookName, stdout, stderr));
    });
    child.stdin.end(request);
  });
}

function parseSandboxResult(
  hookName: string,
  stdout: string,
  stderr: string,
): PluginExecutionResult {
  if (stderr.includes("bad option: --permission") || stderr.includes("illegal option")) {
    return {
      success: false,
      error: `${hookName} sandbox unsupported: Node permission model is unavailable`,
    };
  }

  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith(RESULT_PREFIX));
  if (!line) {
    const detail = stderr.trim() || stdout.trim() || "sandbox exited without result";
    return { success: false, error: `${hookName} sandbox failed: ${detail.slice(0, 500)}` };
  }

  try {
    const parsed = JSON.parse(line.slice(RESULT_PREFIX.length)) as PluginExecutionResult;
    if (parsed.success) return { success: true, output: parsed.output };
    return { success: false, error: `${hookName} failed: ${parsed.error ?? "unknown"}` };
  } catch {
    return { success: false, error: `${hookName} sandbox returned invalid result` };
  }
}

function sandboxEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env["PATH"] ?? "",
    SystemRoot: process.env["SystemRoot"] ?? "",
    COMSPEC: process.env["COMSPEC"] ?? "",
    TMP: process.env["TMP"] ?? "",
    TEMP: process.env["TEMP"] ?? "",
  };
}
