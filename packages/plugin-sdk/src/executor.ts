// Trusted plugin execution hooks.
// This module deliberately does not claim a hostile-code security boundary.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PluginContext, PluginInstance, PluginExecutionResult } from "./types.js";

export type PluginSandboxIsolation =
  | "disabled"
  | "trusted-subprocess"
  | "trusted-in-process"
  | "subprocess";

export interface PluginSandboxPolicy {
  readonly isolation?: PluginSandboxIsolation;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly nodePath?: string;
  readonly allowFsRead?: readonly string[];
  readonly allowFsWrite?: readonly string[];
}

export interface PluginExecutor {
  executeOnLoad(instance: PluginInstance, ctx: PluginContext): Promise<PluginExecutionResult>;
  executeOnUnload(instance: PluginInstance, ctx: PluginContext): Promise<PluginExecutionResult>;
  executeOnConfigure(
    instance: PluginInstance,
    ctx: PluginContext,
    config: Record<string, unknown>,
  ): Promise<PluginExecutionResult>;
  executeOnExecute(
    instance: PluginInstance,
    ctx: PluginContext,
    input: unknown,
  ): Promise<PluginExecutionResult>;
}

const RESULT_PREFIX = "__MACHINE_PLUGIN_SUBPROCESS_RESULT__";
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

const SUBPROCESS_RUNNER = `
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
 * Creates a plugin executor.
 *
 * Third-party execution is disabled by default. `trusted-subprocess` adds useful
 * defense in depth for operator-approved plugins, but Node's permission model is
 * not a hostile-code sandbox. `trusted-in-process` is restricted to first-party
 * code and tests that explicitly accept full process authority.
 *
 * The legacy `subprocess` value is retained as a compatibility alias for
 * `trusted-subprocess`; callers should migrate to the explicit trust label.
 */
export function createSandboxedExecutor(policy: PluginSandboxPolicy = {}): PluginExecutor {
  const hookCache = new Map<string, Record<string, unknown>>();
  const isolation = policy.isolation ?? "disabled";

  async function loadHooks(instance: PluginInstance): Promise<Record<string, unknown>> {
    const pluginId = instance.manifest.id;
    const cached = hookCache.get(pluginId);
    if (cached) return cached;

    const entryPath = resolve(instance.manifest.entryPoint);
    if (!existsSync(entryPath)) return {};

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
    if (isolation === "disabled") {
      return {
        success: false,
        error:
          `${hookName} blocked: third-party plugin execution is disabled. ` +
          `An operator must explicitly select trusted-subprocess or trusted-in-process.`,
      };
    }
    if (isolation === "trusted-subprocess" || isolation === "subprocess") {
      return runHookInTrustedSubprocess(instance, hookName, args, policy);
    }

    try {
      const mod = await loadHooks(instance);
      const hookFn = mod[hookName] as ((...a: unknown[]) => unknown) | undefined;
      if (typeof hookFn !== "function") return { success: true, output: undefined };
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

async function runHookInTrustedSubprocess(
  instance: PluginInstance,
  hookName: string,
  args: unknown[],
  policy: PluginSandboxPolicy,
): Promise<PluginExecutionResult> {
  const entryPath = resolve(instance.manifest.entryPoint);
  if (!existsSync(entryPath)) return { success: true, output: undefined };

  const pluginDir = dirname(entryPath);
  const request = JSON.stringify({ entryPath, hookName, args });
  const timeoutMs = policy.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = policy.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
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
    SUBPROCESS_RUNNER,
  ];

  return new Promise<PluginExecutionResult>((resolveResult) => {
    const child = spawn(nodePath, nodeArgs, {
      cwd: pluginDir,
      env: trustedSubprocessEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let settled = false;
    let timedOut = false;
    let outputExceeded = false;
    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      child.kill();
    }, timeoutMs);

    const capture = (stream: "stdout" | "stderr", chunk: string): void => {
      outputBytes += Buffer.byteLength(chunk, "utf-8");
      if (outputBytes > maxOutputBytes) {
        outputExceeded = true;
        child.kill();
        return;
      }
      if (stream === "stdout") stdout += chunk;
      else stderr += chunk;
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: string) => capture("stderr", chunk));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({ success: false, error: `${hookName} subprocess failed: ${err.message}` });
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (outputExceeded) {
        resolveResult({
          success: false,
          error: `${hookName} exceeded the ${String(maxOutputBytes)} byte output limit`,
        });
        return;
      }
      if (timedOut) {
        resolveResult({
          success: false,
          error: `${hookName} timed out after ${String(timeoutMs)}ms`,
        });
        return;
      }
      resolveResult(parseSubprocessResult(hookName, stdout, stderr));
    });
    child.stdin.end(request);
  });
}

function parseSubprocessResult(
  hookName: string,
  stdout: string,
  stderr: string,
): PluginExecutionResult {
  if (stderr.includes("bad option: --permission") || stderr.includes("illegal option")) {
    return {
      success: false,
      error: `${hookName} trusted subprocess unsupported: Node permission model is unavailable`,
    };
  }

  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith(RESULT_PREFIX));
  if (!line) {
    const detail = stderr.trim() || stdout.trim() || "subprocess exited without result";
    return { success: false, error: `${hookName} subprocess failed: ${detail.slice(0, 500)}` };
  }

  try {
    const parsed = JSON.parse(line.slice(RESULT_PREFIX.length)) as PluginExecutionResult;
    if (parsed.success) return { success: true, output: parsed.output };
    return { success: false, error: `${hookName} failed: ${parsed.error ?? "unknown"}` };
  } catch {
    return { success: false, error: `${hookName} subprocess returned invalid result` };
  }
}

function trustedSubprocessEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env["PATH"] ?? "",
    Path: process.env["Path"] ?? "",
    SystemRoot: process.env["SystemRoot"] ?? "",
    COMSPEC: process.env["COMSPEC"] ?? "",
    PATHEXT: process.env["PATHEXT"] ?? "",
    TMP: process.env["TMP"] ?? "",
    TEMP: process.env["TEMP"] ?? "",
  };
}
