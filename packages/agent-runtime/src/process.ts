import { spawn, spawnSync } from "node:child_process";
import { basename, isAbsolute, relative, resolve } from "node:path";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const BASE_ENVIRONMENT_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "SystemRoot",
  "WINDIR",
  "TEMP",
  "TMP",
  "TMPDIR",
  "PATHEXT",
  "LANG",
  "LC_ALL",
] as const;

const DENIED_EXECUTABLES = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "dash",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "wscript",
  "wscript.exe",
  "cscript",
  "cscript.exe",
]);

const UNSAFE_UNQUOTED_CHARACTERS = new Set(["|", "&", ";", "<", ">", "`", "$", "\n", "\r", "\0"]);

export interface SafeProcessSpec {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string>>;
  readonly passEnvironment?: readonly string[];
  readonly maxOutputBytes?: number;
}

export interface SafeProcessResult {
  readonly executable: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly truncated: boolean;
  readonly signal: NodeJS.Signals | null;
}

export class UnsafeProcessError extends Error {
  readonly code = "UNSAFE_PROCESS";

  constructor(message: string) {
    super(message);
    this.name = "UnsafeProcessError";
  }
}

function normalizedExecutableName(executable: string): string {
  return basename(executable).toLowerCase();
}

export function assertSafeExecutable(executable: string): void {
  const trimmed = executable.trim();
  if (trimmed.length === 0) {
    throw new UnsafeProcessError("Executable must not be empty.");
  }
  if (trimmed.includes("\0") || trimmed.includes("\n") || trimmed.includes("\r")) {
    throw new UnsafeProcessError("Executable contains an invalid control character.");
  }
  if (DENIED_EXECUTABLES.has(normalizedExecutableName(trimmed))) {
    throw new UnsafeProcessError(
      `Shell executable '${normalizedExecutableName(trimmed)}' is denied. Register a direct executable and argv instead.`,
    );
  }
}

export function resolveInsideRoot(root: string, requestedPath = "."): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, requestedPath);
  const rel = relative(resolvedRoot, resolvedPath);
  if (rel !== "" && (rel.startsWith("..") || isAbsolute(rel))) {
    throw new UnsafeProcessError(`Path escapes the allowed root: ${requestedPath}`);
  }
  return resolvedPath;
}

export function buildSafeEnvironment(
  passEnvironment: readonly string[] = [],
  fixedEnvironment: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  const keys = new Set<string>([...BASE_ENVIRONMENT_KEYS, ...passEnvironment]);
  const environment: NodeJS.ProcessEnv = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  for (const [key, value] of Object.entries(fixedEnvironment)) {
    if (key.includes("\0") || key.includes("=")) {
      throw new UnsafeProcessError(`Invalid environment variable name: ${key}`);
    }
    environment[key] = value;
  }
  return environment;
}

function normalizeSpec(spec: SafeProcessSpec): Required<Pick<SafeProcessSpec, "executable" | "cwd">> & {
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly environment: NodeJS.ProcessEnv;
  readonly maxOutputBytes: number;
} {
  assertSafeExecutable(spec.executable);
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) {
    throw new UnsafeProcessError(`Invalid timeout: ${String(timeoutMs)}ms`);
  }
  const maxOutputBytes = spec.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isFinite(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 64 * 1024 * 1024) {
    throw new UnsafeProcessError(`Invalid output limit: ${String(maxOutputBytes)} bytes`);
  }
  const args = [...(spec.args ?? [])];
  if (args.some((arg) => arg.includes("\0"))) {
    throw new UnsafeProcessError("Process argument contains a NUL byte.");
  }
  return {
    executable: spec.executable,
    args,
    cwd: resolve(spec.cwd),
    timeoutMs,
    environment: buildSafeEnvironment(spec.passEnvironment, spec.environment),
    maxOutputBytes,
  };
}

export function runSafeProcessSync(spec: SafeProcessSpec): SafeProcessResult {
  const normalized = normalizeSpec(spec);
  const started = Date.now();
  const result = spawnSync(normalized.executable, normalized.args, {
    cwd: normalized.cwd,
    env: normalized.environment,
    encoding: "utf-8",
    shell: false,
    windowsHide: true,
    timeout: normalized.timeoutMs,
    maxBuffer: normalized.maxOutputBytes,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
  const timedOut = errorCode === "ETIMEDOUT";
  const truncated = errorCode === "ENOBUFS";
  const errorMessage = result.error?.message ?? "";
  const stderr = `${result.stderr ?? ""}${errorMessage.length > 0 ? `${result.stderr ? "\n" : ""}${errorMessage}` : ""}`;
  return {
    executable: normalized.executable,
    args: normalized.args,
    exitCode: result.status ?? (timedOut ? 124 : 1),
    stdout: result.stdout ?? "",
    stderr,
    durationMs: Date.now() - started,
    timedOut,
    cancelled: false,
    truncated,
    signal: result.signal,
  };
}

export async function runSafeProcess(
  spec: SafeProcessSpec,
  signal?: AbortSignal,
): Promise<SafeProcessResult> {
  const normalized = normalizeSpec(spec);
  const started = Date.now();

  return await new Promise<SafeProcessResult>((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let cancelled = signal?.aborted ?? false;
    let truncated = false;
    let settled = false;

    const child = spawn(normalized.executable, normalized.args, {
      cwd: normalized.cwd,
      env: normalized.environment,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (exitCode: number, childSignal: NodeJS.Signals | null, error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (error) stderr += `${stderr.length > 0 ? "\n" : ""}${error.message}`;
      resolveResult({
        executable: normalized.executable,
        args: normalized.args,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        cancelled,
        truncated,
        signal: childSignal,
      });
    };

    const terminate = (): void => {
      if (child.exitCode !== null || child.killed) return;
      child.kill("SIGTERM");
      const hardKill = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 2_000);
      hardKill.unref();
    };

    const onAbort = (): void => {
      cancelled = true;
      terminate();
    };

    const append = (channel: "stdout" | "stderr", chunk: Buffer | string): void => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      const bytes = Buffer.byteLength(text);
      if (channel === "stdout") {
        stdoutBytes += bytes;
        if (stdoutBytes <= normalized.maxOutputBytes) stdout += text;
      } else {
        stderrBytes += bytes;
        if (stderrBytes <= normalized.maxOutputBytes) stderr += text;
      }
      if (stdoutBytes > normalized.maxOutputBytes || stderrBytes > normalized.maxOutputBytes) {
        truncated = true;
        terminate();
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.once("error", (error) => finish(1, null, error));
    child.once("close", (code, childSignal) => {
      const exitCode = code ?? (timedOut ? 124 : cancelled ? 130 : truncated ? 1 : 1);
      finish(exitCode, childSignal);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, normalized.timeoutMs);
    timeout.unref();

    signal?.addEventListener("abort", onAbort, { once: true });
    if (cancelled) terminate();
  });
}

export function splitLegacyCommand(script: string): readonly string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  const flush = (): void => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (const char of script.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"') {
        escaping = true;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (UNSAFE_UNQUOTED_CHARACTERS.has(char)) {
      throw new UnsafeProcessError(
        `Legacy command contains shell syntax '${char}'. Use executable + argv instead.`,
      );
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    current += char;
  }

  if (quote !== null || escaping) {
    throw new UnsafeProcessError("Legacy command has an unterminated quote or escape.");
  }
  flush();
  if (tokens.length === 0) throw new UnsafeProcessError("Command must not be empty.");
  assertSafeExecutable(tokens[0] ?? "");
  return tokens;
}

export function legacyCommandToSpec(script: string, cwd: string): SafeProcessSpec {
  const tokens = splitLegacyCommand(script);
  const executable = tokens[0];
  if (!executable) throw new UnsafeProcessError("Command must include an executable.");
  return { executable, args: tokens.slice(1), cwd };
}
