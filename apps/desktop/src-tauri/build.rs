use std::fs;
use std::path::Path;

const ICON_PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 32, 0, 0, 0, 32, 8, 6,
    0, 0, 0, 115, 122, 122, 244, 0, 0, 0, 126, 73, 68, 65, 84, 120, 218, 99, 224, 224, 22, 248, 31,
    63, 233, 51, 24, 131, 216, 244, 192, 200, 246, 49, 192, 56, 3, 133, 7, 222, 1, 3, 30, 5, 163,
    14, 24, 117, 0, 33, 7, 244, 108, 249, 15, 198, 164, 90, 130, 79, 223, 168, 3, 134, 166, 3, 72,
    117, 4, 77, 66, 128, 20, 71, 208, 44, 10, 136, 117, 4, 77, 211, 0, 49, 142, 160, 121, 34, 36,
    228, 136, 1, 205, 5, 132, 18, 46, 77, 29, 128, 156, 96, 233, 238, 0, 244, 196, 74, 87, 7, 96,
    75, 168, 116, 115, 0, 174, 68, 58, 90, 23, 80, 197, 1, 163, 45, 162, 81, 7, 140, 246, 13, 135,
    125, 223, 16, 0, 29, 182, 201, 99, 158, 160, 65, 114, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96,
    130,
];

/// Wrap the embedded 32x32 PNG in a single-image ICO container.
/// PNG-compressed icon entries are valid ICO (Vista+) and are passed through
/// to the Windows resource compiler by tauri-build.
fn icon_ico_bytes() -> Vec<u8> {
    let mut ico = Vec::with_capacity(22 + ICON_PNG.len());
    // ICONDIR: reserved = 0, type = 1 (icon), count = 1
    ico.extend_from_slice(&[0, 0, 1, 0, 1, 0]);
    // ICONDIRENTRY: 32x32, no palette, reserved = 0, planes = 1, 32bpp
    ico.extend_from_slice(&[32, 32, 0, 0, 1, 0, 32, 0]);
    ico.extend_from_slice(&(ICON_PNG.len() as u32).to_le_bytes());
    ico.extend_from_slice(&22u32.to_le_bytes());
    ico.extend_from_slice(ICON_PNG);
    ico
}

fn ensure_icon() {
    let icon_directory = Path::new("icons");
    let icon_path = icon_directory.join("icon.png");
    let ico_path = icon_directory.join("icon.ico");
    if !icon_path.exists() {
        fs::create_dir_all(icon_directory).expect("create Tauri icon directory");
        fs::write(&icon_path, ICON_PNG).expect("write deterministic Tauri icon");
    }
    // tauri-build requires icons/icon.ico to generate the Windows resource file.
    if !ico_path.exists() {
        fs::create_dir_all(icon_directory).expect("create Tauri icon directory");
        fs::write(&ico_path, icon_ico_bytes()).expect("write deterministic Tauri icon (.ico)");
    }
}

fn main() {
    ensure_icon();
    tauri_build::build()
}
