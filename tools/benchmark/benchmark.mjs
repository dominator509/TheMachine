#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SUITES_DIRECTORY = join(ROOT, "benchmarks", "suites");
const FIXTURES_DIRECTORY = join(ROOT, "benchmarks", "fixtures");
const FIXTURE_WORKER = join(ROOT, "tools", "benchmark", "fixture-worker.mjs");
const CLI_ENTRY = join(ROOT, "apps", "cli", "dist", "index.js");
const DEFAULT_OUTPUT_DIRECTORY = join(ROOT, "benchmark-results");

function parseArguments(argv) {
  const options = {
    suite: "smoke",
    worker: "fixture",
    repeat: 1,
    output: DEFAULT_OUTPUT_DIRECTORY,
    json: false,
    list: false,
    keep: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--suite") options.suite = argv[++index] ?? options.suite;
    else if (value === "--worker") options.worker = argv[++index] ?? options.worker;
    else if (value === "--repeat") options.repeat = Number.parseInt(argv[++index] ?? "1", 10);
    else if (value === "--output") options.output = resolve(argv[++index] ?? DEFAULT_OUTPUT_DIRECTORY);
    else if (value === "--json") options.json = true;
    else if (value === "--list") options.list = true;
    else if (value === "--keep") options.keep = true;
    else if (value === "--help" || value === "-h") {
      console.log([
        "The Machine public benchmark harness",
        "",
        "Usage:",
        "  node tools/benchmark/benchmark.mjs [options]",
        "",
        "Options:",
        "  --suite <id>       Benchmark suite (default: smoke)",
        "  --worker <id>      fixture, codex, claude-code, aider, or openhands",
        "  --repeat <n>       Repetitions per case (default: 1)",
        "  --output <dir>     Report directory",
        "  --list             List available suites",
        "  --keep             Keep temporary repositories and worktrees",
        "  --json             Print the complete report as JSON",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown benchmark option: ${value}`);
    }
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1 || options.repeat > 25) {
    throw new Error("--repeat must be an integer between 1 and 25.");
  }
  return options;
}

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    encoding: "utf-8",
    shell: false,
    windowsHide: true,
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: `${result.stderr ?? ""}${result.error ? `${result.stderr ? "\n" : ""}${result.error.message}` : ""}`,
  };
}

function requiredCommand(executable, args, options = {}) {
  const result = command(executable, args, options);
  if (result.exitCode !== 0) {
    throw new Error(`${executable} ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function suiteFiles() {
  if (!existsSync(SUITES_DIRECTORY)) return [];
  return readdirSync(SUITES_DIRECTORY)
    .filter((name) => name.endsWith(".machine-bench.json"))
    .sort();
}

function readSuite(id) {
  const match = suiteFiles().find((name) => name === `${id}.machine-bench.json`);
  if (!match) throw new Error(`Benchmark suite '${id}' was not found.`);
  const suite = JSON.parse(readFileSync(join(SUITES_DIRECTORY, match), "utf-8"));
  if (suite.version !== 1 || !Array.isArray(suite.cases) || suite.cases.length === 0) {
    throw new Error(`Benchmark suite '${id}' is invalid.`);
  }
  return suite;
}

function initializeRepository(fixtureDirectory, repositoryDirectory) {
  cpSync(fixtureDirectory, repositoryDirectory, { recursive: true });
  const initialized = command("git", ["init", "-b", "main"], { cwd: repositoryDirectory });
  if (initialized.exitCode !== 0) {
    requiredCommand("git", ["init"], { cwd: repositoryDirectory });
    requiredCommand("git", ["checkout", "-b", "main"], { cwd: repositoryDirectory });
  }
  requiredCommand("git", ["config", "user.name", "The Machine Benchmark"], {
    cwd: repositoryDirectory,
  });
  requiredCommand("git", ["config", "user.email", "benchmark@themachine.local"], {
    cwd: repositoryDirectory,
  });
  requiredCommand("git", ["add", "-A"], { cwd: repositoryDirectory });
  requiredCommand("git", ["commit", "-m", "benchmark fixture"], { cwd: repositoryDirectory });
  return requiredCommand("git", ["rev-parse", "HEAD"], { cwd: repositoryDirectory });
}

function planForCase(benchmarkCase, repositoryDirectory, worker) {
  const fixtureWorker = worker === "fixture";
  return {
    version: 1,
    id: `benchmark-${benchmarkCase.id}`,
    title: benchmarkCase.title,
    description: `Public benchmark case ${benchmarkCase.id}`,
    repository: {
      path: repositoryDirectory,
      baseRef: "HEAD",
    },
    ...(fixtureWorker
      ? {
          workers: [
            {
              id: "benchmark-fixture",
              kind: "cli",
              executable: process.execPath,
              args: [FIXTURE_WORKER, "{workspace}", "{taskId}"],
              timeoutMs: 30_000,
              maxOutputBytes: 1024 * 1024,
            },
          ],
        }
      : {}),
    workerStrategy: {
      primary: fixtureWorker ? "benchmark-fixture" : worker,
    },
    policy: {
      allowedPaths: benchmarkCase.allowedPaths,
      deniedPaths: ["test.mjs", ".machine/**", ".git/**"],
      maxChangedFiles: Math.max(benchmarkCase.expectedChangedPaths.length, 1),
      maxPatchBytes: 256 * 1024,
      allowDependencyChanges: false,
      allowBinaryChanges: false,
      keepWorktree: true,
    },
    tasks: [
      {
        id: benchmarkCase.id,
        title: benchmarkCase.title,
        objective: benchmarkCase.objective,
        allowedPaths: benchmarkCase.allowedPaths,
        deniedPaths: ["test.mjs"],
        validations: benchmarkCase.validations,
        maxAttempts: 3,
        requireChanges: true,
        approval: "none",
        checkpointMessage: `benchmark(${benchmarkCase.id}): verified repair`,
      },
    ],
    kaizen: {
      enabled: false,
    },
  };
}

function parseJsonOutput(result, context) {
  if (result.stdout.trim().length === 0) {
    throw new Error(`${context} produced no JSON output. ${result.stderr.trim()}`);
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(
      `${context} emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}\n${result.stdout.slice(0, 2000)}`,
    );
  }
}

function selectedWorkerProbe(worker) {
  const result = command(process.execPath, [CLI_ENTRY, "--json", "workers"], {
    cwd: ROOT,
    timeoutMs: 60_000,
  });
  if (result.exitCode !== 0) {
    return {
      id: worker,
      available: worker === "fixture",
      version: null,
      message: result.stderr.trim() || "Worker probe failed.",
    };
  }
  const payload = parseJsonOutput(result, "machine workers");
  return payload.workers?.find((candidate) => candidate.id === worker) ?? {
    id: worker,
    available: worker === "fixture",
    version: null,
    message: worker === "fixture" ? "Deterministic benchmark fixture worker." : "Worker not registered.",
  };
}

function evidenceVerification(evidencePath) {
  if (!evidencePath) return { valid: false, missing: ["evidence path"], mismatched: [] };
  const result = command(
    process.execPath,
    [CLI_ENTRY, "--json", "evidence", "verify", evidencePath],
    { cwd: ROOT, timeoutMs: 60_000 },
  );
  if (result.exitCode !== 0) {
    return { valid: false, missing: [], mismatched: [result.stderr.trim() || "verification failed"] };
  }
  return parseJsonOutput(result, "machine evidence verify");
}

function calculateScore({ completed, evidenceValid, expectedPathsChanged, policyViolations, attempts }) {
  let score = 0;
  if (completed) score += 50;
  if (evidenceValid) score += 15;
  if (expectedPathsChanged) score += 15;
  if (policyViolations === 0) score += 10;
  score += Math.max(0, 10 - Math.max(0, attempts - 1) * 4);
  return Math.max(0, Math.min(100, score));
}

function executeCase({ suite, benchmarkCase, worker, repetition, keep }) {
  const temporaryRoot = resolve(
    tmpdir(),
    `the-machine-benchmark-${suite.id}-${benchmarkCase.id}-${String(process.pid)}-${String(repetition)}-${Date.now().toString(36)}`,
  );
  const repositoryDirectory = join(temporaryRoot, "repository");
  const fixtureDirectory = join(FIXTURES_DIRECTORY, benchmarkCase.fixture);
  if (!existsSync(fixtureDirectory)) {
    throw new Error(`Benchmark fixture does not exist: ${fixtureDirectory}`);
  }
  mkdirSync(temporaryRoot, { recursive: true });
  const baseCommit = initializeRepository(fixtureDirectory, repositoryDirectory);
  const planPath = join(temporaryRoot, `${benchmarkCase.id}.machine.json`);
  writeFileSync(
    planPath,
    `${JSON.stringify(planForCase(benchmarkCase, repositoryDirectory, worker), null, 2)}\n`,
    "utf-8",
  );

  const started = Date.now();
  const runResult = command(process.execPath, [CLI_ENTRY, "--json", "run", planPath], {
    cwd: ROOT,
    env: { ...process.env, MACHINE_ACTOR: "public-benchmark" },
    timeoutMs: 2 * 60 * 60 * 1000,
    maxBuffer: 128 * 1024 * 1024,
  });
  const elapsedMs = Date.now() - started;
  let outcome = null;
  let parseError = null;
  try {
    outcome = parseJsonOutput(runResult, `benchmark case ${benchmarkCase.id}`);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  const manifest = outcome?.manifest ?? null;
  const taskState = manifest?.taskStates?.[benchmarkCase.id] ?? null;
  const latestAttempt = taskState?.attempts?.at(-1) ?? null;
  const changedFiles = latestAttempt?.changedFiles ?? [];
  const expectedPathsChanged = benchmarkCase.expectedChangedPaths.every((path) =>
    changedFiles.includes(path),
  );
  const verification = evidenceVerification(outcome?.evidencePath ?? manifest?.evidencePath ?? null);
  const completed = outcome?.status === "completed" && manifest?.status === "completed";
  const policyViolations = manifest?.metrics?.policyViolationCount ?? 0;
  const attempts = taskState?.attempts?.length ?? 0;
  const score = calculateScore({
    completed,
    evidenceValid: verification.valid,
    expectedPathsChanged,
    policyViolations,
    attempts,
  });
  const result = {
    suiteId: suite.id,
    caseId: benchmarkCase.id,
    title: benchmarkCase.title,
    worker,
    repetition,
    passed: completed && verification.valid && expectedPathsChanged && policyViolations === 0,
    score,
    status: outcome?.status ?? "process-error",
    runId: outcome?.runId ?? null,
    baseCommit,
    checkpoint: taskState?.checkpoint ?? null,
    elapsedMs,
    runtimeDurationMs: manifest?.metrics?.durationMs ?? null,
    attempts,
    workerFailures: manifest?.metrics?.workerFailureCount ?? 0,
    validationFailures: manifest?.metrics?.validationFailureCount ?? 0,
    policyViolations,
    changedFiles,
    patchBytes: latestAttempt?.patchBytes ?? 0,
    expectedChangedPaths: benchmarkCase.expectedChangedPaths,
    expectedPathsChanged,
    evidence: verification,
    failure: manifest?.failure ?? null,
    processExitCode: runResult.exitCode,
    processStderr: runResult.stderr.trim(),
    parseError,
    temporaryRoot: keep ? temporaryRoot : null,
  };

  if (!keep) rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
  return result;
}

function markdownReport(report) {
  const rows = report.results.map((result) =>
    `| ${result.caseId} | ${result.repetition} | ${result.passed ? "PASS" : "FAIL"} | ${result.score} | ${result.attempts} | ${result.elapsedMs} | ${result.changedFiles.join(", ") || "—"} |`,
  );
  return [
    `# The Machine benchmark — ${report.suite.id} / ${report.worker.id}`,
    "",
    `- Generated: ${report.generatedAt}`,
    `- The Machine commit: \`${report.system.machineCommit}\``,
    `- Worker availability: ${report.worker.available ? "available" : "not detected"}`,
    `- Worker version: ${report.worker.version ?? "unknown"}`,
    `- Passed: ${report.summary.passed}/${report.summary.total}`,
    `- Mean score: ${report.summary.meanScore.toFixed(2)}`,
    `- Mean elapsed: ${report.summary.meanElapsedMs.toFixed(0)} ms`,
    "",
    "| Case | Repetition | Result | Score | Attempts | Elapsed ms | Changed files |",
    "| --- | ---: | --- | ---: | ---: | ---: | --- |",
    ...rows,
    "",
    "## Scoring",
    "",
    "- 50 points: run completed.",
    "- 15 points: evidence checksum manifest verified.",
    "- 15 points: expected files changed.",
    "- 10 points: no patch-policy violation.",
    "- 10 points: first-attempt completion, reduced by four points for each additional attempt.",
    "",
    "Raw per-case records, failures, validation counts, patch sizes, and evidence results are available in the adjacent JSON report.",
    "",
  ].join("\n");
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.list) {
    const suites = suiteFiles().map((name) => {
      const suite = JSON.parse(readFileSync(join(SUITES_DIRECTORY, name), "utf-8"));
      return { id: suite.id, title: suite.title, cases: suite.cases.length, file: name };
    });
    console.log(options.json ? JSON.stringify({ suites }, null, 2) : suites.map((suite) => `${suite.id}\t${suite.cases}\t${suite.title}`).join("\n"));
    return;
  }
  if (!existsSync(CLI_ENTRY)) {
    throw new Error(`Built Machine CLI not found at ${CLI_ENTRY}. Run 'pnpm build' first.`);
  }

  const suite = readSuite(options.suite);
  const workerProbe = options.worker === "fixture"
    ? {
        id: "fixture",
        available: true,
        version: "deterministic-v1",
        message: "Credential-free deterministic benchmark worker.",
      }
    : selectedWorkerProbe(options.worker);
  const results = [];
  for (let repetition = 1; repetition <= options.repeat; repetition += 1) {
    for (const benchmarkCase of suite.cases) {
      if (!options.json) {
        console.log(`[benchmark] ${benchmarkCase.id} / ${options.worker} / repetition ${String(repetition)}`);
      }
      results.push(
        executeCase({
          suite,
          benchmarkCase,
          worker: options.worker,
          repetition,
          keep: options.keep,
        }),
      );
    }
  }

  const machineCommit = command("git", ["rev-parse", "HEAD"], { cwd: ROOT }).stdout.trim() || "unknown";
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    suite: {
      id: suite.id,
      title: suite.title,
      description: suite.description,
      caseCount: suite.cases.length,
    },
    worker: workerProbe,
    options: {
      repeat: options.repeat,
      keep: options.keep,
    },
    system: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      machineCommit,
    },
    summary: {
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      meanScore: mean(results.map((result) => result.score)),
      meanElapsedMs: mean(results.map((result) => result.elapsedMs)),
      totalAttempts: results.reduce((total, result) => total + result.attempts, 0),
      totalPatchBytes: results.reduce((total, result) => total + result.patchBytes, 0),
    },
    results,
  };

  mkdirSync(options.output, { recursive: true });
  const safeTimestamp = report.generatedAt.replace(/[:.]/g, "-");
  const stem = `${safeTimestamp}-${suite.id}-${options.worker}`;
  const jsonPath = join(options.output, `${stem}.json`);
  const markdownPath = join(options.output, `${stem}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  writeFileSync(markdownPath, `${markdownReport(report)}\n`, "utf-8");
  writeFileSync(join(options.output, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  writeFileSync(join(options.output, "latest.md"), `${markdownReport(report)}\n`, "utf-8");

  if (options.json) console.log(JSON.stringify({ ...report, reportFiles: { jsonPath, markdownPath } }, null, 2));
  else {
    console.log(`\n[benchmark] ${String(report.summary.passed)}/${String(report.summary.total)} passed`);
    console.log(`[benchmark] mean score ${report.summary.meanScore.toFixed(2)}`);
    console.log(`[benchmark] JSON ${jsonPath}`);
    console.log(`[benchmark] Markdown ${markdownPath}`);
  }
  if (report.summary.failed > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`benchmark: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
