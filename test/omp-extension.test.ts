import { test, expect } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import specwrightOmpExtension from "../src/runtime/omp/extension";
import { defaultConfig } from "../src/core/state";
import { installOmpAdapter } from "../src/runtime/omp/install";
import { runSpecwrightCommand } from "../src/core/commands";
import { refreshStatus } from "../src/runtime/omp/status";
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
test("concurrent refreshStatus calls do not throw ENOENT on temp file rename", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-concurrent-"));
  const changeDir = join(cwd, ".specwright/changes/0001-drift");
  await mkdir(changeDir, { recursive: true });
  await writeFile(join(changeDir, "tasks.md"), "# Tasks\n\n- [x] T001: Concurrent refresh\n", "utf8");
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
            title: "Concurrent refresh",
            status: "pending",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  }, null, 2)}\n`, "utf8");

  const statuses: Array<string | undefined> = [];
  const ctx: OmpCommandContextLike = {
    cwd,
    ui: {
      setStatus(_key, text) { statuses.push(text); },
    },
  };

  const results = await Promise.allSettled([
    refreshStatus({}, ctx),
    refreshStatus({}, ctx),
    refreshStatus({}, ctx),
  ]);

  for (const result of results) {
    expect(result.status).toBe("fulfilled");
  }
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
  const config = defaultConfig("specwright-omp-install");
  config.agents.researcher.model = "custom/research";
  config.agents.planner.model = "custom/plan";
  config.agents.executor.model = "custom/execute";
  config.agents.verifier.model = "custom/verify";
  const changed = await installOmpAdapter({ cwd, force: false, config });

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
  expect(researcher).toContain("description: Researches local repo evidence and online sources for one Specwright change.");
  expect(researcher).toContain("model: custom/research");
  expect(researcher).toContain("tools: read,grep,find,lsp,web_search");
  expect(researcher).toContain("spawns: []");

  const planner = await readFile(join(cwd, ".omp/agents/specwright-planner.md"), "utf8");
  expect(planner).toContain("name: specwright-planner");
  expect(planner).toContain("description: Converts Specwright intent and research evidence into a decision-complete plan and tasks.");
  expect(planner).toContain("model: custom/plan");
  expect(planner).toContain("tools: read,grep,find,lsp");
  expect(planner).toContain("spawns: []");

  const executor = await readFile(join(cwd, ".omp/agents/specwright-executor.md"), "utf8");
  expect(executor).toContain("name: specwright-executor");
  expect(executor).toContain("model: custom/execute");
  expect(executor).toContain("tools: read,grep,find,lsp,edit,write,bash,todo");
  expect(executor).toContain("spawns: []");
  expect(executor).toContain("Implement the assigned task only.");

  const verifier = await readFile(join(cwd, ".omp/agents/specwright-verifier.md"), "utf8");
  expect(verifier).toContain("name: specwright-verifier");
  expect(verifier).toContain("model: custom/verify");
  expect(verifier).toContain("tools: read,grep,find,lsp,bash,browser");
  expect(verifier).toContain("spawns: []");
});

test("specwright init installs default lifecycle agent models in OMP frontmatter", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-default-models-"));
  const ctx = { cwd, runtime: "cli" as const, now: () => new Date("2026-06-08T00:00:00.000Z") };
  expect((await runSpecwrightCommand(ctx, ["init"])).ok).toBe(true);

  const expected = [
    ["specwright-researcher.md", "model: pi/task"],
    ["specwright-planner.md", "model: pi/plan"],
    ["specwright-executor.md", "model: pi/task"],
    ["specwright-verifier.md", "model: pi/task"],
  ] as const;

  for (const [file, model] of expected) {
    const agent = await readFile(join(cwd, ".omp/agents", file), "utf8");
    expect(agent).toContain(model);
    expect(agent).toContain("spawns: []");
  }
});

test("OMP adapter can regenerate one agent without rewriting other artifacts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-agent-regenerate-"));
  const config = defaultConfig("specwright-omp-agent-regenerate");
  expect(await installOmpAdapter({ cwd, force: false, config })).toContain(".omp/agents/specwright-planner.md");

  const indexPath = join(cwd, ".omp/extensions/specwright/index.ts");
  const researcherPath = join(cwd, ".omp/agents/specwright-researcher.md");
  const plannerPath = join(cwd, ".omp/agents/specwright-planner.md");
  const indexBefore = await readFile(indexPath, "utf8");
  const researcherBefore = await readFile(researcherPath, "utf8");

  config.agents.planner.model = "custom/plan-model";
  const changed = await installOmpAdapter({ cwd, force: false, config, regenerateAgents: ["planner"] });
  expect(changed).toEqual([".omp/agents/specwright-planner.md"]);

  const planner = await readFile(plannerPath, "utf8");
  expect(planner).toContain("model: custom/plan-model");
  expect(await readFile(indexPath, "utf8")).toBe(indexBefore);
  expect(await readFile(researcherPath, "utf8")).toBe(researcherBefore);
});
