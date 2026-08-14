#!/usr/bin/env node

import { resolve } from "node:path";
import {
  createAgenticRuntime,
  loadMachinePlan,
  type AgenticRunStatus,
  type KaizenProposal,
  type RunManifest,
} from "@the-machine/agent-runtime";
import { PLATFORM_NAME } from "@the-machine/core";
import type { EntityId } from "@the-machine/core";
import {
  createDefaultClient,
  listThemes,
  startGuiServer,
  stopGuiServer,
} from "@the-machine/service";
import type { ServiceClient } from "@the-machine/service";

const VERSION = "0.2.0-alpha.1";
const CWD = process.cwd();
const DEFAULT_WS_ID = "default" as EntityId;
const agentic = createAgenticRuntime();
let serviceClient: ServiceClient | null = null;

function client(): ServiceClient {
  serviceClient ??= createDefaultClient({ version: VERSION });
  return serviceClient;
}

function actorName(): string {
  return (
    process.env["MACHINE_ACTOR"] ??
    process.env["GITHUB_ACTOR"] ??
    process.env["USER"] ??
    process.env["USERNAME"] ??
    "local-operator"
  );
}

function showHelp(): void {
  console.log(`${PLATFORM_NAME} CLI v${VERSION}`);
  console.log("");
  console.log("Usage: machine [--json] <command> [options]");
  console.log("");
  console.log("Agentic execution:");
  console.log("  plan:validate <plan.machine.json>       Compile and validate an immutable plan");
  console.log("  run <plan.machine.json>                 Execute a plan in an isolated Git worktree");
  console.log("  resume <run-id> [repository]            Resume from the last durable checkpoint");
  console.log("  status <run-id> [repository]            Show a durable run manifest");
  console.log("  runs [repository]                       List local runs");
  console.log("  cancel <run-id> [repository] [reason]   Request cooperative cancellation");
  console.log("  approve <run-id> <task> <phase> [...]   Approve a before/after task gate");
  console.log("  reject <run-id> <task> <phase> [...]    Reject a before/after task gate");
  console.log("  workers <plan.machine.json>              Inspect worker capabilities without secrets");
  console.log("  evidence verify <directory>             Verify SHA-256 evidence integrity");
  console.log("");
  console.log("Kaizen feedback loop:");
  console.log("  kaizen analyze [repository] [minimum]    Generate one evidence-backed proposal");
  console.log("  kaizen list [repository]                 List proposals");
  console.log("  kaizen show <proposal-id> [repository]   Show a proposal");
  console.log("  kaizen approve <id> [repository] [note]  Human-approve a bounded experiment");
  console.log("  kaizen reject <id> [repository] <note>   Reject a proposal");
  console.log("  kaizen materialize <id> [repository]     Write an approved .machine.json plan");
  console.log("  kaizen record <id> <run-id> [repository] Record experiment outcome");
  console.log("");
  console.log("Legacy compatibility and diagnostics:");
  console.log("  help                                      Show this help message");
  console.log("  version                                   Show version");
  console.log("  doctor [plan.machine.json]                Inspect repository and plan readiness");
  console.log("  health                                    Check service health");
  console.log("  workspace [path]                          Show or create workspace metadata");
  console.log("  repo [path]                               Discover the real repository profile");
  console.log("  plan <file>                               Load a legacy Markdown ExecPlan");
  console.log("  plans                                     List loaded legacy plans");
  console.log("  validation <run-id>                       Show legacy validation results");
  console.log("  providers | provider <id>                 Inspect provider metadata");
  console.log("  mcp | mcp-server <id>                     Inspect MCP metadata");
  console.log("  plugins | plugin <id>                     Inspect plugin metadata");
  console.log("  readiness [subsystem]                     Check readiness gates");
  console.log("  diagnostics                               Run local diagnostics");
  console.log("  gui [port]                                Start the loopback War Council GUI");
  console.log("  gui:themes                                List available GUI themes");
  console.log("");
  console.log("Flags:");
  console.log("  --json                                    Emit structured JSON where supported");
}

function output(value: unknown, jsonMode: boolean): void {
  if (jsonMode) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === "string") console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

function manifestText(manifest: RunManifest): string {
  const taskLines = manifest.taskOrder.map((taskId) => {
    const state = manifest.taskStates[taskId];
    return `  ${taskId}: ${state?.status ?? "unknown"} (${String(state?.attempts.length ?? 0)} attempt(s))${state?.checkpoint ? ` @ ${state.checkpoint.slice(0, 12)}` : ""}`;
  });
  return [
    `Run: ${manifest.runId}`,
    `Plan: ${manifest.planId}`,
    `Status: ${manifest.status}`,
    `Branch: ${manifest.branch}`,
    `Worktree: ${manifest.worktreePath}`,
    `Current task: ${manifest.currentTaskId ?? "none"}`,
    `Evidence: ${manifest.evidencePath ?? "not finalized"}`,
    "Tasks:",
    ...taskLines,
    ...(manifest.failure
      ? [`Failure: ${manifest.failure.category} — ${manifest.failure.message}`]
      : []),
  ].join("\n");
}

function setRunExitCode(status: AgenticRunStatus): void {
  process.exitCode = status === "completed" ? 0 : status === "awaiting_approval" ? 2 : 1;
}

async function runPlan(planPath: string, jsonMode: boolean): Promise<void> {
  const outcome = await agentic.runPlanFile(resolve(planPath));
  output(jsonMode ? outcome : manifestText(outcome.manifest), jsonMode);
  setRunExitCode(outcome.status);
}

async function resumeRun(runId: string, repository: string, jsonMode: boolean): Promise<void> {
  const outcome = await agentic.resume(runId, resolve(repository));
  output(jsonMode ? outcome : manifestText(outcome.manifest), jsonMode);
  setRunExitCode(outcome.status);
}

function showRunStatus(runId: string, repository: string, jsonMode: boolean): void {
  const manifest = agentic.status(runId, resolve(repository));
  output(jsonMode ? manifest : manifestText(manifest), jsonMode);
}

function listRuns(repository: string, jsonMode: boolean): void {
  const manifests = agentic.listRuns(resolve(repository));
  if (jsonMode) {
    output(manifests, true);
    return;
  }
  if (manifests.length === 0) {
    console.log("No local runs found.");
    return;
  }
  for (const manifest of manifests) {
    console.log(
      `${manifest.runId}  ${manifest.status.padEnd(17)}  ${manifest.planId}  ${manifest.updatedAt}`,
    );
  }
}

function inspectWorkers(planPath: string, jsonMode: boolean): void {
  const compiled = loadMachinePlan(resolve(planPath));
  const workers = (compiled.plan.workers ?? []).map((worker) => ({
    id: worker.id,
    kind: worker.kind,
    executable: worker.executable,
    args: worker.args,
    timeoutMs: worker.timeoutMs ?? null,
    passEnvironment: worker.passEnvironment ?? [],
    fixedEnvironmentKeys: Object.keys(worker.environment ?? {}).sort(),
  }));
  const result = {
    planId: compiled.plan.id,
    planDigest: compiled.digest,
    strategy: compiled.plan.workerStrategy,
    workers,
  };
  if (jsonMode) output(result, true);
  else {
    console.log(`Plan: ${result.planId}`);
    console.log(`Digest: ${result.planDigest}`);
    console.log(`Primary: ${result.strategy.primary}`);
    for (const worker of workers) {
      console.log(`  ${worker.id}: ${worker.executable} ${worker.args.join(" ")}`);
    }
  }
}

function validatePlan(planPath: string, jsonMode: boolean): void {
  const compiled = loadMachinePlan(resolve(planPath));
  const result = {
    valid: true,
    id: compiled.plan.id,
    title: compiled.plan.title,
    digest: compiled.digest,
    repository: compiled.plan.repository.path,
    taskOrder: compiled.taskOrder,
    workerStrategy: compiled.plan.workerStrategy,
  };
  output(jsonMode ? result : `Valid plan '${result.id}'\nDigest: ${result.digest}\nTasks: ${result.taskOrder.join(" -> ")}`, jsonMode);
}

function doctor(planPath: string | undefined, jsonMode: boolean): void {
  const repository = client().repo.discover({ workspaceId: DEFAULT_WS_ID, rootPath: CWD });
  const report: Record<string, unknown> = {
    platform: PLATFORM_NAME,
    version: VERSION,
    node: process.versions.node,
    repository,
    checks: {
      gitRepository: repository.hasGit,
      packageManifest: repository.hasPackageJson,
      supportedNode: Number(process.versions.node.split(".")[0] ?? "0") >= 22,
    },
  };
  if (planPath) {
    const compiled = loadMachinePlan(resolve(planPath));
    report["plan"] = {
      valid: true,
      id: compiled.plan.id,
      digest: compiled.digest,
      tasks: compiled.taskOrder.length,
      configuredWorkers: compiled.plan.workers?.map((worker) => worker.id) ?? [],
    };
  }
  output(report, jsonMode);
}

function kaizenText(proposal: KaizenProposal): string {
  return [
    `Proposal: ${proposal.id}`,
    `Status: ${proposal.status}`,
    `Signal: ${proposal.signal.key} (${String(proposal.signal.occurrences)} occurrence(s))`,
    `Risk: ${proposal.risk}`,
    `Problem: ${proposal.problem}`,
    `Hypothesis: ${proposal.hypothesis}`,
    `Plan: ${proposal.materializedPlanPath ?? "not materialized"}`,
  ].join("\n");
}

function handleKaizen(args: readonly string[], jsonMode: boolean): void {
  const action = args[1] ?? "list";
  if (action === "analyze") {
    const repository = args[2] ?? CWD;
    const minimum = args[3] ? Number.parseInt(args[3], 10) : 2;
    const proposal = agentic.kaizen(resolve(repository)).analyze({
      minimumOccurrences: Number.isFinite(minimum) ? minimum : 2,
    });
    output(
      proposal ? (jsonMode ? proposal : kaizenText(proposal)) : "No recurring evidence signal met the proposal threshold.",
      jsonMode,
    );
    return;
  }
  if (action === "list") {
    const repository = args[2] ?? CWD;
    const proposals = agentic.kaizen(resolve(repository)).list();
    if (jsonMode) output(proposals, true);
    else if (proposals.length === 0) console.log("No Kaizen proposals found.");
    else proposals.forEach((proposal) => console.log(`${proposal.id}  ${proposal.status}  ${proposal.signal.key}`));
    return;
  }
  const id = args[2];
  if (!id) throw new Error(`Usage: machine kaizen ${action} <proposal-id> [repository]`);
  const repository = args[3] ?? CWD;
  const engine = agentic.kaizen(resolve(repository));
  if (action === "show") {
    const proposal = engine.get(id);
    output(jsonMode ? proposal : kaizenText(proposal), jsonMode);
  } else if (action === "approve") {
    const note = args.slice(4).join(" ") || "Approved for a bounded, human-reviewed experiment.";
    const proposal = engine.approve(id, actorName(), note);
    output(jsonMode ? proposal : kaizenText(proposal), jsonMode);
  } else if (action === "reject") {
    const note = args.slice(4).join(" ");
    if (!note) throw new Error("A rejection note is required.");
    const proposal = engine.reject(id, actorName(), note);
    output(jsonMode ? proposal : kaizenText(proposal), jsonMode);
  } else if (action === "materialize") {
    const proposal = engine.materialize(id);
    output(jsonMode ? proposal : kaizenText(proposal), jsonMode);
  } else if (action === "record") {
    const runId = args[3];
    const recordRepository = args[4] ?? CWD;
    if (!runId) throw new Error("Usage: machine kaizen record <proposal-id> <run-id> [repository]");
    const proposal = agentic.kaizen(resolve(recordRepository)).recordValidation(id, runId);
    output(jsonMode ? proposal : kaizenText(proposal), jsonMode);
  } else {
    throw new Error(`Unknown Kaizen action: ${action}`);
  }
}

function showHealth(jsonMode: boolean): void {
  const state = client().health.check({});
  output(
    jsonMode
      ? state
      : `Status: ${state.status}\nPlatform: ${state.platform}\nVersion: ${state.version}\nUptime: ${String(state.uptimeMs)}ms`,
    jsonMode,
  );
}

function showWorkspace(path: string | undefined, jsonMode: boolean): void {
  const workspace = client().workspace.get({ path: path ?? CWD });
  output(
    jsonMode
      ? workspace
      : `Workspace path: ${workspace.path}\nStatus: ${workspace.status}\nActive plan: ${workspace.activeExecPlanId ?? "none"}`,
    jsonMode,
  );
}

function showRepo(path: string | undefined, jsonMode: boolean): void {
  const info = client().repo.discover({ workspaceId: DEFAULT_WS_ID, rootPath: path ?? CWD });
  output(
    jsonMode
      ? info
      : `Repository: ${info.rootPath}\nPackage manager: ${info.packageManager}\nNode: ${info.nodeVersion}\nHas package.json: ${info.hasPackageJson ? "true" : "false"}\nHas .git: ${info.hasGit ? "true" : "false"}\nBranch: ${info.branch}`,
    jsonMode,
  );
}

function showLegacyPlan(filePath: string, jsonMode: boolean): void {
  const plan = client().plan.load(filePath);
  output(
    jsonMode ? plan : `Plan: ${plan.title}\nFile: ${plan.id}\nStatus: ${plan.status}`,
    jsonMode,
  );
}

function showLegacyPlans(jsonMode: boolean): void {
  const plans = client().plan.list().plans;
  if (jsonMode) output(plans, true);
  else if (plans.length === 0) console.log("No plans loaded.");
  else plans.forEach((plan) => console.log(`${plan.id} — ${plan.title} [${plan.status}]`));
}

function showValidation(runId: string, jsonMode: boolean): void {
  const result = client().validation.list(runId as EntityId);
  if (jsonMode) output(result, true);
  else if (result.validations.length === 0) console.log("No validations recorded.");
  else result.validations.forEach((validation) =>
    console.log(`${validation.command}: ${validation.passed ? "PASS" : "FAIL"} (exit ${validation.exitCode ?? "?"})`),
  );
}

function showProviders(jsonMode: boolean): void {
  const providers = client().provider.list().providers;
  if (jsonMode) output(providers, true);
  else if (providers.length === 0) console.log("No providers configured.");
  else providers.forEach((provider) => console.log(`${provider.id} — ${provider.name} (${provider.tier})`));
}

function showProvider(id: string, jsonMode: boolean): void {
  const provider = client().provider.get({ workspaceId: DEFAULT_WS_ID, providerId: id as EntityId });
  output(
    jsonMode
      ? provider ?? { error: "Not found" }
      : provider
        ? `Provider: ${provider.id}\nName: ${provider.name}\nTier: ${provider.tier}\nEndpoint: ${provider.endpoint}\nHealthy: ${provider.healthy ? "true" : "false"}`
        : `Provider '${id}' not found.`,
    jsonMode,
  );
}

function showMcp(jsonMode: boolean): void {
  const servers = client().mcp.list().servers;
  if (jsonMode) output(servers, true);
  else if (servers.length === 0) console.log("No MCP servers registered.");
  else servers.forEach((server) => console.log(`${server.id} — ${server.name} (${server.transport})`));
}

function showMcpServer(id: string, jsonMode: boolean): void {
  const server = client().mcp.get({ workspaceId: DEFAULT_WS_ID, mcpId: id as EntityId });
  output(
    jsonMode
      ? server ?? { error: "Not found" }
      : server
        ? `MCP server: ${server.id}\nName: ${server.name}\nTransport: ${server.transport}\nEndpoint: ${server.endpoint}\nTools: ${String(server.tools.length)}`
        : `MCP server '${id}' not found.`,
    jsonMode,
  );
}

function showPlugins(jsonMode: boolean): void {
  const plugins = client().plugin.list().plugins;
  if (jsonMode) output(plugins, true);
  else if (plugins.length === 0) console.log("No plugins registered.");
  else plugins.forEach((plugin) => console.log(`${plugin.id} — ${plugin.name} v${plugin.version}`));
}

function showPlugin(id: string, jsonMode: boolean): void {
  const plugin = client().plugin.get({ workspaceId: DEFAULT_WS_ID, pluginId: id as EntityId });
  output(
    jsonMode
      ? plugin ?? { error: "Not found" }
      : plugin
        ? `Plugin: ${plugin.id}\nName: ${plugin.name}\nVersion: ${plugin.version}\nEnabled: ${plugin.enabled ? "true" : "false"}`
        : `Plugin '${id}' not found.`,
    jsonMode,
  );
}

function showReadiness(subsystem: string | undefined, jsonMode: boolean): void {
  const request: { workspaceId: EntityId; subsystem?: string } = { workspaceId: DEFAULT_WS_ID };
  if (subsystem) request.subsystem = subsystem;
  const result = client().readiness.check(request);
  if (jsonMode) output(result, true);
  else {
    console.log(`Overall: ${result.overall}`);
    result.gates.forEach((gate) =>
      console.log(`${gate.subsystem}: ${gate.status} (${String(gate.passedChecks)}/${String(gate.totalChecks)})`),
    );
  }
}

function showDiagnostics(jsonMode: boolean): void {
  const health = client().health.check({ detail: true });
  const repository = client().repo.discover({ workspaceId: DEFAULT_WS_ID, rootPath: CWD });
  output({
    platform: health.platform,
    version: health.version,
    cwd: CWD,
    node: process.versions.node,
    repository,
    uptimeMs: health.uptimeMs,
    checks: health.checks,
  }, jsonMode);
}

function startGui(portArgument: string | undefined): void {
  const port = portArgument ? Number.parseInt(portArgument, 10) : 3000;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`Invalid port: ${portArgument ?? "undefined"}`);
  startGuiServer({ port, host: "127.0.0.1" });
  console.log(`Dashboard: http://127.0.0.1:${String(port)}/`);
  console.log(`Builder: http://127.0.0.1:${String(port)}/builder`);
  const shutdown = (): void => {
    stopGuiServer();
    process.exitCode = 0;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function showGuiThemes(jsonMode: boolean): void {
  const themes = listThemes();
  if (jsonMode) output({ themes }, true);
  else themes.forEach((theme) => console.log(`${theme.name} — ${theme.label}: ${theme.description}`));
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const jsonMode = rawArgs.includes("--json");
  const helpRequested = rawArgs.includes("--help") || rawArgs.includes("-h");
  const args = rawArgs.filter((arg) => arg !== "--json" && arg !== "--help" && arg !== "-h");
  const command = helpRequested ? "help" : args[0] ?? "help";

  switch (command) {
    case "help":
      showHelp();
      break;
    case "version":
      console.log(VERSION);
      break;
    case "plan:validate":
      if (!args[1]) throw new Error("Usage: machine plan:validate <plan.machine.json>");
      validatePlan(args[1], jsonMode);
      break;
    case "run":
      if (!args[1]) throw new Error("Usage: machine run <plan.machine.json>");
      await runPlan(args[1], jsonMode);
      break;
    case "resume":
      if (!args[1]) throw new Error("Usage: machine resume <run-id> [repository]");
      await resumeRun(args[1], args[2] ?? CWD, jsonMode);
      break;
    case "status":
      if (!args[1]) throw new Error("Usage: machine status <run-id> [repository]");
      showRunStatus(args[1], args[2] ?? CWD, jsonMode);
      break;
    case "runs":
      listRuns(args[1] ?? CWD, jsonMode);
      break;
    case "cancel": {
      if (!args[1]) throw new Error("Usage: machine cancel <run-id> [repository] [reason]");
      const repository = args[2] ?? CWD;
      const reason = args.slice(3).join(" ") || "Cancelled by operator.";
      const manifest = agentic.cancel(args[1], actorName(), reason, resolve(repository));
      output(jsonMode ? manifest : manifestText(manifest), jsonMode);
      break;
    }
    case "approve":
    case "reject": {
      const runId = args[1];
      const taskId = args[2];
      const phase = args[3];
      if (!runId || !taskId || (phase !== "before" && phase !== "after")) {
        throw new Error(`Usage: machine ${command} <run-id> <task-id> <before|after> [repository] [note]`);
      }
      const repository = args[4] ?? CWD;
      const note = args.slice(5).join(" ") || `${command} by ${actorName()}.`;
      const manifest = command === "approve"
        ? agentic.approve(runId, taskId, phase, actorName(), note, resolve(repository))
        : agentic.reject(runId, taskId, phase, actorName(), note, resolve(repository));
      output(jsonMode ? manifest : manifestText(manifest), jsonMode);
      break;
    }
    case "workers":
      if (!args[1]) throw new Error("Usage: machine workers <plan.machine.json>");
      inspectWorkers(args[1], jsonMode);
      break;
    case "evidence":
      if (args[1] !== "verify" || !args[2]) throw new Error("Usage: machine evidence verify <directory>");
      output(agentic.verifyEvidence(resolve(args[2])), jsonMode);
      break;
    case "kaizen":
      handleKaizen(args, jsonMode);
      break;
    case "doctor":
      doctor(args[1], jsonMode);
      break;
    case "health":
      showHealth(jsonMode);
      break;
    case "workspace":
      showWorkspace(args[1], jsonMode);
      break;
    case "repo":
      showRepo(args[1], jsonMode);
      break;
    case "plan":
      if (!args[1]) throw new Error("Usage: machine plan <legacy-execplan.md>");
      showLegacyPlan(args[1], jsonMode);
      break;
    case "plans":
      showLegacyPlans(jsonMode);
      break;
    case "validation":
      if (!args[1]) throw new Error("Usage: machine validation <run-id>");
      showValidation(args[1], jsonMode);
      break;
    case "providers":
      showProviders(jsonMode);
      break;
    case "provider":
      if (!args[1]) throw new Error("Usage: machine provider <id>");
      showProvider(args[1], jsonMode);
      break;
    case "mcp":
      showMcp(jsonMode);
      break;
    case "mcp-server":
      if (!args[1]) throw new Error("Usage: machine mcp-server <id>");
      showMcpServer(args[1], jsonMode);
      break;
    case "plugins":
      showPlugins(jsonMode);
      break;
    case "plugin":
      if (!args[1]) throw new Error("Usage: machine plugin <id>");
      showPlugin(args[1], jsonMode);
      break;
    case "readiness":
      showReadiness(args[1], jsonMode);
      break;
    case "diagnostics":
      showDiagnostics(jsonMode);
      break;
    case "gui":
      startGui(args[1]);
      break;
    case "gui:themes":
      showGuiThemes(jsonMode);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`machine: ${message}`);
  process.exitCode = 1;
});
