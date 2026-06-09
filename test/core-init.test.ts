import { test, expect } from "bun:test";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSpecwrightCommand } from "../src/core/commands";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("init creates Specwright and OMP layout", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-init-"));
  const result = await runSpecwrightCommand({ cwd, runtime: "cli", now: () => new Date("2026-06-08T00:00:00.000Z") }, ["init"]);

  expect(result.ok).toBe(true);
  await expect(pathExists(join(cwd, ".specwright/config.json"))).resolves.toBe(true);
  await expect(pathExists(join(cwd, ".specwright/state.json"))).resolves.toBe(true);
  await expect(pathExists(join(cwd, ".specwright/packs/core/pack.json"))).resolves.toBe(true);
  await expect(pathExists(join(cwd, ".omp/extensions/specwright/package.json"))).resolves.toBe(true);
  await expect(pathExists(join(cwd, ".omp/agents/specwright-researcher.md"))).resolves.toBe(true);
});
