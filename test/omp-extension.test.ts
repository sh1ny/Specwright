import { test, expect, spyOn } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import specwrightOmpExtension from "../src/runtime/omp/extension";
import { defaultConfig } from "../src/core/state";
import { installOmpAdapter } from "../src/runtime/omp/install";
import { runSpecwrightCommand } from "../src/core/commands";
import { refreshStatus } from "../src/runtime/omp/status";
import type { ExtensionApiLike, OmpCommandContextLike, ToolDefinition } from "../src/runtime/omp/types";

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
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
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
  expect(statuses.at(-1)).toBeUndefined();
  expect(sentMessages).toHaveLength(0);
});

test("OMP status refresh syncs tasks.md before rendering status", async () => {
  const handlers = new Map<string, (event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>>();
  const statuses: Array<string | undefined> = [];
  let label = "";

  const pi: ExtensionApiLike = {
    setLabel(value) { label = value; },
    on(event, handler) { handlers.set(event, handler); },
    registerCommand() {},
    sendUserMessage() {},
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  expect(label).toBe("Specwright");

  const commands = await import("../src/core/commands");
  const originalRun = commands.runSpecwrightCommand;
  const spy = spyOn(commands, "runSpecwrightCommand");
  spy.mockImplementation(async (_ctx, args) => {
    if (args.includes("--json") && args.includes("verify")) {
      return { ok: true, summary: JSON.stringify({ ok: true, issues: [] }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    return originalRun(_ctx, args);
  });

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

  try {
    const refresh = handlers.get("session_start");
    expect(refresh).toBeDefined();
    await refresh?.({}, {
      cwd,
      ui: {
        setStatus(_key, text) { statuses.push(text); },
      },
    });

    expect(statuses.at(-1)).toContain("Specwright · 0001 · checkpoint-needed · tasks=1/1");
  } finally {
    spy.mockRestore();
  }
});
test("concurrent refreshStatus calls do not throw ENOENT on temp file rename", async () => {
  const commands = await import("../src/core/commands");
  const originalRun = commands.runSpecwrightCommand;
  const spy = spyOn(commands, "runSpecwrightCommand");
  spy.mockImplementation(async (_ctx, args) => {
    if (args.includes("--json") && args.includes("verify")) {
      return { ok: true, summary: JSON.stringify({ ok: true, issues: [] }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    return originalRun(_ctx, args);
  });

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

  try {
    const results = await Promise.allSettled([
      refreshStatus({}, ctx),
      refreshStatus({}, ctx),
      refreshStatus({}, ctx),
    ]);

    for (const result of results) {
      expect(result.status).toBe("fulfilled");
    }
    expect(statuses.at(-1)).toContain("Specwright · 0001 · checkpoint-needed · tasks=1/1");
  } finally {
    spy.mockRestore();
  }
});

test("concurrent refreshStatus calls update each waiting OMP context", async () => {
  const commands = await import("../src/core/commands");
  const originalRun = commands.runSpecwrightCommand;
  const spy = spyOn(commands, "runSpecwrightCommand");
  spy.mockImplementation(async (_ctx, args) => {
    if (args.includes("--json") && args.includes("verify")) {
      return { ok: true, summary: JSON.stringify({ ok: true, issues: [] }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    return originalRun(_ctx, args);
  });

  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-concurrent-contexts-"));
  const changeDir = join(cwd, ".specwright/changes/0001-drift");
  await mkdir(changeDir, { recursive: true });
  const taskCount = 999;
  const tasksMarkdown = `# Tasks\n\n${Array.from({ length: taskCount }, (_, index) => `- [x] T${String(index + 1).padStart(3, "0")}: Concurrent context refresh ${index + 1}`).join("\n")}\n`;
  await writeFile(join(changeDir, "tasks.md"), tasksMarkdown, "utf8");
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
            title: "Concurrent context refresh",
            status: "pending",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  }, null, 2)}\n`, "utf8");

  const firstStatuses: Array<string | undefined> = [];
  const secondStatuses: Array<string | undefined> = [];

  try {
    await Promise.all([
      refreshStatus({}, {
        cwd,
        ui: {
          setStatus(_key, text) { firstStatuses.push(text); },
        },
      }),
      refreshStatus({}, {
        cwd,
        ui: {
          setStatus(_key, text) { secondStatuses.push(text); },
        },
      }),
    ]);

    expect(firstStatuses.at(-1)).toContain(`Specwright · 0001 · checkpoint-needed · tasks=${taskCount}/${taskCount}`);
    expect(secondStatuses.at(-1)).toContain(`Specwright · 0001 · checkpoint-needed · tasks=${taskCount}/${taskCount}`);
  } finally {
    spy.mockRestore();
  }
});
test("OMP extension sends generated prompts as immediate user messages when idle", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  const sentMessages: Array<{ content: string; options?: { deliverAs?: "steer" | "followUp" } }> = [];

  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage(content, options) { sentMessages.push(options ? { content: String(content), options } : { content: String(content) }); },
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-prompt-"));
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  const ctx: OmpCommandContextLike = { cwd, waitForIdle: async () => {} };

  await command!.handler("init", ctx);
  await command!.handler("new research Add configuration commands for system management", ctx);
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
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
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

test("widened OMP adapter API surface accepts new fields without breaking existing mocks", async () => {
  const tools: Array<{ name: string; params: Record<string, unknown> }> = [];
  let activeTools: string[] = ["existing"];
  let selectedValue: string | undefined;
  let inputValue: string | undefined;
  let editorValue: string | undefined;
  let confirmed = false;
  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand() {},
    sendUserMessage() {},
    registerTool(definition) {
      tools.push({ name: definition.name, params: definition.parameters as Record<string, unknown> });
    },
    getActiveTools() { return activeTools; },
    setActiveTools(tools) { activeTools = tools; },
  };
  const ctx: OmpCommandContextLike = {
    cwd: process.cwd(),
    ui: {
      notify() {},
      setStatus() {},
      async select(message, choices) {
        return choices[0]?.value;
      },
      async input(message, options) {
        return options?.default ?? "typed";
      },
      async editor(content, options) {
        return content;
      },
      async confirm(message) {
        return true;
      },
    },
  };
  pi.registerTool({
    name: "specwright_status",
    label: "Specwright Status",
    description: "Return Specwright status as JSON",
    parameters: {},
    execute() {
      return { content: [{ type: "text", text: "{}" }], details: { ok: true } };
    },
  });
  pi.setActiveTools?.(["specwright_status"]);
  expect(tools).toHaveLength(1);
  expect(tools[0]?.name).toBe("specwright_status");
  expect(pi.getActiveTools?.()).toEqual(["specwright_status"]);
  selectedValue = await ctx.ui?.select?.("Pick one", [{ value: "a", label: "A" }]);
  inputValue = await ctx.ui?.input?.("Type something", { default: "hello" });
  editorValue = await ctx.ui?.editor?.("code", { language: "ts" });
  confirmed = await ctx.ui?.confirm?.("Are you sure?") ?? false;
  expect(selectedValue).toBe("a");
  expect(inputValue).toBe("hello");
  expect(editorValue).toBe("code");
  expect(confirmed).toBe(true);
});

test("OMP extension registers structured tools", () => {
  const tools = new Map<string, { description: string; parameters: Record<string, unknown> }>();
  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand() {},
    sendUserMessage() {},
    registerTool(definition) {
      tools.set(definition.name, { description: definition.description, parameters: definition.parameters as Record<string, unknown> });
    },
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  expect(tools.has("specwright_status")).toBe(true);
  expect(tools.has("specwright_checkpoint")).toBe(true);
  expect(tools.has("specwright_validate")).toBe(true);
  expect(tools.get("specwright_status")?.description).toBe("Return Specwright status as JSON");
  const checkpointProperties = tools.get("specwright_checkpoint")?.parameters.properties as Record<string, unknown>;
  const validateProperties = tools.get("specwright_validate")?.parameters.properties as Record<string, unknown>;
  expect(checkpointProperties).toHaveProperty("change");
  expect(checkpointProperties).toHaveProperty("phase");
  expect(checkpointProperties).toHaveProperty("task");
  expect(checkpointProperties).toHaveProperty("files");
  expect(validateProperties).toHaveProperty("change");
});

test("specwright_status tool returns structured CommandResult shape", async () => {
  const tools = new Map<string, Pick<ToolDefinition, "execute">>();
  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand() {},
    sendUserMessage() {},
    registerTool(definition) {
      tools.set(definition.name, { execute: definition.execute });
    },
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-status-tool-"));
  await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["init"]);

  const statusTool = tools.get("specwright_status");
  expect(statusTool).toBeDefined();
  const result = (await statusTool!.execute("tool-call", {}, undefined, undefined, { cwd })).details as Record<string, unknown>;
  expect(result.ok).toBe(true);
  expect(typeof result.summary).toBe("string");
  expect(Array.isArray(result.filesCreated)).toBe(true);
  expect(Array.isArray(result.filesUpdated)).toBe(true);
  expect(result.exitCode).toBe(0);
});

test("specwright_validate tool returns structured result with validation report", async () => {
  const tools = new Map<string, Pick<ToolDefinition, "execute">>();
  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand() {},
    sendUserMessage() {},
    registerTool(definition) {
      tools.set(definition.name, { execute: definition.execute });
    },
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-validate-tool-"));
  await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["init"]);
  await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["new", "feature", "Test validation tool"]);

  const validateTool = tools.get("specwright_validate");
  expect(validateTool).toBeDefined();
  const result = (await validateTool!.execute("tool-call", {}, undefined, undefined, { cwd })).details as Record<string, unknown>;
  expect(typeof result.ok).toBe("boolean");
  expect(typeof result.summary).toBe("string");
  expect(Array.isArray(result.filesCreated)).toBe(true);
  expect(Array.isArray(result.filesUpdated)).toBe(true);
  expect(result.exitCode).toBeOneOf([0, 1]);
});

test("specwright_checkpoint tool rejects phase and task together", async () => {
  const tools = new Map<string, Pick<ToolDefinition, "execute">>();
  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand() {},
    sendUserMessage() {},
    registerTool(definition) {
      tools.set(definition.name, { execute: definition.execute });
    },
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-checkpoint-both-"));
  const checkpointTool = tools.get("specwright_checkpoint");
  expect(checkpointTool).toBeDefined();
  const result = (await checkpointTool!.execute("tool-call", { change: "", phase: "verify", task: "T001", files: ["tasks.md"] }, undefined, undefined, { cwd })).details as Record<string, unknown>;
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Specify exactly one of phase or task.");
  expect(result.exitCode).toBe(1);
});

test("specwright_checkpoint tool rejects missing phase and task", async () => {
  const tools = new Map<string, Pick<ToolDefinition, "execute">>();
  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand() {},
    sendUserMessage() {},
    registerTool(definition) {
      tools.set(definition.name, { execute: definition.execute });
    },
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-checkpoint-none-"));
  const checkpointTool = tools.get("specwright_checkpoint");
  expect(checkpointTool).toBeDefined();
  const result = (await checkpointTool!.execute("tool-call", { change: "", files: ["tasks.md"] }, undefined, undefined, { cwd })).details as Record<string, unknown>;
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("Specify exactly one of phase or task.");
  expect(result.exitCode).toBe(1);
});

test("specwright_checkpoint tool rejects empty files array", async () => {
  const tools = new Map<string, Pick<ToolDefinition, "execute">>();
  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand() {},
    sendUserMessage() {},
    registerTool(definition) {
      tools.set(definition.name, { execute: definition.execute });
    },
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-checkpoint-empty-files-"));
  const checkpointTool = tools.get("specwright_checkpoint");
  expect(checkpointTool).toBeDefined();
  const result = (await checkpointTool!.execute("tool-call", { change: "", phase: "verify", files: [] }, undefined, undefined, { cwd })).details as Record<string, unknown>;
  expect(result.ok).toBe(false);
  expect(result.summary).toBe("At least one file must be supplied.");
  expect(result.exitCode).toBe(1);
});

test("specwright_checkpoint tool forwards valid params to command", async () => {
  const tools = new Map<string, Pick<ToolDefinition, "execute">>();
  const pi: ExtensionApiLike = {
    setLabel() {},
    on() {},
    registerCommand() {},
    sendUserMessage() {},
    registerTool(definition) {
      tools.set(definition.name, { execute: definition.execute });
    },
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-checkpoint-forward-"));
  await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["init"]);
  await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["new", "feature", "Test checkpoint forwarding"]);

  const checkpointTool = tools.get("specwright_checkpoint");
  expect(checkpointTool).toBeDefined();
  // Without a git worktree the command will fail, but the error should NOT be about invalid params
  const result = (await checkpointTool!.execute("tool-call", { change: "", phase: "verify", files: ["tasks.md"] }, undefined, undefined, { cwd })).details as Record<string, unknown>;
  expect(result.ok).toBe(false);
  expect(result.summary).not.toBe("Specify exactly one of phase or task.");
  expect(result.summary).not.toBe("At least one file must be supplied.");
});
test("wrong first tool call after lifecycle command is blocked", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  const toolCallResults: Array<unknown> = [];
  let toolCallHandler: ((event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>) | undefined;
  const pi: ExtensionApiLike = {
    setLabel() {},
    on(event, handler) {
      if (event === "tool_call") {
        toolCallHandler = handler as (event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>;
      }
    },
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage() {},
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-route-block-"));
  await command!.handler("research 0001", { cwd, waitForIdle: async () => {} });
  expect(toolCallHandler).toBeDefined();
  const blockResult = toolCallHandler!({ toolName: "web_search", input: { query: "test" } }, { cwd });
  toolCallResults.push(blockResult);
  expect(blockResult).toEqual({
    block: true,
    reason: "Expected the model to delegate research to `specwright-researcher` via the `task` tool, but received tool `web_search` instead.",
  });
});

test("correct task call clears pending route and is not blocked", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  let toolCallHandler: ((event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>) | undefined;
  const pi: ExtensionApiLike = {
    setLabel() {},
    on(event, handler) {
      if (event === "tool_call") {
        toolCallHandler = handler as (event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>;
      }
    },
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage() {},
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-route-clear-"));
  await command!.handler("plan 0001", { cwd, waitForIdle: async () => {} });
  const passResult = toolCallHandler!({ toolName: "task", input: { agent: "specwright-planner" } }, { cwd });
  expect(passResult).toBeUndefined();

  const afterResult = toolCallHandler!({ toolName: "web_search", input: {} }, { cwd });
  expect(afterResult).toBeUndefined();
});

test("turn_end clears pending route so subsequent wrong calls pass", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  const handlers = new Map<string, (event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>>();
  const pi: ExtensionApiLike = {
    setLabel() {},
    on(event, handler) { handlers.set(event, handler); },
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage() {},
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-route-turn-end-"));
  await command!.handler("execute 0001", { cwd, waitForIdle: async () => {} });

  const turnEndHandler = handlers.get("turn_end");
  expect(turnEndHandler).toBeDefined();
  await turnEndHandler!({}, { cwd });

  const toolCallHandler = handlers.get("tool_call");
  expect(toolCallHandler).toBeDefined();
  const afterResult = toolCallHandler!({ toolName: "web_search", input: {} }, { cwd });
  expect(afterResult).toBeUndefined();
});

test("session_start clears pending route so subsequent wrong calls pass", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  const handlers = new Map<string, (event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>>();
  const pi: ExtensionApiLike = {
    setLabel() {},
    on(event, handler) { handlers.set(event, handler); },
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage() {},
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-route-session-start-"));
  await command!.handler("verify 0001", { cwd, waitForIdle: async () => {} });

  const sessionStartHandler = handlers.get("session_start");
  expect(sessionStartHandler).toBeDefined();
  await sessionStartHandler!({}, { cwd });

  const toolCallHandler = handlers.get("tool_call");
  expect(toolCallHandler).toBeDefined();
  const afterResult = toolCallHandler!({ toolName: "read_file", input: {} }, { cwd });
  expect(afterResult).toBeUndefined();
});

test("superseding lifecycle command replaces pending route", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  let toolCallHandler: ((event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>) | undefined;
  const pi: ExtensionApiLike = {
    setLabel() {},
    on(event, handler) {
      if (event === "tool_call") {
        toolCallHandler = handler as (event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>;
      }
    },
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage() {},
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-route-supersede-"));
  await command!.handler("research 0001", { cwd, waitForIdle: async () => {} });
  await command!.handler("plan 0001", { cwd, waitForIdle: async () => {} });
  expect(toolCallHandler).toBeDefined();
  const blockResult = toolCallHandler!({ toolName: "task", input: { agent: "specwright-researcher" } }, { cwd });
  expect(blockResult).toEqual({
    block: true,
    reason: "Expected the model to delegate plan to `specwright-planner` via the `task` tool, but received tool `task` instead.",
  });
});

test("non-lifecycle command clears pending route", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  let toolCallHandler: ((event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>) | undefined;
  const pi: ExtensionApiLike = {
    setLabel() {},
    on(event, handler) {
      if (event === "tool_call") {
        toolCallHandler = handler as (event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>;
      }
    },
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage() {},
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-route-non-lifecycle-"));
  await command!.handler("research 0001", { cwd, waitForIdle: async () => {} });
  await command!.handler("status", { cwd, waitForIdle: async () => {} });
  expect(toolCallHandler).toBeDefined();
  const afterResult = toolCallHandler!({ toolName: "web_search", input: {} }, { cwd });
  expect(afterResult).toBeUndefined();
});

test("unrelated commands do not set lifecycle routes", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: OmpCommandContextLike) => Promise<void> }>();
  let toolCallHandler: ((event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>) | undefined;
  const pi: ExtensionApiLike = {
    setLabel() {},
    on(event, handler) {
      if (event === "tool_call") {
        toolCallHandler = handler as (event: unknown, ctx: OmpCommandContextLike) => unknown | Promise<unknown>;
      }
    },
    registerCommand(name, options) { commands.set(name, { handler: options.handler }); },
    sendUserMessage() {},
    registerTool() {},
    getActiveTools() { return []; },
    setActiveTools() {},
  };

  specwrightOmpExtension(pi);
  const command = commands.get("specwright");
  expect(command).toBeDefined();
  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-route-unrelated-"));
  await command!.handler("status", { cwd, waitForIdle: async () => {} });
  expect(toolCallHandler).toBeDefined();
  const afterResult = toolCallHandler!({ toolName: "web_search", input: {} }, { cwd });
  expect(afterResult).toBeUndefined();
});
test("status refresh caches result for unchanged artifacts", async () => {
  const commands = await import("../src/core/commands");
  const spy = spyOn(commands, "runSpecwrightCommand");
  spy.mockImplementation(async (_ctx, args) => {
    if (args.includes("--json") && args.includes("status")) {
      return { ok: true, summary: JSON.stringify({ currentChange: "0001", currentStatus: "executing", tasks: { total: 1, done: 1 } }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    if (args.includes("--json") && args.includes("verify")) {
      return { ok: true, summary: JSON.stringify({ ok: true, issues: [] }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    return { ok: true, summary: "test", statusText: "Specwright · 0001 · executing · tasks=1/1", filesCreated: [], filesUpdated: [], exitCode: 0 as const };
  });

  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-cache-hit-"));
  const changeDirPath = join(cwd, ".specwright/changes/0001-test");
  await mkdir(changeDirPath, { recursive: true });
  await writeFile(join(changeDirPath, "tasks.md"), "# Tasks\n\n- [x] T001: Test\n", "utf8");
  await writeFile(join(cwd, ".specwright/state.json"), JSON.stringify({
    version: 1,
    currentChange: "0001",
    changes: {
      "0001": {
        id: "0001",
        slug: "test",
        title: "Test",
        kind: "feature",
        pack: "core",
        mode: "lite",
        status: "executing",
        step: "execute",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        tasks: {
          T001: { id: "T001", title: "Test", status: "done", updatedAt: "2026-01-01T00:00:00.000Z" },
        },
      },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  }), "utf8");

  try {
    await refreshStatus({}, { cwd, ui: { setStatus() {} } });
    await refreshStatus({}, { cwd, ui: { setStatus() {} } });
    expect(spy.mock.calls.length).toBe(2);
  } finally {
    spy.mockRestore();
  }
});
test("status refresh reruns after canonical artifact mtime changes", async () => {
  const commands = await import("../src/core/commands");
  const spy = spyOn(commands, "runSpecwrightCommand");
  spy.mockImplementation(async (_ctx, args) => {
    if (args.includes("--json") && args.includes("status")) {
      return { ok: true, summary: JSON.stringify({ currentChange: "0001", currentStatus: "executing", tasks: { total: 1, done: 1 } }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    if (args.includes("--json") && args.includes("verify")) {
      return { ok: true, summary: JSON.stringify({ ok: true, issues: [] }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    return { ok: true, summary: "test", statusText: "Specwright · 0001 · executing · tasks=1/1", filesCreated: [], filesUpdated: [], exitCode: 0 as const };
  });

  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-cache-miss-"));
  const changeDirPath = join(cwd, ".specwright/changes/0001-test");
  await mkdir(changeDirPath, { recursive: true });
  await writeFile(join(changeDirPath, "tasks.md"), "# Tasks\n\n- [x] T001: Test\n", "utf8");
  await writeFile(join(changeDirPath, "plan.md"), "# Plan\n", "utf8");
  await writeFile(join(cwd, ".specwright/state.json"), JSON.stringify({
    version: 1,
    currentChange: "0001",
    changes: {
      "0001": {
        id: "0001",
        slug: "test",
        title: "Test",
        kind: "feature",
        pack: "core",
        mode: "lite",
        status: "executing",
        step: "execute",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        tasks: {
          T001: { id: "T001", title: "Test", status: "done", updatedAt: "2026-01-01T00:00:00.000Z" },
        },
      },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  }), "utf8");

  try {
    await refreshStatus({}, { cwd, ui: { setStatus() {} } });
    await writeFile(join(changeDirPath, "plan.md"), "# Plan\n\nUpdated.\n", "utf8");
    await refreshStatus({}, { cwd, ui: { setStatus() {} } });
    expect(spy.mock.calls.length).toBe(4);
  } finally {
    spy.mockRestore();
  }
});

test("status refresh does not run validation when no change is active", async () => {
  const commands = await import("../src/core/commands");
  const spy = spyOn(commands, "runSpecwrightCommand");
  spy.mockImplementation(async () => ({ ok: true, summary: "test", statusText: "test", filesCreated: [], filesUpdated: [], exitCode: 0 as const }));

  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-no-change-"));
  await mkdir(join(cwd, ".specwright"), { recursive: true });
  await writeFile(join(cwd, ".specwright/state.json"), JSON.stringify({
    version: 1,
    currentChange: null,
    changes: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
  }), "utf8");

  try {
    await refreshStatus({}, { cwd, ui: { setStatus() {} } });
    expect(spy.mock.calls.length).toBe(0);
  } finally {
    spy.mockRestore();
  }
});
test("OMP status surfaces blocked with first error code", async () => {
  const commands = await import("../src/core/commands");
  const spy = spyOn(commands, "runSpecwrightCommand");
  spy.mockImplementation(async (_ctx, args) => {
    if (args.includes("--json") && args.includes("status")) {
      return { ok: true, summary: JSON.stringify({ currentChange: "0001", currentStatus: "executing", tasks: { total: 1, done: 0 } }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    if (args.includes("--json") && args.includes("verify")) {
      return { ok: false, summary: JSON.stringify({ ok: false, issues: [{ level: "error", code: "SW001", message: "missing intent" }] }), filesCreated: [], filesUpdated: [], exitCode: 1 as const };
    }
    return { ok: true, summary: "test", statusText: "Specwright · 0001 · executing · tasks=0/1", filesCreated: [], filesUpdated: [], exitCode: 0 as const };
  });

  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-blocked-"));
  const changeDirPath = join(cwd, ".specwright/changes/0001-test");
  await mkdir(changeDirPath, { recursive: true });
  await writeFile(join(changeDirPath, "tasks.md"), "# Tasks\n\n- [ ] T001: Test\n", "utf8");
  await writeFile(join(cwd, ".specwright/state.json"), JSON.stringify({
    version: 1,
    currentChange: "0001",
    changes: {
      "0001": {
        id: "0001",
        slug: "test",
        title: "Test",
        kind: "feature",
        pack: "core",
        mode: "lite",
        status: "executing",
        step: "execute",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        tasks: {
          T001: { id: "T001", title: "Test", status: "pending", updatedAt: "2026-01-01T00:00:00.000Z" },
        },
      },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  }), "utf8");

  const statuses: Array<string | undefined> = [];
  const notifications: Array<{ message: string; type?: string | undefined }> = [];
  try {
    await refreshStatus({}, {
      cwd,
      ui: {
        setStatus(_key, text) { statuses.push(text); },
        notify(message, type) { notifications.push({ message, type }); },
      },
    });
    expect(statuses.at(-1)).toBe("Specwright · 0001 · blocked · SW001");
    expect(notifications.length).toBe(1);
    expect(notifications[0]).toBeDefined();
    expect(notifications[0]!.message).toBe("Specwright: 0001 is blocked (SW001)");
    expect(notifications[0]!.type).toBe("warning");
  } finally {
    spy.mockRestore();
  }
});

test("OMP status surfaces drift for SW009 task drift", async () => {
  const commands = await import("../src/core/commands");
  const spy = spyOn(commands, "runSpecwrightCommand");
  spy.mockImplementation(async (_ctx, args) => {
    if (args.includes("--json") && args.includes("status")) {
      return { ok: true, summary: JSON.stringify({ currentChange: "0001", currentStatus: "executing", tasks: { total: 1, done: 1 } }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    if (args.includes("--json") && args.includes("verify")) {
      return { ok: false, summary: JSON.stringify({ ok: false, issues: [{ level: "error", code: "SW009", message: "Unreconciled task drift: title changed" }] }), filesCreated: [], filesUpdated: [], exitCode: 1 as const };
    }
    return { ok: true, summary: "test", statusText: "Specwright · 0001 · executing · tasks=1/1", filesCreated: [], filesUpdated: [], exitCode: 0 as const };
  });

  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-drift-"));
  const changeDirPath = join(cwd, ".specwright/changes/0001-test");
  await mkdir(changeDirPath, { recursive: true });
  await writeFile(join(changeDirPath, "tasks.md"), "# Tasks\n\n- [x] T001: Test\n", "utf8");
  await writeFile(join(cwd, ".specwright/state.json"), JSON.stringify({
    version: 1,
    currentChange: "0001",
    changes: {
      "0001": {
        id: "0001",
        slug: "test",
        title: "Test",
        kind: "feature",
        pack: "core",
        mode: "lite",
        status: "executing",
        step: "execute",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        tasks: {
          T001: { id: "T001", title: "Test", status: "done", updatedAt: "2026-01-01T00:00:00.000Z" },
        },
      },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  }), "utf8");

  const statuses: Array<string | undefined> = [];
  const notifications: Array<{ message: string; type?: string | undefined }> = [];
  try {
    await refreshStatus({}, {
      cwd,
      ui: {
        setStatus(_key, text) { statuses.push(text); },
        notify(message, type) { notifications.push({ message, type }); },
      },
    });
    expect(statuses.at(-1)).toBe("Specwright · 0001 · drift · tasks=1/1");
    expect(notifications.length).toBe(1);
    expect(notifications[0]).toBeDefined();
    expect(notifications[0]!.message).toBe("Specwright: 0001 has task drift");
    expect(notifications[0]!.type).toBe("warning");
  } finally {
    spy.mockRestore();
  }
});

test("OMP status surfaces checkpoint-needed when all tasks done but change not done", async () => {
  const commands = await import("../src/core/commands");
  const spy = spyOn(commands, "runSpecwrightCommand");
  spy.mockImplementation(async (_ctx, args) => {
    if (args.includes("--json") && args.includes("status")) {
      return { ok: true, summary: JSON.stringify({ currentChange: "0001", currentStatus: "verifying", tasks: { total: 2, done: 2 } }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    if (args.includes("--json") && args.includes("verify")) {
      return { ok: true, summary: JSON.stringify({ ok: true, issues: [] }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    return { ok: true, summary: "test", statusText: "Specwright · 0001 · verifying · tasks=2/2", filesCreated: [], filesUpdated: [], exitCode: 0 as const };
  });

  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-checkpoint-"));
  const changeDirPath = join(cwd, ".specwright/changes/0001-test");
  await mkdir(changeDirPath, { recursive: true });
  await writeFile(join(changeDirPath, "tasks.md"), "# Tasks\n\n- [x] T001: Test\n- [x] T002: Test 2\n", "utf8");
  await writeFile(join(cwd, ".specwright/state.json"), JSON.stringify({
    version: 1,
    currentChange: "0001",
    changes: {
      "0001": {
        id: "0001",
        slug: "test",
        title: "Test",
        kind: "feature",
        pack: "core",
        mode: "lite",
        status: "verifying",
        step: "verify",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        tasks: {
          T001: { id: "T001", title: "Test", status: "done", updatedAt: "2026-01-01T00:00:00.000Z" },
          T002: { id: "T002", title: "Test 2", status: "done", updatedAt: "2026-01-01T00:00:00.000Z" },
        },
      },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  }), "utf8");

  const statuses: Array<string | undefined> = [];
  const notifications: Array<{ message: string; type?: string | undefined }> = [];
  try {
    await refreshStatus({}, {
      cwd,
      ui: {
        setStatus(_key, text) { statuses.push(text); },
        notify(message, type) { notifications.push({ message, type }); },
      },
    });
    expect(statuses.at(-1)).toBe("Specwright · 0001 · checkpoint-needed · tasks=2/2");
    expect(notifications.length).toBe(1);
    expect(notifications[0]).toBeDefined();
    expect(notifications[0]!.message).toBe("Specwright: 0001 needs checkpoint");
    expect(notifications[0]!.type).toBe("warning");
  } finally {
    spy.mockRestore();
  }
});

test("OMP status warning notifications are sent only on transitions", async () => {
  const commands = await import("../src/core/commands");
  const spy = spyOn(commands, "runSpecwrightCommand");
  let callIndex = 0;
  spy.mockImplementation(async (_ctx, args) => {
    callIndex += 1;
    if (args.includes("--json") && args.includes("status")) {
      return { ok: true, summary: JSON.stringify({ currentChange: "0001", currentStatus: "executing", tasks: { total: 1, done: 0 } }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    if (args.includes("--json") && args.includes("verify")) {
      // First two calls have errors, third call passes
      if (callIndex <= 4) {
        return { ok: false, summary: JSON.stringify({ ok: false, issues: [{ level: "error", code: "SW001", message: "missing intent" }] }), filesCreated: [], filesUpdated: [], exitCode: 1 as const };
      }
      return { ok: true, summary: JSON.stringify({ ok: true, issues: [] }), filesCreated: [], filesUpdated: [], exitCode: 0 as const };
    }
    return { ok: true, summary: "test", statusText: "Specwright · 0001 · executing · tasks=0/1", filesCreated: [], filesUpdated: [], exitCode: 0 as const };
  });

  const cwd = await mkdtemp(join(tmpdir(), "specwright-omp-transition-"));
  const changeDirPath = join(cwd, ".specwright/changes/0001-test");
  await mkdir(changeDirPath, { recursive: true });
  await writeFile(join(changeDirPath, "tasks.md"), "# Tasks\n\n- [ ] T001: Test\n", "utf8");
  await writeFile(join(cwd, ".specwright/state.json"), JSON.stringify({
    version: 1,
    currentChange: "0001",
    changes: {
      "0001": {
        id: "0001",
        slug: "test",
        title: "Test",
        kind: "feature",
        pack: "core",
        mode: "lite",
        status: "executing",
        step: "execute",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        tasks: {
          T001: { id: "T001", title: "Test", status: "pending", updatedAt: "2026-01-01T00:00:00.000Z" },
        },
      },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  }), "utf8");

  const notifications: Array<{ message: string; type?: string | undefined }> = [];
  const ctx = {
    cwd,
    ui: {
      setStatus() {},
      notify(message: string, type?: string) { notifications.push({ message, type }); },
    },
  };
  try {
    // First refresh: transitions to blocked → notify
    await refreshStatus({}, ctx);
    expect(notifications.length).toBe(1);

    // Second refresh: same blocked status → no new notify
    await refreshStatus({}, ctx);
    expect(notifications.length).toBe(1);

    // Simulate a cache-busting change so verify re-runs and now passes
    await writeFile(join(changeDirPath, "tasks.md"), "# Tasks\n\n- [ ] T001: Test updated\n", "utf8");

    // Third refresh: transitions away from blocked → no notify (only warn on entry)
    await refreshStatus({}, ctx);
    expect(notifications.length).toBe(1);
  } finally {
    spy.mockRestore();
  }
});
