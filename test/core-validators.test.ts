import { test, expect } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSpecwrightCommand } from "../src/core/commands";
import { defaultConfig, findCurrentChange, upsertChange } from "../src/core/state";
import { validateChange, validateSpecwrightConfig } from "../src/core/validators";

test("validators reject duplicate task IDs", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-validators-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  let change = await findCurrentChange(cwd);
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"), "# Tasks\n\n- [ ] T001: First\n- [ ] T001: Duplicate\n", "utf8");
  change = { ...change, step: "execute", status: "executing", updatedAt: "2026-06-08T00:00:00.000Z" };
  await upsertChange(cwd, change);

  const report = await validateChange(cwd, change);
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "error", code: "SW004" }));
});

test("validators accept workflow config defaults and reject unsafe git values", () => {
  const config = defaultConfig("Specwright");

  expect(() => validateSpecwrightConfig(config)).not.toThrow();
  expect(config.workflow.autoCommit).toBe(true);
  expect(config.workflow.publishMode).toBe("none");
  expect(config.workflow.baseBranch).toBeUndefined();
  expect(config.workflow.remote).toBe("origin");

  expect(() => validateSpecwrightConfig({ ...config, workflow: { ...config.workflow, publishMode: "maybe" as "none" } })).toThrow(
    "Invalid workflow.publishMode",
  );
  expect(() => validateSpecwrightConfig({ ...config, workflow: { ...config.workflow, remote: "bad remote" } })).toThrow(
    "Invalid workflow.remote",
  );
});
