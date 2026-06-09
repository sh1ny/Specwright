import { test, expect } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import specwrightOmpExtension from "../src/runtime/omp/extension";
import { installOmpAdapter } from "../src/runtime/omp/install";
import type { ExtensionApiLike, OmpCommandContextLike } from "../src/runtime/omp/types";

test("OMP extension registers and handles specwright command", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  const notifications: string[] = [];
  const statuses: Array<string | undefined> = [];
  const sentMessages: Array<{ content: string; options?: { deliverAs?: "steer" | "followUp" } }> = [];
  let label = "";

  const pi: ExtensionApiLike = {
    setLabel(value) { label = value; },
    on() {},
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage(content, options) { sentMessages.push(options ? { content: String(content), options } : { content: String(content) }); },
  };

  specwrightOmpExtension(pi);
  expect(label).toBe("Specwright");
  expect(commands.has("specwright")).toBe(true);

  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-extension-"));
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  await command!.handler("status", {
    cwd,
    waitForIdle: async () => {},
    ui: {
      notify(message) { notifications.push(message); },
      setStatus(_key, text) { statuses.push(text); },
    },
  });

  expect(notifications.at(-1)).toContain("Specwright ·");
  expect(statuses.at(-1)).toContain("Specwright · none · idle");
  expect(sentMessages).toHaveLength(0);
});

test("OMP extension sends generated prompts as immediate user messages when idle", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  const sentMessages: Array<{ content: string; options?: { deliverAs?: "steer" | "followUp" } }> = [];

  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage(content, options) { sentMessages.push(options ? { content: String(content), options } : { content: String(content) }); },
  };

  specwrightOmpExtension(pi);
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-prompt-"));
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  const ctx: OmpCommandContextLike = { cwd, waitForIdle: async () => {} };

  await command!.handler("init", ctx);
  await command!.handler('new research "Config commands"', ctx);
  await command!.handler("research --online auto", ctx);

  expect(sentMessages).toHaveLength(1);
  expect(sentMessages[0]?.content).toStartWith("# Specwright Research:");
  expect(sentMessages[0]?.options).toBeUndefined();
});

test("OMP extension preserves quoted JSON config values", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  const notifications: string[] = [];

  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage() {},
  };

  specwrightOmpExtension(pi);
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-config-"));
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  const ctx: OmpCommandContextLike = {
    cwd,
    waitForIdle: async () => {},
    ui: {
      notify(message) { notifications.push(message); },
    },
  };

  await command!.handler("init", ctx);
  await command!.handler("config set packs.enabled '[\"core\",\"game-dev-studio\"]'", ctx);

  const config = JSON.parse(await readFile(join(cwd, ".specwright/config.json"), "utf8")) as {
    packs?: { enabled?: unknown };
  };
  expect(config.packs?.enabled).toEqual(["core", "game-dev-studio"]);
  expect(notifications.at(-1)).toBe("Set packs.enabled.");
});

test("OMP adapter installs project-local extension files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-install-"));
  const changed = await installOmpAdapter({ cwd, force: false });

  expect(changed).toContain(".omp/extensions/specwright/package.json");
  expect(changed).toContain(".omp/extensions/specwright/index.ts");
  expect(changed).toContain(".omp/rules/specwright-workflow.md");
  expect(changed).toContain(".omp/agents/specwright-researcher.md");
  expect(changed).toContain(".omp/agents/specwright-planner.md");
  expect(changed).toContain(".omp/agents/specwright-executor.md");
  expect(changed).toContain(".omp/agents/specwright-verifier.md");

  const packageJson = JSON.parse(await readFile(join(cwd, ".omp/extensions/specwright/package.json"), "utf8")) as {
    omp?: { extensions?: string[] };
  };
  expect(packageJson.omp?.extensions).toEqual(["./index.ts"]);

  const index = await readFile(join(cwd, ".omp/extensions/specwright/index.ts"), "utf8");
  expect(index).toContain("src/runtime/omp/extension");

  const rule = await readFile(join(cwd, ".omp/rules/specwright-workflow.md"), "utf8");
  expect(rule).toContain("alwaysApply: true");
  expect(rule).toContain("source-of-truth workflow artifacts");

  const researcher = await readFile(join(cwd, ".omp/agents/specwright-researcher.md"), "utf8");
  expect(researcher).toContain("name: specwright-researcher");
  expect(researcher).toContain("tools: read,grep,find,lsp,web_search");

  const executor = await readFile(join(cwd, ".omp/agents/specwright-executor.md"), "utf8");
  expect(executor).toContain("name: specwright-executor");
  expect(executor).toContain("Implement the assigned task only.");
});
