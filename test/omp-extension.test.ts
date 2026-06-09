import { test, expect } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

test("OMP status refresh syncs tasks.md before rendering status", async () => {
  const handlers = new Map<string, (event: unknown, ctx: OmpCommandContextLike) => void | Promise<unknown>>();
  const statuses: Array<string | undefined> = [];
  let label = "";

  const pi: ExtensionApiLike = {
    setLabel(value) { label = value; },
    on(event, handler) { handlers.set(event, handler); },
    registerCommand() {},
    sendUserMessage() {},
  };

  specwrightOmpExtension(pi);
  expect(label).toBe("Specwright");

  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-refresh-"));
  const changeDir = join(cwd, ".specwright/changes/0001-drift");
  await mkdir(changeDir, { recursive: true });
  await writeFile(join(changeDir, "tasks.md"), "# Tasks\n\n- [x] T001: Refresh status\n", "utf8");
  await writeFile(join(cwd, ".specwright/state.json"), `${JSON.stringify({
    version: 1,
    currentChange: "0001",
    changes: {
      "0001": {
        id: "0001",
        slug: "drift",
        title: "Drift",
        kind: "feature",
        pack: "core",
        mode: "lite",
        status: "executing",
        step: "execute",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        tasks: {
          T001: {
            id: "T001",
            title: "Refresh status",
            status: "pending",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  }, null, 2)}\n`, "utf8");

  const refresh = handlers.get("session_start");
  expect(refresh).toBeDefined();
  await refresh?.({}, {
    cwd,
    ui: {
      setStatus(_key, text) { statuses.push(text); },
    },
  });

  expect(statuses.at(-1)).toContain("Specwright · 0001 · executing · tasks=1/1");
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
