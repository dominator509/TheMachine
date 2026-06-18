// The Machine — Tauri v2 Desktop Application
// Loads the existing TypeScript CLI as a Tauri command.

use tauri::{Manager, State};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Serialize, Deserialize)]
pub struct CliResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Invokes the Machine CLI from within the Tauri app.
/// The CLI binary is expected to be bundled alongside the desktop app.
#[tauri::command]
fn run_cli(args: Vec<String>) -> CliResult {
    let output = Command::new("machine")
        .args(&args)
        .output()
        .unwrap_or_else(|e| {
            // If the machine binary isn't found, return a friendly error
            use std::process::Output;
            Output {
                stdout: Vec::new(),
                stderr: format!("machine binary not found: {e}").into_bytes(),
                status: std::process::ExitStatus::from_raw(1),
            }
        });

    CliResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! Welcome to The Machine.")
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![run_cli, greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
