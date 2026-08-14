#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const workspace = resolve(process.argv[2] ?? process.cwd());
const taskId = process.argv[3] ?? "";

function safeWrite(relativePath, contents) {
  const destination = resolve(workspace, relativePath);
  const rel = relative(workspace, destination);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Benchmark fixture worker path escaped workspace: ${relativePath}`);
  }
  writeFileSync(destination, contents, "utf-8");
}

switch (taskId) {
  case "fix-addition":
    safeWrite(
      "src/math.mjs",
      "export function add(a, b) {\n  return a + b;\n}\n",
    );
    break;
  case "normalize-greeting":
    safeWrite(
      "src/greeting.mjs",
      [
        "export function normalizeGreeting(value) {",
        "  const normalized = String(value).trim().replace(/\\s+/g, \" \" ).replace(/!+$/g, \"\");",
        "  if (normalized.length === 0) return \"!\";",
        "  return `${normalized[0].toUpperCase()}${normalized.slice(1)}!`;",
        "}",
        "",
      ].join("\n"),
    );
    break;
  default:
    throw new Error(`Unknown benchmark fixture task: ${taskId}`);
}

console.log(JSON.stringify({ type: "fixture.completed", taskId, workspace }));
