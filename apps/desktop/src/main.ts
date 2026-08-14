import {
  cancelDesktopJob,
  launchMachine,
  onMachineJobEvent,
  queryMachine,
  type ApprovalPhase,
  type JobEvent,
  type MachineRequest,
} from "./bridge.js";

interface RunFailure {
  readonly category: string;
  readonly message: string;
  readonly retryable?: boolean;
}

interface ValidationRecord {
  readonly validationId: string;
  readonly passed: boolean;
  readonly exitCode: number;
  readonly durationMs: number;
}

interface AttemptRecord {
  readonly attempt: number;
  readonly workerId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly failure: RunFailure | null;
  readonly changedFiles: readonly string[];
  readonly patchBytes: number;
  readonly validations: readonly ValidationRecord[];
}

interface TaskState {
  readonly taskId: string;
  readonly status: string;
  readonly phase: string;
  readonly attempts: readonly AttemptRecord[];
  readonly checkpoint: string | null;
}

interface RunMetrics {
  readonly startedAt?: string;
  readonly finishedAt?: string | null;
  readonly durationMs?: number;
  readonly attemptCount?: number;
  readonly completedTaskCount?: number;
  readonly workerFailureCount?: number;
  readonly validationFailureCount?: number;
  readonly policyViolationCount?: number;
  readonly approvalWaitCount?: number;
}

interface RunManifest {
  readonly runId: string;
  readonly planId: string;
  readonly planDigest: string;
  readonly status: string;
  readonly repositoryPath: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly baseCommit: string;
  readonly currentTaskId: string | null;
  readonly taskOrder: readonly string[];
  readonly taskStates: Readonly<Record<string, TaskState>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly evidencePath: string | null;
  readonly failure: RunFailure | null;
  readonly metrics: RunMetrics;
}

interface RunEvent {
  readonly sequence: number;
  readonly timestamp: string;
  readonly type: string;
  readonly taskId: string | null;
  readonly workerId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

interface RunArtifact {
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly size: number;
  readonly modifiedAt: string;
}

interface EvidenceVerification {
  readonly valid: boolean;
  readonly missing: readonly string[];
  readonly mismatched: readonly string[];
}

interface RunSnapshot {
  readonly manifest: RunManifest;
  readonly plan: unknown;
  readonly events: readonly RunEvent[];
  readonly approvals: readonly unknown[];
  readonly diff: string;
  readonly artifacts: readonly RunArtifact[];
  readonly evidenceVerification: EvidenceVerification | null;
  readonly capturedAt: string;
}

interface WorkerDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly kind: string;
  readonly executable: string;
  readonly builtIn: boolean;
  readonly documentationUrl: string | null;
  readonly outputFormat: string;
  readonly supportedPlatforms: readonly string[];
  readonly requiredEnvironment: readonly string[];
  readonly optionalEnvironment: readonly string[];
  readonly safetyNotes: readonly string[];
}

interface WorkerProbe {
  readonly id: string;
  readonly available: boolean;
  readonly executable: string;
  readonly version: string | null;
  readonly message: string;
  readonly checkedAt: string;
  readonly descriptor: WorkerDescriptor;
}

interface WorkersResponse {
  readonly workers: readonly WorkerProbe[];
  readonly plan?: unknown;
}

interface BenchmarkReport {
  readonly suite?: { readonly id?: string; readonly title?: string };
  readonly worker?: { readonly id?: string; readonly version?: string | null };
  readonly summary?: {
    readonly passed?: number;
    readonly total?: number;
    readonly meanScore?: number;
    readonly meanElapsedMs?: number;
  };
  readonly reportFiles?: { readonly jsonPath?: string; readonly markdownPath?: string };
}

interface ConsoleState {
  repository: string;
  planPath: string;
  runs: RunManifest[];
  selectedRunId: string | null;
  snapshot: RunSnapshot | null;
  workers: WorkerProbe[];
  activeView: "runs" | "workers" | "benchmarks";
  detailTab: "tasks" | "events" | "diff" | "artifacts" | "plan";
  activeJobId: string | null;
  activeJobKind: "run" | "resume" | "benchmark" | null;
  jobStdout: string[];
  jobStderr: string[];
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing desktop element: ${id}`);
  return found as T;
}

const ui = {
  bridgeStatus: element<HTMLSpanElement>("bridge-status"),
  repository: element<HTMLInputElement>("repository-input"),
  plan: element<HTMLInputElement>("plan-input"),
  refresh: element<HTMLButtonElement>("refresh-button"),
  start: element<HTMLButtonElement>("start-button"),
  probe: element<HTMLButtonElement>("probe-button"),
  runCount: element<HTMLSpanElement>("run-count"),
  workerCount: element<HTMLSpanElement>("worker-count"),
  runFilter: element<HTMLSelectElement>("run-filter"),
  runList: element<HTMLDivElement>("run-list"),
  noRun: element<HTMLDivElement>("no-run"),
  runDetail: element<HTMLDivElement>("run-detail"),
  runPlanId: element<HTMLDivElement>("run-plan-id"),
  runTitle: element<HTMLHeadingElement>("run-title"),
  runSubtitle: element<HTMLDivElement>("run-subtitle"),
  runStatus: element<HTMLSpanElement>("run-status"),
  resume: element<HTMLButtonElement>("resume-button"),
  cancelRun: element<HTMLButtonElement>("cancel-run-button"),
  metrics: element<HTMLDivElement>("metrics-grid"),
  approvalPanel: element<HTMLElement>("approval-panel"),
  approvalTitle: element<HTMLHeadingElement>("approval-title"),
  approvalDescription: element<HTMLParagraphElement>("approval-description"),
  approvalNote: element<HTMLInputElement>("approval-note"),
  approve: element<HTMLButtonElement>("approve-button"),
  reject: element<HTMLButtonElement>("reject-button"),
  taskList: element<HTMLDivElement>("task-list"),
  eventList: element<HTMLDivElement>("event-list"),
  eventCount: element<HTMLSpanElement>("event-count"),
  eventFilter: element<HTMLSelectElement>("event-filter"),
  diff: element<HTMLPreElement>("diff-output"),
  artifacts: element<HTMLDivElement>("artifact-list"),
  verifyEvidence: element<HTMLButtonElement>("verify-evidence-button"),
  evidenceStatus: element<HTMLSpanElement>("evidence-status"),
  planOutput: element<HTMLPreElement>("plan-output"),
  probeWorkers: element<HTMLButtonElement>("probe-workers-button"),
  workerGrid: element<HTMLDivElement>("worker-grid"),
  benchmarkForm: element<HTMLFormElement>("benchmark-form"),
  benchmarkSuite: element<HTMLInputElement>("benchmark-suite"),
  benchmarkWorker: element<HTMLSelectElement>("benchmark-worker"),
  benchmarkRepeat: element<HTMLInputElement>("benchmark-repeat"),
  benchmarkStatus: element<HTMLSpanElement>("benchmark-status"),
  benchmarkSummary: element<HTMLDivElement>("benchmark-summary"),
  jobStatus: element<HTMLSpanElement>("job-status"),
  jobMeta: element<HTMLDivElement>("job-meta"),
  jobConsole: element<HTMLPreElement>("job-console"),
  stopJob: element<HTMLButtonElement>("stop-job-button"),
  toast: element<HTMLDivElement>("toast"),
};

const state: ConsoleState = {
  repository: localStorage.getItem("machine.repository") ?? ".",
  planPath: localStorage.getItem("machine.plan") ?? "",
  runs: [],
  selectedRunId: localStorage.getItem("machine.selectedRun"),
  snapshot: null,
  workers: [],
  activeView: "runs",
  detailTab: "tasks",
  activeJobId: null,
  activeJobKind: null,
  jobStdout: [],
  jobStderr: [],
};

ui.repository.value = state.repository;
ui.plan.value = state.planPath;

function persistWorkspace(): void {
  state.repository = ui.repository.value.trim() || ".";
  state.planPath = ui.plan.value.trim();
  localStorage.setItem("machine.repository", state.repository);
  localStorage.setItem("machine.plan", state.planPath);
  if (state.selectedRunId) localStorage.setItem("machine.selectedRun", state.selectedRunId);
  else localStorage.removeItem("machine.selectedRun");
}

function showToast(message: string, error = false): void {
  ui.toast.textContent = message;
  ui.toast.classList.toggle("error", error);
  ui.toast.classList.remove("hidden");
  window.setTimeout(() => ui.toast.classList.add("hidden"), 3600);
}

function setPill(target: HTMLElement, label: string, status: string): void {
  target.textContent = label;
  target.className = `status-pill ${status.replaceAll(/[^A-Za-z0-9_-]/g, "_")}`;
}

function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1000) return `${String(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1000);
  return `${String(minutes)}m ${String(seconds)}s`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function shortId(value: string | null | undefined, length = 12): string {
  return value ? value.slice(0, length) : "—";
}

async function queryJson<T>(request: MachineRequest): Promise<T> {
  const result = await queryMachine<T>(request);
  if (result.exit_code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Machine exited ${String(result.exit_code)}`);
  }
  if (result.json === null) throw new Error("The Machine CLI did not return structured JSON.");
  return result.json;
}

function runStatusClass(status: string): string {
  return status.toLowerCase().replaceAll(/[^a-z0-9_-]/g, "_");
}

function metric(label: string, value: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "metric-card";
  const labelElement = document.createElement("div");
  labelElement.className = "metric-label";
  labelElement.textContent = label;
  const valueElement = document.createElement("div");
  valueElement.className = "metric-value";
  valueElement.title = value;
  valueElement.textContent = value;
  card.append(labelElement, valueElement);
  return card;
}

function renderRuns(): void {
  const filter = ui.runFilter.value;
  const visible = state.runs.filter((run) => filter === "all" || run.status === filter);
  ui.runCount.textContent = String(state.runs.length);
  ui.runList.replaceChildren();
  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.textContent = state.runs.length === 0 ? "No durable runs in this repository." : "No runs match this filter.";
    ui.runList.append(empty);
    return;
  }
  for (const run of visible) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `run-card${run.runId === state.selectedRunId ? " active" : ""}`;
    const title = document.createElement("div");
    title.className = "run-card-title";
    const strong = document.createElement("strong");
    strong.textContent = run.planId;
    const pill = document.createElement("span");
    setPill(pill, run.status, runStatusClass(run.status));
    title.append(strong, pill);
    const meta = document.createElement("div");
    meta.className = "run-card-meta";
    const id = document.createElement("span");
    id.textContent = shortId(run.runId, 18);
    const updated = document.createElement("span");
    updated.textContent = formatTimestamp(run.updatedAt);
    meta.append(id, updated);
    button.append(title, meta);
    button.addEventListener("click", () => void selectRun(run.runId));
    ui.runList.append(button);
  }
}

function taskProgress(stateValue: TaskState): HTMLElement {
  const progress = document.createElement("div");
  progress.className = "task-progress";
  const steps = ["pending", "working", "validating", "checkpointing", "completed"];
  const phaseIndex = stateValue.status === "completed" ? 4 : Math.max(0, steps.indexOf(stateValue.phase));
  steps.forEach((_step, index) => {
    const segment = document.createElement("span");
    if (index <= phaseIndex && stateValue.status !== "failed") segment.className = "complete";
    progress.append(segment);
  });
  return progress;
}

function renderTasks(snapshot: RunSnapshot): void {
  ui.taskList.replaceChildren();
  for (const taskId of snapshot.manifest.taskOrder) {
    const task = snapshot.manifest.taskStates[taskId];
    if (!task) continue;
    const latest = task.attempts.at(-1);
    const card = document.createElement("article");
    card.className = "task-card";
    const title = document.createElement("div");
    title.className = "task-title-row";
    const heading = document.createElement("h3");
    heading.textContent = taskId;
    const pill = document.createElement("span");
    setPill(pill, task.status, runStatusClass(task.status));
    title.append(heading, pill);
    const meta = document.createElement("div");
    meta.className = "task-meta";
    const values = [
      `phase ${task.phase}`,
      `${String(task.attempts.length)} attempt(s)`,
      `worker ${latest?.workerId ?? "—"}`,
      `patch ${formatBytes(latest?.patchBytes)}`,
      `checkpoint ${shortId(task.checkpoint)}`,
    ];
    values.forEach((value) => {
      const item = document.createElement("span");
      item.textContent = value;
      meta.append(item);
    });
    card.append(title, meta, taskProgress(task));
    if (latest?.failure) {
      const failure = document.createElement("p");
      failure.className = "muted";
      failure.textContent = `${latest.failure.category}: ${latest.failure.message}`;
      card.append(failure);
    }
    ui.taskList.append(card);
  }
}

function eventCategory(type: string): string {
  return type.split(".")[0] ?? type;
}

function eventSummary(event: RunEvent): string {
  const payload = event.payload;
  const preferred = ["message", "summary", "category", "validationId", "checkpoint", "phase"];
  for (const key of preferred) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  const serialized = JSON.stringify(payload);
  return serialized.length > 260 ? `${serialized.slice(0, 257)}...` : serialized;
}

function renderEvents(snapshot: RunSnapshot): void {
  const filter = ui.eventFilter.value;
  const events = snapshot.events.filter((event) => filter === "all" || eventCategory(event.type) === filter);
  ui.eventCount.textContent = `${String(snapshot.events.length)} events`;
  ui.eventList.replaceChildren();
  if (events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.textContent = "No events match this filter.";
    ui.eventList.append(empty);
    return;
  }
  for (const event of [...events].reverse()) {
    const row = document.createElement("div");
    row.className = "event-row";
    const sequence = document.createElement("span");
    sequence.className = "event-sequence";
    sequence.textContent = `#${String(event.sequence)}`;
    const type = document.createElement("span");
    type.className = "event-type";
    type.textContent = event.type;
    type.title = `${formatTimestamp(event.timestamp)} · ${event.taskId ?? "run"} · ${event.workerId ?? "system"}`;
    const summary = document.createElement("span");
    summary.className = "event-summary";
    summary.textContent = eventSummary(event);
    row.append(sequence, type, summary);
    ui.eventList.append(row);
  }
}

function renderArtifacts(snapshot: RunSnapshot): void {
  ui.artifacts.replaceChildren();
  const files = snapshot.artifacts.filter((artifact) => artifact.kind === "file");
  if (files.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.textContent = "No run artifacts found.";
    ui.artifacts.append(empty);
  }
  for (const artifact of files) {
    const row = document.createElement("div");
    row.className = "artifact-row";
    const path = document.createElement("span");
    path.className = "artifact-path";
    path.textContent = artifact.path;
    path.title = artifact.path;
    const size = document.createElement("span");
    size.textContent = formatBytes(artifact.size);
    const modified = document.createElement("span");
    modified.textContent = formatTimestamp(artifact.modifiedAt);
    row.append(path, size, modified);
    ui.artifacts.append(row);
  }
  const verification = snapshot.evidenceVerification;
  if (!verification) ui.evidenceStatus.textContent = "Evidence not finalized";
  else if (verification.valid) ui.evidenceStatus.textContent = "Checksums verified";
  else ui.evidenceStatus.textContent = `Invalid: ${[...verification.missing, ...verification.mismatched].join(", ")}`;
}

function approvalContext(manifest: RunManifest): { taskId: string; phase: ApprovalPhase } | null {
  const taskId = manifest.currentTaskId;
  if (!taskId || manifest.status !== "awaiting_approval") return null;
  const task = manifest.taskStates[taskId];
  if (!task) return null;
  if (task.phase === "awaiting_before_approval") return { taskId, phase: "before" };
  if (task.phase === "awaiting_after_approval") return { taskId, phase: "after" };
  return null;
}

function renderSnapshot(snapshot: RunSnapshot): void {
  const manifest = snapshot.manifest;
  ui.noRun.classList.add("hidden");
  ui.runDetail.classList.remove("hidden");
  ui.runPlanId.textContent = manifest.planId;
  ui.runTitle.textContent = manifest.runId;
  ui.runSubtitle.textContent = `${manifest.branch} · base ${shortId(manifest.baseCommit)} · updated ${formatTimestamp(manifest.updatedAt)}`;
  setPill(ui.runStatus, manifest.status, runStatusClass(manifest.status));
  ui.resume.disabled = manifest.status === "running" || manifest.status === "completed" || manifest.status === "cancelled";
  ui.cancelRun.disabled = ["completed", "failed", "stopped", "cancelled"].includes(manifest.status);
  ui.metrics.replaceChildren(
    metric("Tasks", `${String(manifest.metrics.completedTaskCount ?? 0)}/${String(manifest.taskOrder.length)}`),
    metric("Attempts", String(manifest.metrics.attemptCount ?? 0)),
    metric("Duration", formatDuration(manifest.metrics.durationMs)),
    metric("Worker failures", String(manifest.metrics.workerFailureCount ?? 0)),
    metric("Validation failures", String(manifest.metrics.validationFailureCount ?? 0)),
    metric("Policy violations", String(manifest.metrics.policyViolationCount ?? 0)),
  );

  const approval = approvalContext(manifest);
  ui.approvalPanel.classList.toggle("hidden", approval === null);
  if (approval) {
    ui.approvalPanel.dataset.taskId = approval.taskId;
    ui.approvalPanel.dataset.phase = approval.phase;
    ui.approvalTitle.textContent = `${approval.phase === "before" ? "Pre-execution" : "Post-patch"} approval required`;
    ui.approvalDescription.textContent = `Task ${approval.taskId} is paused. Review the task, events, and diff before deciding.`;
  }

  renderTasks(snapshot);
  renderEvents(snapshot);
  ui.diff.textContent = snapshot.diff || "No committed or staged diff is available.";
  renderArtifacts(snapshot);
  ui.planOutput.textContent = JSON.stringify(snapshot.plan, null, 2);
  if (manifest.failure) {
    showToast(`${manifest.failure.category}: ${manifest.failure.message}`, true);
  }
}

function showNoRun(): void {
  ui.noRun.classList.remove("hidden");
  ui.runDetail.classList.add("hidden");
}

function renderWorkers(): void {
  ui.workerCount.textContent = String(state.workers.length);
  ui.workerGrid.replaceChildren();
  if (state.workers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.textContent = "Probe workers to inspect local installations.";
    ui.workerGrid.append(empty);
    return;
  }
  for (const worker of state.workers) {
    const card = document.createElement("article");
    card.className = "worker-card";
    const title = document.createElement("div");
    title.className = "worker-title-row";
    const heading = document.createElement("h3");
    heading.textContent = worker.descriptor.displayName;
    const pill = document.createElement("span");
    setPill(pill, worker.available ? "Available" : "Unavailable", worker.available ? "available" : "unavailable");
    title.append(heading, pill);
    const description = document.createElement("p");
    description.className = "worker-description";
    description.textContent = worker.descriptor.description;
    const meta = document.createElement("div");
    meta.className = "worker-meta";
    for (const value of [
      `id ${worker.id}`,
      `kind ${worker.descriptor.kind}`,
      `binary ${worker.executable}`,
      `version ${worker.version ?? "unknown"}`,
      `output ${worker.descriptor.outputFormat}`,
    ]) {
      const item = document.createElement("span");
      item.textContent = value;
      meta.append(item);
    }
    const safety = document.createElement("ul");
    safety.className = "worker-safety";
    for (const note of worker.descriptor.safetyNotes) {
      const item = document.createElement("li");
      item.textContent = note;
      safety.append(item);
    }
    card.append(title, description, meta, safety);
    ui.workerGrid.append(card);
  }
}

function switchView(view: ConsoleState["activeView"]): void {
  state.activeView = view;
  document.querySelectorAll<HTMLElement>("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === view);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
}

function switchDetailTab(tab: ConsoleState["detailTab"]): void {
  state.detailTab = tab;
  document.querySelectorAll<HTMLElement>("[data-detail-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.detailPanel === tab);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-detail-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.detailTab === tab);
  });
}

async function loadRuns(silent = false): Promise<void> {
  persistWorkspace();
  try {
    state.runs = await queryJson<RunManifest[]>({
      operation: "runs",
      repository: state.repository,
    });
    if (state.selectedRunId && !state.runs.some((run) => run.runId === state.selectedRunId)) {
      state.selectedRunId = null;
      state.snapshot = null;
    }
    renderRuns();
    if (state.selectedRunId) await loadSnapshot(state.selectedRunId, true);
    else showNoRun();
  } catch (error) {
    state.runs = [];
    renderRuns();
    showNoRun();
    if (!silent) showToast(error instanceof Error ? error.message : String(error), true);
  }
}

async function loadSnapshot(runId: string, silent = false): Promise<void> {
  try {
    const snapshot = await queryJson<RunSnapshot>({
      operation: "snapshot",
      run_id: runId,
      repository: state.repository,
    });
    state.snapshot = snapshot;
    state.selectedRunId = runId;
    persistWorkspace();
    renderRuns();
    renderSnapshot(snapshot);
  } catch (error) {
    if (!silent) showToast(error instanceof Error ? error.message : String(error), true);
  }
}

async function selectRun(runId: string): Promise<void> {
  state.selectedRunId = runId;
  switchView("runs");
  await loadSnapshot(runId);
}

async function loadWorkers(): Promise<void> {
  persistWorkspace();
  ui.probeWorkers.disabled = true;
  ui.probe.disabled = true;
  try {
    const request: MachineRequest = state.planPath
      ? { operation: "workers", plan_path: state.planPath }
      : { operation: "workers" };
    const result = await queryJson<WorkersResponse>(request);
    state.workers = [...result.workers];
    renderWorkers();
    showToast(`Probed ${String(state.workers.length)} workers.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), true);
  } finally {
    ui.probeWorkers.disabled = false;
    ui.probe.disabled = false;
  }
}

function appendJobEvent(event: JobEvent): void {
  if (event.job_id !== state.activeJobId) return;
  if (event.channel === "stdout") state.jobStdout.push(event.line);
  else if (event.channel === "stderr") state.jobStderr.push(event.line);
  const prefix = event.channel === "stderr" ? "[stderr] " : event.channel === "status" ? "[status] " : "";
  ui.jobConsole.textContent += `${prefix}${event.line}\n`;
  ui.jobConsole.scrollTop = ui.jobConsole.scrollHeight;
  if (event.exit_code !== null) {
    const success = event.exit_code === 0 || event.exit_code === 2;
    setPill(ui.jobStatus, success ? "Finished" : "Failed", success ? "completed" : "failed");
    ui.stopJob.classList.add("hidden");
    const kind = state.activeJobKind;
    state.activeJobId = null;
    state.activeJobKind = null;
    if (kind === "benchmark") renderBenchmarkResult(success);
    void loadRuns(true);
    void loadWorkers();
  }
}

function renderBenchmarkResult(success: boolean): void {
  setPill(ui.benchmarkStatus, success ? "Finished" : "Failed", success ? "completed" : "failed");
  const text = state.jobStdout.join("\n").trim();
  let report: BenchmarkReport | null = null;
  try {
    report = JSON.parse(text) as BenchmarkReport;
  } catch {
    // The streamed console remains useful when a worker emitted non-JSON diagnostics.
  }
  ui.benchmarkSummary.replaceChildren();
  if (!report?.summary) {
    const pre = document.createElement("pre");
    pre.className = "code-view";
    pre.textContent = text || state.jobStderr.join("\n") || "No benchmark report was produced.";
    ui.benchmarkSummary.append(pre);
    return;
  }
  const grid = document.createElement("div");
  grid.className = "benchmark-result-grid";
  grid.append(
    metric("Passed", `${String(report.summary.passed ?? 0)}/${String(report.summary.total ?? 0)}`),
    metric("Mean score", (report.summary.meanScore ?? 0).toFixed(2)),
    metric("Mean elapsed", formatDuration(report.summary.meanElapsedMs ?? 0)),
    metric("Worker", report.worker?.id ?? "unknown"),
  );
  const files = document.createElement("p");
  files.className = "muted";
  files.textContent = report.reportFiles?.markdownPath
    ? `Report: ${report.reportFiles.markdownPath}`
    : "Report files are in benchmark-results/.";
  ui.benchmarkSummary.append(grid, files);
}

async function launchJob(request: MachineRequest, kind: NonNullable<ConsoleState["activeJobKind"]>): Promise<void> {
  if (state.activeJobId) throw new Error("A desktop job is already active.");
  state.jobStdout = [];
  state.jobStderr = [];
  ui.jobConsole.textContent = "";
  const jobId = await launchMachine(request);
  state.activeJobId = jobId;
  state.activeJobKind = kind;
  ui.jobMeta.textContent = `${kind} · ${jobId}`;
  setPill(ui.jobStatus, "Running", "running");
  ui.stopJob.classList.remove("hidden");
  if (kind === "benchmark") setPill(ui.benchmarkStatus, "Running", "running");
}

async function startRun(): Promise<void> {
  persistWorkspace();
  if (!state.planPath) throw new Error("Choose a .machine.json plan first.");
  await launchJob({ operation: "start", plan_path: state.planPath }, "run");
  switchView("runs");
}

async function resumeSelectedRun(): Promise<void> {
  if (!state.selectedRunId) throw new Error("Select a run first.");
  await launchJob(
    { operation: "resume", run_id: state.selectedRunId, repository: state.repository },
    "resume",
  );
}

async function cancelSelectedRun(): Promise<void> {
  if (!state.selectedRunId) throw new Error("Select a run first.");
  await queryJson<RunManifest>({
    operation: "cancel_run",
    run_id: state.selectedRunId,
    repository: state.repository,
    reason: "Cancellation requested from the native run console.",
  });
  showToast("Cancellation requested.");
  await loadSnapshot(state.selectedRunId);
}

async function decideApproval(decision: "approve" | "reject"): Promise<void> {
  const runId = state.selectedRunId;
  const taskId = ui.approvalPanel.dataset.taskId;
  const phase = ui.approvalPanel.dataset.phase as ApprovalPhase | undefined;
  if (!runId || !taskId || (phase !== "before" && phase !== "after")) {
    throw new Error("No pending approval is selected.");
  }
  const note = ui.approvalNote.value.trim() || `${decision} from native run console`;
  const operation: MachineRequest = decision === "approve"
    ? { operation: "approve", run_id: runId, task_id: taskId, phase, repository: state.repository, note }
    : { operation: "reject", run_id: runId, task_id: taskId, phase, repository: state.repository, note };
  await queryJson<RunManifest>(operation);
  ui.approvalNote.value = "";
  showToast(`${decision === "approve" ? "Approved" : "Rejected"} ${taskId}.`);
  if (decision === "approve") await resumeSelectedRun();
  else await loadSnapshot(runId);
}

async function verifySelectedEvidence(): Promise<void> {
  const evidencePath = state.snapshot?.manifest.evidencePath;
  if (!evidencePath) throw new Error("This run has not finalized an evidence bundle.");
  const verification = await queryJson<EvidenceVerification>({
    operation: "evidence_verify",
    directory: evidencePath,
  });
  ui.evidenceStatus.textContent = verification.valid
    ? "Checksums verified"
    : `Invalid: ${[...verification.missing, ...verification.mismatched].join(", ")}`;
  showToast(verification.valid ? "Evidence bundle verified." : "Evidence verification failed.", !verification.valid);
}

async function runBenchmark(): Promise<void> {
  const suite = ui.benchmarkSuite.value.trim() || "smoke";
  const worker = ui.benchmarkWorker.value;
  const repeat = Number.parseInt(ui.benchmarkRepeat.value, 10);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 25) {
    throw new Error("Benchmark repetitions must be between 1 and 25.");
  }
  await launchJob({ operation: "benchmark", suite, worker, repeat }, "benchmark");
}

async function refreshEverything(): Promise<void> {
  await Promise.all([loadRuns(true), loadWorkers()]);
}

async function connect(): Promise<void> {
  try {
    const result = await queryMachine({ operation: "version" });
    if (result.exit_code !== 0) throw new Error(result.stderr || "Machine CLI unavailable");
    setPill(ui.bridgeStatus, result.stdout.trim() || "Connected", "completed");
    await refreshEverything();
  } catch (error) {
    setPill(ui.bridgeStatus, "Disconnected", "failed");
    showToast(error instanceof Error ? error.message : String(error), true);
  }
}

function bindEvents(): void {
  ui.repository.addEventListener("change", () => {
    state.selectedRunId = null;
    state.snapshot = null;
    persistWorkspace();
    void loadRuns();
  });
  ui.plan.addEventListener("change", persistWorkspace);
  ui.refresh.addEventListener("click", () => void refreshEverything());
  ui.probe.addEventListener("click", () => void refreshEverything());
  ui.start.addEventListener("click", () => void startRun().catch((error: unknown) => showToast(error instanceof Error ? error.message : String(error), true)));
  ui.resume.addEventListener("click", () => void resumeSelectedRun().catch((error: unknown) => showToast(error instanceof Error ? error.message : String(error), true)));
  ui.cancelRun.addEventListener("click", () => void cancelSelectedRun().catch((error: unknown) => showToast(error instanceof Error ? error.message : String(error), true)));
  ui.approve.addEventListener("click", () => void decideApproval("approve").catch((error: unknown) => showToast(error instanceof Error ? error.message : String(error), true)));
  ui.reject.addEventListener("click", () => void decideApproval("reject").catch((error: unknown) => showToast(error instanceof Error ? error.message : String(error), true)));
  ui.verifyEvidence.addEventListener("click", () => void verifySelectedEvidence().catch((error: unknown) => showToast(error instanceof Error ? error.message : String(error), true)));
  ui.probeWorkers.addEventListener("click", () => void loadWorkers());
  ui.runFilter.addEventListener("change", renderRuns);
  ui.eventFilter.addEventListener("change", () => {
    if (state.snapshot) renderEvents(state.snapshot);
  });
  ui.benchmarkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void runBenchmark().catch((error: unknown) => showToast(error instanceof Error ? error.message : String(error), true));
  });
  ui.stopJob.addEventListener("click", () => {
    if (!state.activeJobId) return;
    void cancelDesktopJob(state.activeJobId).catch((error: unknown) => showToast(error instanceof Error ? error.message : String(error), true));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view as ConsoleState["activeView"]));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-detail-tab]").forEach((button) => {
    button.addEventListener("click", () => switchDetailTab(button.dataset.detailTab as ConsoleState["detailTab"]));
  });
}

bindEvents();
void onMachineJobEvent(appendJobEvent);
void connect();
window.setInterval(() => {
  if (state.activeJobId) void loadRuns(true);
  else if (state.snapshot && ["running", "awaiting_approval", "pending"].includes(state.snapshot.manifest.status)) {
    void loadSnapshot(state.snapshot.manifest.runId, true);
  }
}, 1800);
