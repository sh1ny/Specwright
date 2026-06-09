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
import { syncChangeTasksFromMarkdown } from "../src/core/state";
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

test("checkpoint and commit aliases stage scoped files with deterministic messages", async () => {
  const cwd = await initGitRepo("specwright-checkpoint-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Inventory Crafting"])).ok).toBe(true);

  await writeFile(join(cwd, ".specwright/changes/0001-inventory-crafting/tasks.md"), "- [ ] T001: Build inventory\n  - Files: `tracked.txt`\n", "utf8");
  await writeFile(join(cwd, "tracked.txt"), "tracked\n", "utf8");
  await writeFile(join(cwd, "unrelated.txt"), "unrelated\n", "utf8");

  const checkpoint = await runSpecwrightCommand(ctx, ["checkpoint", "0001-inventory-crafting", "--task", "T001", "--files", "tracked.txt"]);
  expect(checkpoint.ok).toBe(true);
  let subject = await expectGit(cwd, ["log", "-1", "--pretty=%s"]);
  expect(subject.stdout.trim()).toBe("specwright: checkpoint 0001-inventory-crafting T001");
  let status = await expectGit(cwd, ["status", "--short"]);
  expect(status.stdout).toContain("?? unrelated.txt");
  expect(status.stdout).not.toContain("tracked.txt");

  await writeFile(join(cwd, "phase.txt"), "phase\n", "utf8");
  const commit = await runSpecwrightCommand(ctx, ["commit", "0001-inventory-crafting", "--phase", "plan", "--files", "phase.txt"]);
  expect(commit.ok).toBe(true);
  subject = await expectGit(cwd, ["log", "-1", "--pretty=%s"]);
  expect(subject.stdout.trim()).toBe("specwright: checkpoint 0001-inventory-crafting plan");
  status = await expectGit(cwd, ["status", "--short"]);
  expect(status.stdout).not.toContain("phase.txt");
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
