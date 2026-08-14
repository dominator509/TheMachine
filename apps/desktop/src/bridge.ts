import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ApprovalPhase = "before" | "after";

export type MachineRequest =
  | { readonly operation: "version" }
  | { readonly operation: "workers"; readonly plan_path?: string }
  | { readonly operation: "runs"; readonly repository: string }
  | {
      readonly operation: "snapshot";
      readonly run_id: string;
      readonly repository: string;
      readonly after_sequence?: number;
    }
  | { readonly operation: "start"; readonly plan_path: string }
  | { readonly operation: "resume"; readonly run_id: string; readonly repository: string }
  | {
      readonly operation: "cancel_run";
      readonly run_id: string;
      readonly repository: string;
      readonly reason: string;
    }
  | {
      readonly operation: "approve";
      readonly run_id: string;
      readonly task_id: string;
      readonly phase: ApprovalPhase;
      readonly repository: string;
      readonly note: string;
    }
  | {
      readonly operation: "reject";
      readonly run_id: string;
      readonly task_id: string;
      readonly phase: ApprovalPhase;
      readonly repository: string;
      readonly note: string;
    }
  | { readonly operation: "evidence_verify"; readonly directory: string }
  | {
      readonly operation: "benchmark";
      readonly suite: string;
      readonly worker: string;
      readonly repeat: number;
    };

export interface CliResult<T = unknown> {
  readonly stdout: string;
  readonly stderr: string;
  readonly exit_code: number;
  readonly json: T | null;
}

export interface JobEvent {
  readonly job_id: string;
  readonly channel: "stdout" | "stderr" | "status";
  readonly line: string;
  readonly exit_code: number | null;
}

export async function queryMachine<T>(request: MachineRequest): Promise<CliResult<T>> {
  return await invoke<CliResult<T>>("machine_query", { request });
}

export async function launchMachine(request: MachineRequest): Promise<string> {
  return await invoke<string>("machine_launch", { request });
}

export async function cancelDesktopJob(jobId: string): Promise<void> {
  await invoke("machine_cancel_job", { jobId });
}

export async function onMachineJobEvent(
  handler: (event: JobEvent) => void,
): Promise<UnlistenFn> {
  return await listen<JobEvent>("machine-job-event", (event) => handler(event.payload));
}
