import { test, expect } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { buildCodebaseIndex } from "../src/core/codebase-index";
import { runSpecwrightCommand, renderHelp } from "../src/core/commands";
import {
  branchNameForChange,
  commitStaged,
  generatePullRequestBody,
  gitWorktreeRoot,
  isGitWorktree,
  isWorktreeClean,
  mergeNoFastForward,
  resolveBaseBranch,
  runGh,
  runGit,
  stageFiles,
  switchToExistingBranch,
  writePullRequestBodyFile,
} from "../src/core/git";
import { validateCodebaseIndex } from "../src/core/validators";
import { syncChangeTasksFromFileIfPresent, syncChangeTasksFromMarkdown, upsertChange } from "../src/core/state";
import type { ChangeState, SpecwrightConfig, TaskSyncIssueKind } from "../src/core/types";

function testContext(cwd: string) {
  return { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
}

async function readConfig(cwd: string): Promise<SpecwrightConfig> {
  return JSON.parse(await readFile(join(cwd, ".specwright/config.json"), "utf8")) as SpecwrightConfig;
}

async function expectGit(cwd: string, args: readonly string[]) {
  const result = await runGit(cwd, args);
  expect(result.exitCode, `${result.command} ${result.args.join(" ")}\n${result.stderr}`).toBe(0);
  return result;
}

async function initGitRepo(prefix: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  await expectGit(cwd, ["init"]);
  await expectGit(cwd, ["checkout", "-B", "main"]);
  await expectGit(cwd, ["config", "user.email", "specwright@example.invalid"]);
  await expectGit(cwd, ["config", "user.name", "Specwright Tests"]);
  return cwd;
}

async function createCompleteFixture(prefix: string): Promise<
  {
    cwd: string;
    ctx: TestCommandContext;
    changeDir: string;
    branch: string;
    statePath: string;
    remote: string;
  }
> {
  const cwd = await initGitRepo(prefix);
  const ctx = testContext(cwd);
  const remote = await mkdtemp(join(tmpdir(), `${prefix}remote-`));
  await expectGit(remote, ["init", "--bare"]);
  await expectGit(cwd, ["remote", "add", "origin", remote]);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await expectGit(cwd, ["add", "--all"]);
  await expectGit(cwd, ["commit", "-m", "specwright setup"]);

  const changeDir = join(cwd, ".specwright", "changes", "0001-inventory-crafting");
  const statePath = join(cwd, ".specwright", "state.json");
  const state = JSON.parse(await readFile(statePath, "utf8")) as {
    currentChange: string;
    changes: Record<string, { step: string; tasks: Record<string, { id: string; title: string; status: string; updatedAt: string }> }>;
  };
  const changeId = state.currentChange;
  const change = state.changes[changeId];
  if (!change) throw new Error(`Change ${changeId} not found in state`);
  change.step = "execute";
  change.tasks["T001"] = { id: "T001", title: "Implement feature", status: "done", updatedAt: new Date().toISOString() };
  await writeFile(statePath, JSON.stringify(state), "utf8");

  await writeFile(
    join(changeDir, "tasks.md"),
    "# Tasks\n\n## Tasks\n\n- [x] T001: Implement feature\n\n### Acceptance\n\nFeature works.\n\n### Verification\n\nRun tests.\n",
    "utf8",
  );
  await writeFile(
    join(changeDir, "verify.md"),
    "# Verify\n\n## Observed output\n\n`bun test` passed.\n",
    "utf8",
  );
  await writeFile(
    join(changeDir, "evidence.md"),
    "# Evidence\n\n## Local evidence\n\nFixture evidence for complete command guards.\n",
    "utf8",
  );
  await writeFile(
    join(changeDir, "handoff.md"),
    "# Handoff\n\n## Goal\n\nImplement inventory crafting.\n",
    "utf8",
  );
  await stageFiles(cwd, [join(changeDir, "tasks.md"), join(changeDir, "verify.md"), join(changeDir, "handoff.md"), join(changeDir, "evidence.md"), statePath]);
  await commitStaged(cwd, "add tasks verify evidence and handoff");

  const branch = (await expectGit(cwd, ["branch", "--show-current"])).stdout.trim();
  return { cwd, ctx, changeDir, branch, statePath, remote };
}

test("malformed option values fail before command execution", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-flags-"));
  const ctx = testContext(cwd);

  for (const argv of [
    ["new", "feature", "Inventory", "--mode"],
    ["new", "feature", "Inventory", "--pack"],
    ["research", "--online"],
    ["execute", "--task"],
    ["new", "feature", "Inventory", "--pack", "--json"],
    ["execute", "--task", "--json"],
    ["checkpoint", "--phase"],
    ["checkpoint", "--files"],
  ]) {
    const result = await runSpecwrightCommand(ctx, argv);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.summary).toStartWith("Unknown option: --");
  }
});

test("invalid enum option values fail and valid values still work", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-enum-flags-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const invalidMode = await runSpecwrightCommand(ctx, ["new", "feature", "Inventory", "--mode", "tiny"]);
  expect(invalidMode.ok).toBe(false);
  expect(invalidMode.exitCode).toBe(1);
  expect(invalidMode.summary).toBe("Unknown option: --mode");

  const validMode = await runSpecwrightCommand(ctx, ["new", "feature", "Inventory", "--mode", "full"]);
  expect(validMode.ok).toBe(true);

  const invalidOnline = await runSpecwrightCommand(ctx, ["research", "--online", "sometimes"]);
  expect(invalidOnline.ok).toBe(false);
  expect(invalidOnline.exitCode).toBe(1);
  expect(invalidOnline.summary).toBe("Unknown option: --online");

  const validOnline = await runSpecwrightCommand(ctx, ["research", "--online", "never"]);
  expect(validOnline.ok).toBe(true);
});
test("new rejects missing request with updated usage message", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-new-missing-request-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  const missing = await runSpecwrightCommand(ctx, ["new", "feature"]);
  expect(missing.ok).toBe(false);
  expect(missing.exitCode).toBe(1);
  expect(missing.summary).toBe("Usage: specwright new <kind> <request...>");
  expect(missing.summary).not.toContain('"<title>"');
});
test("new accepts multi-word unquoted request and uses all tokens", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-new-multiword-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  const result = await runSpecwrightCommand(ctx, ["new", "feature", "Inventory", "Crafting", "System"]);
  expect(result.ok).toBe(true);
  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].title).toBe("Inventory Crafting System");
  expect(state.changes["0001"].slug).toBe("inventory-crafting-system");
});
test("new accepts quoted request as single request", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-new-quoted-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  const result = await runSpecwrightCommand(ctx, ["new", "bugfix", "Fix login redirect after session expiry"]);
  expect(result.ok).toBe(true);
  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].title).toBe("Fix login redirect after session expiry");
  expect(state.changes["0001"].slug).toBe("fix-login-redirect-after-session-expiry");
});
test("new expands standalone local file references in request", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-new-file-reference-"));
  const ctx = testContext(cwd);
  await mkdir(join(cwd, "docs"));
  await writeFile(join(cwd, "docs/request.md"), "Build inventory\nwith recipes", "utf8");
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["new", "feature", "Implement", "@docs/request.md", "now"]);

  expect(result.ok).toBe(true);
  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].title).toBe("Implement Build inventory with recipes now");
});
test("new derives a readable title and slug from a long request", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-new-long-request-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  const longRequest = "This is a very long implementation request that goes well beyond what would be reasonable for a change title and should be truncated to a readable length";
  const result = await runSpecwrightCommand(ctx, ["new", "feature", longRequest]);
  expect(result.ok).toBe(true);
  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].title.length).toBeLessThanOrEqual(80);
  expect(state.changes["0001"].title).not.toContain("\n");
  expect(state.changes["0001"].title).toMatch(/^This is a very long implementation request/);
  expect(state.changes["0001"].slug).toBe("this-is-a-very-long-implementation-request-that-goes-well-beyond-what-would-be");
});
test("new uses first sentence as title when request contains multiple sentences", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-new-sentence-boundary-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  const multiSentence = "Add user authentication. Then implement authorization checks and session management.";
  const result = await runSpecwrightCommand(ctx, ["new", "feature", multiSentence]);
  expect(result.ok).toBe(true);
  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].title).toBe("Add user authentication.");
  expect(state.changes["0001"].slug).toBe("add-user-authentication");
});
test("new renders exact source request and expanded request in intent artifact", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-new-intent-request-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  const inlineRequest = "Add user authentication with OAuth2 support";
  const result = await runSpecwrightCommand(ctx, ["new", "feature", inlineRequest]);
  expect(result.ok).toBe(true);
  const intent = await readFile(join(cwd, ".specwright", "changes", "0001-add-user-authentication-with-oauth2-support", "intent.md"), "utf8");
  expect(intent).toContain("### Source request");
  expect(intent).toContain(inlineRequest);
  expect(intent).toContain("### Expanded request");
  expect(intent).toContain(inlineRequest);
});
test("new renders expanded request in intent artifact when file references are used", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-new-intent-expanded-"));
  const ctx = testContext(cwd);
  await mkdir(join(cwd, "docs"));
  await writeFile(join(cwd, "docs/request.md"), "Build inventory\nwith recipes", "utf8");
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  const result = await runSpecwrightCommand(ctx, ["new", "feature", "Implement", "@docs/request.md", "now"]);
  expect(result.ok).toBe(true);
  const intent = await readFile(join(cwd, ".specwright", "changes", "0001-implement-build-inventory-with-recipes-now", "intent.md"), "utf8");
  expect(intent).toContain("### Source request");
  expect(intent).toContain("Implement @docs/request.md now");
  expect(intent).toContain("### Expanded request");
  expect(intent).toContain("Implement Build inventory\nwith recipes now");
});

test("new rejects unsupported or invalid local file references", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-new-invalid-file-reference-"));
  const ctx = testContext(cwd);
  await mkdir(join(cwd, "docs"));
  await writeFile(join(cwd, "large.md"), "x".repeat(64 * 1024 + 1), "utf8");
  const unreadablePath = join(cwd, "secret.md");
  await writeFile(unreadablePath, "secret", "utf8");
  await chmod(unreadablePath, 0o000);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  try {
    for (const [token, expected] of [
      ["@missing.md", "File reference not found: @missing.md"],
      ["@docs", "File reference is a directory: @docs"],
      ["@*.md", "Glob patterns are not supported in @file references: @*.md"],
      ["@https://example.invalid/request.md", "URL @file references are not supported: @https://example.invalid/request.md"],
      ["@-", "stdin @file references are not supported"],
      ["@secret.md", "File reference is not readable: @secret.md"],
      ["@large.md", "File reference is too large: @large.md is 65537 bytes; maximum is 65536 bytes."],
      ["@../outside.md", "Path traversal and absolute paths are not allowed"],
      ["@/etc/passwd", "Path traversal and absolute paths are not allowed"],
    ] as const) {
      const result = await runSpecwrightCommand(ctx, ["new", "feature", token]);
      expect(result.ok, token).toBe(false);
      expect(result.exitCode, token).toBe(1);
      expect(result.summary, token).toContain(expected);
    }
  } finally {
    await chmod(unreadablePath, 0o600);
  }
});

test("help text advertises request-based new contract", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-help-new-request-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  const help = await runSpecwrightCommand(ctx, ["help"]);
  expect(help.ok).toBe(true);
  expect(help.summary).toContain("specwright new <kind> <request...>");
  expect(help.summary).not.toContain('"<title>"');
});

test("init writes default lifecycle agent model config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-agent-config-defaults-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const config = await readConfig(cwd);
  expect(config.agents).toEqual({
    researcher: { model: "pi/task" },
    planner: { model: "pi/plan" },
    executor: { model: "pi/task" },
    verifier: { model: "pi/task" },
  });
});

test("config get returns supported scalar and array values", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-config-get-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const projectName = await runSpecwrightCommand(ctx, ["config", "get", "project.name"]);
  expect(projectName.ok).toBe(true);
  expect(projectName.summary).toBe("Specwright");

  const enabledPacks = await runSpecwrightCommand(ctx, ["config", "get", "packs.enabled"]);
  expect(enabledPacks.ok).toBe(true);
  expect(JSON.parse(enabledPacks.summary)).toEqual(["core"]);

  for (const [key, expected] of [
    ["agents.researcher.model", "pi/task"],
    ["agents.planner.model", "pi/plan"],
    ["agents.executor.model", "pi/task"],
    ["agents.verifier.model", "pi/task"],
  ] as const) {
    const model = await runSpecwrightCommand(ctx, ["config", "get", key]);
    expect(model.ok).toBe(true);
    expect(model.summary).toBe(expected);
  }

  const autoCommit = await runSpecwrightCommand(ctx, ["config", "get", "workflow.autoCommit"]);
  expect(autoCommit.ok).toBe(true);
  expect(autoCommit.summary).toBe("true");

  const publishMode = await runSpecwrightCommand(ctx, ["config", "get", "workflow.publishMode"]);
  expect(publishMode.ok).toBe(true);
  expect(publishMode.summary).toBe("none");

  const baseBranch = await runSpecwrightCommand(ctx, ["config", "get", "workflow.baseBranch"]);
  expect(baseBranch.ok).toBe(true);
  expect(baseBranch.summary).toBe("");

  const remote = await runSpecwrightCommand(ctx, ["config", "get", "workflow.remote"]);
  expect(remote.ok).toBe(true);
  expect(remote.summary).toBe("origin");
});

test("config set validates and persists supported value types", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-config-set-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  for (const argv of [
    ["config", "set", "project.name", "Inventory"],
    ["config", "set", "defaults.mode", "full"],
    ["config", "set", "defaults.onlineResearch", "require"],
    ["config", "set", "defaults.maxContextFiles", "9"],
    ["config", "set", "runtimes.omp.enabled", "false"],
    ["config", "set", "packs.enabled", "[\"core\",\"game-dev-studio\"]"],
    ["config", "set", "workflow.autoCommit", "false"],
    ["config", "set", "workflow.publishMode", "pr"],
    ["config", "set", "workflow.baseBranch", "main"],
    ["config", "set", "workflow.remote", "upstream"],
  ]) {
    const result = await runSpecwrightCommand(ctx, argv);
    expect(result.ok).toBe(true);
  }

  const config = await readConfig(cwd);
  expect(config.project.name).toBe("Inventory");
  expect(config.defaults.mode).toBe("full");
  expect(config.defaults.onlineResearch).toBe("require");
  expect(config.defaults.maxContextFiles).toBe(9);
  expect(config.runtimes.omp.enabled).toBe(false);
  expect(config.packs.enabled).toEqual(["core", "game-dev-studio"]);
  expect(config.workflow.autoCommit).toBe(false);
  expect(config.workflow.publishMode).toBe("pr");
  expect(config.workflow.baseBranch).toBe("main");
  expect(config.workflow.remote).toBe("upstream");
});

test("config set persists agent model values without touching unrelated config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-agent-config-set-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const before = await readConfig(cwd);
  const result = await runSpecwrightCommand(ctx, ["config", "set", "agents.planner.model", "custom/plan-model"]);
  expect(result.ok).toBe(true);
  expect(result.summary).toBe("Set agents.planner.model.");

  const after = await readConfig(cwd);
  expect(after.agents.planner.model).toBe("custom/plan-model");
  expect(after.agents.researcher).toEqual(before.agents.researcher);
  expect(after.agents.executor).toEqual(before.agents.executor);
  expect(after.agents.verifier).toEqual(before.agents.verifier);
  expect(after.project).toEqual(before.project);
  expect(after.defaults).toEqual(before.defaults);
  expect(after.packs).toEqual(before.packs);
  expect(after.runtimes).toEqual(before.runtimes);
  expect(after.workflow).toEqual(before.workflow);
});

test("config set regenerates changed OMP agent models when OMP is enabled", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-agent-regenerate-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const packagePath = join(cwd, ".omp/extensions/specwright/package.json");
  const rulePath = join(cwd, ".omp/rules/specwright-workflow.md");
  const researcherPath = join(cwd, ".omp/agents/specwright-researcher.md");
  const plannerPath = join(cwd, ".omp/agents/specwright-planner.md");
  const packageBefore = await readFile(packagePath, "utf8");
  const ruleBefore = await readFile(rulePath, "utf8");
  const researcherBefore = await readFile(researcherPath, "utf8");

  const result = await runSpecwrightCommand(ctx, ["config", "set", "agents.planner.model", "custom/plan-model"]);
  expect(result.ok).toBe(true);
  expect(result.filesUpdated).toContain(".specwright/config.json");
  expect(result.filesUpdated).toContain(".omp/agents/specwright-planner.md");
  expect(result.filesUpdated).not.toContain(".omp/extensions/specwright/package.json");
  expect(result.filesUpdated).not.toContain(".omp/rules/specwright-workflow.md");
  expect(result.filesUpdated).not.toContain(".omp/agents/specwright-researcher.md");

  const plannerAfter = await readFile(plannerPath, "utf8");
  expect(plannerAfter).toContain("model: custom/plan-model");
  expect(await readFile(packagePath, "utf8")).toBe(packageBefore);
  expect(await readFile(rulePath, "utf8")).toBe(ruleBefore);
  expect(await readFile(researcherPath, "utf8")).toBe(researcherBefore);
});
test("init regenerates stale adapter when version marker is missing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-adapter-stale-init-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const packagePath = join(cwd, ".omp/extensions/specwright/package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));
  delete pkg.specwrightAdapterVersion;
  await writeFile(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["init"]);
  expect(result.ok).toBe(true);
  expect(result.filesUpdated).toContain(".omp/extensions/specwright/package.json");
  const restored = JSON.parse(await readFile(packagePath, "utf8"));
  expect(restored.specwrightAdapterVersion).toBe("1");
});

test("config set regenerates stale adapter when version marker is mismatched", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-adapter-stale-config-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const packagePath = join(cwd, ".omp/extensions/specwright/package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));
  pkg.specwrightAdapterVersion = "0";
  await writeFile(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["config", "set", "defaults.maxOutputWords", "1500"]);
  expect(result.ok).toBe(true);
  expect(result.filesUpdated).toContain(".omp/extensions/specwright/package.json");
  const restored = JSON.parse(await readFile(packagePath, "utf8"));
  expect(restored.specwrightAdapterVersion).toBe("1");
});

test("current adapter version avoids unnecessary rewrite on init and config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-adapter-current-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const packagePath = join(cwd, ".omp/extensions/specwright/package.json");
  const before = await readFile(packagePath, "utf8");

  const initAgain = await runSpecwrightCommand(ctx, ["init"]);
  expect(initAgain.ok).toBe(true);
  expect(initAgain.filesUpdated).not.toContain(".omp/extensions/specwright/package.json");
  expect(await readFile(packagePath, "utf8")).toBe(before);

  const configResult = await runSpecwrightCommand(ctx, ["config", "set", "defaults.maxOutputWords", "2000"]);
  expect(configResult.ok).toBe(true);
  expect(configResult.filesUpdated).not.toContain(".omp/extensions/specwright/package.json");
  expect(await readFile(packagePath, "utf8")).toBe(before);
});

test("config set rejects invalid input without changing existing config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-config-invalid-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const valid = await runSpecwrightCommand(ctx, ["config", "set", "defaults.maxOutputWords", "1500"]);
  expect(valid.ok).toBe(true);
  const before = await readConfig(cwd);

  for (const argv of [
    ["config", "get"],
    ["config", "get", "defaults.mode", "extra"],
    ["config", "get", "unknown.key"],
    ["config", "set", "defaults.mode"],
    ["config", "set", "defaults.mode", "tiny"],
    ["config", "set", "defaults.maxOutputWords", "0"],
    ["config", "set", "defaults.maxOutputWords", "1.5"],
    ["config", "set", "runtimes.omp.enabled", "yes"],
    ["config", "set", "packs.enabled", "not-json"],
    ["config", "set", "packs.enabled", "[\"core\",3]"],
    ["config", "set", "agents.executor.model", ""],
    ["config", "set", "agents.executor.model", "   "],
    ["config", "set", "unknown.key", "value"],
    ["config", "set", "workflow.autoCommit", "yes"],
    ["config", "set", "workflow.publishMode", "maybe"],
    ["config", "set", "workflow.remote", ""],
    ["config", "set", "workflow.remote", "--origin"],
    ["config", "set", "workflow.remote", "bad remote"],
    ["config", "set", "workflow.baseBranch", "bad branch"],
    ["config", "set", "project.name", "Inventory", "extra"],
  ]) {
    const result = await runSpecwrightCommand(ctx, argv);
    expect(result.ok).toBe(false);
    expect(await readConfig(cwd)).toEqual(before);
  }
});

test("discuss command returns generated prompt and preserves discuss artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-discuss-command-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["discuss", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toStartWith("# Specwright Discuss: 0001-inventory-crafting");
  expect(result.prompt).toContain(".specwright/changes/0001-inventory-crafting/discussion.md");
  expect(result.prompt).toContain(".specwright/changes/0001-inventory-crafting/intent.md");
  expect(result.prompt).toContain(".specwright/changes/0001-inventory-crafting/constraints.md");
  expect(result.prompt).toContain(".specwright/changes/0001-inventory-crafting/decisions.md");

  const decisions = await readFile(join(cwd, ".specwright/changes/0001-inventory-crafting/decisions.md"), "utf8");
  expect(decisions).toContain("# Decisions");
  expect(decisions).toContain("## Settled");
});

test("git runner detects worktrees and constructs lifecycle branch names", async () => {
  const outside = await mkdtemp(join(tmpdir(), "specwright-not-git-"));
  expect(await isGitWorktree(outside)).toBe(false);
  expect(await gitWorktreeRoot(outside)).toBeUndefined();

  const cwd = await initGitRepo("specwright-git-detect-");
  expect(await isGitWorktree(cwd)).toBe(true);
  expect(await gitWorktreeRoot(cwd)).toBe(cwd);
  expect(branchNameForChange({ kind: "feature", id: "0005", slug: "integrate-git-and-gh-commands" })).toBe(
    "feature/0005-integrate-git-and-gh-commands",
  );
  expect(branchNameForChange({
    kind: "bugfix",
    id: "0010",
    slug: "strengthen-specwright-omp-lifecycle-subagent-routing-guardrails-so-orchestrator",
  })).toBe("bugfix/0010-strengthen-specwright-omp-lifecycle");
});

test("git runner stages explicit files and commits only staged content", async () => {
  const cwd = await initGitRepo("specwright-git-stage-");
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");
  await writeFile(join(cwd, "unrelated.txt"), "unrelated\n", "utf8");

  await stageFiles(cwd, ["tracked.txt"]);
  const staged = await expectGit(cwd, ["diff", "--cached", "--name-only"]);
  expect(staged.stdout.trim()).toBe("tracked.txt");

  await commitStaged(cwd, "Specwright checkpoint");
  const subject = await expectGit(cwd, ["log", "-1", "--pretty=%s"]);
  expect(subject.stdout.trim()).toBe("Specwright checkpoint");

  const status = await expectGit(cwd, ["status", "--short"]);
  expect(status.stdout).toContain("?? unrelated.txt");
  expect(status.stdout).not.toContain("tracked.txt");
});

test("commitStaged adds a body with a second message paragraph", async () => {
  const cwd = await initGitRepo("specwright-git-commit-body-");
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");

  await stageFiles(cwd, ["tracked.txt"]);
  await commitStaged(cwd, "Specwright checkpoint", "Change: 0013\nTask: T002");

  const subject = await expectGit(cwd, ["log", "-1", "--pretty=%s"]);
  expect(subject.stdout.trim()).toBe("Specwright checkpoint");
  const body = await expectGit(cwd, ["log", "-1", "--pretty=%b"]);
  expect(body.stdout.trim()).toBe("Change: 0013\nTask: T002");
});

test("checkpoint command rejects invalid selectors and file lists", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-invalid-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");

  for (const argv of [
    ["checkpoint", "--summary", "Test validation", "--files", "tracked.txt"],
    ["checkpoint", "--phase", "plan", "--task", "T001", "--summary", "Test validation", "--files", "tracked.txt"],
    ["checkpoint", "--phase", "not-a-phase", "--summary", "Test validation", "--files", "tracked.txt"],
    ["checkpoint", "--phase", "plan", "--summary", "Test validation", "--files", ""],
    ["checkpoint", "--phase", "plan", "--summary", "Test validation", "--files", "tracked.txt,missing.txt"],
  ]) {
    const result = await runSpecwrightCommand(ctx, argv);
    expect(result.ok).toBe(false);
  }

  const staged = await expectGit(cwd, ["diff", "--cached", "--name-only"]);
  expect(staged.stdout.trim()).toBe("");
});

test("checkpoint rejects missing --summary", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-no-summary-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--task", "T001", "--files", "tracked.txt"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toContain("--summary");
});

test("checkpoint rejects blank --summary", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-blank-summary-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--task", "T001", "--summary", "   ", "--files", "tracked.txt"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toContain("--summary");
});

test("checkpoint accepts quoted summary with spaces", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-quoted-summary-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"), "- [ ] T001: Build inventory\n  - Files: `tracked.txt`\n", "utf8");
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--task", "T001", "--summary", "Implement checkpoint summary support", "--files", "tracked.txt"]);
  expect(result.ok).toBe(true);
});

test("commit alias also requires --summary", async () => {
  const cwd = await initGitRepo("specwright-commit-no-summary-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["commit", "0001-inventory-crafting", "--task", "T001", "--files", "tracked.txt"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toContain("--summary");
});

test("commit alias produces identical subject and body as checkpoint for the same task", async () => {
  const cwd = await initGitRepo("specwright-commit-alias-parity-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "- [ ] T001: Build inventory\n  - Files: `tracked.txt`\n",
    "utf8",
  );
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");

  const summary = "Implement checkpoint summary support";
  const checkpoint = await runSpecwrightCommand(ctx, [
    "checkpoint", "0001-inventory-crafting", "--task", "T001",
    "--summary", summary, "--files", "tracked.txt",
  ]);
  expect(checkpoint.ok).toBe(true);

  const checkpointSubject = (await expectGit(cwd, ["log", "-1", "--pretty=%s"])).stdout.trim();
  const checkpointBody = (await expectGit(cwd, ["log", "-1", "--pretty=%b"])).stdout;

  // Reset to untracked state for a fair second run
  await runGit(cwd, ["reset", "HEAD~1"]);
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");

  const commit = await runSpecwrightCommand(ctx, [
    "commit", "0001-inventory-crafting", "--task", "T001",
    "--summary", summary, "--files", "tracked.txt",
  ]);
  expect(commit.ok).toBe(true);

  const commitSubject = (await expectGit(cwd, ["log", "-1", "--pretty=%s"])).stdout.trim();
  const commitBody = (await expectGit(cwd, ["log", "-1", "--pretty=%b"])).stdout;

  expect(commitSubject).toBe(checkpointSubject);
  expect(commitSubject).toBe("[0001-T001] Implement checkpoint summary support");
  expect(commitBody).toBe(checkpointBody);
  expect(commitBody).toContain("Unit: task T001");
  expect(commitBody).toContain("Summary: Implement checkpoint summary support");
  expect(commitBody).toContain("Task title: Build inventory");
});


test("checkpoint and commit aliases stage scoped files with deterministic messages", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"), "- [ ] T001: Build inventory\n  - Files: `tracked.txt`\n", "utf8");
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");
  await writeFile(join(cwd, "unrelated.txt"), "unrelated\n", "utf8");

  const checkpoint = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--task", "T001", "--summary", "Build inventory", "--files", "tracked.txt"]);
  expect(checkpoint.ok).toBe(true);
  let subject = await expectGit(cwd, ["log", "-1", "--pretty=%s"]);
  expect(subject.stdout.trim()).toBe("[0001-T001] Build inventory");
  let body = await expectGit(cwd, ["log", "-1", "--pretty=%b"]);
  expect(body.stdout).toContain("Change: 0001-inventory-crafting");
  expect(body.stdout).toContain("Unit: task T001");
  expect(body.stdout).toContain("Summary: Build inventory");
  expect(body.stdout).toContain("Task title: Build inventory");
  expect(body.stdout).toContain("Files:\n- tracked.txt");
  let status = await expectGit(cwd, ["status", "--short"]);
  expect(status.stdout).toContain("?? unrelated.txt");
  expect(status.stdout).not.toContain("tracked.txt");

  await writeFile(join(cwd, "phase.txt"), "phase\n", "utf8");
  const commit = await runSpecwrightCommand(ctx, ["commit", "0001-inventory-crafting", "--phase", "plan", "--summary", "Plan the work", "--files", "phase.txt"]);
  expect(commit.ok).toBe(true);
  subject = await expectGit(cwd, ["log", "-1", "--pretty=%s"]);
  expect(subject.stdout.trim()).toBe("[0001-plan] Plan the work");
  body = await expectGit(cwd, ["log", "-1", "--pretty=%b"]);
  expect(body.stdout).toContain("Change: 0001-inventory-crafting");
  expect(body.stdout).toContain("Unit: phase plan");
  expect(body.stdout).toContain("Summary: Plan the work");
  expect(body.stdout).toContain("Phase: plan");
  expect(body.stdout).toContain("Files:\n- phase.txt");
  status = await expectGit(cwd, ["status", "--short"]);
  expect(status.stdout).not.toContain("phase.txt");
});

test("phase checkpoint does not sync task metadata but stages state.json when tasks.md is present", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-phase-no-sync-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  const planPath = ".specwright/changes/0001-inventory-crafting/plan.md";
  const tasksPath = ".specwright/changes/0001-inventory-crafting/tasks.md";
  await writeFile(join(cwd, planPath), "# Plan\n\nUse evidence.\n", "utf8");
  await writeFile(join(cwd, tasksPath), "- [ ] T001: Build inventory\n  - Files: `tracked.txt`\n", "utf8");
  const stateBefore = await readFile(join(cwd, ".specwright/state.json"), "utf8");
  const checkpoint = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--phase", "plan", "--summary", "Plan the work", "--files", `${planPath},${tasksPath}`]);
  expect(checkpoint.ok).toBe(true);
  const stateAfter = await readFile(join(cwd, ".specwright/state.json"), "utf8");
  expect(stateAfter).toBe(stateBefore);
  const committed = await expectGit(cwd, ["show", "--name-only", "--pretty=format:", "HEAD"]);
  expect(committed.stdout.trim().split(/\r?\n/).filter(Boolean).sort()).toEqual([planPath, tasksPath].sort());
});

test("task checkpoint stages derived state when task sync changes cache", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-task-state-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"), "- [ ] T001: Build inventory\n  - Files: `tracked.txt`\n", "utf8");
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");

  const checkpoint = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--task", "T001", "--summary", "Build inventory", "--files", "tracked.txt"]);
  expect(checkpoint.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].tasks.T001.status).toBe("pending");
  const committed = await expectGit(cwd, ["show", "--name-only", "--pretty=format:", "HEAD"]);
  expect(committed.stdout.trim().split(/\r?\n/).filter(Boolean).sort()).toEqual([".specwright/state.json", "tracked.txt"].sort());
});
test("task checkpoint commits tasks.md when only non-cached task metadata changed", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-task-meta-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  const tasksPath = ".specwright/changes/0001-inventory-crafting/tasks.md";
  await writeFile(join(cwd, tasksPath), "- [ ] T001: Build inventory\n  - Files: `tracked.txt`\n", "utf8");
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");
  // First checkpoint — syncs task into state
  const checkpoint1 = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--task", "T001", "--summary", "Build inventory", "--files", "tracked.txt"]);
  expect(checkpoint1.ok).toBe(true);
  // Edit metadata only (Files bullet), not checkbox or title. Files metadata is not cached in state.
  await writeFile(join(cwd, tasksPath), "- [ ] T001: Build inventory\n  - Files: `other.txt`\n", "utf8");
  // Second checkpoint commits the changed tasks.md; unchanged tracked.txt and unchanged state.json are not part of the git diff.
  const checkpoint2 = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--task", "T001", "--summary", "Build inventory", "--files", `${tasksPath},tracked.txt`]);
  expect(checkpoint2.ok).toBe(true);
  const committed = await expectGit(cwd, ["show", "--name-only", "--pretty=format:", "HEAD"]);
  expect(committed.stdout.trim().split(/\r?\n/).filter(Boolean).sort()).toEqual([tasksPath].sort());
});
test("task checkpoint fails when sync detects duplicate task IDs", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-task-dup-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  const tasksPath = ".specwright/changes/0001-inventory-crafting/tasks.md";
  await writeFile(
    join(cwd, tasksPath),
    "- [ ] T001: Build inventory\n- [ ] T001: Duplicate inventory\n",
    "utf8",
  );
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");
  const stateBefore = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  const checkpoint = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--task", "T001", "--summary", "Build inventory", "--files", `${tasksPath},tracked.txt`]);
  expect(checkpoint.ok).toBe(false);
  expect(checkpoint.summary).toContain("Duplicate");
  const stateAfter = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(stateAfter).toEqual(stateBefore);
});
test("task checkpoint fails when sync detects malformed task lines", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-task-bad-line-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  const tasksPath = ".specwright/changes/0001-inventory-crafting/tasks.md";
  await writeFile(
    join(cwd, tasksPath),
    "- [maybe] T001: Build inventory\n",
    "utf8",
  );
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");
  const stateBefore = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  const checkpoint = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--task", "T001", "--summary", "Build inventory", "--files", `${tasksPath},tracked.txt`]);
  expect(checkpoint.ok).toBe(false);
  expect(checkpoint.summary).toContain("Malformed");
  const stateAfter = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(stateAfter).toEqual(stateBefore);
});

test("base branch resolves from config, remote HEAD, then main fallback", async () => {
  const configuredCwd = await mkdtemp(join(tmpdir(), "specwright-base-config-"));
  const configuredCtx = testContext(configuredCwd);
  expect((await runSpecwrightCommand(configuredCtx, ["init"])).ok).toBe(true);
  const configured = await readConfig(configuredCwd);
  configured.workflow.baseBranch = "release";
  expect(await resolveBaseBranch(configuredCwd, configured)).toBe("release");

  const remoteHeadCwd = await initGitRepo("specwright-base-remote-head-");
  const remoteHeadCtx = testContext(remoteHeadCwd);
  expect((await runSpecwrightCommand(remoteHeadCtx, ["init"])).ok).toBe(true);
  await expectGit(remoteHeadCwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk"]);
  expect(await resolveBaseBranch(remoteHeadCwd, await readConfig(remoteHeadCwd))).toBe("trunk");

  const fallbackCwd = await initGitRepo("specwright-base-fallback-");
  const fallbackCtx = testContext(fallbackCwd);
  expect((await runSpecwrightCommand(fallbackCtx, ["init"])).ok).toBe(true);
  expect(await resolveBaseBranch(fallbackCwd, await readConfig(fallbackCwd))).toBe("main");
});

test("gh runner passes argv and disables prompts and update notifiers", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-gh-runner-"));
  const binDir = join(cwd, "bin");
  await mkdir(binDir);
  const capture = join(cwd, "gh-capture.json");
  const ghPath = join(binDir, "gh");
  await writeFile(
    ghPath,
    `#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
writeFileSync(process.env.SPECWRIGHT_GH_CAPTURE, JSON.stringify({
  argv: process.argv.slice(2),
  env: {
    GH_PROMPT_DISABLED: process.env.GH_PROMPT_DISABLED,
    GH_NO_UPDATE_NOTIFIER: process.env.GH_NO_UPDATE_NOTIFIER,
    GH_NO_EXTENSION_UPDATE_NOTIFIER: process.env.GH_NO_EXTENSION_UPDATE_NOTIFIER,
    GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT
  }
}));
`,
    "utf8",
  );
  await chmod(ghPath, 0o755);

  const result = await runGh(cwd, ["pr", "create", "--title", "Specwright"], {
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
    SPECWRIGHT_GH_CAPTURE: capture,
  });

  expect(result.exitCode).toBe(0);
  const observed = JSON.parse(await readFile(capture, "utf8")) as {
    argv: string[];
    env: Record<string, string>;
  };
  expect(observed.argv).toEqual(["pr", "create", "--title", "Specwright"]);
  expect(observed.env).toEqual({
    GH_PROMPT_DISABLED: "1",
    GH_NO_UPDATE_NOTIFIER: "1",
    GH_NO_EXTENSION_UPDATE_NOTIFIER: "1",
    GIT_TERMINAL_PROMPT: "0",
  });
});

function changeFixture(id: string, slug: string, title: string): ChangeState {
  return {
    id,
    slug,
    title,
    kind: "feature",
    pack: "core",
    mode: "lite",
    status: "executing",
    step: "execute",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
    tasks: {},
  };
}
test("task artifact sync preserves runtime statuses only for matching unchecked tasks", () => {
  const now = new Date("2026-06-08T01:00:00.000Z");
  const change: ChangeState = {
    ...changeFixture("0001", "inventory-crafting", "Inventory Crafting"),
    tasks: {
      T001: { id: "T001", title: "Build inventory", status: "in-progress", updatedAt: "old" },
      T002: { id: "T002", title: "Review recipes", status: "blocked", updatedAt: "old" },
      T003: { id: "T003", title: "Ship inventory", status: "done", updatedAt: "old" },
    },
  };

  const result = syncChangeTasksFromMarkdown(change, [
    "- [ ] T001: Build inventory",
    "- [ ] T002: Review crafting recipes",
    "- [ ] T003: Ship inventory",
    "- [x] T004: Verify inventory",
  ].join("\n"), now);

  expect(result.change.tasks.T001?.status).toBe("in-progress");
  expect(result.change.tasks.T002?.status).toBe("pending");
  expect(result.change.tasks.T003?.status).toBe("pending");
  expect(result.change.tasks.T004?.status).toBe("done");
  expect(result.change.tasks.T002?.title).toBe("Review crafting recipes");
  expect(result.issues.map((issue) => issue.kind)).toEqual(["title-drift"]);
});

test("task artifact sync reports malformed and duplicate task lines deterministically", () => {
  const result = syncChangeTasksFromMarkdown(changeFixture("0001", "inventory-crafting", "Inventory Crafting"), [
    "- [ ] T001: Build inventory",
    "- [x] T001: Duplicate inventory",
    "- [maybe] T002: Bad checkbox",
    "- [ ] T003 Missing colon",
    "- [X] T004: Verify inventory",
  ].join("\n"), new Date("2026-06-08T01:00:00.000Z"));
  const issueKinds: TaskSyncIssueKind[] = result.issues.map((issue) => issue.kind);

  expect(Object.keys(result.change.tasks)).toEqual(["T001", "T004"]);
  expect(result.change.tasks.T001?.title).toBe("Build inventory");
  expect(result.change.tasks.T001?.status).toBe("pending");
  expect(result.change.tasks.T004?.status).toBe("done");
  expect(issueKinds).toEqual(["duplicate-task-id", "malformed-task-line", "malformed-task-line"]);
});

test("syncChangeTasksFromMarkdown emits cached-task-without-artifact issues", () => {
  const now = new Date("2026-06-08T01:00:00.000Z");
  const change: ChangeState = {
    ...changeFixture("0001", "inventory-crafting", "Inventory Crafting"),
    tasks: {
      T001: { id: "T001", title: "Build inventory", status: "in-progress", updatedAt: "old" },
      T002: { id: "T002", title: "Review recipes", status: "blocked", updatedAt: "old" },
    },
  };
  const result = syncChangeTasksFromMarkdown(change, "- [ ] T001: Build inventory\n", now);
  expect(result.issues.map((issue) => issue.kind)).toEqual(["cached-task-without-artifact"]);
  expect(result.issues[0]?.taskId).toBe("T002");
  expect(result.issues[0]?.message).toContain("T002");
});
test("syncChangeTasksFromFileIfPresent does not call updateCachedChange when sync returns issues", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-sync-dirty-no-persist-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  let change = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8")).changes["0001"];
  change = {
    ...change,
    tasks: {
      T001: { id: "T001", title: "Build inventory", status: "in-progress", updatedAt: "old" },
      T002: { id: "T002", title: "Review recipes", status: "blocked", updatedAt: "old" },
    },
  };
  await upsertChange(cwd, change);

  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "# Tasks\n\n- [ ] T001: Build inventory\n- [ ] T001: Duplicate\n",
    "utf8",
  );

  const result = await syncChangeTasksFromFileIfPresent(cwd, change, ctx.now());
  expect(result.issues.length).toBeGreaterThan(0);
  expect(result.issues.map((issue) => issue.kind)).toContain("duplicate-task-id");

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].tasks.T001.title).toBe("Build inventory");
  expect(state.changes["0001"].tasks.T002.title).toBe("Review recipes");
});
test("task file sync updates a non-current change without changing currentChange", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-passive-task-sync-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Quest Board"])).ok).toBe(true);

  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "- [x] T001: Build inventory\n- [ ] T002: Review recipes\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["tasks", "0001-inventory-crafting"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.currentChange).toBe("0002");
  expect(state.changes["0001"].tasks.T001.status).toBe("done");
  expect(state.changes["0001"].tasks.T002.status).toBe("pending");
  expect(state.changes["0002"].tasks).toEqual({});
});

type TestCommandContext = ReturnType<typeof testContext>;

function taskListMarkdown(firstChecked: boolean, secondChecked: boolean): string {
  return [
    `- [${firstChecked ? "x" : " "}] T001: Build inventory`,
    "  - Acceptance: Inventory builds.",
    "  - Verification: bun test inventory.",
    "",
    `- [${secondChecked ? "x" : " "}] T002: Review recipes`,
    "  - Acceptance: Recipes are reviewed.",
    "  - Verification: bun test recipes.",
    "",
  ].join("\n");
}

async function createCommandSyncFixture(prefix: string, tasksMarkdown: string): Promise<{ cwd: string; ctx: TestCommandContext; dir: string }> {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const dir = join(cwd, ".specwright/changes/0001-inventory-crafting");
  await writeFile(join(dir, "intent.md"), "# Intent\n\nShip inventory crafting.\n", "utf8");
  await writeFile(join(dir, "evidence.md"), "# Evidence\n\nLocal evidence exists.\n", "utf8");
  await writeFile(join(dir, "plan.md"), "# Plan\n\nUse evidence.md.\n", "utf8");
  await writeFile(join(dir, "tasks.md"), tasksMarkdown, "utf8");
  await writeFile(join(dir, "verify.md"), "# Verification\n\n## Observed output\n\nObserved command output: ok.\n", "utf8");
  return { cwd, ctx, dir };
}

test("status syncs task artifact changes before rendering progress", async () => {
  const { cwd, ctx } = await createCommandSyncFixture("specwright-status-sync-", taskListMarkdown(true, false));

  const result = await runSpecwrightCommand(ctx, ["status"]);
  expect(result.ok).toBe(true);
  expect(result.summary).toContain("tasks=1/2");
  expect(result.statusText).toContain("tasks=1/2");

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].tasks.T001.status).toBe("done");
  expect(state.changes["0001"].tasks.T002.status).toBe("pending");
});

test("execute syncs task artifact changes before selecting next pending task", async () => {
  const { cwd, ctx, dir } = await createCommandSyncFixture("specwright-execute-sync-", taskListMarkdown(false, false));
  expect((await runSpecwrightCommand(ctx, ["tasks"])).ok).toBe(true);
  await writeFile(join(dir, "tasks.md"), taskListMarkdown(true, false), "utf8");

  const result = await runSpecwrightCommand(ctx, ["execute"]);
  expect(result.ok).toBe(true);
  expect(result.summary).toBe("Prepared execute prompt for T002.");
  expect(result.prompt).toContain("- [ ] T002: Review recipes");

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].tasks.T001.status).toBe("done");
  expect(state.changes["0001"].tasks.T002.status).toBe("in-progress");
});

test("verify syncs task artifact changes before updating change status", async () => {
  const { cwd, ctx, dir } = await createCommandSyncFixture("specwright-verify-sync-", taskListMarkdown(false, false));
  expect((await runSpecwrightCommand(ctx, ["tasks"])).ok).toBe(true);
  await writeFile(join(dir, "tasks.md"), taskListMarkdown(true, false), "utf8");

  const result = await runSpecwrightCommand(ctx, ["verify"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].status).toBe("verifying");
  expect(state.changes["0001"].step).toBe("verify");
  expect(state.changes["0001"].tasks.T001.status).toBe("done");
  expect(state.changes["0001"].tasks.T002.status).toBe("pending");
});

test("verify preserves existing observed command output", async () => {
  const { cwd, ctx, dir } = await createCommandSyncFixture("specwright-verify-preserve-output-", taskListMarkdown(false, false));
  const observedOutput = "```\n$ bun test\nTest Results:\n   PASS: 2 passed\n```\n";
  await writeFile(join(dir, "verify.md"), `# Verification\n\n## Result\n\nPASS\n\n## Issues\n\nNo issues.\n\n## Observed output\n\n${observedOutput}`, "utf8");

  const result = await runSpecwrightCommand(ctx, ["verify"]);
  expect(result.ok).toBe(true);

  const verify = await readFile(join(dir, "verify.md"), "utf8");
  expect(verify).toContain(observedOutput);
});
test("verify reports SW009 for title drift even when tasks.md was edited", async () => {
  const { cwd, ctx, dir } = await createCommandSyncFixture("specwright-verify-drift-", taskListMarkdown(false, false));
  expect((await runSpecwrightCommand(ctx, ["tasks"])).ok).toBe(true);
  await writeFile(join(dir, "tasks.md"), taskListMarkdown(false, false).replace("Build inventory", "Build inventory v2"), "utf8");
  const result = await runSpecwrightCommand(ctx, ["verify", "--json"]);
  expect(result.ok).toBe(false);
  const report = JSON.parse(result.summary);
  const sw009 = report.issues.filter((issue: { code: string }) => issue.code === "SW009");
  expect(sw009.length).toBeGreaterThan(0);
  expect(sw009.some((issue: { message: string }) => issue.message.includes("title changed"))).toBe(true);
  // State should NOT have been updated with the drifted title
  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].tasks.T001.title).toBe("Build inventory");
});

test("handoff syncs task artifact changes before computing completion", async () => {
  const { cwd, ctx, dir } = await createCommandSyncFixture("specwright-handoff-sync-", taskListMarkdown(false, false));
  expect((await runSpecwrightCommand(ctx, ["tasks"])).ok).toBe(true);
  await writeFile(join(dir, "tasks.md"), taskListMarkdown(true, true), "utf8");

  const result = await runSpecwrightCommand(ctx, ["handoff"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("No incomplete tasks.");

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].status).toBe("done");
  expect(state.changes["0001"].step).toBe("handoff");
  expect(state.changes["0001"].tasks.T001.status).toBe("done");
  expect(state.changes["0001"].tasks.T002.status).toBe("done");
});
test("discuss resyncs task artifact changes before rendering prompt", async () => {
  const { cwd, ctx, dir } = await createCommandSyncFixture("specwright-discuss-sync-", taskListMarkdown(false, false));
  expect((await runSpecwrightCommand(ctx, ["tasks"])).ok).toBe(true);
  await writeFile(join(dir, "tasks.md"), taskListMarkdown(true, false), "utf8");

  const result = await runSpecwrightCommand(ctx, ["discuss"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].tasks.T001.status).toBe("done");
  expect(state.changes["0001"].tasks.T002.status).toBe("pending");
});

test("research resyncs task artifact changes before rendering prompt", async () => {
  const { cwd, ctx, dir } = await createCommandSyncFixture("specwright-research-sync-", taskListMarkdown(false, false));
  expect((await runSpecwrightCommand(ctx, ["tasks"])).ok).toBe(true);
  await writeFile(join(dir, "tasks.md"), taskListMarkdown(true, false), "utf8");

  const result = await runSpecwrightCommand(ctx, ["research"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].tasks.T001.status).toBe("done");
  expect(state.changes["0001"].tasks.T002.status).toBe("pending");
});

test("plan resyncs task artifact changes before rendering prompt", async () => {
  const { cwd, ctx, dir } = await createCommandSyncFixture("specwright-plan-sync-", taskListMarkdown(false, false));
  expect((await runSpecwrightCommand(ctx, ["tasks"])).ok).toBe(true);
  await writeFile(join(dir, "tasks.md"), taskListMarkdown(true, false), "utf8");

  const result = await runSpecwrightCommand(ctx, ["plan"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.changes["0001"].tasks.T001.status).toBe("done");
  expect(state.changes["0001"].tasks.T002.status).toBe("pending");
});



test("pull request body is generated from populated Specwright artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-pr-body-populated-"));
  const change = changeFixture("0001", "inventory-crafting", "Inventory Crafting");
  const artifactDir = join(cwd, ".specwright/changes/0001-inventory-crafting");
  await mkdir(artifactDir, { recursive: true });

  await writeFile(
    join(artifactDir, "intent.md"),
    `# Intent

<!-- Specwright artifact: preserve human-owned sections and update only the relevant headings. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
## Goal

Ship deterministic inventory crafting.

## Users

- Crafters

</frozen-after-approval>
`,
    "utf8",
  );
  await writeFile(
    join(artifactDir, "plan.md"),
    `# Plan

## Decision

Build curated lifecycle automation.

## Implementation plan

1. Generate PR bodies from artifacts.
`,
    "utf8",
  );
  await writeFile(join(artifactDir, "tasks.md"), "- [x] T001: Build inventory\n- [ ] T002: Publish workflow\n", "utf8");
  await writeFile(
    join(artifactDir, "verify.md"),
    `# Verify

## Result

Focused PR body tests pass.
`,
    "utf8",
  );
  await writeFile(
    join(artifactDir, "decisions.md"),
    `# Decisions

## Settled

- Use noninteractive gh.

## Deferred

- Arbitrary passthrough.

## Blocking facts

- This should not appear in the PR body.
`,
    "utf8",
  );
  await writeFile(
    join(artifactDir, "evidence.md"),
    `# Evidence

## Local evidence

- Existing command seams are centralized.
`,
    "utf8",
  );
  await writeFile(
    join(artifactDir, "sources.md"),
    `# Sources

## URLs

- https://cli.github.com/manual/gh_pr_create
`,
    "utf8",
  );
  await writeFile(
    join(artifactDir, "handoff.md"),
    `# Handoff

## Next task

Implement publish modes.
`,
    "utf8",
  );

  const bodyPath = await writePullRequestBodyFile(cwd, change);
  const body = await readFile(bodyPath, "utf8");
  expect(bodyPath.endsWith(join(".specwright", "tmp", "pull-request-0001-inventory-crafting.md"))).toBe(true);
  expect(body).toContain("## Summary\n\n### Goal\n\nShip deterministic inventory crafting.");
  expect(body).toContain("## Changes");
  expect(body).toContain("### Decision\n\nBuild curated lifecycle automation.");
  expect(body).toContain("- [x] T001: Build inventory");
  expect(body).toContain("## Verification\n\n### Result\n\nFocused PR body tests pass.");
  expect(body).toContain("## Key Decisions");
  expect(body).toContain("- Use noninteractive gh.");
  expect(body).toContain("## Evidence / Sources");
  expect(body).toContain("https://cli.github.com/manual/gh_pr_create");
  expect(body).toContain("## Handoff / Next Steps");
  expect(body).toContain("Implement publish modes.");
  expect(body).not.toContain("human-owned intent");
  expect(body).not.toContain("# Intent");
  expect(body).not.toContain("This should not appear");
});

test("pull request body omits empty and missing optional artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-pr-body-sparse-"));
  const change = changeFixture("0002", "sparse-change", "Sparse Change");
  const artifactDir = join(cwd, ".specwright/changes/0002-sparse-change");
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    join(artifactDir, "intent.md"),
    `# Intent

## Goal

Keep sparse artifacts useful.
`,
    "utf8",
  );
  await writeFile(
    join(artifactDir, "verify.md"),
    `# Verify

## Result

`,
    "utf8",
  );

  const body = await generatePullRequestBody(cwd, change);
  expect(body).toBe("## Summary\n\n### Goal\n\nKeep sparse artifacts useful.\n");
  expect(body).not.toContain("## Verification");
  expect(body).not.toContain("## Evidence / Sources");
});

test("publish none performs no remote work and help lists publish modes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-publish-none-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const publish = await runSpecwrightCommand(ctx, ["publish", "--mode", "none"]);
  expect(publish.ok).toBe(true);
  expect(publish.summary).toContain("no remote work");

  const help = await runSpecwrightCommand(ctx, ["help"]);
  expect(help.summary).toContain("specwright publish [<change>] [--mode none|push|pr]");
});

test("publish push uses configured mode and pushes current branch to remote", async () => {
  const cwd = await initGitRepo("specwright-publish-push-");
  const remote = await mkdtemp(join(tmpdir(), "specwright-publish-push-remote-"));
  const ctx = testContext(cwd);
  await expectGit(remote, ["init", "--bare"]);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await expectGit(cwd, ["remote", "add", "origin", remote]);
  expect((await runSpecwrightCommand(ctx, ["config", "set", "workflow.publishMode", "push"])).ok).toBe(true);

  const branch = (await expectGit(cwd, ["branch", "--show-current"])).stdout.trim();
  const publish = await runSpecwrightCommand(ctx, ["publish"]);
  expect(publish.ok).toBe(true);
  expect(publish.summary).toBe(`Pushed ${branch} to origin.`);
  await expectGit(remote, ["show-ref", "--verify", `refs/heads/${branch}`]);
});

test("publish pr pushes and invokes gh pr create with explicit noninteractive flags", async () => {
  const cwd = await initGitRepo("specwright-publish-pr-");
  const remote = await mkdtemp(join(tmpdir(), "specwright-publish-pr-remote-"));
  const binDir = join(cwd, "bin");
  const capture = join(cwd, "gh-publish-capture.json");
  const ctx = testContext(cwd);
  await expectGit(remote, ["init", "--bare"]);
  await mkdir(binDir);
  const ghPath = join(binDir, "gh");
  await writeFile(
    ghPath,
    `#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
writeFileSync(process.env.SPECWRIGHT_GH_CAPTURE, JSON.stringify({
  argv: process.argv.slice(2),
  env: {
    GH_PROMPT_DISABLED: process.env.GH_PROMPT_DISABLED,
    GH_NO_UPDATE_NOTIFIER: process.env.GH_NO_UPDATE_NOTIFIER,
    GH_NO_EXTENSION_UPDATE_NOTIFIER: process.env.GH_NO_EXTENSION_UPDATE_NOTIFIER,
    GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT
  }
}));
`,
    "utf8",
  );
  await chmod(ghPath, 0o755);

  const originalPath = process.env.PATH;
  const originalCapture = process.env.SPECWRIGHT_GH_CAPTURE;
  try {
    process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
    process.env.SPECWRIGHT_GH_CAPTURE = capture;
    expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
    expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
    await expectGit(cwd, ["remote", "add", "origin", remote]);
    expect((await runSpecwrightCommand(ctx, ["config", "set", "workflow.baseBranch", "release"])).ok).toBe(true);

    const branch = (await expectGit(cwd, ["branch", "--show-current"])).stdout.trim();
    const publish = await runSpecwrightCommand(ctx, ["publish", "--mode", "pr"]);
    expect(publish.ok).toBe(true);
    expect(publish.filesCreated).toHaveLength(1);
    const bodyFile = publish.filesCreated[0];
    expect(bodyFile).toBeDefined();
    await expectGit(remote, ["show-ref", "--verify", `refs/heads/${branch}`]);

    const observed = JSON.parse(await readFile(capture, "utf8")) as {
      argv: string[];
      env: Record<string, string>;
    };
    expect(observed.argv).toEqual([
      "pr",
      "create",
      "--title",
      "0001-inventory-crafting: Inventory Crafting",
      "--body-file",
      bodyFile as string,
      "--base",
      "release",
      "--head",
      branch,
    ]);
    expect(observed.env).toEqual({
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
      GH_NO_EXTENSION_UPDATE_NOTIFIER: "1",
      GIT_TERMINAL_PROMPT: "0",
    });
    expect((await readFile(bodyFile as string, "utf8")).length).toBeGreaterThan(0);
  } finally {
    process.env.PATH = originalPath;
    if (originalCapture === undefined) {
      delete process.env.SPECWRIGHT_GH_CAPTURE;
    } else {
      process.env.SPECWRIGHT_GH_CAPTURE = originalCapture;
    }
  }
});

test("publish pr reports gh execution failures", async () => {
  const cwd = await initGitRepo("specwright-publish-pr-fail-");
  const remote = await mkdtemp(join(tmpdir(), "specwright-publish-pr-fail-remote-"));
  const binDir = join(cwd, "bin");
  const ctx = testContext(cwd);
  await expectGit(remote, ["init", "--bare"]);
  await mkdir(binDir);
  const ghPath = join(binDir, "gh");
  await writeFile(
    ghPath,
    `#!/usr/bin/env bun
console.error("authentication required");
process.exit(2);
`,
    "utf8",
  );
  await chmod(ghPath, 0o755);

  const originalPath = process.env.PATH;
  try {
    process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
    expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
    expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
    await expectGit(cwd, ["remote", "add", "origin", remote]);

    const publish = await runSpecwrightCommand(ctx, ["publish", "--mode", "pr"]);
    expect(publish.ok).toBe(false);
    expect(publish.summary).toContain("gh pr create failed: authentication required");
  } finally {
    process.env.PATH = originalPath;
  }
});
test("discuss on an explicit non-current change does not modify currentChange", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-discuss-non-current-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "First"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Second"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["discuss", "0001"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.currentChange).toBe("0002");
  expect(state.changes["0001"].step).toBe("discuss");
});

test("research on an explicit non-current change does not modify currentChange", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-research-non-current-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "First"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Second"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["research", "0001"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.currentChange).toBe("0002");
  expect(state.changes["0001"].step).toBe("research");
});

test("plan on an explicit non-current change does not modify currentChange", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-plan-non-current-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "First"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Second"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["plan", "0001"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.currentChange).toBe("0002");
  expect(state.changes["0001"].step).toBe("plan");
});

test("execute on an explicit non-current change does not modify currentChange", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-execute-non-current-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "First"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Second"])).ok).toBe(true);

  await writeFile(
    join(cwd, ".specwright/changes/0001-first/tasks.md"),
    "- [ ] T001: Build something\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["execute", "0001"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.currentChange).toBe("0002");
  expect(state.changes["0001"].step).toBe("execute");
  expect(state.changes["0001"].tasks.T001.status).toBe("in-progress");
});

test("verify on an explicit non-current change does not modify currentChange", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-verify-non-current-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "First"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Second"])).ok).toBe(true);

  await writeFile(
    join(cwd, ".specwright/changes/0001-first/tasks.md"),
    "- [ ] T001: Build something\n",
    "utf8",
  );
  await writeFile(
    join(cwd, ".specwright/changes/0001-first/intent.md"),
    "# Intent\n\n## Goal\n\nVerify the first change.\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["verify", "0001"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.currentChange).toBe("0002");
  expect(state.changes["0001"].step).toBe("verify");
});

test("handoff on an explicit non-current change does not modify currentChange", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-handoff-non-current-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "First"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Second"])).ok).toBe(true);

  await writeFile(
    join(cwd, ".specwright/changes/0001-first/tasks.md"),
    "- [x] T001: Build something\n",
    "utf8",
  );
  await writeFile(
    join(cwd, ".specwright/changes/0001-first/verify.md"),
    "# Verify\n\n## Observed output\n\n`bun test` passed.\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["handoff", "0001"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8"));
  expect(state.currentChange).toBe("0002");
  expect(state.changes["0001"].step).toBe("handoff");
});
function ompContext(cwd: string) {
  return { cwd, runtime: "omp" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
}

test("OMP runtime discuss uses ask dialog references", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-discuss-"));
  const ctx = ompContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["discuss", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("Use Oh My Pi `ask`");
  expect(result.prompt).toContain("You are the receiving OMP agent");
});

test("CLI runtime discuss does not use OMP references", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-cli-discuss-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["discuss", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).not.toContain("Use Oh My Pi `ask`");
  expect(result.prompt).not.toContain("You are the receiving OMP agent");
});

test("OMP runtime research uses task tool spawn strategy", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-research-"));
  const ctx = ompContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["research", "--online", "never", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("OMP's `task` tool");
  expect(result.prompt).toContain("OMP's bundled `task` agent");
  expect(result.prompt).not.toContain("retry the same assignment once with the default task agent");
});

test("CLI runtime research uses neutral spawn strategy", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-cli-research-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["research", "--online", "never", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).not.toContain("OMP's `task` tool");
  expect(result.prompt).toContain("retry the same assignment once with the default task agent");
});

test("OMP runtime plan uses task tool spawn strategy", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-plan-"));
  const ctx = ompContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/intent.md"), "# Intent\n", "utf8");
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/research.md"), "# Research\n", "utf8");
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/evidence.md"), "# Evidence\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["plan", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("OMP's `task` tool");
  expect(result.prompt).not.toContain("delegate to `specwright-planner`");
});

test("CLI runtime plan uses neutral spawn strategy", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-cli-plan-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/intent.md"), "# Intent\n", "utf8");
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/research.md"), "# Research\n", "utf8");
  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/evidence.md"), "# Evidence\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["plan", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).not.toContain("OMP's `task` tool");
  expect(result.prompt).toContain("delegate to `specwright-planner`");
});

test("OMP runtime execute uses task tool spawn strategy", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-execute-"));
  const ctx = ompContext(cwd);
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
});

test("CLI runtime execute uses neutral spawn strategy", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-cli-execute-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "- [ ] T001: Build inventory\n  - Files: `src/core/commands.ts`\n  - Action: Wire inventory.\n  - Acceptance: Inventory works.\n  - Verification: Run prompt tests.\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["execute", "--task", "T001", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).not.toContain("OMP's `task` tool");
  expect(result.prompt).toContain("delegate to `specwright-executor`");
});

test("OMP runtime verify uses task tool spawn strategy", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-verify-"));
  const ctx = ompContext(cwd);
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
});

test("CLI runtime verify uses neutral spawn strategy", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-cli-verify-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(
    join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"),
    "- [ ] T001: Build inventory\n  - Files: `src/core/commands.ts`\n  - Action: Wire inventory.\n  - Acceptance: Inventory works.\n  - Verification: Run prompt tests.\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["verify", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).not.toContain("OMP's `task` tool");
  expect(result.prompt).toContain("delegate to `specwright-verifier`");
});
test("complete none has no side effects and sets status to done", async () => {
  const { cwd, ctx, remote } = await createCompleteFixture("specwright-complete-none-");

  const result = await runSpecwrightCommand(ctx, ["complete", "--mode", "none"]);
  expect(result.ok).toBe(true);
  expect(result.summary).toContain("Complete mode: none");

  const state = JSON.parse(await readFile(join(cwd, ".specwright", "state.json"), "utf8")) as {
    changes: Record<string, { status: string; step: string }>;
  };
  const changeId = Object.keys(state.changes)[0];
  expect(changeId).toBeDefined();
  expect(state.changes[changeId ?? ""]?.status).toBe("done");
  expect(state.changes[changeId ?? ""]?.step).toBe("handoff");

  // Verify no push occurred.
  const branch = "feature/0001-inventory-crafting";
  const remoteRef = await runGit(remote, ["show-ref", "--verify", `refs/heads/${branch}`]);
  expect(remoteRef.exitCode).not.toBe(0);
});

test("complete push pushes current branch to remote", async () => {
  const { cwd, ctx, branch, remote } = await createCompleteFixture("specwright-complete-push-");

  const result = await runSpecwrightCommand(ctx, ["complete", "--mode", "push"]);
  expect(result.ok).toBe(true);
  expect(result.summary).toContain(`Pushed ${branch} to origin`);
  await expectGit(remote, ["show-ref", "--verify", `refs/heads/${branch}`]);

  const state = JSON.parse(await readFile(join(cwd, ".specwright", "state.json"), "utf8")) as {
    changes: Record<string, { status: string; step: string }>;
  };
  const changeId = Object.keys(state.changes)[0];
  expect(changeId).toBeDefined();
  expect(state.changes[changeId ?? ""]?.status).toBe("done");
  expect(state.changes[changeId ?? ""]?.step).toBe("handoff");
});

test("complete merge switches to base and creates no-fast-forward merge commit", async () => {
  const cwd = await initGitRepo("specwright-complete-merge-");
  const ctx = testContext(cwd);
  const remote = await mkdtemp(join(tmpdir(), "specwright-complete-merge-remote-"));
  await expectGit(remote, ["init", "--bare"]);
  await expectGit(cwd, ["remote", "add", "origin", remote]);
  // Make main a real branch with a commit so we can switch back to it.
  await writeFile(join(cwd, "README.md"), "# project\n", "utf8");
  await stageFiles(cwd, ["README.md"]);
  await commitStaged(cwd, "initial");
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await expectGit(cwd, ["add", "--all"]);
  await expectGit(cwd, ["commit", "-m", "specwright setup"]);

  const changeDir = join(cwd, ".specwright", "changes", "0001-inventory-crafting");
  const statePath = join(cwd, ".specwright", "state.json");
  const state = JSON.parse(await readFile(statePath, "utf8")) as {
    currentChange: string;
    changes: Record<string, { step: string; tasks: Record<string, { id: string; title: string; status: string; updatedAt: string }> }>;
  };
  const changeId = state.currentChange;
  const change = state.changes[changeId];
  if (!change) throw new Error(`Change ${changeId} not found in state`);
  change.step = "execute";
  change.tasks["T001"] = { id: "T001", title: "Implement feature", status: "done", updatedAt: new Date().toISOString() };
  await writeFile(statePath, JSON.stringify(state), "utf8");

  await writeFile(
    join(changeDir, "tasks.md"),
    "# Tasks\n\n## Tasks\n\n- [x] T001: Implement feature\n\n### Acceptance\n\nFeature works.\n\n### Verification\n\nRun tests.\n",
    "utf8",
  );
  await writeFile(join(changeDir, "verify.md"), "# Verify\n\n## Observed output\n\n`bun test` passed.\n", "utf8");
  await writeFile(join(changeDir, "handoff.md"), "# Handoff\n\n## Goal\n\nImplement inventory crafting.\n", "utf8");
  await stageFiles(cwd, [join(changeDir, "tasks.md"), join(changeDir, "verify.md"), join(changeDir, "handoff.md"), statePath]);
  await commitStaged(cwd, "add tasks verify and handoff");

  const branch = (await expectGit(cwd, ["branch", "--show-current"])).stdout.trim();
  const result = await runSpecwrightCommand(ctx, ["complete", "--mode", "merge"]);
  expect(result.ok).toBe(true);
  expect(result.summary).toContain(`Merged ${branch} into main with --no-ff`);

  const currentBranch = (await expectGit(cwd, ["branch", "--show-current"])).stdout.trim();
  expect(currentBranch).toBe("main");

  const log = (await expectGit(cwd, ["log", "-1", "--pretty=%s"])).stdout.trim();
  expect(log).toContain(`Merge branch '${branch}'`);

  const parents = (await expectGit(cwd, ["rev-list", "--parents", "-n", "1", "HEAD"])).stdout.trim().split(/\s+/);
  expect(parents.length).toBe(3); // commit hash + two parent hashes

  const mergedState = JSON.parse(await readFile(statePath, "utf8")) as {
    changes: Record<string, { status: string; step: string }>;
  };
  expect(mergedState.changes[changeId]?.status).toBe("done");
  expect(mergedState.changes[changeId]?.step).toBe("handoff");

  // Verify no branch deletion.
  const localBranches = (await expectGit(cwd, ["branch", "--list", branch])).stdout.trim();
  expect(localBranches).toContain(branch);
});

test("complete command defaults to none when mode is omitted", async () => {
  const { ctx } = await createCompleteFixture("specwright-complete-default-");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(true);
  expect(result.summary).toContain("Complete mode: none");
});

test("complete command rejects invalid modes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-complete-invalid-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["complete", "--mode", "fast"]);
  expect(result.ok).toBe(false);
  expect(result.exitCode).toBe(1);
  expect(result.summary).toBe("Unknown option: --mode");
});

test("complete command accepts optional change positional", async () => {
  const cwd = await initGitRepo("specwright-complete-change-");
  const ctx = testContext(cwd);
  const remote = await mkdtemp(join(tmpdir(), "specwright-complete-change-remote-"));
  await expectGit(remote, ["init", "--bare"]);
  await expectGit(cwd, ["remote", "add", "origin", remote]);
  // Make main a real branch with a commit so we can switch back to it.
  await writeFile(join(cwd, "README.md"), "# project\n", "utf8");
  await stageFiles(cwd, ["README.md"]);
  await commitStaged(cwd, "initial");
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await expectGit(cwd, ["add", "--all"]);
  await expectGit(cwd, ["commit", "-m", "specwright setup"]);

  const changeDir = join(cwd, ".specwright", "changes", "0001-inventory-crafting");
  const statePath = join(cwd, ".specwright", "state.json");
  const state = JSON.parse(await readFile(statePath, "utf8")) as {
    currentChange: string;
    changes: Record<string, { step: string; tasks: Record<string, { id: string; title: string; status: string; updatedAt: string }> }>;
  };
  const changeId = state.currentChange;
  const change = state.changes[changeId];
  if (!change) throw new Error(`Change ${changeId} not found in state`);
  change.step = "execute";
  change.tasks["T001"] = { id: "T001", title: "Implement feature", status: "done", updatedAt: new Date().toISOString() };
  await writeFile(statePath, JSON.stringify(state), "utf8");

  await writeFile(
    join(changeDir, "tasks.md"),
    "# Tasks\n\n## Tasks\n\n- [x] T001: Implement feature\n\n### Acceptance\n\nFeature works.\n\n### Verification\n\nRun tests.\n",
    "utf8",
  );
  await writeFile(join(changeDir, "verify.md"), "# Verify\n\n## Observed output\n\n`bun test` passed.\n", "utf8");
  await writeFile(join(changeDir, "handoff.md"), "# Handoff\n\n## Goal\n\nImplement inventory crafting.\n", "utf8");
  await stageFiles(cwd, [join(changeDir, "tasks.md"), join(changeDir, "verify.md"), join(changeDir, "handoff.md"), statePath]);
  await commitStaged(cwd, "add tasks verify and handoff");

  const result = await runSpecwrightCommand(ctx, ["complete", "0001-inventory-crafting", "--mode", "merge"]);
  expect(result.ok).toBe(true);
  expect(result.summary).toContain("Merged");
});

test("help text lists complete usage", async () => {
  const help = renderHelp();
  expect(help).toContain("specwright complete [<change>] [--mode none|push|pr|merge]");
});

test("publish --mode merge still fails", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-publish-merge-fail-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["publish", "--mode", "merge"]);
  expect(result.ok).toBe(false);
  expect(result.exitCode).toBe(1);
  expect(result.summary).toBe("Unknown option: --mode");
});

test("complete fails when not in a git worktree", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-complete-no-git-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Complete requires a git worktree.");
});

test("complete fails for detached HEAD", async () => {
  const { cwd, ctx } = await createCompleteFixture("specwright-complete-detached-");
  await expectGit(cwd, ["checkout", "--detach", "HEAD"]);

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Complete requires a non-detached HEAD.");
});

test("complete fails when no current change exists", async () => {
  const cwd = await initGitRepo("specwright-complete-no-change-");
  const ctx = testContext(cwd);
  await expectGit(cwd, ["remote", "add", "origin", await mkdtemp(join(tmpdir(), "specwright-complete-no-change-remote-"))]);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toContain("No current Specwright change");
});

test("complete fails when branch does not match change", async () => {
  const cwd = await initGitRepo("specwright-complete-branch-mismatch-");
  const ctx = testContext(cwd);
  const remote = await mkdtemp(join(tmpdir(), "specwright-complete-branch-mismatch-remote-"));
  await expectGit(remote, ["init", "--bare"]);
  await expectGit(cwd, ["remote", "add", "origin", remote]);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await expectGit(cwd, ["checkout", "-b", "wrong-branch"]);

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toContain("does not match change branch");
});

test("complete fails when on the base branch", async () => {
  const cwd = await initGitRepo("specwright-complete-on-base-");
  const ctx = testContext(cwd);
  const remote = await mkdtemp(join(tmpdir(), "specwright-complete-on-base-remote-"));
  await expectGit(remote, ["init", "--bare"]);
  await expectGit(cwd, ["remote", "add", "origin", remote]);
  // Make an initial commit so that main is a real branch we can switch back to.
  await writeFile(join(cwd, "README.md"), "# project\n", "utf8");
  await stageFiles(cwd, ["README.md"]);
  await commitStaged(cwd, "initial");
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  // Persist state to main so findCurrentChange resolves there.
  const statePath = join(cwd, ".specwright", "state.json");
  const stateData = await readFile(statePath, "utf8");
  await expectGit(cwd, ["checkout", "main"]);
  await mkdir(join(cwd, ".specwright"), { recursive: true });
  await writeFile(statePath, stateData, "utf8");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toContain("does not match change branch");
});
test("complete fails when worktree is dirty", async () => {
  const cwd = await initGitRepo("specwright-complete-dirty-");
  const ctx = testContext(cwd);
  const remote = await mkdtemp(join(tmpdir(), "specwright-complete-dirty-remote-"));
  await expectGit(remote, ["init", "--bare"]);
  await expectGit(cwd, ["remote", "add", "origin", remote]);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await writeFile(join(cwd, "untracked.txt"), "dirty\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Complete requires a clean worktree. Commit or stash local changes first.");
});

test("complete guards run before push, pr, or merge side effects", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-complete-guards-first-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  for (const mode of ["push", "pr", "merge"] as const) {
    const result = await runSpecwrightCommand(ctx, ["complete", "--mode", mode]);
    expect(result.ok).toBe(false);
    expect(result.summary).toBe("Complete requires a git worktree.");
  }
});

test("isWorktreeClean returns true for clean worktree", async () => {
  const cwd = await initGitRepo("specwright-clean-");
  await writeFile(join(cwd, "tracked.txt"), "content\n", "utf8");
  await stageFiles(cwd, ["tracked.txt"]);
  await commitStaged(cwd, "initial");

  expect(await isWorktreeClean(cwd)).toBe(true);
});

test("isWorktreeClean returns false for dirty worktree", async () => {
  const cwd = await initGitRepo("specwright-dirty-");
  await writeFile(join(cwd, "tracked.txt"), "content\n", "utf8");
  await stageFiles(cwd, ["tracked.txt"]);
  await commitStaged(cwd, "initial");
  await writeFile(join(cwd, "tracked.txt"), "modified\n", "utf8");

  expect(await isWorktreeClean(cwd)).toBe(false);
});

test("switchToExistingBranch switches to an existing branch", async () => {
  const cwd = await initGitRepo("specwright-switch-existing-");
  await writeFile(join(cwd, "on-main.txt"), "main\n", "utf8");
  await stageFiles(cwd, ["on-main.txt"]);
  await commitStaged(cwd, "on main");
  await expectGit(cwd, ["checkout", "-b", "feature"]);
  await expectGit(cwd, ["checkout", "main"]);

  await switchToExistingBranch(cwd, "feature");
  const branch = (await expectGit(cwd, ["branch", "--show-current"])).stdout.trim();
  expect(branch).toBe("feature");
});

test("switchToExistingBranch fails for missing branch", async () => {
  const cwd = await initGitRepo("specwright-switch-missing-");

  await expect(switchToExistingBranch(cwd, "nonexistent")).rejects.toThrow("git switch failed");
});

test("mergeNoFastForward creates a no-fast-forward merge commit", async () => {
  const cwd = await initGitRepo("specwright-merge-noff-");
  await writeFile(join(cwd, "on-main.txt"), "main\n", "utf8");
  await stageFiles(cwd, ["on-main.txt"]);
  await commitStaged(cwd, "on main");
  await expectGit(cwd, ["checkout", "-b", "feature"]);
  await writeFile(join(cwd, "on-feature.txt"), "feature\n", "utf8");
  await stageFiles(cwd, ["on-feature.txt"]);
  await commitStaged(cwd, "on feature");
  await expectGit(cwd, ["checkout", "main"]);

  await mergeNoFastForward(cwd, "feature");
  const log = (await expectGit(cwd, ["log", "-1", "--pretty=%s"])).stdout.trim();
  expect(log).toContain("Merge branch 'feature'");
});

test("complete fails when validation fails", async () => {
  const { cwd, ctx, changeDir } = await createCompleteFixture("specwright-complete-validation-");

  // Overwrite intent.md with only headings so validation fails (SW001).
  await writeFile(join(changeDir, "intent.md"), "# Intent\n\n## Goal\n\n", "utf8");
  await stageFiles(cwd, [join(changeDir, "intent.md")]);
  await commitStaged(cwd, "setup for validation failure test");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Complete requires passing validation. Run specwright verify to see issues.");
});

test("complete fails when tasks are not all done", async () => {
  const cwd = await initGitRepo("specwright-complete-tasks-undone-");
  const ctx = testContext(cwd);
  const remote = await mkdtemp(join(tmpdir(), "specwright-complete-tasks-undone-remote-"));
  await expectGit(remote, ["init", "--bare"]);
  await expectGit(cwd, ["remote", "add", "origin", remote]);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await expectGit(cwd, ["add", "--all"]);
  await expectGit(cwd, ["commit", "-m", "specwright setup"]);

  const changeDir = join(cwd, ".specwright", "changes", "0001-inventory-crafting");

  // Advance step to execute so tasks are required.
  const statePath = join(cwd, ".specwright", "state.json");
  const state = JSON.parse(await readFile(statePath, "utf8")) as {
    currentChange: string;
    changes: Record<string, { step: string; tasks: Record<string, { id: string; title: string; status: string; updatedAt: string }> }>;
  };
  const changeId = state.currentChange;
  const change = state.changes[changeId];
  if (!change) throw new Error(`Change ${changeId} not found in state`);
  change.step = "execute";
  const taskId = "T001";
  change.tasks[taskId] = { id: taskId, title: "Implement feature", status: "pending", updatedAt: new Date().toISOString() };
  await writeFile(statePath, JSON.stringify(state), "utf8");

  // Write tasks.md with an unchecked task.
  await writeFile(
    join(changeDir, "tasks.md"),
    "# Tasks\n\n## Tasks\n\n- [ ] T001: Implement feature\n\n### Acceptance\n\nFeature works.\n\n### Verification\n\nRun tests.\n",
    "utf8",
  );

  // Write verify.md with observed output to pass SW008.
  await writeFile(
    join(changeDir, "verify.md"),
    "# Verify\n\n## Observed output\n\n`bun test` passed.\n",
    "utf8",
  );

  // Write handoff.md.
  await writeFile(
    join(changeDir, "handoff.md"),
    "# Handoff\n\n## Goal\n\nImplement inventory crafting.\n",
    "utf8",
  );

  // Commit all artifacts so worktree is clean.
  await stageFiles(cwd, [join(changeDir, "tasks.md"), join(changeDir, "verify.md"), join(changeDir, "handoff.md"), statePath]);
  await commitStaged(cwd, "setup for tasks undone test");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toContain("Complete requires all tasks to be done");
});

test("complete fails when verify.md is missing", async () => {
  const { cwd, ctx, changeDir } = await createCompleteFixture("specwright-complete-no-verify-");

  await rm(join(changeDir, "verify.md"));
  await stageFiles(cwd, [join(changeDir, "verify.md")]);
  await commitStaged(cwd, "setup for missing verify test");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Complete requires verify.md to contain observed command/output evidence.");
});

test("complete fails when handoff.md is missing", async () => {
  const { cwd, ctx, changeDir } = await createCompleteFixture("specwright-complete-no-handoff-");

  await rm(join(changeDir, "handoff.md"));
  await stageFiles(cwd, [join(changeDir, "handoff.md")]);
  await commitStaged(cwd, "setup for missing handoff test");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Complete requires a non-empty handoff.md.");
});

test("complete fails when there are no tasks", async () => {
  const { cwd, ctx, changeDir, statePath } = await createCompleteFixture("specwright-complete-no-tasks-");

  await rm(join(changeDir, "tasks.md"));
  const state = JSON.parse(await readFile(statePath, "utf8")) as {
    currentChange: string;
    changes: Record<string, { status: string; step: string; tasks: Record<string, unknown> }>;
  };
  const changeState = state.changes[state.currentChange];
  if (!changeState) throw new Error(`Change ${state.currentChange} not found in state`);
  changeState.tasks = {};
  await writeFile(statePath, JSON.stringify(state), "utf8");
  await stageFiles(cwd, [join(changeDir, "tasks.md"), statePath]);
  await commitStaged(cwd, "setup for no tasks test");

  const before = JSON.parse(await readFile(statePath, "utf8")) as {
    changes: Record<string, { status: string }>;
  };
  const changeId = Object.keys(before.changes)[0];
  expect(changeId).toBeDefined();
  expect(before.changes[changeId ?? ""]?.status).not.toBe("done");

  const result = await runSpecwrightCommand(ctx, ["complete", "--mode", "none"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Complete requires at least one task; add tasks to tasks.md first.");

  const after = JSON.parse(await readFile(statePath, "utf8")) as {
    changes: Record<string, { status: string }>;
  };
  expect(after.changes[changeId ?? ""]?.status).not.toBe("done");
});

test("complete passes all guards with all tasks done", async () => {
  const cwd = await initGitRepo("specwright-complete-tasks-done-");
  const ctx = testContext(cwd);
  const remote = await mkdtemp(join(tmpdir(), "specwright-complete-tasks-done-remote-"));
  await expectGit(remote, ["init", "--bare"]);
  await expectGit(cwd, ["remote", "add", "origin", remote]);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);
  await expectGit(cwd, ["add", "--all"]);
  await expectGit(cwd, ["commit", "-m", "specwright setup"]);

  const changeDir = join(cwd, ".specwright", "changes", "0001-inventory-crafting");

  // Advance step to execute and add a done task.
  const statePath = join(cwd, ".specwright", "state.json");
  const state = JSON.parse(await readFile(statePath, "utf8")) as {
    currentChange: string;
    changes: Record<string, { step: string; tasks: Record<string, { id: string; title: string; status: string; updatedAt: string }> }>;
  };
  const changeId = state.currentChange;
  const change = state.changes[changeId];
  if (!change) throw new Error(`Change ${changeId} not found in state`);
  change.step = "execute";
  const taskId = "T001";
  change.tasks[taskId] = { id: taskId, title: "Implement feature", status: "done", updatedAt: new Date().toISOString() };
  await writeFile(statePath, JSON.stringify(state), "utf8");

  // Write tasks.md with a checked task that has acceptance and verification blocks.
  await writeFile(
    join(changeDir, "tasks.md"),
    "# Tasks\n\n## Tasks\n\n- [x] T001: Implement feature\n\n### Acceptance\n\nFeature works.\n\n### Verification\n\nRun tests.\n",
    "utf8",
  );

  // Write verify.md with observed output (required when all tasks are done).
  await writeFile(
    join(changeDir, "verify.md"),
    "# Verify\n\n## Observed output\n\n`bun test` passed.\n",
    "utf8",
  );

  // Write handoff.md.
  await writeFile(
    join(changeDir, "handoff.md"),
    "# Handoff\n\n## Goal\n\nImplement inventory crafting.\n",
    "utf8",
  );

  // Commit all artifacts so worktree is clean.
  await stageFiles(cwd, [join(changeDir, "tasks.md"), join(changeDir, "verify.md"), join(changeDir, "handoff.md"), statePath]);
  await commitStaged(cwd, "setup for all tasks done test");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(true);
  expect(result.summary).toContain("Complete mode: none");
});

test("complete fails when verify.md has prose but no observed output", async () => {
  const { cwd, ctx, changeDir } = await createCompleteFixture("specwright-complete-verify-prose-");
  await writeFile(
    join(changeDir, "verify.md"),
    "# Verify\n\nEverything looks good. No commands were run.\n",
    "utf8",
  );
  await stageFiles(cwd, [join(changeDir, "verify.md")]);
  await commitStaged(cwd, "setup for verify prose test");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Complete requires verify.md to contain observed command/output evidence.");
});

test("complete fails when verify.md only has an empty observed output section", async () => {
  const { cwd, ctx, changeDir } = await createCompleteFixture("specwright-complete-verify-empty-observed-");
  await writeFile(
    join(changeDir, "verify.md"),
    "# Verify\n\n## Observed output\n\n",
    "utf8",
  );
  await stageFiles(cwd, [join(changeDir, "verify.md")]);
  await commitStaged(cwd, "setup for empty observed output test");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Complete requires verify.md to contain observed command/output evidence.");
});

test("complete pr pushes branch and opens pull request", async () => {
  const { cwd, ctx, branch, remote } = await createCompleteFixture("specwright-complete-pr-");
  const binDir = await mkdtemp(join(tmpdir(), "specwright-complete-pr-bin-"));
  const capture = join(cwd, "gh-complete-capture.json");
  const ghPath = join(binDir, "gh");
  await writeFile(
    ghPath,
    `#!/usr/bin/env bun\nimport { writeFileSync } from "node:fs";\nwriteFileSync(process.env.SPECWRIGHT_GH_CAPTURE, JSON.stringify({\n  argv: process.argv.slice(2),\n  env: {\n    GH_PROMPT_DISABLED: process.env.GH_PROMPT_DISABLED,\n    GH_NO_UPDATE_NOTIFIER: process.env.GH_NO_UPDATE_NOTIFIER,\n    GH_NO_EXTENSION_UPDATE_NOTIFIER: process.env.GH_NO_EXTENSION_UPDATE_NOTIFIER,\n    GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT\n  }\n}));\n`,
    "utf8",
  );
  await chmod(ghPath, 0o755);

  const originalPath = process.env.PATH;
  const originalCapture = process.env.SPECWRIGHT_GH_CAPTURE;
  try {
    process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
    process.env.SPECWRIGHT_GH_CAPTURE = capture;

    const result = await runSpecwrightCommand(ctx, ["complete", "--mode", "pr"]);
    expect(result.ok).toBe(true);
    expect(result.summary).toContain(`Created pull request for ${branch} targeting main`);
    expect(result.filesCreated).toHaveLength(1);
    const bodyFile = result.filesCreated[0];
    expect(bodyFile).toBeDefined();
    await expectGit(remote, ["show-ref", "--verify", `refs/heads/${branch}`]);

    const observed = JSON.parse(await readFile(capture, "utf8")) as {
      argv: string[];
      env: Record<string, string>;
    };
    expect(observed.argv).toEqual([
      "pr",
      "create",
      "--title",
      "0001-inventory-crafting: Inventory Crafting",
      "--body-file",
      bodyFile as string,
      "--base",
      "main",
      "--head",
      branch,
    ]);
    expect(observed.env).toEqual({
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
      GH_NO_EXTENSION_UPDATE_NOTIFIER: "1",
      GIT_TERMINAL_PROMPT: "0",
    });
    expect((await readFile(bodyFile as string, "utf8")).length).toBeGreaterThan(0);

    const state = JSON.parse(await readFile(join(cwd, ".specwright", "state.json"), "utf8")) as {
      changes: Record<string, { status: string; step: string }>;
    };
    const changeId = Object.keys(state.changes)[0];
    expect(changeId).toBeDefined();
    expect(state.changes[changeId ?? ""]?.status).toBe("done");
    expect(state.changes[changeId ?? ""]?.step).toBe("handoff");
  } finally {
    process.env.PATH = originalPath ?? "";
    if (originalCapture === undefined) {
      delete process.env.SPECWRIGHT_GH_CAPTURE;
    } else {
      process.env.SPECWRIGHT_GH_CAPTURE = originalCapture;
    }
  }
});

test("complete prevents push, pr, and merge side effects on later guard failures", async () => {
  const { cwd, ctx, branch, remote, changeDir, statePath } = await createCompleteFixture(
    "specwright-complete-later-guards-",
  );
  // Cause a validation failure after git/worktree preflight checks pass.
  await writeFile(join(changeDir, "intent.md"), "# Intent\n\n## Goal\n\n", "utf8");
  await stageFiles(cwd, [join(changeDir, "intent.md")]);
  await commitStaged(cwd, "setup for later guard failure test");

  const binDir = await mkdtemp(join(tmpdir(), "specwright-complete-guard-bin-"));
  const capture = join(cwd, "gh-guard-capture.json");
  const ghPath = join(binDir, "gh");
  await writeFile(
    ghPath,
    `#!/usr/bin/env bun\nimport { writeFileSync } from "node:fs";\nwriteFileSync(process.env.SPECWRIGHT_GH_CAPTURE, JSON.stringify({ invoked: true }));\n`,
    "utf8",
  );
  await chmod(ghPath, 0o755);

  const originalPath = process.env.PATH;
  const originalCapture = process.env.SPECWRIGHT_GH_CAPTURE;
  try {
    process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
    process.env.SPECWRIGHT_GH_CAPTURE = capture;

    for (const mode of ["push", "pr", "merge"] as const) {
      const headBefore = (await expectGit(cwd, ["rev-parse", "HEAD"])).stdout.trim();
      const result = await runSpecwrightCommand(ctx, ["complete", "--mode", mode]);
      expect(result.ok).toBe(false);
      expect(result.summary).toBe("Complete requires passing validation. Run specwright verify to see issues.");

      const remoteRef = await runGit(remote, ["show-ref", "--verify", `refs/heads/${branch}`]);
      expect(remoteRef.exitCode, `mode ${mode} should not push`).not.toBe(0);

      if (mode === "pr") {
        await expect(readFile(capture, "utf8")).rejects.toThrow();
      }

      const currentBranch = (await expectGit(cwd, ["branch", "--show-current"])).stdout.trim();
      expect(currentBranch, `mode ${mode} should stay on ${branch}`).toBe(branch);

      const headAfter = (await expectGit(cwd, ["rev-parse", "HEAD"])).stdout.trim();
      expect(headAfter, `mode ${mode} should not create commits`).toBe(headBefore);

      const state = JSON.parse(await readFile(statePath, "utf8")) as {
        changes: Record<string, { status: string }>;
      };
      const changeId = Object.keys(state.changes)[0];
      expect(state.changes[changeId ?? ""]?.status, `mode ${mode} should not mark done`).not.toBe("done");
    }
  } finally {
    process.env.PATH = originalPath ?? "";
    if (originalCapture === undefined) {
      delete process.env.SPECWRIGHT_GH_CAPTURE;
    } else {
      process.env.SPECWRIGHT_GH_CAPTURE = originalCapture;
    }
  }
});

test("complete fails when task sync detects unreconciled drift", async () => {
  const { cwd, ctx, changeDir, statePath } = await createCompleteFixture("specwright-complete-task-drift-");
  await writeFile(
    join(changeDir, "tasks.md"),
    "# Tasks\n\n## Tasks\n\n- [x] T001: Implement feature\n- [x] T001: Duplicate title\n",
    "utf8",
  );
  await stageFiles(cwd, [join(changeDir, "tasks.md")]);
  await commitStaged(cwd, "setup for task drift test");

  const result = await runSpecwrightCommand(ctx, ["complete"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toContain("Complete cannot reconcile tasks.md");

  const state = JSON.parse(await readFile(statePath, "utf8")) as {
    changes: Record<string, { status: string }>;
  };
  const changeId = Object.keys(state.changes)[0];
  expect(state.changes[changeId ?? ""]?.status).not.toBe("done");
});

test("pack add rejects path traversal ids", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-pack-add-traversal-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["pack", "add", "../outside"]);
  expect(result.ok).toBe(false);
  expect(result.summary).toContain("Invalid pack id");
});

test("parseArgs accepts --key=value option syntax", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-keyvalue-args-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const publishResult = await runSpecwrightCommand(ctx, ["publish", "--mode=none"]);
  expect(publishResult.ok).toBe(true);
  expect(publishResult.summary).toContain("Publish mode is none");
});

test("scan accepts --map, --refresh, and combinations without treating them as unknown", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-flags-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const mapResult = await runSpecwrightCommand(ctx, ["scan", "--map"]);
  expect(mapResult.ok).toBe(true);
  expect(mapResult.summary).toBe("Prepared project scan prompt.");

  const refreshResult = await runSpecwrightCommand(ctx, ["scan", "--refresh"]);
  expect(refreshResult.ok).toBe(true);
  expect(refreshResult.summary).toBe("Prepared project scan prompt.");

  const combinedResult = await runSpecwrightCommand(ctx, [
    "scan",
    "--map",
    "--refresh",
    "--force",
    "--json",
    "--print-prompt",
  ]);
  expect(combinedResult.ok).toBe(true);
  expect(JSON.parse(combinedResult.summary).summary).toBe("Prepared project scan prompt.");
});

test("scan still rejects unknown flags", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-unknown-flags-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const unknownResult = await runSpecwrightCommand(ctx, ["scan", "--stale"]);
  expect(unknownResult.ok).toBe(false);
  expect(unknownResult.exitCode).toBe(1);
  expect(unknownResult.summary).toBe("Unknown option: --stale");
});

test("help text advertises scan --map, --refresh, --force, and --json", () => {
  const help = renderHelp();
  expect(help).toContain("specwright scan [--map] [--refresh] [--force] [--json] [--print-prompt]");
});

test("scan ensures all project intelligence artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-artifacts-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["scan"]);
  expect(result.ok).toBe(true);
  expect(result.summary).toBe("Prepared project scan prompt.");

  const project = join(cwd, ".specwright", "project");
  const scanPath = join(project, "scan.md");
  const mapPath = join(project, "codebase-map.md");
  const indexPath = join(project, "codebase-index.json");

  expect(result.filesCreated).toContain(scanPath);
  expect(result.filesCreated).toContain(mapPath);
  expect(result.filesCreated).toContain(indexPath);
  expect(result.filesCreated.length).toBe(3);
  expect(result.filesUpdated).toEqual([]);

  const index = JSON.parse(await readFile(indexPath, "utf8"));
  expect(index.version).toBe(1);
  expect(index.generatedAt).toBe(ctx.now().toISOString());
  expect(Array.isArray(index.entrypoints)).toBe(true);
  expect(Array.isArray(index.modules)).toBe(true);
  expect(Array.isArray(index.commands)).toBe(true);
  expect(Array.isArray(index.verification)).toBe(true);
  expect(Array.isArray(index.risks)).toBe(true);
  expect(index.fingerprints).toEqual({});
});

test("scan --map ensures only map artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-map-artifacts-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["scan", "--map"]);
  expect(result.ok).toBe(true);

  const project = join(cwd, ".specwright", "project");
  const scanPath = join(project, "scan.md");
  const mapPath = join(project, "codebase-map.md");
  const indexPath = join(project, "codebase-index.json");

  expect(result.filesCreated.sort()).toEqual([indexPath, mapPath].sort());
  expect(result.filesUpdated).toEqual([]);
  expect(await readFile(mapPath, "utf8")).toContain("# Codebase Map");
  await expect(readFile(scanPath, "utf8")).rejects.toThrow();
});

test("scan preserves existing map artifacts unless --force is used", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-preserve-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);

  const project = join(cwd, ".specwright", "project");
  const mapPath = join(project, "codebase-map.md");
  const indexPath = join(project, "codebase-index.json");

  await writeFile(mapPath, "# Preserved map\n\n", "utf8");
  await writeFile(indexPath, JSON.stringify({ version: 1, generatedAt: "2020-01-01T00:00:00.000Z", entrypoints: [], modules: [], commands: [], verification: [], risks: [] }, null, 2), "utf8");

  const result = await runSpecwrightCommand(ctx, ["scan"]);
  expect(result.ok).toBe(true);
  expect(result.filesCreated).toEqual([]);
  expect(result.filesUpdated).toEqual([]);
  expect(await readFile(mapPath, "utf8")).toBe("# Preserved map\n\n");
  expect(JSON.parse(await readFile(indexPath, "utf8")).generatedAt).toBe("2020-01-01T00:00:00.000Z");
});

test("scan --force regenerates existing map artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-force-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);

  const project = join(cwd, ".specwright", "project");
  const mapPath = join(project, "codebase-map.md");
  const indexPath = join(project, "codebase-index.json");

  await writeFile(mapPath, "# Stale map\n\n", "utf8");
  await writeFile(indexPath, JSON.stringify({ version: 1, generatedAt: "2020-01-01T00:00:00.000Z", entrypoints: [], modules: [], commands: [], verification: [], risks: [] }, null, 2), "utf8");

  const result = await runSpecwrightCommand(ctx, ["scan", "--force"]);
  expect(result.ok).toBe(true);
  expect(result.filesUpdated).toContain(mapPath);
  expect(result.filesUpdated).toContain(indexPath);
  expect(result.filesUpdated.length).toBe(5);
  expect(await readFile(mapPath, "utf8")).toContain("# Codebase Map");
  expect(JSON.parse(await readFile(indexPath, "utf8")).generatedAt).toBe(ctx.now().toISOString());
});

test("scan --map --force regenerates only map artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-map-force-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);

  const project = join(cwd, ".specwright", "project");
  const scanPath = join(project, "scan.md");
  const techStackPath = join(project, "tech-stack.md");
  const architecturePath = join(project, "architecture.md");
  const mapPath = join(project, "codebase-map.md");
  const indexPath = join(project, "codebase-index.json");

  await writeFile(scanPath, "# Custom scan\n\n", "utf8");
  await writeFile(techStackPath, "# Custom tech stack\n\n", "utf8");
  await writeFile(architecturePath, "# Custom architecture\n\n", "utf8");
  await writeFile(mapPath, "# Stale map\n\n", "utf8");
  await writeFile(indexPath, JSON.stringify({ version: 1, generatedAt: "2020-01-01T00:00:00.000Z", entrypoints: [], modules: [], commands: [], verification: [], risks: [], fingerprints: {} }, null, 2), "utf8");

  const result = await runSpecwrightCommand(ctx, ["scan", "--map", "--force"]);
  expect(result.ok).toBe(true);
  expect(result.filesCreated).toEqual([]);
  expect(result.filesUpdated.sort()).toEqual([indexPath, mapPath].sort());
  expect(await readFile(scanPath, "utf8")).toBe("# Custom scan\n\n");
  expect(await readFile(techStackPath, "utf8")).toBe("# Custom tech stack\n\n");
  expect(await readFile(architecturePath, "utf8")).toBe("# Custom architecture\n\n");
  expect(await readFile(mapPath, "utf8")).toContain("# Codebase Map");
  expect(JSON.parse(await readFile(indexPath, "utf8")).generatedAt).toBe(ctx.now().toISOString());
});

test("scan prompt references map artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-prompt-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["scan"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain(".specwright/project/codebase-map.md");
  expect(result.prompt).toContain(".specwright/project/codebase-index.json");
});

test("scan --json returns accurate result shape", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-json-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["scan", "--json"]);
  expect(result.ok).toBe(true);
  const payload = JSON.parse(result.summary);
  expect(payload.summary).toBe("Prepared project scan prompt.");
  expect(payload.map).toBe(false);
  expect(payload.refresh).toBe(false);
  expect(payload.filesCreated).toEqual(result.filesCreated);
  expect(payload.filesUpdated).toEqual(result.filesUpdated);
  expect(payload.validation.ok).toBe(true);
  expect(typeof payload.prompt).toBe("string");
  expect(payload.prompt).toContain(".specwright/project/codebase-map.md");
});

test("scan creates a deterministic index for a non-Git TypeScript project", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-first-"));
  const ctx = testContext(cwd);
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test", build: "bun run build" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "cli.ts"), "console.log('hi');\n", "utf8");
  await writeFile(join(cwd, "test", "cli.test.ts"), "import { test } from 'bun:test';\n", "utf8");

  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  const result = await runSpecwrightCommand(ctx, ["scan", "--json"]);
  expect(result.ok).toBe(true);

  const payload = JSON.parse(result.summary);
  expect(payload.indexUpdated).toBe(true);
  expect(payload.staleFiles).toEqual([]);
  expect(payload.scannedFiles).toBeGreaterThan(0);
  expect(payload.indexedFiles).toBeGreaterThan(0);
  expect(payload.truncated).toBe(false);

  const indexPath = join(cwd, ".specwright", "project", "codebase-index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const entryPaths = index.entrypoints.map((entry: { path: string }) => entry.path);
  expect(entryPaths).toContain("package.json");
  expect(entryPaths).toContain("src/cli.ts");

  const cliModule = index.modules.find((mod: { path: string }) => mod.path === "src/cli.ts");
  expect(cliModule).toBeDefined();
  expect(cliModule.tests).toContain("test/cli.test.ts");

  const verificationCommands = index.verification.map((v: { command: string }) => v.command);
  expect(verificationCommands).toContain("bun test");

  expect(typeof index.fingerprints["src/cli.ts"]).toBe("object");
  expect(typeof index.fingerprints["test/cli.test.ts"]).toBe("object");
});

test("scan is a no-op when the deterministic index is already current", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-idempotent-"));
  const ctx = testContext(cwd);
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "cli.ts"), "console.log('hi');\n", "utf8");
  await writeFile(join(cwd, "test", "cli.test.ts"), "import { test } from 'bun:test';\n", "utf8");

  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);

  const indexPath = join(cwd, ".specwright", "project", "codebase-index.json");
  const before = await readFile(indexPath, "utf8");
  const result = await runSpecwrightCommand(ctx, ["scan", "--json"]);
  expect(result.ok).toBe(true);

  const payload = JSON.parse(result.summary);
  expect(payload.indexUpdated).toBe(false);
  expect(payload.staleFiles).toEqual([]);
  expect(await readFile(indexPath, "utf8")).toBe(before);
});

test("scan refreshes fingerprints for changed indexed files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-refresh-changed-"));
  const ctx = testContext(cwd);
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "cli.ts"), "console.log('hi');\n", "utf8");
  await writeFile(join(cwd, "test", "cli.test.ts"), "import { test } from 'bun:test';\n", "utf8");

  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);

  const indexPath = join(cwd, ".specwright", "project", "codebase-index.json");
  const before = JSON.parse(await readFile(indexPath, "utf8"));
  const originalCliFingerprint = before.fingerprints["src/cli.ts"];
  expect(originalCliFingerprint).toBeDefined();

  await writeFile(join(cwd, "src", "cli.ts"), "console.log('hello');\n", "utf8");
  const result = await runSpecwrightCommand(ctx, ["scan", "--json"]);
  expect(result.ok).toBe(true);

  const payload = JSON.parse(result.summary);
  expect(payload.indexUpdated).toBe(true);
  expect(payload.staleFiles).toContain("src/cli.ts (changed)");

  const after = JSON.parse(await readFile(indexPath, "utf8"));
  expect(after.fingerprints["src/cli.ts"]).not.toEqual(originalCliFingerprint);
  expect(after.fingerprints["test/cli.test.ts"]).toEqual(before.fingerprints["test/cli.test.ts"]);
});

test("scan rebuilds an invalid codebase-index.json from scratch", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-invalid-rebuild-"));
  const ctx = testContext(cwd);
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "keep.ts"), "export const keep = 1;\n", "utf8");
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
    "utf8",
  );

  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);

  const indexPath = join(cwd, ".specwright", "project", "codebase-index.json");
  await writeFile(
    indexPath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: "2020-01-01T00:00:00.000Z",
        entrypoints: [{ path: "../escape.ts" }],
        modules: [{ path: "src/missing.ts" }],
        commands: [{}],
        verification: [],
        risks: [{ area: "custom risk", summary: "preserved" }],
        fingerprints: { "src/missing.ts": { mtime: 1, size: 1, checksum: "abc" } },
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["scan", "--json", "--print-prompt"]);
  expect(result.ok).toBe(true);
  const payload = JSON.parse(result.summary);
  expect(payload.validation.ok).toBe(false);
  expect(payload.indexUpdated).toBe(true);
  expect(result.prompt).toContain("Validation issues:");
  expect(result.prompt).toContain("not a safe relative path");
  expect(result.prompt).toContain("Hard validation errors");

  const rebuilt = JSON.parse(await readFile(indexPath, "utf8"));
  expect(rebuilt.entrypoints.some((entry: { path: string }) => entry.path === "package.json")).toBe(true);
  expect(rebuilt.modules.some((mod: { path: string }) => mod.path === "src/keep.ts")).toBe(true);
  expect(rebuilt.fingerprints["src/keep.ts"]).toBeDefined();
  expect(rebuilt.entrypoints.every((entry: { path: string }) => entry.path !== "../escape.ts")).toBe(true);
  expect(rebuilt.modules.every((mod: { path: string }) => mod.path !== "src/missing.ts")).toBe(true);
  expect(rebuilt.fingerprints["../escape.ts"]).toBeUndefined();
  expect(rebuilt.fingerprints["src/missing.ts"]).toBeUndefined();
  expect(rebuilt.risks.some((risk: { area: string }) => risk.area === "custom risk")).toBe(false);
});

test("scan --refresh follows the same command-owned refresh path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-refresh-compat-"));
  const ctx = testContext(cwd);
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "cli.ts"), "console.log('hi');\n", "utf8");
  await writeFile(join(cwd, "test", "cli.test.ts"), "import { test } from 'bun:test';\n", "utf8");

  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  const first = await runSpecwrightCommand(ctx, ["scan", "--refresh", "--json"]);
  expect(first.ok).toBe(true);
  const firstPayload = JSON.parse(first.summary);
  expect(firstPayload.indexUpdated).toBe(true);
  expect(firstPayload.staleFiles).toEqual([]);

  const second = await runSpecwrightCommand(ctx, ["scan", "--refresh", "--json"]);
  expect(second.ok).toBe(true);
  const secondPayload = JSON.parse(second.summary);
  expect(secondPayload.indexUpdated).toBe(false);
  expect(secondPayload.staleFiles).toEqual([]);
});

test("scan preserves SW106 warnings while rebuilding deterministic data", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-sw106-warning-"));
  const ctx = testContext(cwd);
  await mkdir(join(cwd, "src", "dir"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
    "utf8",
  );

  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);

  const indexPath = join(cwd, ".specwright", "project", "codebase-index.json");
  await writeFile(
    indexPath,
    JSON.stringify(
      { version: 1, generatedAt: ctx.now().toISOString(), entrypoints: [], modules: [{ path: "src/dir" }], commands: [], verification: [], risks: [], fingerprints: {} },
      null,
      2,
    ),
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["scan", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("references non-file path: src/dir");
});
test("scan --map prompt focuses only on map artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-map-prompt-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["scan", "--map", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("Focus only on codebase mapping for this run");
  expect(result.prompt).toContain(".specwright/project/codebase-map.md");
  expect(result.prompt).toContain(".specwright/project/codebase-index.json");
  expect(result.prompt).not.toContain(".specwright/project/scan.md");
  expect(result.prompt).not.toContain(".specwright/project/tech-stack.md");
  expect(result.prompt).not.toContain(".specwright/project/architecture.md");
});

test("scan prompt through CLI is runtime-neutral without OMP references", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-neutral-prompt-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["scan", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).not.toContain("OMP");
  expect(result.prompt).not.toContain("Oh My Pi");
  expect(result.prompt).not.toContain("task tool");
  expect(result.prompt).toContain("Use file discovery (find)");
  expect(result.prompt).toContain("Use search and LSP when available");
  expect(result.prompt).toContain("Preserve existing confirmed facts");
  expect(result.prompt).toContain("Record uncertainty, assumptions, and gaps");
});

test("scan --refresh prompt includes deterministic refresh note", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-refresh-contract-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["scan", "--refresh", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("Refresh run:");
  expect(result.prompt).toContain("use the deterministic index state above to identify changed areas");
  expect(result.prompt).toContain("patch only the stale prose sections");
});

test("scan surfaces validation issues for an invalid codebase-index.json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-validation-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);

  const indexPath = join(cwd, ".specwright", "project", "codebase-index.json");
  await writeFile(
    indexPath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: ctx.now().toISOString(),
        entrypoints: [{ path: "../escape.ts" }],
        modules: [{ path: "src/missing.ts", tests: ["test/missing.test.ts"] }],
        commands: [{}],
        verification: [],
        risks: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["scan", "--print-prompt"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain("Validation issues:");
  expect(result.prompt).toContain("not a safe relative path");
  expect(result.prompt).toContain("missing required field");
  expect(result.prompt).toContain("missing file");
});

test("buildCodebaseIndex discovers and classifies a non-Git TypeScript project", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-nongit-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test", build: "bun run build" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "cli.ts"), "console.log('hi');\n", "utf8");
  await writeFile(join(cwd, "test", "cli.test.ts"), "import { test } from 'bun:test';\n", "utf8");

  const result = await buildCodebaseIndex({ cwd, now: new Date("2026-06-08T00:00:00.000Z") });
  expect(result.changed).toBe(true);
  expect(result.truncated).toBe(false);
  expect(result.scannedFiles).toBeGreaterThan(0);
  expect(result.indexedFiles).toBeGreaterThan(0);
  expect(result.staleFiles).toEqual([]);

  const entryPaths = result.index.entrypoints?.map((entry) => entry.path) ?? [];
  expect(entryPaths).toContain("package.json");
  expect(entryPaths).toContain("src/cli.ts");

  const cliModule = result.index.modules?.find((mod) => mod.path === "src/cli.ts");
  expect(cliModule).toBeDefined();
  expect(cliModule?.tests).toContain("test/cli.test.ts");

  const verificationCommands = result.index.verification?.map((v) => v.command) ?? [];
  expect(verificationCommands).toContain("bun test");

  const commandNames = result.index.commands?.map((cmd) => cmd.name) ?? [];
  expect(commandNames.length).toBeGreaterThan(0);
  expect(commandNames).toContain("test");
});

test("buildCodebaseIndex records deterministic scan coverage risk when indexed file cap is exceeded", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-indexed-cap-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "a.ts"), "export const a = 1;\n", "utf8");
  await writeFile(join(cwd, "src", "b.ts"), "export const b = 2;\n", "utf8");

  const result = await buildCodebaseIndex({
    cwd,
    now: new Date("2026-06-08T00:00:00.000Z"),
    limits: { maxIndexedFiles: 1 },
  });
  expect(result.truncated).toBe(true);
  expect(result.indexedFiles).toBeLessThanOrEqual(1);
  expect(result.index.risks?.some((risk) => risk.area === "scan coverage")).toBe(true);
});

test("buildCodebaseIndex records deterministic scan coverage risk when scanned file cap is exceeded", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-scan-cap-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "demo" }), "utf8");
  await writeFile(join(cwd, "a.ts"), "export const a = 1;\n", "utf8");
  await writeFile(join(cwd, "b.ts"), "export const b = 2;\n", "utf8");

  const result = await buildCodebaseIndex({
    cwd,
    now: new Date("2026-06-08T00:00:00.000Z"),
    limits: { maxFilesScanned: 1 },
  });
  expect(result.truncated).toBe(true);
  expect(result.scannedFiles).toBeLessThanOrEqual(1);
  expect(result.index.risks?.some((risk) => risk.area === "scan coverage")).toBe(true);
});

test("buildCodebaseIndex fingerprints indexed files and is idempotent on unchanged source", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-fingerprint-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "cli.ts"), "console.log('hi');\n", "utf8");
  await writeFile(join(cwd, "test", "cli.test.ts"), "import { test } from 'bun:test';\n", "utf8");

  const now = new Date("2026-06-08T00:00:00.000Z");
  const first = await buildCodebaseIndex({ cwd, now });
  expect(first.changed).toBe(true);
  expect(first.staleFiles).toEqual([]);
  expect(first.index.fingerprints).toBeDefined();
  expect(first.index.fingerprints?.["package.json"]).toBeDefined();
  expect(first.index.fingerprints?.["src/cli.ts"]).toBeDefined();
  expect(first.index.fingerprints?.["test/cli.test.ts"]).toBeDefined();
  expect(first.index.generatedAt).toBe(now.toISOString());

  const second = await buildCodebaseIndex({ cwd, now, existing: first.index });
  expect(second.changed).toBe(false);
  expect(second.staleFiles).toEqual([]);
  expect(second.index.generatedAt).toBe(first.index.generatedAt);
  expect(second.index.fingerprints).toEqual(first.index.fingerprints);
});

test("buildCodebaseIndex reports stale files and refreshes fingerprints when a source file changes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-stale-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "cli.ts"), "console.log('hi');\n", "utf8");
  await writeFile(join(cwd, "test", "cli.test.ts"), "import { test } from 'bun:test';\n", "utf8");

  const now = new Date("2026-06-08T00:00:00.000Z");
  const first = await buildCodebaseIndex({ cwd, now });
  const originalCliFingerprint = first.index.fingerprints?.["src/cli.ts"];
  expect(originalCliFingerprint).toBeDefined();

  await writeFile(join(cwd, "src", "cli.ts"), "console.log('hello');\n", "utf8");
  const second = await buildCodebaseIndex({ cwd, now, existing: first.index });
  expect(second.changed).toBe(true);
  expect(second.staleFiles).toContain("src/cli.ts (changed)");
  expect(second.index.fingerprints?.["src/cli.ts"]).not.toEqual(originalCliFingerprint);
  expect(second.index.fingerprints?.["test/cli.test.ts"]).toEqual(first.index.fingerprints?.["test/cli.test.ts"]);
});

test("buildCodebaseIndex keeps fingerprints stable when only filesystem mtime changes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-stable-mtime-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "cli.ts"), "console.log('hi');\n", "utf8");

  const now = new Date("2026-06-08T00:00:00.000Z");
  const first = await buildCodebaseIndex({ cwd, now });
  const originalFingerprint = first.index.fingerprints?.["src/cli.ts"];
  expect(originalFingerprint).toBeDefined();
  expect(originalFingerprint?.mtime).toBe(0);

  await utimes(
    join(cwd, "src", "cli.ts"),
    new Date("2030-01-01T00:00:00.000Z"),
    new Date("2030-01-01T00:00:00.000Z"),
  );

  const second = await buildCodebaseIndex({ cwd, now, existing: first.index });
  expect(second.changed).toBe(false);
  expect(second.staleFiles).toEqual([]);
  expect(second.index.fingerprints?.["src/cli.ts"]).toEqual(originalFingerprint);
});

test("buildCodebaseIndex removes fingerprints for paths no longer indexed", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-removed-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "keep.ts"), "export const keep = 1;\n", "utf8");
  await writeFile(join(cwd, "src", "drop.ts"), "export const drop = 1;\n", "utf8");

  const now = new Date("2026-06-08T00:00:00.000Z");
  const first = await buildCodebaseIndex({ cwd, now });
  expect(first.index.fingerprints?.["src/drop.ts"]).toBeDefined();

  await rm(join(cwd, "src", "drop.ts"));
  const second = await buildCodebaseIndex({ cwd, now, existing: first.index });
  expect(second.staleFiles).toContain("src/drop.ts (missing)");
  expect(second.changed).toBe(true);
  expect(second.index.fingerprints?.["src/drop.ts"]).toBeUndefined();
  expect(second.index.fingerprints?.["src/keep.ts"]).toEqual(first.index.fingerprints?.["src/keep.ts"]);
});

test("buildCodebaseIndex filters unsafe and excluded package entrypoints", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-package-entrypoints-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "bin"), { recursive: true });
  await mkdir(join(cwd, "dist"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      name: "demo",
      main: "./src/cli.ts",
      module: "dist/ignored.js",
      bin: {
        safe: "bin/specwright.mjs",
        escape: "../escape.js",
        absolute: "/tmp/escape.js",
      },
    }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "cli.ts"), "export const cli = 1;\n", "utf8");
  await writeFile(join(cwd, "bin", "specwright.mjs"), "console.log('specwright');\n", "utf8");
  await writeFile(join(cwd, "dist", "ignored.js"), "console.log('ignored');\n", "utf8");

  const result = await buildCodebaseIndex({ cwd, now: new Date("2026-06-08T00:00:00.000Z") });
  const entrypointPaths = result.index.entrypoints?.map((entry) => entry.path) ?? [];
  expect(entrypointPaths).toContain("src/cli.ts");
  expect(entrypointPaths).toContain("bin/specwright.mjs");
  expect(entrypointPaths).not.toContain("./src/cli.ts");
  expect(entrypointPaths).not.toContain("dist/ignored.js");
  expect(entrypointPaths).not.toContain("../escape.js");
  expect(entrypointPaths).not.toContain("/tmp/escape.js");
  expect((await validateCodebaseIndex(cwd, result.index)).ok).toBe(true);
});

test("buildCodebaseIndex counts associated tests against the indexed file cap", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-test-cap-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "a.ts"), "export const a = 1;\n", "utf8");
  await writeFile(join(cwd, "src", "a.test.ts"), "import './a';\n", "utf8");

  const result = await buildCodebaseIndex({
    cwd,
    now: new Date("2026-06-08T00:00:00.000Z"),
    limits: { maxIndexedFiles: 1 },
  });
  expect(result.truncated).toBe(true);
  expect(result.indexedFiles).toBeLessThanOrEqual(1);
  const sourceModule = result.index.modules?.find((mod) => mod.path === "src/a.ts");
  expect(sourceModule).toBeDefined();
  expect(sourceModule?.tests).toBeUndefined();
  expect(result.index.fingerprints?.["src/a.test.ts"]).toBeUndefined();
});

test("buildCodebaseIndex associates tests by nearest path and avoids ambiguous basename fallback", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-test-association-"));
  await mkdir(join(cwd, "src", "api"), { recursive: true });
  await mkdir(join(cwd, "src", "ui"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(join(cwd, "src", "api", "index.ts"), "export const api = 1;\n", "utf8");
  await writeFile(join(cwd, "src", "ui", "index.ts"), "export const ui = 1;\n", "utf8");
  await writeFile(join(cwd, "src", "ui", "index.test.ts"), "import './index';\n", "utf8");
  await writeFile(join(cwd, "test", "index.test.ts"), "export const ambiguous = true;\n", "utf8");

  const result = await buildCodebaseIndex({ cwd, now: new Date("2026-06-08T00:00:00.000Z") });
  const apiModule = result.index.modules?.find((mod) => mod.path === "src/api/index.ts");
  const uiModule = result.index.modules?.find((mod) => mod.path === "src/ui/index.ts");
  const standaloneTest = result.index.modules?.find((mod) => mod.path === "test/index.test.ts");
  expect(uiModule?.tests).toContain("src/ui/index.test.ts");
  expect(apiModule?.tests).toBeUndefined();
  expect(standaloneTest?.kind).toBe("test");
});

test("buildCodebaseIndex skips oversized files and records a large file skipped risk", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-oversized-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "demo" }), "utf8");
  await writeFile(join(cwd, "src", "small.ts"), "export const small = 1;\n", "utf8");
  await writeFile(join(cwd, "src", "huge.ts"), "x".repeat(64), "utf8");

  const result = await buildCodebaseIndex({
    cwd,
    now: new Date("2026-06-08T00:00:00.000Z"),
    limits: { maxFingerprintBytesPerFile: 32 },
  });
  expect(result.index.risks?.some((risk) => risk.area === "large file skipped")).toBe(true);
  expect(result.index.fingerprints?.["src/huge.ts"]).toBeUndefined();
  expect(result.index.fingerprints?.["src/small.ts"]).toBeDefined();
});

test("buildCodebaseIndex reports stale when a fingerprinted file becomes oversized", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-oversized-stale-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "src", "huge.ts"), "export const huge = 1;\n", "utf8");

  const now = new Date("2026-06-08T00:00:00.000Z");
  const first = await buildCodebaseIndex({
    cwd,
    now,
    limits: { maxFingerprintBytesPerFile: 32 },
  });
  expect(first.index.fingerprints?.["src/huge.ts"]).toBeDefined();

  await writeFile(join(cwd, "src", "huge.ts"), "x".repeat(64), "utf8");
  const second = await buildCodebaseIndex({
    cwd,
    now,
    existing: first.index,
    limits: { maxFingerprintBytesPerFile: 32 },
  });
  expect(second.staleFiles).toContain("src/huge.ts (changed)");
  expect(second.changed).toBe(true);
  expect(second.index.fingerprints?.["src/huge.ts"]).toBeUndefined();
  expect(second.index.risks?.some((risk) => risk.area === "large file skipped")).toBe(true);
});
test("buildCodebaseIndex treats root test directories as tests", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-root-tests-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await mkdir(join(cwd, "__tests__"), { recursive: true });
  await writeFile(join(cwd, "src", "cli.ts"), "export const cli = 1;\n", "utf8");
  await writeFile(join(cwd, "test", "cli.test.ts"), "import '../src/cli';\n", "utf8");
  await writeFile(join(cwd, "__tests__", "standalone.ts"), "export const standalone = true;\n", "utf8");

  const result = await buildCodebaseIndex({ cwd, now: new Date("2026-06-08T00:00:00.000Z") });
  const cliModule = result.index.modules?.find((mod) => mod.path === "src/cli.ts");
  const standaloneTest = result.index.modules?.find((mod) => mod.path === "__tests__/standalone.ts");
  const normalRootTestModules =
    result.index.modules?.filter(
      (mod) =>
        (mod.path === "test/cli.test.ts" || mod.path === "__tests__/standalone.ts") &&
        mod.kind !== "test",
    ) ?? [];

  expect(cliModule?.tests).toContain("test/cli.test.ts");
  expect(standaloneTest?.kind).toBe("test");
  expect(normalRootTestModules).toEqual([]);
});

test("buildCodebaseIndex does not mark exact scan cap as truncated", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-exact-scan-cap-"));
  await writeFile(join(cwd, "a.ts"), "export const a = 1;\n", "utf8");
  await writeFile(join(cwd, "b.ts"), "export const b = 2;\n", "utf8");

  const result = await buildCodebaseIndex({
    cwd,
    now: new Date("2026-06-08T00:00:00.000Z"),
    limits: { maxFilesScanned: 2 },
  });
  expect(result.truncated).toBe(false);
  expect(result.scannedFiles).toBe(2);
  expect(result.index.risks?.some((risk) => risk.area === "scan coverage")).toBe(false);
});

test("buildCodebaseIndex records large-file risk only for indexed oversized files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-indexed-oversized-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "assets"), { recursive: true });
  await writeFile(join(cwd, "src", "huge.ts"), "x".repeat(64), "utf8");
  await writeFile(join(cwd, "assets", "video.bin"), "x".repeat(64), "utf8");

  const result = await buildCodebaseIndex({
    cwd,
    now: new Date("2026-06-08T00:00:00.000Z"),
    limits: { maxFingerprintBytesPerFile: 32 },
  });
  const largeFileRisks = result.index.risks?.filter((risk) => risk.area === "large file skipped") ?? [];
  expect(largeFileRisks).toHaveLength(1);
  expect(largeFileRisks[0]?.summary).toContain("src/huge.ts");
  expect(largeFileRisks[0]?.summary).not.toContain("assets/video.bin");
  expect(result.index.fingerprints?.["src/huge.ts"]).toBeUndefined();
  expect(result.index.fingerprints?.["assets/video.bin"]).toBeUndefined();
});

test("buildCodebaseIndex deduplicates package and inferred entrypoints before cap accounting", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-dedup-entrypoints-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ main: "./src/cli.ts", bin: { cli: "src/cli.ts" } }),
    "utf8",
  );
  await writeFile(join(cwd, "src", "cli.ts"), "export const cli = 1;\n", "utf8");

  const result = await buildCodebaseIndex({
    cwd,
    now: new Date("2026-06-08T00:00:00.000Z"),
    limits: { maxIndexedFiles: 2 },
  });
  expect(result.index.entrypoints?.filter((entry) => entry.path === "src/cli.ts")).toHaveLength(1);
  expect(result.index.modules?.filter((mod) => mod.path === "src/cli.ts")).toHaveLength(1);
  expect(result.truncated).toBe(false);
  expect(result.indexedFiles).toBe(2);
});

test("buildCodebaseIndex uses Git discovery for tracked and untracked files while ignoring ignored files", async () => {
  const cwd = await initGitRepo("specwright-build-index-git-discovery-");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "demo" }), "utf8");
  await writeFile(join(cwd, "src", "tracked.ts"), "export const tracked = 1;\n", "utf8");
  await writeFile(join(cwd, "src", "untracked.ts"), "export const untracked = 1;\n", "utf8");
  await writeFile(join(cwd, ".gitignore"), "ignored.ts\n", "utf8");
  await writeFile(join(cwd, "ignored.ts"), "export const ignored = 1;\n", "utf8");
  await expectGit(cwd, ["add", "package.json", "src/tracked.ts", ".gitignore"]);
  await expectGit(cwd, ["commit", "-m", "seed"]);

  const result = await buildCodebaseIndex({ cwd, now: new Date("2026-06-08T00:00:00.000Z") });
  const modulePaths = result.index.modules?.map((mod) => mod.path) ?? [];
  expect(modulePaths).toContain("src/tracked.ts");
  expect(modulePaths).toContain("src/untracked.ts");
  expect(modulePaths).not.toContain("ignored.ts");
  expect(result.index.fingerprints?.["src/tracked.ts"]).toBeDefined();
  expect(result.index.fingerprints?.["src/untracked.ts"]).toBeDefined();
  expect(result.index.fingerprints?.["ignored.ts"]).toBeUndefined();
});

test("buildCodebaseIndex ignores root package metadata excluded by Git discovery", async () => {
  const cwd = await initGitRepo("specwright-build-index-ignored-package-");
  await mkdir(join(cwd, "src"), { recursive: true });
  await writeFile(join(cwd, ".gitignore"), "package.json\n", "utf8");
  await writeFile(join(cwd, "src", "cli.ts"), "export const cli = 1;\n", "utf8");
  await expectGit(cwd, ["add", ".gitignore", "src/cli.ts"]);
  await expectGit(cwd, ["commit", "-m", "seed"]);
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ main: "./src/cli.ts", scripts: { test: "bun test" } }),
    "utf8",
  );

  const result = await buildCodebaseIndex({ cwd, now: new Date("2026-06-08T00:00:00.000Z") });
  const entrypointPaths = result.index.entrypoints?.map((entry) => entry.path) ?? [];
  const commandNames = result.index.commands?.map((command) => command.name) ?? [];
  const verificationCommands = result.index.verification?.map((item) => item.command) ?? [];
  const modulePaths = result.index.modules?.map((mod) => mod.path) ?? [];

  expect(entrypointPaths).not.toContain("package.json");
  expect(result.index.fingerprints?.["package.json"]).toBeUndefined();
  expect(commandNames).not.toContain("test");
  expect(verificationCommands).not.toContain("bun test");
  expect(modulePaths).toContain("src/cli.ts");
});

test("buildCodebaseIndex sorts paths by code-unit order", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-build-index-code-unit-sort-"));
  await mkdir(join(cwd, "src"), { recursive: true });
  const paths = ["src/Z.ts", "src/a.ts", "src/ä.ts"];
  for (const relPath of paths) {
    await writeFile(join(cwd, relPath), "export const value = 1;\n", "utf8");
  }

  const result = await buildCodebaseIndex({ cwd, now: new Date("2026-06-08T00:00:00.000Z") });
  const modulePaths = (result.index.modules?.map((mod) => mod.path) ?? []).filter((path) =>
    paths.includes(path),
  );
  const expected = [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  expect(modulePaths).toEqual(expected);
});


test("scan --json surfaces validation issues in machine-readable output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-scan-validation-json-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);

  const indexPath = join(cwd, ".specwright", "project", "codebase-index.json");
  await writeFile(
    indexPath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: ctx.now().toISOString(),
        entrypoints: [{ path: "../escape.ts" }],
        modules: [],
        commands: [],
        verification: [],
        risks: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["scan", "--json"]);
  expect(result.ok).toBe(true);
  const payload = JSON.parse(result.summary);
  expect(payload.validation.ok).toBe(false);
  expect(payload.validation.issues.some((issue: { message: string }) => issue.message.includes("not a safe relative path"))).toBe(true);
  expect(result.prompt).toContain("Validation issues:");
  expect(result.prompt).toContain("not a safe relative path");
});
test("research prompt includes map pointer when map artifacts exist", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-research-map-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Test research map pointer"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["research"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain(".specwright/project/codebase-map.md");
  expect(result.prompt).toContain(".specwright/project/codebase-index.json");
  expect(result.prompt).toContain("Optional project context:");
  expect(result.prompt).not.toContain("# Codebase Map");
});

test("research prompt omits map pointer when map artifacts are absent", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-research-no-map-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Test research no map pointer"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["research"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).not.toContain(".specwright/project/codebase-map.md");
  expect(result.prompt).not.toContain(".specwright/project/codebase-index.json");
  expect(result.prompt).not.toContain("Optional project context:");
});

test("plan prompt includes map pointer when map artifacts exist", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-plan-map-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Test plan map pointer"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["plan"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain(".specwright/project/codebase-map.md");
  expect(result.prompt).toContain(".specwright/project/codebase-index.json");
  expect(result.prompt).toContain("Optional project context:");
  expect(result.prompt).not.toContain("# Codebase Map");
});

test("plan prompt omits map pointer when map artifacts are absent", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-plan-no-map-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Test plan no map pointer"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["plan"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).not.toContain(".specwright/project/codebase-map.md");
  expect(result.prompt).not.toContain(".specwright/project/codebase-index.json");
  expect(result.prompt).not.toContain("Optional project context:");
});

test("execute prompt includes map reference path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-execute-map-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Test execute map pointer"])).ok).toBe(true);

  await writeFile(
    join(cwd, ".specwright/changes/0001-test-execute-map-pointer/tasks.md"),
    "- [ ] T001: Build something\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["execute"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain(".specwright/project/codebase-map.md");
  expect(result.prompt).toContain(".specwright/project/codebase-index.json");
  expect(result.prompt).toContain("Optional project context:");
  expect(result.prompt).not.toContain("# Codebase Map");
});

test("handoff prompt includes map pointer when no task is specified", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-handoff-map-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Test handoff map pointer"])).ok).toBe(true);

  await writeFile(
    join(cwd, ".specwright/changes/0001-test-handoff-map-pointer/tasks.md"),
    "- [x] T001: Build something\n",
    "utf8",
  );
  await writeFile(
    join(cwd, ".specwright/changes/0001-test-handoff-map-pointer/verify.md"),
    "# Verify\n\n## Observed output\n\n`bun test` passed.\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["handoff"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).toContain(".specwright/project/codebase-map.md");
  expect(result.prompt).toContain(".specwright/project/codebase-index.json");
  expect(result.prompt).toContain("Optional project context:");
  expect(result.prompt).not.toContain("# Codebase Map");
});

test("handoff prompt omits map pointer when task is specified", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-handoff-task-map-"));
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["scan"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Test handoff task map pointer"])).ok).toBe(true);

  await writeFile(
    join(cwd, ".specwright/changes/0001-test-handoff-task-map-pointer/tasks.md"),
    "- [x] T001: Build something\n",
    "utf8",
  );
  await writeFile(
    join(cwd, ".specwright/changes/0001-test-handoff-task-map-pointer/verify.md"),
    "# Verify\n\n## Observed output\n\n`bun test` passed.\n",
    "utf8",
  );

  const result = await runSpecwrightCommand(ctx, ["handoff", "--task", "T001"]);
  expect(result.ok).toBe(true);
  expect(result.prompt).not.toContain(".specwright/project/codebase-map.md");
  expect(result.prompt).not.toContain(".specwright/project/codebase-index.json");
  expect(result.prompt).not.toContain("Optional project context:");
});

