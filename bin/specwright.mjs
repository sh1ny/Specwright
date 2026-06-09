#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const cliPath = resolve(repoRoot, "src/cli.ts");

const result = spawnSync("bun", [cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error("Specwright requires Bun on PATH because the initial OMP runtime uses Bun.");
    process.exit(1);
  }
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
