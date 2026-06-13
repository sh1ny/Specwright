import { test, expect } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodebaseIndex } from "../src/core/codebase-index";
import { runSpecwrightCommand } from "../src/core/commands";
import { defaultConfig, findCurrentChange, upsertChange } from "../src/core/state";
import { hasObservedOutput, validateChange, validateCodebaseIndex, validateSpecwrightConfig } from "../src/core/validators";

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

test("validateCodebaseIndex accepts a valid version-1 index", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-valid-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(join(cwd, "src", "entry.ts"), "export default 1;\n", "utf8");
  await writeFile(join(cwd, "src", "module.ts"), "export const m = 1;\n", "utf8");
  await writeFile(join(cwd, "test", "module.test.ts"), "import { test } from 'bun:test';\n", "utf8");

  const report = await validateCodebaseIndex(cwd, {
    version: 1,
    generatedAt: new Date().toISOString(),
    entrypoints: [{ path: "src/entry.ts", kind: "cli" }],
    modules: [{ path: "src/module.ts", kind: "core", tests: ["test/module.test.ts"] }],
    commands: [{ name: "scan" }],
    verification: [{ command: "bun test" }],
    risks: [{ area: "runtime" }],
  });

  expect(report.ok).toBe(true);
  expect(report.issues).toEqual([]);
  await rm(cwd, { recursive: true, force: true });
});

test("validateCodebaseIndex reports invalid version and shape errors", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-shape-"));
  const report = await validateCodebaseIndex(cwd, {
    version: 2,
    modules: "not-an-array",
  });

  expect(report.ok).toBe(false);
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "error", code: "SW101" }));
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "error", code: "SW103", message: expect.stringContaining("modules") }));
  await rm(cwd, { recursive: true, force: true });
});

test("validateCodebaseIndex reports unsafe and absolute paths", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-paths-"));
  await mkdir(join(cwd, "safe"), { recursive: true });
  await writeFile(join(cwd, "safe", "test.ts"), "", "utf8");
  const report = await validateCodebaseIndex(cwd, {
    version: 1,
    entrypoints: [],
    modules: [{ path: "/absolute/module.ts", tests: ["../escape.test.ts", "safe/test.ts"] }, { path: "C:\\Users\\me\\secret.ts" }, { path: "C:/Users/me/secret.ts" }],
    commands: [],
    verification: [],
    risks: [],
  });

  expect(report.ok).toBe(false);
  const messages = report.issues.map((issue) => issue.message);
  expect(messages).toContainEqual(expect.stringContaining("/absolute/module.ts"));
  expect(messages).toContainEqual(expect.stringContaining("../escape.test.ts"));
  expect(messages).toContainEqual(expect.stringContaining("C:\\Users\\me\\secret.ts"));
  expect(messages).toContainEqual(expect.stringContaining("C:/Users/me/secret.ts"));
  expect(messages).not.toContainEqual(expect.stringContaining("safe/test.ts"));
  await rm(cwd, { recursive: true, force: true });
});

test("validateCodebaseIndex reports missing required fields", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-fields-"));
  const report = await validateCodebaseIndex(cwd, {
    version: 1,
    entrypoints: [{}],
    modules: [{ path: "src/module.ts" }],
    commands: [{}],
    verification: [{}],
    risks: [{}],
  });

  expect(report.ok).toBe(false);
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "error", code: "SW104", message: expect.stringContaining("entrypoints[0]") }));
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "error", code: "SW104", message: expect.stringContaining("commands[0]") }));
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "error", code: "SW104", message: expect.stringContaining("verification[0]") }));
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "error", code: "SW104", message: expect.stringContaining("risks[0]") }));
  await rm(cwd, { recursive: true, force: true });
});
test("validateCodebaseIndex reports non-string optional semantic fields", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-optional-fields-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "entry.ts"), "export default 1;\n", "utf8");
  await writeFile(join(cwd, "src", "module.ts"), "export const m = 1;\n", "utf8");

  const report = await validateCodebaseIndex(cwd, {
    version: 1,
    entrypoints: [{ path: "src/entry.ts", kind: 123, summary: false }],
    modules: [{ path: "src/module.ts", kind: [], summary: {} }],
    commands: [{ name: "test", summary: 123 }],
    verification: [{ command: "bun test", purpose: false }],
    risks: [{ area: "custom risk", summary: 123 }],
    fingerprints: {},
  });

  expect(report.ok).toBe(false);
  const messages = report.issues.filter((issue) => issue.code === "SW104").map((issue) => issue.message);
  expect(messages).toContain("entrypoints[0] field kind must be a string.");
  expect(messages).toContain("entrypoints[0] field summary must be a string.");
  expect(messages).toContain("modules[0] field kind must be a string.");
  expect(messages).toContain("modules[0] field summary must be a string.");
  expect(messages).toContain("commands[0] field summary must be a string.");
  expect(messages).toContain("verification[0] field purpose must be a string.");
  expect(messages).toContain("risks[0] field summary must be a string.");
  await rm(cwd, { recursive: true, force: true });
});


test("validateCodebaseIndex warns when listed paths do not exist", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-missing-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "exists.ts"), "", "utf8");

  const report = await validateCodebaseIndex(cwd, {
    version: 1,
    entrypoints: [{ path: "src/missing.ts" }],
    modules: [{ path: "src/exists.ts", tests: ["test/missing.test.ts"] }],
    commands: [],
    verification: [],
    risks: [],
  });

  expect(report.ok).toBe(true);
  const warnings = report.issues.filter((issue) => issue.level === "warning");
  expect(warnings).toContainEqual(expect.objectContaining({ code: "SW106", message: expect.stringContaining("src/missing.ts") }));
  expect(warnings).toContainEqual(expect.objectContaining({ code: "SW106", message: expect.stringContaining("test/missing.test.ts") }));
  await rm(cwd, { recursive: true, force: true });
});

test("validateCodebaseIndex warns when listed path is a directory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-directory-"));
  await mkdir(join(cwd, "src", "dir"), { recursive: true });

  const report = await validateCodebaseIndex(cwd, {
    version: 1,
    entrypoints: [],
    modules: [{ path: "src/dir" }],
    commands: [],
    verification: [],
    risks: [],
  });

  expect(report.ok).toBe(true);
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "warning", code: "SW106", message: expect.stringContaining("non-file path: src/dir") }));
  await rm(cwd, { recursive: true, force: true });
});

test("validateCodebaseIndex treats ENOTDIR as a missing indexed path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-enotdir-"));
  await writeFile(join(cwd, "src"), "", "utf8");

  const report = await validateCodebaseIndex(cwd, {
    version: 1,
    entrypoints: [{ path: "src/missing.ts" }],
    modules: [],
    commands: [],
    verification: [],
    risks: [],
  });

  expect(report.ok).toBe(true);
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "warning", code: "SW106", message: expect.stringContaining("src/missing.ts") }));
  await rm(cwd, { recursive: true, force: true });
});

test("validateCodebaseIndex rejects control-character paths without statting them", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-control-path-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "module.ts"), "", "utf8");

  const report = await validateCodebaseIndex(cwd, {
    version: 1,
    entrypoints: [{ path: "src/\u0000secret.ts" }],
    modules: [{ path: "src/module.ts", tests: ["test/\u0000module.test.ts"] }],
    commands: [],
    verification: [],
    risks: [],
  });

  expect(report.ok).toBe(false);
  expect(report.issues.filter((issue) => issue.level === "error" && issue.code === "SW105").length).toBeGreaterThanOrEqual(2);
  await rm(cwd, { recursive: true, force: true });
});

test("validateCodebaseIndex rejects malformed fingerprints", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-fingerprints-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "module.ts"), "", "utf8");

  const report = await validateCodebaseIndex(cwd, {
    version: 1,
    entrypoints: [],
    modules: [{ path: "src/module.ts" }],
    commands: [],
    verification: [],
    risks: [],
    fingerprints: {
      "src/module.ts": null,
      "../escape.ts": { mtime: 1, size: 1, checksum: "x" },
      "src/bad.ts": { mtime: "now", size: 1, checksum: "x" },
    },
  });

  expect(report.ok).toBe(false);
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "error", code: "SW109" }));
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "error", code: "SW105", message: expect.stringContaining("../escape.ts") }));
  await rm(cwd, { recursive: true, force: true });
});
test("validateCodebaseIndex treats SW106 missing-file warnings as non-blocking but hard errors as blocking", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-blocking-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "module.ts"), "", "utf8");

  const report = await validateCodebaseIndex(cwd, {
    version: 1,
    entrypoints: [{ path: "src/missing.ts" }],
    modules: [{ path: "src/module.ts" }],
    commands: [],
    verification: [],
    risks: [],
    fingerprints: {
      "src/module.ts": { mtime: "now", size: 1, checksum: "x" } as unknown as NonNullable<CodebaseIndex["fingerprints"]> extends Record<string, infer V> ? V : never,
    },
  });

  expect(report.ok).toBe(false);
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "warning", code: "SW106", message: expect.stringContaining("src/missing.ts") }));
  expect(report.issues).toContainEqual(expect.objectContaining({ level: "error", code: "SW109" }));
  await rm(cwd, { recursive: true, force: true });
});
test("validateCodebaseIndex accepts a CodebaseIndex-typed object from the shared module", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-index-shared-type-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "entry.ts"), "export default 1;\n", "utf8");

  const index: CodebaseIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entrypoints: [{ path: "src/entry.ts", kind: "cli", summary: "entry" }],
    modules: [],
    commands: [],
    verification: [],
    risks: [],
    fingerprints: {},
  };

  const report = await validateCodebaseIndex(cwd, index);
  expect(report.ok).toBe(true);
  expect(report.issues).toEqual([]);
  await rm(cwd, { recursive: true, force: true });
});
