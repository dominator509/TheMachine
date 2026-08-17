#!/usr/bin/env node
// Build the installable CLI release artifact and evidence metadata.
// Native desktop installers are built separately by the OS matrix and are never represented by a JS shim.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELEASE_DIR = process.env.MACHINE_RELEASE_DIR
  ? join(ROOT, process.env.MACHINE_RELEASE_DIR)
  : join(ROOT, "release");
const STAGING_DIR = join(RELEASE_DIR, ".staging", "cli");
const PNPM = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const ROOT_PACKAGE = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const STORAGE_PACKAGE = JSON.parse(
  readFileSync(join(ROOT, "packages", "storage", "package.json"), "utf-8"),
);
const version = String(ROOT_PACKAGE.version ?? "0.0.0");

function command(executable, args, options = {}) {
  execFileSync(executable, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...options.env },
  });
}

function capture(executable, args) {
  return execFileSync(executable, args, {
    cwd: ROOT,
    encoding: "utf-8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function deterministicUuid(seed) {
  const bytes = Buffer.from(createHash("sha256").update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function artifact(relativePath, type) {
  const absolutePath = join(RELEASE_DIR, relativePath);
  return {
    path: relativePath.replaceAll("\\", "/"),
    type,
    sizeBytes: statSync(absolutePath).size,
    sha256: sha256(absolutePath),
  };
}

function assertSourceClean() {
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=no"], {
    cwd: ROOT,
    encoding: "utf-8",
    shell: false,
  });
  if (result.status !== 0) throw new Error(`Unable to inspect source state: ${result.stderr}`);
  if (result.stdout.trim().length > 0) {
    throw new Error("Release build refused because tracked source files are modified.");
  }
}

function setTreeTimestamp(root, seconds) {
  const date = new Date(seconds * 1000);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) setTreeTimestamp(entryPath, seconds);
    utimesSync(entryPath, date, date);
  }
  utimesSync(root, date, date);
}

function bundledComponents(metafile) {
  const components = new Map();
  const pnpmPattern = /node_modules[\\/]\.pnpm[\\/]((?:@[^+]+\+)?[^@\\/]+)@([^\\/]+)[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/;
  for (const input of Object.keys(metafile.inputs ?? {})) {
    const normalized = input.replaceAll("\\", "/");
    const match = pnpmPattern.exec(normalized);
    if (!match) continue;
    const packageName = (match[3] ?? "").replaceAll("\\", "/");
    const packageVersion = decodeURIComponent(match[2] ?? "").split("_")[0] ?? "unknown";
    if (!packageName || !packageVersion) continue;
    components.set(`${packageName}@${packageVersion}`, {
      type: "library",
      name: packageName,
      version: packageVersion,
      purl: `pkg:npm/${packageName.startsWith("@") ? packageName.replace("/", "%2F") : packageName}@${packageVersion}`,
    });
  }
  const betterSqliteVersion = String(
    STORAGE_PACKAGE.dependencies?.["better-sqlite3"] ?? "unknown",
  ).replace(/^[^0-9]*/, "");
  components.set(`better-sqlite3@${betterSqliteVersion}`, {
    type: "library",
    name: "better-sqlite3",
    version: betterSqliteVersion,
    purl: `pkg:npm/better-sqlite3@${betterSqliteVersion}`,
  });
  return [...components.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
}

assertSourceClean();
const candidateSha = capture("git", ["rev-parse", "HEAD"]);
const candidateTree = capture("git", ["rev-parse", "HEAD^{tree}"]);
const commitTimestamp = capture("git", ["show", "-s", "--format=%ct", "HEAD"]);
const createdAt = capture("git", ["show", "-s", "--format=%cI", "HEAD"]);
const sourceDateEpoch = Number(commitTimestamp);
if (!Number.isInteger(sourceDateEpoch) || sourceDateEpoch <= 0) {
  throw new Error(`Invalid source commit timestamp: ${commitTimestamp}`);
}
process.env.SOURCE_DATE_EPOCH = String(sourceDateEpoch);

if (process.argv.includes("--sign")) {
  throw new Error(
    "Release signing is an external trust operation. Build unsigned candidates here, then sign the exact digests in an authorized environment.",
  );
}

rmSync(RELEASE_DIR, { recursive: true, force: true });
mkdirSync(STAGING_DIR, { recursive: true, mode: 0o700 });
console.log(`Building The Machine CLI ${version} from ${candidateSha}...`);
command(PNPM, ["release:versions"]);
command(PNPM, ["build"]);

const machinePath = join(STAGING_DIR, "machine.js");
const metafilePath = join(RELEASE_DIR, "cli-esbuild-metafile.json");
command(PNPM, [
  "exec",
  "esbuild",
  "apps/cli/src/index.ts",
  "--bundle",
  "--platform=node",
  "--target=node22",
  "--format=esm",
  `--outfile=${machinePath}`,
  `--metafile=${metafilePath}`,
  "--external:better-sqlite3",
  "--legal-comments=external",
  "--log-level=info",
]);
chmodSync(machinePath, 0o755);

const packageJson = {
  name: "@the-machine/cli",
  version,
  description: ROOT_PACKAGE.description,
  license: "MIT",
  type: "module",
  bin: { machine: "machine.js" },
  files: ["machine.js", "README.md", "LICENSE"],
  engines: { node: ">=22.13.0" },
  dependencies: {
    "better-sqlite3": STORAGE_PACKAGE.dependencies["better-sqlite3"],
  },
};
writeFileSync(join(STAGING_DIR, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
cpSync(join(ROOT, "README.md"), join(STAGING_DIR, "README.md"));
cpSync(join(ROOT, "LICENSE"), join(STAGING_DIR, "LICENSE"));
setTreeTimestamp(STAGING_DIR, sourceDateEpoch);

const packOutput = capture(NPM, [
  "pack",
  STAGING_DIR,
  "--pack-destination",
  RELEASE_DIR,
  "--ignore-scripts",
  "--json",
]);
const packResult = JSON.parse(packOutput);
const packedFilename = Array.isArray(packResult) ? packResult[0]?.filename : undefined;
if (typeof packedFilename !== "string" || !existsSync(join(RELEASE_DIR, packedFilename))) {
  throw new Error(`npm pack did not produce an artifact: ${packOutput}`);
}

writeFileSync(join(RELEASE_DIR, "version.txt"), `${version}\n`);
const metafile = JSON.parse(readFileSync(metafilePath, "utf-8"));
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${deterministicUuid(`${candidateSha}:${version}:sbom`)}`,
  version: 1,
  metadata: {
    timestamp: createdAt,
    tools: {
      components: [{ type: "application", name: "The Machine release builder", version }],
    },
    component: {
      type: "application",
      name: "@the-machine/cli",
      version,
      purl: `pkg:npm/%40the-machine%2Fcli@${version}`,
      hashes: [{ alg: "SHA-256", content: sha256(join(RELEASE_DIR, packedFilename)) }],
    },
    properties: [
      { name: "the-machine:candidate-sha", value: candidateSha },
      { name: "the-machine:candidate-tree", value: candidateTree },
    ],
  },
  components: bundledComponents(metafile),
};
const sbomPath = join(RELEASE_DIR, "cli.cdx.json");
writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`);

const subjects = [artifact(packedFilename, "npm-tarball"), artifact("cli.cdx.json", "sbom")];
const provenance = {
  _type: "https://in-toto.io/Statement/v1",
  subject: subjects.map((subject) => ({
    name: subject.path,
    digest: { sha256: subject.sha256 },
  })),
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://github.com/dominator509/TheMachine/tools/release/build-release.mjs",
      externalParameters: { version, candidateSha, candidateTree },
      internalParameters: { sourceDateEpoch },
      resolvedDependencies: [
        {
          uri: `git+https://github.com/dominator509/TheMachine@${candidateSha}`,
          digest: { gitCommit: candidateSha },
        },
      ],
    },
    runDetails: {
      builder: { id: "the-machine-local-release-builder" },
      metadata: {
        invocationId: `urn:uuid:${deterministicUuid(`${candidateSha}:${version}:provenance`)}`,
        startedOn: createdAt,
        finishedOn: createdAt,
      },
    },
  },
  unsigned: true,
  warning: "Metadata only; this file is not a signed SLSA attestation.",
};
const provenancePath = join(RELEASE_DIR, "provenance.unsigned.json");
writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

const payloadArtifacts = [
  artifact(packedFilename, "npm-tarball"),
  artifact("cli.cdx.json", "sbom"),
  artifact("provenance.unsigned.json", "unsigned-provenance-metadata"),
  artifact("cli-esbuild-metafile.json", "build-metafile"),
  artifact("version.txt", "version-marker"),
];
const releaseManifest = {
  schemaVersion: 1,
  product: "The Machine",
  version,
  candidateSha,
  candidateTree,
  sourceDateEpoch,
  createdAt,
  nodeVersion: process.version,
  platform: process.platform,
  architecture: process.arch,
  artifacts: payloadArtifacts,
  nativeDesktop: {
    status: "built-by-os-matrix",
    requiredManifest: "native-artifacts.json",
    javascriptSubstituteAllowed: false,
  },
  signing: {
    status: "unsigned",
    externalGateRequired: true,
  },
};
const manifestPath = join(RELEASE_DIR, "release-manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`);

const checksumArtifacts = [
  ...payloadArtifacts,
  artifact("release-manifest.json", "release-manifest"),
].sort((left, right) => left.path.localeCompare(right.path));
writeFileSync(
  join(RELEASE_DIR, "checksums.sha256"),
  `${checksumArtifacts.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n")}\n`,
);
setTreeTimestamp(RELEASE_DIR, sourceDateEpoch);
rmSync(join(RELEASE_DIR, ".staging"), { recursive: true, force: true });

console.log(`Release artifact: ${relative(ROOT, join(RELEASE_DIR, packedFilename))}`);
console.log(`Release manifest: ${relative(ROOT, manifestPath)}`);
console.log("Native installers are intentionally absent from this local CLI build.");
console.log("build: ok");
