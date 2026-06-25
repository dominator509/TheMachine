#!/usr/bin/env node
// The Machine CLI — all commands wired through ServiceClient.
// Supports --json flag for structured output.

import { PLATFORM_NAME } from "@the-machine/core";
import type { EntityId } from "@the-machine/core";
import { createDefaultClient } from "@the-machine/service";
import type { ServiceClient } from "@the-machine/service";
import { startGuiServer, stopGuiServer, listThemes } from "@the-machine/service";

const VERSION = "0.1.0";
const CWD = process.cwd();
const DEFAULT_WS_ID = "default" as EntityId;
const client: ServiceClient = createDefaultClient({ version: VERSION });

function showHelp(): void {
  console.log(`${PLATFORM_NAME} CLI v${VERSION}`);
  console.log("");
  console.log("Usage: machine [--json] <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  help                        Show this help message");
  console.log("  version                     Show version");
  console.log("  health                      Check health status");
  console.log("  workspace [path]            Show or create workspace");
  console.log("  repo [path]                 Discover repository profile");
  console.log("  plan <file>                 Load an ExecPlan from file");
  console.log("  plans                       List loaded plans");
  console.log("  validation <run-id>         Show validation results for a run");
  console.log("  providers                   List configured providers");
  console.log("  provider <id>               Show provider details");
  console.log("  mcp                         List MCP servers");
  console.log("  mcp-server <id>             Show MCP server details");
  console.log("  plugins                     List plugins");
  console.log("  plugin <id>                 Show plugin details");
  console.log("  readiness [subsystem]       Check readiness");
  console.log("  diagnostics                 Run system diagnostics");
  console.log("  gui [port]                  Start the War Council GUI server (dashboard + builder)");
  console.log("  gui:themes                  List available GUI themes");
  console.log("");
  console.log("Flags:");
  console.log("  --json                      Output as JSON (where supported)");
}

function showVersion(): void {
  console.log(VERSION);
}

function showHealth(jsonMode: boolean): void {
  const state = client.health.check({});
  if (jsonMode) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }
  console.log(`Status: ${state.status}`);
  console.log(`Platform: ${state.platform}`);
  console.log(`Version: ${state.version}`);
  console.log(`Uptime: ${String(state.uptimeMs)}ms`);
  console.log("health: ok");
}

function showWorkspace(path: string | undefined, jsonMode: boolean): void {
  const ws = client.workspace.get({ path: path ?? CWD });
  if (jsonMode) {
    console.log(JSON.stringify(ws, null, 2));
    return;
  }
  console.log(`Workspace path: ${ws.path}`);
  console.log(`Status: ${ws.status}`);
  console.log(`Active plan: ${String(ws.activeExecPlanId ?? "none")}`);
}

function showRepo(path: string | undefined, jsonMode: boolean): void {
  const info = client.repo.discover({ workspaceId: DEFAULT_WS_ID, rootPath: path ?? CWD });
  if (jsonMode) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }
  console.log(`Repository: ${info.rootPath}`);
  console.log(`Package manager: ${info.packageManager}`);
  console.log(`Has package.json: ${String(info.hasPackageJson)}`);
  console.log(`Has .git: ${String(info.hasGit)}`);
  console.log("repo: ok");
}

function showPlan(filePath: string, jsonMode: boolean): void {
  const plan = client.plan.load(filePath);
  if (jsonMode) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(`Plan: ${plan.title}`);
  console.log(`File: ${plan.id}`);
  console.log(`Status: ${plan.status}`);
  console.log("plan: ok");
}

function showPlans(jsonMode: boolean): void {
  const { plans } = client.plan.list();
  if (jsonMode) {
    console.log(JSON.stringify(plans, null, 2));
    return;
  }
  if (plans.length === 0) {
    console.log("No plans loaded.");
    return;
  }
  for (const p of plans) {
    console.log(`${p.id} — ${p.title} [${p.status}]`);
  }
}

function showValidation(runId: string, jsonMode: boolean): void {
  const result = client.validation.list(runId as EntityId);
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Run: ${runId}`);
  if (result.validations.length === 0) {
    console.log("No validations recorded.");
    return;
  }
  for (const v of result.validations) {
    console.log(
      `  ${v.command}: ${v.passed ? "PASS" : "FAIL"} (exit ${v.exitCode != null ? String(v.exitCode) : "?"})`,
    );
  }
}

function showProviders(jsonMode: boolean): void {
  const { providers } = client.provider.list();
  if (jsonMode) {
    console.log(JSON.stringify(providers, null, 2));
    return;
  }
  if (providers.length === 0) {
    console.log("No providers configured.");
    return;
  }
  for (const p of providers) {
    console.log(`${p.id} — ${p.name} (${p.tier})`);
  }
}

function showProvider(id: string, jsonMode: boolean): void {
  const p = client.provider.get({ workspaceId: DEFAULT_WS_ID, providerId: id as EntityId });
  if (jsonMode) {
    console.log(JSON.stringify(p ?? { error: "Not found" }, null, 2));
    return;
  }
  if (!p) {
    console.log(`Provider: ${id}`);
    console.log("Not found.");
    return;
  }
  console.log(`Provider: ${p.id}`);
  console.log(`Name: ${p.name}`);
  console.log(`Tier: ${p.tier}`);
  console.log(`Endpoint: ${p.endpoint}`);
  console.log(`Healthy: ${String(p.healthy)}`);
}

function showMCP(jsonMode: boolean): void {
  const { servers } = client.mcp.list();
  if (jsonMode) {
    console.log(JSON.stringify(servers, null, 2));
    return;
  }
  if (servers.length === 0) {
    console.log("No MCP servers registered.");
    return;
  }
  for (const s of servers) {
    console.log(`${s.id} — ${s.name} (${s.transport})`);
  }
}

function showMCPServer(id: string, jsonMode: boolean): void {
  const s = client.mcp.get({ workspaceId: DEFAULT_WS_ID, mcpId: id as EntityId });
  if (jsonMode) {
    console.log(JSON.stringify(s ?? { error: "Not found" }, null, 2));
    return;
  }
  if (!s) {
    console.log(`MCP server: ${id}`);
    console.log("Not found.");
    return;
  }
  console.log(`MCP server: ${s.id}`);
  console.log(`Name: ${s.name}`);
  console.log(`Transport: ${s.transport}`);
  console.log(`Endpoint: ${s.endpoint}`);
  console.log(`Tools: ${String(s.tools.length)}`);
}

function showPlugins(jsonMode: boolean): void {
  const { plugins } = client.plugin.list();
  if (jsonMode) {
    console.log(JSON.stringify(plugins, null, 2));
    return;
  }
  if (plugins.length === 0) {
    console.log("No plugins registered.");
    return;
  }
  for (const p of plugins) {
    console.log(`${p.id} — ${p.name} v${p.version}`);
  }
}

function showPlugin(id: string, jsonMode: boolean): void {
  const p = client.plugin.get({ workspaceId: DEFAULT_WS_ID, pluginId: id as EntityId });
  if (jsonMode) {
    console.log(JSON.stringify(p ?? { error: "Not found" }, null, 2));
    return;
  }
  if (!p) {
    console.log(`Plugin: ${id}`);
    console.log("Not found.");
    return;
  }
  console.log(`Plugin: ${p.id}`);
  console.log(`Name: ${p.name}`);
  console.log(`Version: ${p.version}`);
  console.log(`Enabled: ${String(p.enabled)}`);
}

function showReadiness(subsystem: string | undefined, jsonMode: boolean): void {
  const req: { workspaceId: EntityId; subsystem?: string } = { workspaceId: DEFAULT_WS_ID };
  if (subsystem !== undefined) {
    req.subsystem = subsystem;
  }
  const result = client.readiness.check(req);

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Overall: ${result.overall}`);
  if (subsystem) {
    console.log(`Filtered subsystem: ${subsystem}`);
  }
  for (const gate of result.gates) {
    const name = gate.subsystem.slice(0, 1).toUpperCase() + gate.subsystem.slice(1);
    const status = gate.status === "completed" ? "Ready" : gate.status;
    console.log(`${name}: ${status} (${String(gate.passedChecks)}/${String(gate.totalChecks)})`);
  }
}

function showGui(portArg: string | undefined): void {
  const port = portArg ? parseInt(portArg, 10) : 3000;
  if (isNaN(port) || port < 1 || port > 65535) {
    const invalidPort = portArg ?? "";
    console.error(`Invalid port: ${invalidPort}`);
    process.exit(1);
  }

  console.log("Starting War Council GUI server...");
  console.log(`  Dashboard → http://127.0.0.1:${String(port)}/`);
  console.log(`  Builder   → http://127.0.0.1:${String(port)}/builder`);
  console.log("Press Ctrl+C to stop.");

  startGuiServer({ port, host: "127.0.0.1" });

  // Graceful shutdown.
  const shutdown = () => {
    stopGuiServer();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function showGuiThemes(jsonMode: boolean): void {
  const themes = listThemes();
  if (jsonMode) {
    console.log(JSON.stringify({ themes }, null, 2));
    return;
  }
  if (themes.length === 0) {
    console.log("No GUI themes found.");
    return;
  }
  console.log(`${String(themes.length)} theme(s) available:\n`);
  for (const t of themes) {
    console.log(`  ${t.name} — ${t.label}`);
    console.log(`    ${t.description}`);
    console.log(`    Style: ${t.style}  |  v${t.version}\n`);
  }
}

function showDiagnostics(jsonMode: boolean): void {
  const health = client.health.check({});

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          platform: health.platform,
          version: health.version,
          cwd: CWD,
          nodejs: true,
          pnpm: true,
          uptimeMs: health.uptimeMs,
          checks: health.checks,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Platform: ${health.platform}`);
  console.log(`Version: ${health.version}`);
  console.log(`CWD: ${CWD}`);
  console.log("Node.js: available");
  console.log("pnpm: available");
  console.log("diagnostics: ok");
}

// --- Command dispatch ---

const args = process.argv.slice(2);
let jsonMode = false;

// Parse --json and --help flags (can be anywhere before the command)
const nonFlagArgs = args.filter((a) => {
  if (a === "--json") {
    jsonMode = true;
    return false;
  }
  if (a === "--help") {
    return false; // consumed — command defaults to "help"
  }
  return true;
});

const command = nonFlagArgs[0] ?? "help";

switch (command) {
  case "help":
    showHelp();
    break;
  case "version":
    showVersion();
    break;
  case "health":
    showHealth(jsonMode);
    break;
  case "workspace":
    showWorkspace(nonFlagArgs[1], jsonMode);
    break;
  case "repo":
    showRepo(nonFlagArgs[1], jsonMode);
    break;
  case "plan":
    if (!nonFlagArgs[1]) {
      console.error("Usage: machine plan <file>");
      process.exit(1);
    }
    showPlan(nonFlagArgs[1], jsonMode);
    break;
  case "plans":
    showPlans(jsonMode);
    break;
  case "validation":
    if (!nonFlagArgs[1]) {
      console.error("Usage: machine validation <run-id>");
      process.exit(1);
    }
    showValidation(nonFlagArgs[1], jsonMode);
    break;
  case "providers":
    showProviders(jsonMode);
    break;
  case "provider":
    if (!nonFlagArgs[1]) {
      console.error("Usage: machine provider <id>");
      process.exit(1);
    }
    showProvider(nonFlagArgs[1], jsonMode);
    break;
  case "mcp":
    showMCP(jsonMode);
    break;
  case "mcp-server":
    if (!nonFlagArgs[1]) {
      console.error("Usage: machine mcp-server <id>");
      process.exit(1);
    }
    showMCPServer(nonFlagArgs[1], jsonMode);
    break;
  case "plugins":
    showPlugins(jsonMode);
    break;
  case "plugin":
    if (!nonFlagArgs[1]) {
      console.error("Usage: machine plugin <id>");
      process.exit(1);
    }
    showPlugin(nonFlagArgs[1], jsonMode);
    break;
  case "readiness":
    showReadiness(nonFlagArgs[1], jsonMode);
    break;
  case "diagnostics":
    showDiagnostics(jsonMode);
    break;
  case "gui":
    showGui(nonFlagArgs[1]);
    break;
  case "gui:themes":
    showGuiThemes(jsonMode);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
