import { test, expect } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSpecwrightCommand } from "../src/core/commands";

test("research prompt includes online research and fallback", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-prompts-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["research", "--online", "require", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("web_search");
  expect(result.prompt).toContain("sources.md");
  expect(result.prompt).toContain("retry the same assignment once with OMP's bundled `task` agent");
  expect(result.prompt).toContain("specwright checkpoint 0001-inventory-crafting --phase research --files .specwright/changes/0001-inventory-crafting/research.md,.specwright/changes/0001-inventory-crafting/sources.md,.specwright/changes/0001-inventory-crafting/evidence.md,.specwright/changes/0001-inventory-crafting/options.md");
});

test("discuss prompt requires OMP-led clarification before artifact writes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-discuss-prompt-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["discuss", "--print-prompt"]);
  expect(result.ok).toBe(true);
  const prompt = result.prompt ?? "";
  expect(prompt).toContain("You are the receiving OMP agent");
  expect(prompt).toContain("Inspect bounded local evidence before asking");
  expect(prompt).toContain("Identify 3-4 change-specific gray areas");
  expect(prompt).toContain("Ask the user before writing final artifacts");
  expect(prompt).toContain("Use Oh My Pi `ask`");
  expect(prompt).toContain("`multi: true`");
  expect(prompt).toContain("`recommended` defaults");
  expect(prompt).toContain("option descriptions");
  expect(prompt).toContain("group related `questions`");
  expect(prompt).toContain("numbered plain-text options and wait for the user's answer");
  expect(prompt).toContain("After each completed gray area, write a short checkpoint");
  expect(prompt).toContain("Update intent.md, constraints.md, and decisions.md only after the relevant answers are settled");
  expect(prompt).toContain("`Ready for research`");
  expect(prompt).toContain("deterministic Specwright CLI has already prepared the discussion artifacts");
  expect(prompt).toContain("specwright checkpoint 0001-inventory-crafting --phase discuss --files .specwright/changes/0001-inventory-crafting/discussion.md,.specwright/changes/0001-inventory-crafting/intent.md,.specwright/changes/0001-inventory-crafting/constraints.md,.specwright/changes/0001-inventory-crafting/decisions.md");
  expect(prompt).not.toContain("CLI can call `ask`");
});

test("plan and tasks prompts require CLI-parseable checklist tasks", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-task-format-prompts-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const planResult = await runSpecwrightCommand(ctx, ["plan", "--print-prompt"]);
  expect(planResult.ok).toBe(true);
  expect(planResult.prompt).toContain("CLI-parseable tasks.md");
  expect(planResult.prompt).toContain("exactly one unchecked checklist line in this format: - [ ] T001: Short imperative title");
  expect(planResult.prompt).toContain("Do NOT use task headings such as ### T001");
  expect(planResult.prompt).toContain("only checklist lines define executable tasks");
  expect(planResult.prompt).toContain("specwright checkpoint 0001-inventory-crafting --phase plan --files .specwright/changes/0001-inventory-crafting/plan.md,.specwright/changes/0001-inventory-crafting/tasks.md");

  const tasksResult = await runSpecwrightCommand(ctx, ["tasks", "--print-prompt"]);
  expect(tasksResult.ok).toBe(true);
  expect(tasksResult.prompt).toContain("Required tasks.md format for the Specwright CLI");
  expect(tasksResult.prompt).toContain("exactly one unchecked checklist line: - [ ] T001: Short imperative title");
  expect(tasksResult.prompt).toContain("Do NOT write task IDs as headings such as ### T001");
  expect(tasksResult.prompt).toContain("specwright checkpoint 0001-inventory-crafting --phase tasks --files .specwright/changes/0001-inventory-crafting/tasks.md");
});

test("execute prompt includes scoped checkpoint command from task files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-execute-checkpoint-prompt-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "- [ ] T001: Build inventory\n  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["execute", "--task", "T001", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("specwright checkpoint 0001-inventory-crafting --task T001 --files src/core/commands.ts,test/core-commands.test.ts");
});
