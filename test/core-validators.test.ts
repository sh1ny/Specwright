import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSpecwrightCommand } from "../src/core/commands";
import { defaultConfig, findCurrentChange, upsertChange } from "../src/core/state";
import { hasObservedOutput, validateChange, validateSpecwrightConfig } from "../src/core/validators";

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

test("validators report unreconciled malformed and duplicate task drift", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-validators-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  let change = await findCurrentChange(cwd);
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "# Tasks\n\n- [ ] T001: First\n- [x] T001: Duplicate\n- [maybe] T002: Malformed\n",
    "utf8",
  );
  change = { ...change, step: "execute", status: "executing", updatedAt: "2026-06-08T00:00:00.000Z" };
  await upsertChange(cwd, change);

  const report = await validateChange(cwd, change);
  const driftMessages = report.issues.filter((issue) => issue.code === "SW009").map((issue) => issue.message);
  expect(driftMessages).toContain("Unreconciled task drift: Duplicate task id T001 on line 4.");
  expect(driftMessages).toContain("Unreconciled task drift: Malformed task checklist line 5. Expected \"- [ ] T001: Title\".");
});

test("validators report unreconciled cached task drift", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-validators-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  let change = await findCurrentChange(cwd);
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "# Tasks\n\n- [ ] T001: Renamed task\n  - Acceptance: Works.\n  - Verification: Run test.\n",
    "utf8",
  );
  change = {
    ...change,
    step: "execute",
    status: "executing",
    updatedAt: "2026-06-08T00:00:00.000Z",
    tasks: {
      T001: { id: "T001", title: "Original task", status: "pending", updatedAt: "old" },
      T002: { id: "T002", title: "Cached only", status: "pending", updatedAt: "old" },
    },
  };
  await upsertChange(cwd, change);

  const report = await validateChange(cwd, change);
  const driftMessages = report.issues.filter((issue) => issue.code === "SW009").map((issue) => issue.message);
  expect(driftMessages).toContain("Unreconciled task drift: Task T001 title changed from \"Original task\" to \"Renamed task\".");
  expect(driftMessages).toContain("Unreconciled task drift: Cached task T002 has no matching tasks.md artifact.");
});

test("validators report missing task artifacts at execute or later", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-validators-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  let change = await findCurrentChange(cwd);
  await rm(join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"));
  change = {
    ...change,
    step: "execute",
    status: "executing",
    updatedAt: "2026-06-08T00:00:00.000Z",
    tasks: {
      T001: { id: "T001", title: "Cached only", status: "pending", updatedAt: "old" },
    },
  };
  await upsertChange(cwd, change);

  const report = await validateChange(cwd, change);
  const driftMessages = report.issues.filter((issue) => issue.code === "SW009").map((issue) => issue.message);
  expect(driftMessages).toContain("Unreconciled task drift: tasks.md is missing at execute or later step.");
  expect(driftMessages).toContain("Unreconciled task drift: Cached task T001 exists but tasks.md is missing.");
});

test("validators do not report safe task drift that sync can reconcile", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-validators-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  let change = await findCurrentChange(cwd);
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "# Tasks\n\n- [x] T001: Build inventory\n  - Acceptance: Works.\n  - Verification: Run test.\n",
    "utf8",
  );
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/verify.md"),
    "# Verify\n\n## Observed output\n\nbun test passed\n",
    "utf8",
  );
  change = {
    ...change,
    step: "execute",
    status: "executing",
    updatedAt: "2026-06-08T00:00:00.000Z",
    tasks: {
      T001: { id: "T001", title: "Build inventory", status: "pending", updatedAt: "old" },
    },
  };
  await upsertChange(cwd, change);

  const report = await validateChange(cwd, change);
  expect(report.issues.some((issue) => issue.code === "SW009")).toBe(false);
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

test("hasObservedOutput requires content under the observed output heading", () => {
  expect(hasObservedOutput("# Verification\n\n## Observed output\n\n")).toBe(false);
  expect(hasObservedOutput("# Verification\n\n## Observed output\n\n```\n$ bun test\nPASS\n```\n")).toBe(true);
  expect(hasObservedOutput("# Verification\n\nObserved command output: bun test passed.\n")).toBe(true);
});
