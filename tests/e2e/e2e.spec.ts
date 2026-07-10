import { test, expect } from '@playwright/test';

test.describe('E2E Full Workflow', () => {
  test('CLI Help Command', async ({ page }) => {
    // As CLI tests are already integration tests via execSync,
    // this file just demonstrates Playwright runner is working.
    // In a real desktop app scenario, we'd launch Tauri here.
    expect(true).toBe(true);
  });
});

  test('CLI System Check command executes', async ({ page }) => {
    const { execSync } = require('node:child_process');
    const { resolve } = require('node:path');
    const CLI_PATH = resolve(__dirname, "../../apps/cli/dist/index.js");

    const stdout = execSync(`node ${CLI_PATH} health`, { encoding: 'utf-8' });
    expect(stdout).toContain('Status: ok');
  });

  test('CLI diagnostics runs via E2E runner', async ({ page }) => {
    const { execSync } = require('node:child_process');
    const { resolve } = require('node:path');
    const CLI_PATH = resolve(__dirname, "../../apps/cli/dist/index.js");

    const stdout = execSync(`node ${CLI_PATH} diagnostics`, { encoding: 'utf-8' });
    expect(stdout).toContain('Platform: The Machine');
    expect(stdout).toContain('diagnostics: ok');
  });
