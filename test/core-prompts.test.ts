import { test, expect } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../src/core/state";
import { renderLifecycleSpawnStrategy, renderScanPrompt, type RoutedLifecycleStep, type ScanDeterministicSummary } from "../src/core/prompts";
import {
  renderOmpLifecycleSpawnStrategy,
  renderOmpDiscussPrompt,
  renderOmpSubagentRetryClause,
  renderOmpScanPrompt,
} from "../src/runtime/omp/prompts";
import { runSpecwrightCommand } from "../src/core/commands";
function scanSummary(overrides?: Partial<ScanDeterministicSummary>): ScanDeterministicSummary {
  return {
    indexUpdated: true,
    scannedFiles: 120,
    indexedFiles: 42,
    truncated: false,
    staleFiles: [],
    validationIssues: [],
    ...overrides,
  };
}


test("lifecycle spawn strategy routes each phase to configured agent model", () => {
  const config = defaultConfig("prompt-test");
  config.agents.researcher.model = "custom/research";
  config.agents.planner.model = "custom/plan";
  config.agents.executor.model = "custom/execute";
  config.agents.verifier.model = "custom/verify";
  const expected: Record<RoutedLifecycleStep, { agent: string; model: string; key: string }> = {
    research: { agent: "specwright-researcher", model: "custom/research", key: "agents.researcher.model" },
    plan: { agent: "specwright-planner", model: "custom/plan", key: "agents.planner.model" },
    execute: { agent: "specwright-executor", model: "custom/execute", key: "agents.executor.model" },
    verify: { agent: "specwright-verifier", model: "custom/verify", key: "agents.verifier.model" },
  };

  for (const [step, details] of Object.entries(expected) as Array<[
    RoutedLifecycleStep,
    (typeof expected)[RoutedLifecycleStep],
  ]>) {
    const strategy = renderLifecycleSpawnStrategy({ step, config });
    expect(strategy).not.toContain("OMP's `task` tool");
    expect(strategy).toContain(`delegate to \`${details.agent}\``);
    expect(strategy).toContain(`configured model \`${details.model}\``);
    expect(strategy).toContain(`\`${details.key}\``);
    expect(strategy).toContain("excludes this Lifecycle spawn strategy section");
    expect(strategy).toContain("MUST NOT tell the subagent that its first action is to delegate to another lifecycle agent");
    expect(strategy).toContain("MUST NOT include the blocker rule for missing lifecycle delegation");
    expect(strategy).toContain("lifecycle orchestrator");
    expect(strategy).toContain("first operational action");
    expect(strategy).toContain(`While the \`${details.agent}\` subagent is active, do not perform implementation-file reads`);
    expect(strategy).toContain("code or artifact edits");
    expect(strategy).toContain("test runs");
    expect(strategy).toContain("artifact or status updates");
    expect(strategy).toContain("completion claims");
    expect(strategy).toContain("report a visible blocker naming the missing component and stop");
    expect(strategy).toContain("do not proceed with direct inline work");
    expect(strategy).not.toContain("do the work directly in this agent with the same rules instead of blocking");
    expect(strategy).toContain(`Wait for the \`${details.agent}\` result`);
    expect(strategy).not.toContain("Pass the full current prompt as the subagent assignment");
  }
});

test("OMP lifecycle spawn strategy includes task tool and spawn instructions", () => {
  const config = defaultConfig("prompt-test");
  config.agents.researcher.model = "custom/research";
  config.agents.planner.model = "custom/plan";
  config.agents.executor.model = "custom/execute";
  config.agents.verifier.model = "custom/verify";
  const expected: Record<RoutedLifecycleStep, { agent: string; model: string; key: string }> = {
    research: { agent: "specwright-researcher", model: "custom/research", key: "agents.researcher.model" },
    plan: { agent: "specwright-planner", model: "custom/plan", key: "agents.planner.model" },
    execute: { agent: "specwright-executor", model: "custom/execute", key: "agents.executor.model" },
    verify: { agent: "specwright-verifier", model: "custom/verify", key: "agents.verifier.model" },
  };

  for (const [step, details] of Object.entries(expected) as Array<[
    RoutedLifecycleStep,
    (typeof expected)[RoutedLifecycleStep],
  ]>) {
    const strategy = renderOmpLifecycleSpawnStrategy({ step, config });
    expect(strategy).toContain("OMP's `task` tool");
    expect(strategy).toContain(`spawn \`${details.agent}\``);
    expect(strategy).toContain(`configured model \`${details.model}\``);
    expect(strategy).toContain(`\`${details.key}\``);
    expect(strategy).toContain("excludes this Lifecycle spawn strategy section");
    expect(strategy).toContain("MUST NOT tell the subagent that its first action is to spawn another lifecycle agent");
    expect(strategy).toContain("MUST NOT include the blocker rule for missing lifecycle delegation");
    expect(strategy).toContain("lifecycle orchestrator");
    expect(strategy).toContain("first operational action");
    expect(strategy).toContain(`While the \`${details.agent}\` subagent is active, do not perform implementation-file reads`);
    expect(strategy).toContain("code or artifact edits");
    expect(strategy).toContain("test runs");
    expect(strategy).toContain("artifact or status updates");
    expect(strategy).toContain("completion claims");
    expect(strategy).toContain("report a visible blocker naming the missing component and stop");
    expect(strategy).toContain("do not proceed with direct inline work");
    expect(strategy).not.toContain("do the work directly in this agent with the same rules instead of blocking");
    expect(strategy).toContain(`Wait for the \`${details.agent}\` result`);
    expect(strategy).not.toContain("Pass the full current prompt as the subagent assignment");
  }
});

test("fresh init defaults route lifecycle prompts to matching agents and models", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-default-routing-prompts-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const changeDir = join(cwd, ".specwright/changes/0001-inventory-crafting");
  await writeFile(join(changeDir, "intent.md"), "# Intent\n\n## Goal\n\nBuild inventory.\n", "utf8");
  await writeFile(join(changeDir, "evidence.md"), "# Evidence\n\n## Local evidence\n\n- Existing inventory evidence.\n", "utf8");
  await writeFile(
    join(changeDir, "tasks.md"),
    "- [ ] T001: Build inventory\n  - Files: `src/core/commands.ts`\n  - Action: Wire inventory.\n  - Acceptance: Inventory works.\n  - Verification: Run prompt tests.\n",
    "utf8",
  );

  const expected = [
    { argv: ["research", "--online", "never", "--print-prompt"], agent: "specwright-researcher", model: "pi/task" },
    { argv: ["plan", "--print-prompt"], agent: "specwright-planner", model: "pi/plan" },
    { argv: ["execute", "--task", "T001", "--print-prompt"], agent: "specwright-executor", model: "pi/task" },
    { argv: ["verify", "--print-prompt"], agent: "specwright-verifier", model: "pi/task" },
  ] as const;

  for (const { argv, agent, model } of expected) {
    const result = await runSpecwrightCommand(ctx, [...argv]);
    expect(result.ok).toBe(true);
    expect(result.prompt).toContain(`delegate to \`${agent}\``);
    expect(result.prompt).toContain(`configured model \`${model}\``);
    expect(result.prompt).toContain("excludes this Lifecycle spawn strategy section");
    expect(result.prompt).not.toContain("Pass the full current prompt as the subagent assignment");
    expect(result.prompt).not.toContain("OMP's `task` tool");
  }
});

test("research prompt includes online research and fallback", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-prompts-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["research", "--online", "require", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("web_search");
  expect(result.prompt).toContain("sources.md");
  expect(result.prompt).toContain("retry the same assignment once with the default task agent");
  expect(result.prompt).not.toContain("OMP's bundled `task` agent");
  expect(result.prompt).toContain("delegate to `specwright-researcher`");
  expect(result.prompt).toContain("configured model `pi/task`");
  expect(result.prompt).toContain("excludes this Lifecycle spawn strategy section");
  expect(result.prompt).toContain("MUST NOT tell the subagent that its first action is to delegate to another lifecycle agent");
  expect(result.prompt).not.toContain("Pass the full current prompt as the subagent assignment");
  expect(result.prompt).toContain("specwright checkpoint 0001-inventory-crafting --phase research --summary '<concrete summary>' --files .specwright/changes/0001-inventory-crafting/research.md,.specwright/changes/0001-inventory-crafting/sources.md,.specwright/changes/0001-inventory-crafting/evidence.md,.specwright/changes/0001-inventory-crafting/options.md");
});

test("discuss prompt is runtime-neutral without OMP references", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-discuss-prompt-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["discuss", "--print-prompt"]);
  expect(result.ok).toBe(true);
  const prompt = result.prompt ?? "";
  expect(prompt).not.toContain("You are the receiving OMP agent");
  expect(prompt).toContain("Inspect bounded local evidence before asking");
  expect(prompt).toContain("Identify 3-4 change-specific gray areas");
  expect(prompt).toContain("Ask the user before writing final artifacts");
  expect(prompt).toContain("Use structured clarification");
  expect(prompt).toContain("multi-select");
  expect(prompt).toContain("recommended defaults");
  expect(prompt).toContain("option descriptions");
  expect(prompt).toContain("group related questions");
  expect(prompt).toContain("numbered plain-text options and wait for the user's answer");
  expect(prompt).toContain("After each completed gray area, write a short checkpoint");
  expect(prompt).toContain("Update intent.md, constraints.md, and decisions.md only after the relevant answers are settled");
  expect(prompt).toContain("`Ready for research`");
  expect(prompt).toContain("deterministic Specwright CLI has already prepared the discussion artifacts");
  expect(prompt).toContain("specwright checkpoint 0001-inventory-crafting --phase discuss --summary '<concrete summary>' --files .specwright/changes/0001-inventory-crafting/discussion.md,.specwright/changes/0001-inventory-crafting/intent.md,.specwright/changes/0001-inventory-crafting/constraints.md,.specwright/changes/0001-inventory-crafting/decisions.md");
  expect(prompt).not.toContain("Lifecycle spawn strategy");
  expect(prompt).not.toContain("delegate to `specwright-");
  expect(prompt).not.toContain("Use Oh My Pi `ask`");
});

test("OMP discuss prompt includes ask dialog references", () => {
  const config = defaultConfig("prompt-test");
  const change = {
    id: "0001",
    slug: "inventory-crafting",
    title: "Inventory Crafting",
    kind: "feature" as const,
    pack: "core",
    mode: "lite" as const,
    status: "discussing" as const,
    step: "discuss" as const,
    tasks: {},
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  };
  const prompt = renderOmpDiscussPrompt({ step: "discuss", change, config, cwd: "/tmp" });
  expect(prompt).toContain("You are the receiving OMP agent");
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
  expect(prompt).not.toContain("Lifecycle spawn strategy");
  expect(prompt).not.toContain("delegate to `specwright-");
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
  expect(planResult.prompt).toContain("specwright checkpoint 0001-inventory-crafting --phase plan --summary '<concrete summary>' --files .specwright/changes/0001-inventory-crafting/plan.md,.specwright/changes/0001-inventory-crafting/tasks.md");
  expect(planResult.prompt).toContain("delegate to `specwright-planner`");
  expect(planResult.prompt).toContain("configured model `pi/plan`");
  expect(planResult.prompt).not.toContain("\n  - [ ]");

  const tasksResult = await runSpecwrightCommand(ctx, ["tasks", "--print-prompt"]);
  expect(tasksResult.ok).toBe(true);
  expect(tasksResult.prompt).toContain("Required tasks.md format for the Specwright CLI");
  expect(tasksResult.prompt).toContain("exactly one unchecked checklist line: - [ ] T001: Short imperative title");
  expect(tasksResult.prompt).toContain("Do NOT write task IDs as headings such as ### T001");
  expect(tasksResult.prompt).toContain("specwright checkpoint 0001-inventory-crafting --phase tasks --summary '<concrete summary>' --files .specwright/changes/0001-inventory-crafting/tasks.md");
  expect(tasksResult.prompt).not.toContain("Lifecycle spawn strategy");
  expect(tasksResult.prompt).not.toContain("delegate to `specwright-");
});

test("execute prompt includes scoped checkpoint command from task files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-execute-checkpoint-prompt-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/intent.md"),
    "# Intent\n\n## Goal\n\nBuild inventory.\n",
    "utf8",
  );
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/evidence.md"),
    "# Evidence\n\n## Local evidence\n\n- Existing inventory command evidence.\n",
    "utf8",
  );
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "- [ ] T001: Build inventory\n  - Files: `src/core/commands.ts`, `test/core-commands.test.ts`\n  - Action: Wire inventory.\n  - Acceptance: Inventory works.\n  - Verification: Run focused prompt tests.\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["execute", "--task", "T001", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("specwright checkpoint 0001-inventory-crafting --task T001 --summary '<concrete summary>' --files src/core/commands.ts,test/core-commands.test.ts");
  expect(result.prompt).toContain("delegate to `specwright-executor`");
  expect(result.prompt).toContain("configured model `pi/task`");

  const verifyResult = await runSpecwrightCommand(ctx, ["verify", "--print-prompt"]);
  expect(verifyResult.ok).toBe(true);
  expect(verifyResult.prompt).toContain("delegate to `specwright-verifier`");
  expect(verifyResult.prompt).toContain("configured model `pi/task`");
});

test("OMP subagent retry clause references bundled task agent", () => {
  const clause = renderOmpSubagentRetryClause();
  expect(clause).toContain("OMP's bundled `task` agent");
  expect(clause).toContain("retry the same assignment once");
  expect(clause).toContain("read-only/no-project-wide-command constraints");
});
test("OMP runtime research prompt selects OMP lifecycle spawn strategy through command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-research-prompt-"));
  const ctx = { cwd, runtime: "omp" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["research", "--online", "never", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("OMP's `task` tool");
  expect(result.prompt).toContain("spawn `specwright-researcher`");
  expect(result.prompt).toContain("Route to configured model `pi/task`");
  expect(result.prompt).toContain("OMP's bundled `task` agent");
  expect(result.prompt).not.toContain("delegate to `specwright-researcher`");
});

test("OMP runtime plan prompt selects OMP lifecycle spawn strategy through command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-plan-prompt-"));
  const ctx = { cwd, runtime: "omp" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/intent.md"), "# Intent\n", "utf8");
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/research.md"), "# Research\n", "utf8");
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/evidence.md"), "# Evidence\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["plan", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("OMP's `task` tool");
  expect(result.prompt).toContain("spawn `specwright-planner`");
  expect(result.prompt).not.toContain("delegate to `specwright-planner`");
});

test("OMP runtime execute prompt selects OMP lifecycle spawn strategy through command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-execute-prompt-"));
  const ctx = { cwd, runtime: "omp" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "- [ ] T001: Build inventory\n  - Files: `src/core/commands.ts`\n  - Action: Wire inventory.\n  - Acceptance: Inventory works.\n  - Verification: Run prompt tests.\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["execute", "--task", "T001", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("OMP's `task` tool");
  expect(result.prompt).toContain("spawn `specwright-executor`");
  expect(result.prompt).not.toContain("delegate to `specwright-executor`");
});

test("OMP runtime verify prompt selects OMP lifecycle spawn strategy through command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-verify-prompt-"));
  const ctx = { cwd, runtime: "omp" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "- [ ] T001: Build inventory\n  - Files: `src/core/commands.ts`\n  - Action: Wire inventory.\n  - Acceptance: Inventory works.\n  - Verification: Run prompt tests.\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["verify", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("OMP's `task` tool");
  expect(result.prompt).toContain("spawn `specwright-verifier`");
  expect(result.prompt).not.toContain("delegate to `specwright-verifier`");
});

test("CLI runtime prompts remain neutral without OMP references through command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-cli-neutral-prompts-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const researchResult = await runSpecwrightCommand(ctx, ["research", "--online", "never", "--print-prompt"]);
  expect(researchResult.ok).toBe(true);
  expect(researchResult.prompt).not.toContain("OMP's `task` tool");
  expect(researchResult.prompt).toContain("delegate to `specwright-researcher`");

  const discussResult = await runSpecwrightCommand(ctx, ["discuss", "--print-prompt"]);
  expect(discussResult.ok).toBe(true);
  expect(discussResult.prompt).not.toContain("Use Oh My Pi `ask`");
  expect(discussResult.prompt).not.toContain("You are the receiving OMP agent");
});

test("renderScanPrompt default mode lists prose artifacts, deterministic state, and ownership boundary", () => {
  const config = defaultConfig("scan-prompt-test");
  const prompt = renderScanPrompt({ config, map: false, refresh: false, deterministicSummary: scanSummary() });
  expect(prompt).toContain("# Specwright Scan");
  expect(prompt).toContain("Inspect the repository and update the project intelligence prose files.");
  expect(prompt).toContain(".specwright/project/scan.md");
  expect(prompt).toContain(".specwright/project/tech-stack.md");
  expect(prompt).toContain(".specwright/project/architecture.md");
  expect(prompt).toContain(".specwright/project/codebase-map.md");
  expect(prompt).toContain("Command-owned (do not edit directly): .specwright/project/codebase-index.json and its machine fields");
  expect(prompt).toContain("Deterministic index state:");
  expect(prompt).toContain("codebase-index.json updated: true");
  expect(prompt).toContain("Files scanned: 120");
  expect(prompt).toContain("Files indexed: 42");
  expect(prompt).toContain("Stale files: none");
  expect(prompt).toContain("Truncated/capped: no");
  expect(prompt).toContain("Ownership boundary:");
  expect(prompt).toContain("Command-owned (do not edit directly):");
  expect(prompt).toContain("Agent-owned (edit prose only):");
  expect(prompt).toContain(
    "Agent-owned (edit prose only): .specwright/project/scan.md, .specwright/project/tech-stack.md, .specwright/project/architecture.md, .specwright/project/codebase-map.md. You may summarize current index facts in prose",
  );
  expect(prompt).toContain("Never author, paste, or hand-edit fingerprints");
  expect(prompt).toContain("Use file discovery (find)");
  expect(prompt).toContain("Use search and LSP when available");
  expect(prompt).toContain("Record uncertainty, assumptions, and gaps in the Open questions section");
  expect(prompt).not.toContain("OMP");
  expect(prompt).not.toContain("scout");
  expect(prompt).not.toContain("Refresh contract:");
  expect(prompt).not.toContain("## Current fingerprints");
  expect(prompt).not.toContain('"mtime": number');
  expect(prompt).not.toContain("{ \"mtime\": number, \"size\": number, \"checksum\": string }");
  expect(prompt).toContain("Record the retry in .specwright/project/scan.md under Open questions");
});

test("renderScanPrompt map mode focuses only on map prose artifact", () => {
  const config = defaultConfig("scan-prompt-test");
  const prompt = renderScanPrompt({ config, map: true, refresh: false, deterministicSummary: scanSummary() });
  expect(prompt).toContain("Focus only on codebase mapping for this run.");
  expect(prompt).toContain(".specwright/project/codebase-map.md");
  expect(prompt).toContain("Record the retry in .specwright/project/codebase-map.md under Open questions");
  expect(prompt).toContain("Agent-owned (edit prose only): .specwright/project/codebase-map.md. You may summarize current index facts in prose");
  expect(prompt).not.toContain(".specwright/project/scan.md");
  expect(prompt).not.toContain(".specwright/project/tech-stack.md");
  expect(prompt).not.toContain(".specwright/project/architecture.md");
  expect(prompt).toContain("Command-owned (do not edit directly): .specwright/project/codebase-index.json and its machine fields");
});

test("renderScanPrompt refresh mode shows deterministic stale files and refresh note", () => {
  const config = defaultConfig("scan-prompt-test");
  const summary = scanSummary({ staleFiles: ["src/core/x.ts (changed)"], indexUpdated: true });
  const prompt = renderScanPrompt({ config, map: false, refresh: true, deterministicSummary: summary });
  expect(prompt).toContain("Refresh the project intelligence prose by patching stale sections");
  expect(prompt).toContain("Refresh run:");
  expect(prompt).toContain("Stale files: 1");
  expect(prompt).toContain("src/core/x.ts (changed)");
  expect(prompt).not.toContain("Refresh contract:");
  expect(prompt).not.toContain("Compare current files against the recorded fingerprints");
  expect(prompt).not.toContain("## Current fingerprints");
});

test("renderScanPrompt map+refresh mode focuses map artifact and refresh note", () => {
  const config = defaultConfig("scan-prompt-test");
  const prompt = renderScanPrompt({ config, map: true, refresh: true, deterministicSummary: scanSummary() });
  expect(prompt).toContain("Refresh the codebase map by patching stale prose sections");
  expect(prompt).toContain(".specwright/project/codebase-map.md");
  expect(prompt).toContain("Record the retry in .specwright/project/codebase-map.md under Open questions");
  expect(prompt).not.toContain(".specwright/project/scan.md");
  expect(prompt).toContain("Refresh run:");
  expect(prompt).not.toContain("Refresh contract:");
  expect(prompt).toContain("Command-owned (do not edit directly): .specwright/project/codebase-index.json and its machine fields");
  expect(prompt).toContain("Agent-owned (edit prose only): .specwright/project/codebase-map.md. You may summarize current index facts in prose");
});

test("renderScanPrompt is runtime-neutral and avoids OMP-specific scout wording", () => {
  const config = defaultConfig("scan-prompt-test");
  const prompt = renderScanPrompt({ config, map: false, refresh: false, deterministicSummary: scanSummary() });
  expect(prompt).not.toContain("OMP");
  expect(prompt).not.toContain("Oh My Pi");
  expect(prompt).not.toContain("task tool");
  expect(prompt).not.toContain("evidence.md");
  expect(prompt).not.toContain("scout");
  expect(prompt).toContain(".specwright/project/scan.md");
  expect(prompt).toContain("Subagent fallback");
  expect(prompt).toContain("retry the same assignment once");
});

test("renderScanPrompt surfaces validation issues and scratch-rebuild status", () => {
  const config = defaultConfig("scan-prompt-test");
  const summary = scanSummary({
    validationIssues: [{ level: "error", code: "SW100", message: "version must be 1" }],
    rebuiltFromValidationErrors: true,
  });
  const prompt = renderScanPrompt({ config, map: false, refresh: false, deterministicSummary: summary });
  expect(prompt).toContain("Validation issues: 1");
  expect(prompt).toContain("ERROR SW100: version must be 1");
  expect(prompt).toContain("Hard validation errors in the existing codebase-index.json caused a scratch rebuild");
});
test("renderScanPrompt never requests manual fingerprint edits in any mode", () => {
  const config = defaultConfig("scan-prompt-test");
  const modes: Array<{ map: boolean; refresh: boolean }> = [
    { map: false, refresh: false },
    { map: true, refresh: false },
    { map: false, refresh: true },
    { map: true, refresh: true },
  ];

  for (const { map, refresh } of modes) {
    const prompt = renderScanPrompt({ config, map, refresh, deterministicSummary: scanSummary() });
    expect(prompt).not.toContain("## Current fingerprints");
    expect(prompt).not.toContain('"mtime": number');
    expect(prompt).not.toContain('{ "mtime": number, "size": number, "checksum": string }');
    expect(prompt).toContain("Never author, paste, or hand-edit fingerprints");
  }
});

test("renderOmpScanPrompt includes parallel scout guidance for mapping subsystems", () => {
  const config = defaultConfig("omp-scan-prompt-test");
  const prompt = renderOmpScanPrompt({ config, map: true, refresh: false, deterministicSummary: scanSummary() });
  expect(prompt).toContain("# Specwright Scan");
  expect(prompt).toContain("OMP map guidance");
  expect(prompt).toContain("parallel read-only scouts");
  expect(prompt).toContain("OMP's `task` tool");
  expect(prompt).toContain("CLI and command kernel");
  expect(prompt).toContain("runtime adapters");
  expect(prompt).toContain("packs, templates, and agents");
  expect(prompt).toContain("fall back to sequential mapping");
  expect(prompt).toContain("Ownership boundary and Agent contract sections");
  expect(prompt).toContain("Merge scout findings into agent-owned prose artifacts only; read `codebase-index.json` for confirmed facts and record uncertainty in Open questions.");
  expect(prompt).not.toContain("bounded discovery and mapping contract");
  expect(prompt).not.toContain("Merge scout findings into `codebase-map.md` and `codebase-index.json`");
  expect(prompt).not.toContain("Merge scout findings into agent-owned prose artifacts only; read `codebase-index.json` and `codebase-index.json`");
});

test("renderOmpScanPrompt preserves deterministic state and OMP guidance in refresh mode", () => {
  const config = defaultConfig("omp-scan-refresh-test");
  const summary = scanSummary({ staleFiles: ["src/core/x.ts (changed)"] });
  const prompt = renderOmpScanPrompt({ config, map: false, refresh: true, deterministicSummary: summary });
  expect(prompt).toContain("Refresh run:");
  expect(prompt).toContain("Stale files: 1");
  expect(prompt).toContain("src/core/x.ts (changed)");
  expect(prompt).toContain("OMP map guidance");
  expect(prompt).not.toContain("Refresh contract:");
  expect(prompt).not.toContain("## Current fingerprints");
  expect(prompt).toContain("Merge scout findings into agent-owned prose artifacts only; read `codebase-index.json` for confirmed facts");
  expect(prompt).not.toContain("Merge scout findings into `codebase-map.md` and `codebase-index.json`");
});
