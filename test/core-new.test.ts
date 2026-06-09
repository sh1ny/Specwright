import { test, expect } from "bun:test";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSpecwrightCommand } from "../src/core/commands";
import { runGit } from "../src/core/git";
import { slugify } from "../src/core/slug";
import type { SpecwrightState } from "../src/core/types";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function testContext(cwd: string) {
  return { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
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

test("new creates a current change directory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-new-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["new", "feature", "Implement an inventory crafting system"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8")) as SpecwrightState;
  expect(state.currentChange).toBe("0001");
  const slug = state.changes["0001"].slug;
  await expect(pathExists(join(cwd, `.specwright/changes/0001-${slug}`))).resolves.toBe(true);
});
test("new and discuss create a first-class decisions artifact", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-decisions-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["new", "feature", "Implement an inventory crafting system"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["discuss"])).ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8")) as SpecwrightState;
  const slug = state.changes["0001"].slug;

  const decisions = await readFile(join(cwd, `.specwright/changes/0001-${slug}/decisions.md`), "utf8");
  expect(decisions).toContain("# Decisions");
  expect(decisions).toContain("## Settled");
  expect(decisions).toContain("## Ready state");
  expect(decisions).not.toMatch(/\{\{(?:id|title|kind|mode|pack|createdAt)\}\}/);

  expect(await readFile(join(cwd, ".specwright/packs/core/templates/decisions.md"), "utf8")).toContain("# Decisions");
});

test("new in a git worktree creates a change branch and commits only scaffold files", async () => {
  const cwd = await initGitRepo("specwright-new-git-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  await writeFile(join(cwd, "unrelated.txt"), "unrelated\n", "utf8");

  const result = await runSpecwrightCommand(ctx, ["new", "feature", "Implement an inventory crafting system"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8")) as SpecwrightState;
  const slug = state.changes["0001"].slug;

  const branch = await expectGit(cwd, ["branch", "--show-current"]);
  expect(branch.stdout.trim()).toBe(`feature/0001-${slug}`);

  const subject = await expectGit(cwd, ["log", "-1", "--pretty=%s"]);
  expect(subject.stdout.trim()).toBe(`specwright: start 0001-${slug}`);

  const committed = await expectGit(cwd, ["show", "--name-only", "--pretty=format:", "HEAD"]);
  const committedFiles = committed.stdout.trim().split("\n").filter(Boolean).sort();
  expect(committedFiles).toContain(".specwright/state.json");
  expect(committedFiles).toContain(`.specwright/changes/0001-${slug}/intent.md`);
  expect(committedFiles).toContain(`.specwright/changes/0001-${slug}/tasks.md`);
  expect(committedFiles).not.toContain(".specwright/config.json");
  expect(committedFiles).not.toContain("unrelated.txt");

  const status = await expectGit(cwd, ["status", "--short"]);
  expect(status.stdout).toContain("?? unrelated.txt");
  expect(status.stdout).not.toContain(`.specwright/changes/0001-${slug}`);
});

test("new in a git worktree creates a branch without committing when auto-commit is disabled", async () => {
  const cwd = await initGitRepo("specwright-new-no-commit-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);
  expect((await runSpecwrightCommand(ctx, ["config", "set", "workflow.autoCommit", "false"])).ok).toBe(true);

  const result = await runSpecwrightCommand(ctx, ["new", "feature", "Implement an inventory crafting system"]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8")) as SpecwrightState;
  const slug = state.changes["0001"].slug;

  const branch = await expectGit(cwd, ["branch", "--show-current"]);
  expect(branch.stdout.trim()).toBe(`feature/0001-${slug}`);

  const head = await runGit(cwd, ["rev-parse", "--verify", "HEAD"]);
  expect(head.exitCode).not.toBe(0);

  const status = await expectGit(cwd, ["status", "--short"]);
  expect(status.stdout).toContain("?? .specwright/");
});
test("new derives title and slug from a long request and uses them for branch and state", async () => {
  const cwd = await initGitRepo("specwright-new-derived-");
  const ctx = testContext(cwd);
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const longRequest = "Implement a complete user authentication and authorization system with OAuth2 integration and session management for the web application";
  const result = await runSpecwrightCommand(ctx, ["new", "feature", longRequest]);
  expect(result.ok).toBe(true);

  const state = JSON.parse(await readFile(join(cwd, ".specwright/state.json"), "utf8")) as SpecwrightState;
  expect(state.currentChange).toBe("0001");
  expect(state.changes["0001"].title.length).toBeLessThanOrEqual(80);
  expect(state.changes["0001"].slug).toBe(slugify(state.changes["0001"].title));

  const branch = await expectGit(cwd, ["branch", "--show-current"]);
  expect(branch.stdout.trim()).toBe(`feature/0001-${state.changes["0001"].slug}`);

  const subject = await expectGit(cwd, ["log", "-1", "--pretty=%s"]);
  expect(subject.stdout.trim()).toBe(`specwright: start 0001-${state.changes["0001"].slug}`);
});
