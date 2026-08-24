#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(executable, ["exec", "vitest", "run", "--project", "unit"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    MACHINE_ALLOW_TRUSTED_PLUGIN_SUBPROCESS: "1",
  },
  shell: false,
  windowsHide: true,
  stdio: "inherit",
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
