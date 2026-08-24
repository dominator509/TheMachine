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
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const options = parseOptions(process.argv.slice(2));
const source = resolve(options.source ?? "apps/desktop/src-tauri/target/release/bundle");
const output = resolve(options.output ?? "artifacts/native");
const platform = sanitize(options.platform ?? process.env.RUNNER_OS ?? process.platform);
const arch = sanitize(options.arch ?? process.env.RUNNER_ARCH ?? process.arch);
const candidateSha = options.candidate ?? process.env.GITHUB_SHA ?? gitHead();
const version = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version;

if (!existsSync(source)) {
  console.error(`Native bundle directory does not exist: ${source}`);
  process.exit(1);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true, mode: 0o700 });
const targetRoot = join(output, `${platform}-${arch}`);
mkdirSync(targetRoot, { recursive: true, mode: 0o700 });

const artifacts = [];
for (const sourcePath of walk(source)) {
  const sourceRelative = relative(source, sourcePath).replaceAll("\\", "/");
  const destination = resolve(targetRoot, sourceRelative);
  const containment = relative(targetRoot, destination);
  if (containment.startsWith("..") || containment.includes("../")) {
    throw new Error(`Native artifact escapes target root: ${sourceRelative}`);
  }
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(sourcePath, destination);
  const contents = readFileSync(destination);
  artifacts.push({
    path: relative(output, destination).replaceAll("\\", "/"),
    sha256: createHash("sha256").update(contents).digest("hex"),
    sizeBytes: contents.length,
  });
}

artifacts.sort((left, right) => left.path.localeCompare(right.path));
if (artifacts.length === 0) {
  console.error(`No installer artifacts were found under ${source}`);
  process.exit(1);
}

const manifest = {
  schemaVersion: 1,
  version,
  candidateSha,
  platform,
  arch,
  generatedAt: new Date().toISOString(),
  artifacts,
};
writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
console.log(`Collected ${String(artifacts.length)} native artifacts for ${platform}-${arch}.`);

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

function sanitize(value) {
  const sanitized = String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!sanitized) throw new Error(`Invalid artifact segment: ${String(value)}`);
  return sanitized;
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Native artifact collection refuses symbolic links: ${path}`);
    }
    if (metadata.isDirectory()) {
      yield* walk(path);
    } else if (metadata.isFile() && statSync(path).size > 0) {
      yield path;
    }
  }
}

function gitHead() {
  const headPath = resolve(ROOT, ".git/HEAD");
  if (!existsSync(headPath)) return "unknown";
  const head = readFileSync(headPath, "utf8").trim();
  if (!head.startsWith("ref: ")) return head;
  const refPath = resolve(ROOT, ".git", head.slice(5));
  return existsSync(refPath) ? readFileSync(refPath, "utf8").trim() : basename(head.slice(5));
}
