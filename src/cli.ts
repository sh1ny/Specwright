#!/usr/bin/env bun
import { runSpecwrightCommand, renderHelp } from "./core/commands";

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("--help")) {
  console.log(renderHelp());
  process.exit(0);
}

const result = await runSpecwrightCommand(
  { cwd: process.cwd(), runtime: "cli", now: () => new Date() },
  argv,
);

const output = result.summary;
if (result.ok) {
  console.log(output);
} else {
  console.error(output);
}

if (result.prompt && argv.includes("--print-prompt")) {
  console.log(result.prompt);
}

process.exit(result.exitCode);
