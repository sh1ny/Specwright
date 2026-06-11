import { test, expect } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { runSpecwrightCommand } from "../src/core/commands";
import {
  branchNameForChange,
  commitStaged,
  generatePullRequestBody,
  gitWorktreeRoot,
  isGitWorktree,
  resolveBaseBranch,
  runGh,
  runGit,
  stageFiles,
  writePullRequestBodyFile,
} from "../src/core/git";
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
    ["checkpoint", "--files", "tracked.txt"],
    ["checkpoint", "--phase", "plan", "--task", "T001", "--files", "tracked.txt"],
    ["checkpoint", "--phase", "not-a-phase", "--files", "tracked.txt"],
    ["checkpoint", "--phase", "plan", "--files", ""],
    ["checkpoint", "--phase", "plan", "--files", "tracked.txt,missing.txt"],
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
  expect(subject.stdout.trim()).toBe("specwright: checkpoint 0001-inventory-crafting T001");
  let status = await expectGit(cwd, ["status", "--short"]);
  expect(status.stdout).toContain("?? unrelated.txt");
  expect(status.stdout).not.toContain("tracked.txt");

  await writeFile(join(cwd, "phase.txt"), "phase\n", "utf8");
  const commit = await runSpecwrightCommand(ctx, ["commit", "0001-inventory-crafting", "--phase", "plan", "--summary", "Plan the work", "--files", "phase.txt"]);
  expect(commit.ok).toBe(true);
  subject = await expectGit(cwd, ["log", "-1", "--pretty=%s"]);
  expect(subject.stdout.trim()).toBe("specwright: checkpoint 0001-inventory-crafting plan");
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
