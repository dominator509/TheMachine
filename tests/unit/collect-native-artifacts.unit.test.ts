import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "../../tools/release/collect-native-artifacts.mjs");

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "machine-bundle-"));
  const source = join(root, "bundle");
  const output = join(root, "out");
  mkdirSync(join(source, "deb"), { recursive: true });
  writeFileSync(join(source, "deb", "The Machine_0.3.0_amd64.deb"), "deb-bytes");
  mkdirSync(join(source, "appimage", "The Machine.AppDir"), { recursive: true });
  writeFileSync(join(source, "appimage", "The Machine_0.3.0_amd64.AppImage"), "appimage-bytes");
  writeFileSync(join(source, "appimage", "The Machine.AppDir", "the-machine.png"), "png-bytes");
  // linuxdeploy leaves symlinks (e.g. .DirIcon) inside the staging AppDir.
  symlinkSync(
    join(source, "appimage", "The Machine.AppDir", "the-machine.png"),
    join(source, "appimage", "The Machine.AppDir", ".DirIcon"),
  );
  return { root, source, output };
}

function runCollector(source: string, output: string) {
  return execFileSync(
    process.execPath,
    [
      SCRIPT,
      "--source",
      source,
      "--output",
      output,
      "--platform",
      "Linux",
      "--arch",
      "X64",
      "--candidate",
      "test-sha",
    ],
    { encoding: "utf8" },
  );
}

describe("collect-native-artifacts", () => {
  it("skips AppImage .AppDir staging directories instead of failing on their symlinks", () => {
    const { root, source, output } = makeFixture();
    try {
      runCollector(source, output);
      const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
      const paths = manifest.artifacts.map((artifact: { path: string }) => artifact.path);
      expect(paths).toHaveLength(2);
      expect(paths.some((p: string) => p.endsWith(".deb"))).toBe(true);
      expect(paths.some((p: string) => p.endsWith(".AppImage"))).toBe(true);
      expect(paths.some((p: string) => p.includes(".AppDir"))).toBe(false);
      for (const artifact of manifest.artifacts) {
        expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still refuses symlinks outside AppImage staging directories", () => {
    const { root, source, output } = makeFixture();
    symlinkSync(join(source, "deb", "The Machine_0.3.0_amd64.deb"), join(source, "rogue-link"));
    try {
      expect(() => runCollector(source, output)).toThrow(/refuses symbolic links/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
