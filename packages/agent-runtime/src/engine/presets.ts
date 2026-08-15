import { resolve } from "node:path";
import { runSafeProcess } from "../process.js";
import { createCliWorker } from "./workers.js";
import type { CliWorkerConfig, MachineWorker } from "./types.js";

export type BuiltinWorkerId = "codex" | "claude-code" | "aider" | "openhands";

export interface WorkerDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly kind: string;
  readonly executable: string;
  readonly builtIn: boolean;
  readonly documentationUrl: string | null;
  readonly outputFormat: "jsonl" | "text" | "custom";
  readonly supportedPlatforms: readonly ("linux" | "darwin" | "win32")[];
  readonly requiredEnvironment: readonly string[];
  readonly optionalEnvironment: readonly string[];
  readonly safetyNotes: readonly string[];
}

export interface WorkerProbeResult {
  readonly id: string;
  readonly available: boolean;
  readonly executable: string;
  readonly version: string | null;
  readonly message: string;
  readonly checkedAt: string;
  readonly descriptor: WorkerDescriptor;
}

export interface DescribedMachineWorker extends MachineWorker {
  readonly descriptor: WorkerDescriptor;
  probe(): Promise<WorkerProbeResult>;
}

interface PresetDefinition {
  readonly descriptor: Omit<WorkerDescriptor, "executable">;
  readonly executableEnvironment: string;
  readonly defaultExecutable: string;
  readonly versionArgs: readonly string[];
  readonly config: (executable: string) => CliWorkerConfig;
}

const COMMON_PROXY_ENVIRONMENT = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "SSL_CERT_FILE",
  "NODE_EXTRA_CA_CERTS",
] as const;

function configuredExecutable(definition: PresetDefinition): string {
  return process.env[definition.executableEnvironment]?.trim() || definition.defaultExecutable;
}

function configuredModel(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function firstUsefulLine(value: string): string | null {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? null
  );
}

async function probeDefinition(
  definition: PresetDefinition,
  descriptor: WorkerDescriptor,
): Promise<WorkerProbeResult> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await runSafeProcess({
      executable: descriptor.executable,
      args: definition.versionArgs,
      cwd: resolve(process.cwd()),
      timeoutMs: 10_000,
      maxOutputBytes: 128 * 1024,
      passEnvironment: [...COMMON_PROXY_ENVIRONMENT],
    });
    const version = firstUsefulLine(result.stdout) ?? firstUsefulLine(result.stderr);
    const available = result.exitCode === 0 && !result.timedOut && !result.cancelled;
    return {
      id: descriptor.id,
      available,
      executable: descriptor.executable,
      version,
      message: available
        ? `${descriptor.displayName} is available${version ? `: ${version}` : "."}`
        : `${descriptor.displayName} probe failed with exit code ${String(result.exitCode)}${result.timedOut ? " (timed out)" : ""}.`,
      checkedAt,
      descriptor,
    };
  } catch (error) {
    return {
      id: descriptor.id,
      available: false,
      executable: descriptor.executable,
      version: null,
      message: error instanceof Error ? error.message : String(error),
      checkedAt,
      descriptor,
    };
  }
}

function createPresetWorker(definition: PresetDefinition): DescribedMachineWorker {
  const executable = configuredExecutable(definition);
  const descriptor: WorkerDescriptor = {
    ...definition.descriptor,
    executable,
  };
  const worker = createCliWorker(definition.config(executable));
  return {
    ...worker,
    descriptor,
    async probe(): Promise<WorkerProbeResult> {
      return await probeDefinition(definition, descriptor);
    },
  };
}

const CODEX_ENVIRONMENT = [
  "CODEX_HOME",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_ORGANIZATION",
  "OPENAI_PROJECT",
  ...COMMON_PROXY_ENVIRONMENT,
] as const;

const CLAUDE_ENVIRONMENT = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "AWS_PROFILE",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "CLOUD_ML_REGION",
  "ANTHROPIC_VERTEX_PROJECT_ID",
  ...COMMON_PROXY_ENVIRONMENT,
] as const;

const AIDER_ENVIRONMENT = [
  "AIDER_MODEL",
  "AIDER_WEAK_MODEL",
  "AIDER_EDITOR_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_API_BASE",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "GROQ_API_KEY",
  "COHERE_API_KEY",
  "MISTRAL_API_KEY",
  "AZURE_API_KEY",
  "AZURE_API_BASE",
  "AZURE_API_VERSION",
  "OLLAMA_API_BASE",
  ...COMMON_PROXY_ENVIRONMENT,
] as const;

const OPENHANDS_ENVIRONMENT = [
  "LLM_API_KEY",
  "LLM_MODEL",
  "LLM_BASE_URL",
  "OH_PERSISTENCE_DIR",
  "AGENT_SERVER_IMAGE_REPOSITORY",
  "AGENT_SERVER_IMAGE_TAG",
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  ...COMMON_PROXY_ENVIRONMENT,
] as const;

const DEFINITIONS: readonly PresetDefinition[] = [
  {
    descriptor: {
      id: "codex",
      displayName: "OpenAI Codex CLI",
      description:
        "Runs Codex noninteractively with automatic review and a workspace-write sandbox.",
      kind: "codex-cli",
      builtIn: true,
      documentationUrl: "https://github.com/openai/codex",
      outputFormat: "jsonl",
      supportedPlatforms: ["linux", "darwin", "win32"],
      requiredEnvironment: [],
      optionalEnvironment: CODEX_ENVIRONMENT,
      safetyNotes: [
        "Uses Codex automatic review rather than the dangerous sandbox-bypass flag.",
        "Runs ephemerally and leaves final validation and checkpointing to The Machine.",
      ],
    },
    executableEnvironment: "MACHINE_CODEX_BIN",
    defaultExecutable: "codex",
    versionArgs: ["--version"],
    config: (executable) => {
      const model = configuredModel("MACHINE_CODEX_MODEL");
      return {
        id: "codex",
        kind: "cli",
        executable,
        args: [
          "exec",
          "--json",
          "--color",
          "never",
          "--ephemeral",
          "--ignore-rules",
          "--approve-for-me",
          "--cd",
          "{workspace}",
          ...(model ? ["--model", model] : []),
          "{prompt}",
        ],
        timeoutMs: 3_600_000,
        maxOutputBytes: 16 * 1024 * 1024,
        passEnvironment: CODEX_ENVIRONMENT,
      };
    },
  },
  {
    descriptor: {
      id: "claude-code",
      displayName: "Anthropic Claude Code",
      description: "Runs Claude Code in print mode with streamed JSON and bounded editing tools.",
      kind: "claude-code-cli",
      builtIn: true,
      documentationUrl: "https://docs.anthropic.com/en/docs/claude-code/cli-usage",
      outputFormat: "jsonl",
      supportedPlatforms: ["linux", "darwin", "win32"],
      requiredEnvironment: [],
      optionalEnvironment: CLAUDE_ENVIRONMENT,
      safetyNotes: [
        "Never enables dangerously-skip-permissions.",
        "Allows repository reads and edits while denying network tools and Git history mutation commands.",
      ],
    },
    executableEnvironment: "MACHINE_CLAUDE_BIN",
    defaultExecutable: "claude",
    versionArgs: ["--version"],
    config: (executable) => {
      const model = configuredModel("MACHINE_CLAUDE_MODEL");
      const maxTurns = process.env["MACHINE_CLAUDE_MAX_TURNS"]?.trim() || "80";
      return {
        id: "claude-code",
        kind: "cli",
        executable,
        args: [
          "--print",
          "{prompt}",
          "--output-format",
          "stream-json",
          "--verbose",
          "--max-turns",
          maxTurns,
          "--permission-mode",
          "acceptEdits",
          ...(model ? ["--model", model] : []),
          "--allowedTools",
          "Read",
          "Glob",
          "Grep",
          "Edit",
          "Write",
          "NotebookEdit",
          "Bash(git status:*)",
          "Bash(git diff:*)",
          "Bash(git log:*)",
          "--disallowedTools",
          "WebFetch",
          "WebSearch",
          "Bash(git commit:*)",
          "Bash(git push:*)",
          "Bash(git reset:*)",
          "Bash(git clean:*)",
        ],
        timeoutMs: 3_600_000,
        maxOutputBytes: 16 * 1024 * 1024,
        passEnvironment: CLAUDE_ENVIRONMENT,
      };
    },
  },
  {
    descriptor: {
      id: "aider",
      displayName: "Aider",
      description:
        "Runs one scripted Aider edit pass while disabling Aider-owned commits and test execution.",
      kind: "aider-cli",
      builtIn: true,
      documentationUrl: "https://aider.chat/docs/scripting.html",
      outputFormat: "text",
      supportedPlatforms: ["linux", "darwin", "win32"],
      requiredEnvironment: [],
      optionalEnvironment: AIDER_ENVIRONMENT,
      safetyNotes: [
        "Disables Aider auto-commits, dirty commits, attribution changes, auto-lint, and auto-test.",
        "The Machine remains the sole checkpoint and deterministic-validation authority.",
      ],
    },
    executableEnvironment: "MACHINE_AIDER_BIN",
    defaultExecutable: "aider",
    versionArgs: ["--version"],
    config: (executable) => {
      const model = configuredModel("MACHINE_AIDER_MODEL");
      return {
        id: "aider",
        kind: "cli",
        executable,
        args: [
          "--message-file",
          "{promptFile}",
          "--yes-always",
          "--no-stream",
          "--no-pretty",
          "--no-auto-commits",
          "--no-dirty-commits",
          "--no-gitignore",
          "--no-attribute-author",
          "--no-attribute-committer",
          "--no-attribute-co-authored-by",
          "--no-auto-lint",
          "--no-auto-test",
          "--no-check-update",
          "--disable-playwright",
          "--no-suggest-shell-commands",
          "--skip-sanity-check-repo",
          ...(model ? ["--model", model] : []),
        ],
        timeoutMs: 3_600_000,
        maxOutputBytes: 16 * 1024 * 1024,
        passEnvironment: AIDER_ENVIRONMENT,
      };
    },
  },
  {
    descriptor: {
      id: "openhands",
      displayName: "OpenHands",
      description:
        "Runs the OpenHands CLI headlessly with JSONL events and only the disposable worktree mounted writable.",
      kind: "openhands-cli",
      builtIn: true,
      documentationUrl: "https://docs.openhands.dev/openhands/usage/cli/headless",
      outputFormat: "jsonl",
      supportedPlatforms: ["linux", "darwin"],
      requiredEnvironment: [],
      optionalEnvironment: OPENHANDS_ENVIRONMENT,
      safetyNotes: [
        "OpenHands headless mode auto-approves its internal actions, so it is confined to the run worktree through SANDBOX_VOLUMES.",
        "Native Windows users should run this preset through WSL with Docker available.",
      ],
    },
    executableEnvironment: "MACHINE_OPENHANDS_BIN",
    defaultExecutable: "openhands",
    versionArgs: ["--version"],
    config: (executable) => ({
      id: "openhands",
      kind: "cli",
      executable,
      args: ["--headless", "--json", "--file", "{promptFile}"],
      timeoutMs: 3_600_000,
      maxOutputBytes: 32 * 1024 * 1024,
      environment: {
        SANDBOX_VOLUMES: "{workspace}:/workspace:rw",
      },
      passEnvironment: OPENHANDS_ENVIRONMENT,
    }),
  },
];

export function createBuiltinWorkers(): DescribedMachineWorker[] {
  return DEFINITIONS.map(createPresetWorker);
}

export function isDescribedWorker(worker: MachineWorker): worker is DescribedMachineWorker {
  const candidate = worker as Partial<DescribedMachineWorker>;
  return candidate.descriptor !== undefined && typeof candidate.probe === "function";
}

export function describeWorker(worker: MachineWorker): WorkerDescriptor {
  if (isDescribedWorker(worker)) return worker.descriptor;
  return {
    id: worker.id,
    displayName: worker.id,
    description: "Custom Machine worker supplied by a plan or embedding application.",
    kind: worker.kind,
    executable: "custom",
    builtIn: false,
    documentationUrl: null,
    outputFormat: "custom",
    supportedPlatforms: ["linux", "darwin", "win32"],
    requiredEnvironment: [],
    optionalEnvironment: [],
    safetyNotes: [
      "Custom workers are responsible for declaring and enforcing their own execution boundary.",
    ],
  };
}

export async function probeWorker(worker: MachineWorker): Promise<WorkerProbeResult> {
  if (isDescribedWorker(worker)) return await worker.probe();
  const descriptor = describeWorker(worker);
  return {
    id: worker.id,
    available: true,
    executable: descriptor.executable,
    version: null,
    message: "Custom in-process worker is registered; no executable probe is defined.",
    checkedAt: new Date().toISOString(),
    descriptor,
  };
}

export async function probeWorkers(
  workers: readonly MachineWorker[],
): Promise<WorkerProbeResult[]> {
  return await Promise.all(workers.map(async (worker) => await probeWorker(worker)));
}
