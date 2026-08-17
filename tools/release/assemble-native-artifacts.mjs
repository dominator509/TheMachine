#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const options = parseOptions(process.argv.slice(2));
const input = resolve(options.input ?? "native-downloads");
const releaseRoot = resolve(options.output ?? "release");
const nativeRoot = join(releaseRoot, "native");
const expectedCandidate = options.candidate ?? process.env.GITHUB_SHA ?? "unknown";
const expectedVersion = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version;
const requiredPlatforms = String(
  options.platforms ?? process.env.MACHINE_REQUIRED_NATIVE_PLATFORMS ?? "linux,windows,macos",
)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (!existsSync(input)) {
  console.error(`Native download root does not exist: ${input}`);
  process.exit(1);
}

const manifests = findManifests(input);
if (manifests.length === 0) {
  console.error(`No native artifact manifests were found under ${input}`);
  process.exit(1);
}

rmSync(nativeRoot, { recursive: true, force: true });
mkdirSync(nativeRoot, { recursive: true, mode: 0o700 });
const assembled = [];
const platforms = new Set();

for (const manifestPath of manifests) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `Native manifest version mismatch in ${manifestPath}: ${String(manifest.version)} != ${expectedVersion}`,
    );
  }
  if (manifest.candidateSha !== expectedCandidate) {
    throw new Error(
      `Native manifest candidate mismatch in ${manifestPath}: ${String(manifest.candidateSha)} != ${expectedCandidate}`,
    );
  }
  if (typeof manifest.platform !== "string" || typeof manifest.arch !== "string") {
    throw new Error(`Native manifest omits platform or architecture: ${manifestPath}`);
  }
  platforms.add(manifest.platform.toLowerCase());
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  if (artifacts.length === 0) throw new Error(`Native manifest has no artifacts: ${manifestPath}`);

  for (const artifact of artifacts) {
    const declaredPath = typeof artifact?.path === "string" ? artifact.path : "";
    const expectedDigest = typeof artifact?.sha256 === "string" ? artifact.sha256 : "";
    if (!declaredPath || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
      throw new Error(`Malformed native artifact entry in ${manifestPath}`);
    }
    const sourcePath = resolve(dirname(manifestPath), declaredPath);
    const sourceContainment = relative(dirname(manifestPath), sourcePath);
    if (sourceContainment.startsWith("..") || lstatSync(sourcePath).isSymbolicLink()) {
      throw new Error(`Unsafe native artifact path: ${declaredPath}`);
    }
    const contents = readFileSync(sourcePath);
    const actualDigest = sha256(contents);
    if (actualDigest !== expectedDigest) {
      throw new Error(`Native artifact digest mismatch: ${sourcePath}`);
    }

    const destination = resolve(nativeRoot, declaredPath);
    const destinationContainment = relative(nativeRoot, destination);
    if (destinationContainment.startsWith("..")) {
      throw new Error(`Native artifact escapes release root: ${declaredPath}`);
    }
    if (existsSync(destination)) throw new Error(`Duplicate native artifact path: ${declaredPath}`);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    copyFileSync(sourcePath, destination);
    assembled.push({
      path: `native/${declaredPath.replaceAll("\\", "/")}`,
      sha256: actualDigest,
      sizeBytes: contents.length,
      platform: manifest.platform,
      arch: manifest.arch,
    });
  }
}

const missingPlatforms = requiredPlatforms.filter((platform) => !platforms.has(platform));
if (missingPlatforms.length > 0) {
  throw new Error(`Missing required native platforms: ${missingPlatforms.join(", ")}`);
}

assembled.sort((left, right) => left.path.localeCompare(right.path));
const outputManifest = {
  schemaVersion: 1,
  version: expectedVersion,
  candidateSha: expectedCandidate,
  generatedAt: new Date().toISOString(),
  platforms: Array.from(platforms).sort(),
  artifacts: assembled,
};
writeFileSync(join(releaseRoot, "native-artifacts.json"), `${JSON.stringify(outputManifest, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
console.log(`Assembled ${String(assembled.length)} verified native artifacts.`);

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function parseOptions(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith("--")) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    parsed[key.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function findManifests(directory) {
  const results = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Native download tree contains a symlink: ${path}`);
    if (entry.isDirectory()) results.push(...findManifests(path));
    else if (entry.isFile() && entry.name === "manifest.json") results.push(path);
  }
  return results.sort();
}
