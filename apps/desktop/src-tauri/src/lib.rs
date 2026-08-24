use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

static NEXT_JOB_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case")]
pub enum MachineRequest {
    Version,
    Workers {
        plan_path: Option<String>,
    },
    Runs {
        repository: String,
    },
    Snapshot {
        run_id: String,
        repository: String,
        after_sequence: Option<u64>,
    },
    Start {
        plan_path: String,
    },
    Resume {
        run_id: String,
        repository: String,
    },
    CancelRun {
        run_id: String,
        repository: String,
        reason: String,
    },
    Approve {
        run_id: String,
        task_id: String,
        phase: String,
        repository: String,
        note: String,
    },
    Reject {
        run_id: String,
        task_id: String,
        phase: String,
        repository: String,
        note: String,
    },
    EvidenceVerify {
        directory: String,
    },
    Benchmark {
        suite: String,
        worker: String,
        repeat: u32,
    },
}

#[derive(Debug, Serialize)]
pub struct CliResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub json: Option<Value>,
}

#[derive(Clone, Debug, Serialize)]
pub struct JobEvent {
    pub job_id: String,
    pub channel: String,
    pub line: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug)]
struct MachineCommand {
    executable: PathBuf,
    prefix_args: Vec<String>,
}

#[derive(Default)]
struct JobRegistry {
    jobs: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
}

fn non_empty(value: String, field: &str) -> Result<String, String> {
    if value.trim().is_empty() {
        Err(format!("{field} must not be empty"))
    } else if value.contains('\0') {
        Err(format!("{field} contains a NUL byte"))
    } else {
        Ok(value)
    }
}

fn approval_phase(value: String) -> Result<String, String> {
    match value.as_str() {
        "before" | "after" => Ok(value),
        _ => Err("approval phase must be 'before' or 'after'".to_string()),
    }
}

fn machine_command() -> Result<MachineCommand, String> {
    if let Ok(value) = env::var("MACHINE_CLI") {
        let executable = PathBuf::from(value);
        if executable.as_os_str().is_empty() {
            return Err("MACHINE_CLI is empty".to_string());
        }
        return Ok(MachineCommand {
            executable,
            prefix_args: Vec::new(),
        });
    }

    let current = env::current_dir().map_err(|error| error.to_string())?;
    for ancestor in current.ancestors() {
        let candidate = ancestor
            .join("apps")
            .join("cli")
            .join("dist")
            .join("index.js");
        if candidate.is_file() {
            let node = env::var("MACHINE_NODE").unwrap_or_else(|_| "node".to_string());
            return Ok(MachineCommand {
                executable: PathBuf::from(node),
                prefix_args: vec![candidate.to_string_lossy().to_string()],
            });
        }
    }

    Ok(MachineCommand {
        executable: PathBuf::from(if cfg!(windows) {
            "machine.cmd"
        } else {
            "machine"
        }),
        prefix_args: Vec::new(),
    })
}

fn request_args(request: MachineRequest, json: bool) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    if json {
        args.push("--json".to_string());
    }

    match request {
        MachineRequest::Version => args.push("version".to_string()),
        MachineRequest::Workers { plan_path } => {
            args.push("workers".to_string());
            if let Some(path) = plan_path {
                args.push(non_empty(path, "plan_path")?);
            }
        }
        MachineRequest::Runs { repository } => {
            args.push("runs".to_string());
            args.push(non_empty(repository, "repository")?);
        }
        MachineRequest::Snapshot {
            run_id,
            repository,
            after_sequence,
        } => {
            args.push("snapshot".to_string());
            args.push(non_empty(run_id, "run_id")?);
            args.push(non_empty(repository, "repository")?);
            if let Some(sequence) = after_sequence {
                args.push(sequence.to_string());
            }
        }
        MachineRequest::Start { plan_path } => {
            args.push("run".to_string());
            args.push(non_empty(plan_path, "plan_path")?);
        }
        MachineRequest::Resume { run_id, repository } => {
            args.push("resume".to_string());
            args.push(non_empty(run_id, "run_id")?);
            args.push(non_empty(repository, "repository")?);
        }
        MachineRequest::CancelRun {
            run_id,
            repository,
            reason,
        } => {
            args.push("cancel".to_string());
            args.push(non_empty(run_id, "run_id")?);
            args.push(non_empty(repository, "repository")?);
            args.push(non_empty(reason, "reason")?);
        }
        MachineRequest::Approve {
            run_id,
            task_id,
            phase,
            repository,
            note,
        } => {
            args.push("approve".to_string());
            args.push(non_empty(run_id, "run_id")?);
            args.push(non_empty(task_id, "task_id")?);
            args.push(approval_phase(phase)?);
            args.push(non_empty(repository, "repository")?);
            args.push(non_empty(note, "note")?);
        }
        MachineRequest::Reject {
            run_id,
            task_id,
            phase,
            repository,
            note,
        } => {
            args.push("reject".to_string());
            args.push(non_empty(run_id, "run_id")?);
            args.push(non_empty(task_id, "task_id")?);
            args.push(approval_phase(phase)?);
            args.push(non_empty(repository, "repository")?);
            args.push(non_empty(note, "note")?);
        }
        MachineRequest::EvidenceVerify { directory } => {
            args.extend([
                "evidence".to_string(),
                "verify".to_string(),
                non_empty(directory, "directory")?,
            ]);
        }
        MachineRequest::Benchmark {
            suite,
            worker,
            repeat,
        } => {
            if repeat == 0 || repeat > 25 {
                return Err("benchmark repeat must be between 1 and 25".to_string());
            }
            args.extend([
                "benchmark".to_string(),
                "run".to_string(),
                "--suite".to_string(),
                non_empty(suite, "suite")?,
                "--worker".to_string(),
                non_empty(worker, "worker")?,
                "--repeat".to_string(),
                repeat.to_string(),
            ]);
        }
    }
    Ok(args)
}

fn configured_process(request: MachineRequest, json: bool) -> Result<Command, String> {
    let machine = machine_command()?;
    let mut command = Command::new(machine.executable);
    command.args(machine.prefix_args);
    command.args(request_args(request, json)?);
    command.env("MACHINE_ACTOR", "desktop-operator");
    command.stdin(Stdio::null());
    Ok(command)
}

#[tauri::command]
fn machine_query(request: MachineRequest) -> Result<CliResult, String> {
    let output = configured_process(request, true)?
        .output()
        .map_err(|error| format!("unable to start The Machine CLI: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let json = serde_json::from_str(stdout.trim()).ok();
    Ok(CliResult {
        stdout,
        stderr,
        exit_code: output.status.code().unwrap_or(-1),
        json,
    })
}

fn emit_reader<R: Read + Send + 'static>(app: AppHandle, job_id: String, channel: &str, reader: R) {
    let channel = channel.to_string();
    thread::spawn(move || {
        for line in BufReader::new(reader).lines() {
            match line {
                Ok(line) => {
                    let _ = app.emit(
                        "machine-job-event",
                        JobEvent {
                            job_id: job_id.clone(),
                            channel: channel.clone(),
                            line,
                            exit_code: None,
                        },
                    );
                }
                Err(error) => {
                    let _ = app.emit(
                        "machine-job-event",
                        JobEvent {
                            job_id: job_id.clone(),
                            channel: "stderr".to_string(),
                            line: format!("unable to read {channel}: {error}"),
                            exit_code: None,
                        },
                    );
                    break;
                }
            }
        }
    });
}

fn new_job_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sequence = NEXT_JOB_ID.fetch_add(1, Ordering::Relaxed);
    format!("job-{millis}-{sequence}")
}

#[tauri::command]
fn machine_launch(
    app: AppHandle,
    registry: State<'_, Arc<JobRegistry>>,
    request: MachineRequest,
) -> Result<String, String> {
    if !matches!(
        &request,
        MachineRequest::Start { .. }
            | MachineRequest::Resume { .. }
            | MachineRequest::Benchmark { .. }
    ) {
        return Err("this operation must use machine_query".to_string());
    }

    let mut command = configured_process(request, true)?;
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("unable to launch The Machine job: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "job stdout was not piped".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "job stderr was not piped".to_string())?;
    let job_id = new_job_id();
    let shared_child = Arc::new(Mutex::new(child));
    registry
        .jobs
        .lock()
        .map_err(|_| "job registry lock was poisoned".to_string())?
        .insert(job_id.clone(), shared_child.clone());

    emit_reader(app.clone(), job_id.clone(), "stdout", stdout);
    emit_reader(app.clone(), job_id.clone(), "stderr", stderr);

    let monitor_job_id = job_id.clone();
    thread::spawn(move || loop {
        let status = match shared_child.lock() {
            Ok(mut child) => child.try_wait(),
            Err(_) => {
                let _ = app.emit(
                    "machine-job-event",
                    JobEvent {
                        job_id: monitor_job_id.clone(),
                        channel: "status".to_string(),
                        line: "job lock was poisoned".to_string(),
                        exit_code: Some(-1),
                    },
                );
                break;
            }
        };
        match status {
            Ok(Some(status)) => {
                let exit_code = status.code().unwrap_or(-1);
                let _ = app.emit(
                    "machine-job-event",
                    JobEvent {
                        job_id: monitor_job_id.clone(),
                        channel: "status".to_string(),
                        line: format!("job finished with exit code {exit_code}"),
                        exit_code: Some(exit_code),
                    },
                );
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(200)),
            Err(error) => {
                let _ = app.emit(
                    "machine-job-event",
                    JobEvent {
                        job_id: monitor_job_id.clone(),
                        channel: "status".to_string(),
                        line: format!("job wait failed: {error}"),
                        exit_code: Some(-1),
                    },
                );
                break;
            }
        }
    });

    // A detached cleanup watcher avoids holding the Tauri State borrow in the job thread.
    let cleanup_registry = registry.inner().clone();
    let cleanup_job_id = job_id.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(1));
        let finished = cleanup_registry
            .jobs
            .lock()
            .ok()
            .and_then(|jobs| jobs.get(&cleanup_job_id).cloned())
            .and_then(|child| {
                child
                    .lock()
                    .ok()
                    .and_then(|mut child| child.try_wait().ok().flatten())
            })
            .is_some();
        if finished {
            if let Ok(mut jobs) = cleanup_registry.jobs.lock() {
                jobs.remove(&cleanup_job_id);
            }
            break;
        }
    });

    Ok(job_id)
}

#[tauri::command]
fn machine_cancel_job(registry: State<'_, Arc<JobRegistry>>, job_id: String) -> Result<(), String> {
    let child = registry
        .jobs
        .lock()
        .map_err(|_| "job registry lock was poisoned".to_string())?
        .get(&job_id)
        .cloned()
        .ok_or_else(|| format!("job not found: {job_id}"))?;
    let result = {
        let mut locked_child = child
            .lock()
            .map_err(|_| "job lock was poisoned".to_string())?;
        locked_child
            .kill()
            .map_err(|error| format!("unable to terminate job: {error}"))
    };
    result
}

pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(JobRegistry::default()))
        .invoke_handler(tauri::generate_handler![
            machine_query,
            machine_launch,
            machine_cancel_job
        ])
        .run(tauri::generate_context!())
        .expect("error while running The Machine desktop application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_arguments_are_structured() {
        let args = request_args(
            MachineRequest::Snapshot {
                run_id: "run-1".to_string(),
                repository: "/tmp/repository".to_string(),
                after_sequence: Some(7),
            },
            true,
        )
        .expect("snapshot arguments");
        assert_eq!(
            args,
            vec!["--json", "snapshot", "run-1", "/tmp/repository", "7"]
        );
    }

    #[test]
    fn invalid_approval_phase_is_rejected() {
        let result = request_args(
            MachineRequest::Approve {
                run_id: "run-1".to_string(),
                task_id: "task-1".to_string(),
                phase: "everything".to_string(),
                repository: "/tmp/repository".to_string(),
                note: "approve".to_string(),
            },
            true,
        );
        assert!(result.is_err());
    }
}
