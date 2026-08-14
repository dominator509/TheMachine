#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const workspace = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
const outputPath = resolve(workspace, "demo-output.txt");
if (!outputPath.startsWith(`${workspace}/`) && outputPath !== `${workspace}\\demo-output.txt`) {
  throw new Error("Output path escaped the supplied workspace.");
}
writeFileSync(
  outputPath,
  "The Machine executed a worker in an isolated Git worktree.\n",
  "utf-8",
);
console.log(`Created ${outputPath}`);
