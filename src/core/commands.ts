import { access, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installOmpAdapter } from "../runtime/omp/install";
import { writeJsonFile } from "./json";
import {
  changeDir,
  changesDir,
  configPath,
  packsDir,
  projectDir,
  specwrightDir,
  statePath,
} from "./paths";
import { renderCheckpointClause, renderContextBudget, renderDiscussPrompt, renderSubagentRetryClause } from "./prompts";
import { slugify, nextChangeId } from "./slug";
import {
  defaultConfig,
  defaultState,
  findCurrentChange,
  loadConfig,
  loadState,
  saveConfig,
  saveState,
  syncChangeTasksFromFileIfPresent,
  syncChangeTasksFromMarkdown,
  updateCachedChange,
  upsertChange,
} from "./state";
import { branchNameForChange, commitStaged, createPullRequest, currentBranch, isGitWorktree, pushBranch, resolveBaseBranch, stageFiles, switchToBranch, writePullRequestBodyFile } from "./git";
import { renderValidationReport, validateChange, validateSpecwrightConfig } from "./validators";
import type {
  ChangeKind,
  ChangeState,
  CommandContext,
  CommandResult,
  OnlineResearchMode,
  SpecwrightConfig,
  SpecwrightMode,
  WorkflowPublishMode,
  TaskState,
} from "./types";

interface ParsedArgs {
  command?: string;
  positionals: string[];
  json: boolean;
  force: boolean;
  printPrompt: boolean;
  mode?: SpecwrightMode;
  publishMode?: WorkflowPublishMode;
  pack?: string;
  online?: OnlineResearchMode;
  task?: string;
  phase?: string;
  files?: string[];
  unknown?: string;
}

const CHANGE_KINDS = new Set<ChangeKind>(["feature", "bugfix", "refactor", "research"]);
const MODES = new Set<SpecwrightMode>(["lite", "full"]);
const ONLINE_MODES = new Set<OnlineResearchMode>(["never", "ask", "auto", "require"]);
const PUBLISH_MODES = new Set<WorkflowPublishMode>(["none", "push", "pr"]);
const CHECKPOINT_PHASES = new Set(["discuss", "research", "plan", "tasks", "verify", "handoff"]);
const TEMPLATE_FILES = [
  "change.md",
  "discussion.md",
  "intent.md",
  "decisions.md",
  "constraints.md",
  "research.md",
  "sources.md",
  "evidence.md",
  "options.md",
  "plan.md",
  "tasks.md",
  "verify.md",
  "handoff.md",
] as const;

function ok(summary: string, updates: Partial<CommandResult> = {}): CommandResult {
  return {
    ok: true,
    summary,
    filesCreated: updates.filesCreated ?? [],
    filesUpdated: updates.filesUpdated ?? [],
    exitCode: 0,
    ...(updates.prompt ? { prompt: updates.prompt } : {}),
    ...(updates.statusText ? { statusText: updates.statusText } : {}),
  };
}

function fail(summary: string, updates: Partial<CommandResult> = {}): CommandResult {
  return {
    ok: false,
    summary,
    filesCreated: updates.filesCreated ?? [],
    filesUpdated: updates.filesUpdated ?? [],
    exitCode: 1,
    ...(updates.prompt ? { prompt: updates.prompt } : {}),
    ...(updates.statusText ? { statusText: updates.statusText } : {}),
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { positionals: [], json: false, force: false, printPrompt: false };
  const [command, ...rest] = argv;
  if (command !== undefined) {
    parsed.command = command;
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--force") {
      parsed.force = true;
    } else if (arg === "--print-prompt") {
      parsed.printPrompt = true;
    } else if (arg === "--mode") {
      const value = rest[++index];
      if (parsed.command === "publish") {
        if (value === undefined || value.startsWith("--") || !PUBLISH_MODES.has(value as WorkflowPublishMode)) {
          parsed.unknown = arg;
        } else {
          parsed.publishMode = value as WorkflowPublishMode;
        }
      } else if (value === undefined || value.startsWith("--") || !MODES.has(value as SpecwrightMode)) {
        parsed.unknown = arg;
      } else {
        parsed.mode = value as SpecwrightMode;
      }
    } else if (arg === "--pack") {
      const value = rest[++index];
      if (value === undefined || value.startsWith("--")) {
        parsed.unknown = arg;
      } else {
        parsed.pack = value;
      }
    } else if (arg === "--online") {
      const value = rest[++index];
      if (value === undefined || value.startsWith("--") || !ONLINE_MODES.has(value as OnlineResearchMode)) {
        parsed.unknown = arg;
      } else {
        parsed.online = value as OnlineResearchMode;
      }
    } else if (arg === "--task") {
      const value = rest[++index];
      if (value === undefined || value.startsWith("--")) {
        parsed.unknown = arg;
      } else {
        parsed.task = value;
      }
    } else if (arg === "--phase") {
      const value = rest[++index];
      if (value === undefined || value.startsWith("--")) {
        parsed.unknown = arg;
      } else {
        parsed.phase = value;
      }
    } else if (arg === "--files") {
      const value = rest[++index];
      if (value === undefined || value.startsWith("--")) {
        parsed.unknown = arg;
      } else {
        parsed.files = value.split(",").map((file) => file.trim()).filter((file) => file.length > 0);
      }
    } else if (arg?.startsWith("--")) {
      parsed.unknown = arg;
    } else if (arg) {
      parsed.positionals.push(arg);
    }
  }

  return parsed;
}

type ConfigValue = string | number | boolean | string[];

interface ConfigKeyDescriptor {
  get: (config: SpecwrightConfig) => ConfigValue;
  set: (config: SpecwrightConfig, value: ConfigValue) => SpecwrightConfig;
  parse: (raw: string) => ConfigValue;
  format: (value: ConfigValue) => string;
}

function formatConfigValue(value: ConfigValue): string {
  return Array.isArray(value) ? JSON.stringify(value) : String(value);
}

function parseStringValue(raw: string): string {
  return raw;
}

function parseEnumValue<T extends string>(raw: string, allowed: ReadonlySet<T>, label: string): T {
  if (!allowed.has(raw as T)) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }
  return raw as T;
}

function parsePositiveIntegerValue(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid positive integer: ${raw}`);
  }
  return value;
}

function parseBooleanValue(raw: string): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Invalid boolean: ${raw}`);
}

function parseStringArrayValue(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Invalid JSON array: ${raw}`);
  }
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error("Expected JSON array of strings");
  }
  return parsed;
}

const CONFIG_KEY_DESCRIPTORS = {
  "project.name": {
    get: (config) => config.project.name,
    set: (config, value) => ({ ...config, project: { ...config.project, name: value as string } }),
    parse: parseStringValue,
    format: formatConfigValue,
  },
  "defaults.mode": {
    get: (config) => config.defaults.mode,
    set: (config, value) => ({ ...config, defaults: { ...config.defaults, mode: value as SpecwrightMode } }),
    parse: (raw) => parseEnumValue(raw, MODES, "mode"),
    format: formatConfigValue,
  },
  "defaults.pack": {
    get: (config) => config.defaults.pack,
    set: (config, value) => ({ ...config, defaults: { ...config.defaults, pack: value as string } }),
    parse: parseStringValue,
    format: formatConfigValue,
  },
  "defaults.onlineResearch": {
    get: (config) => config.defaults.onlineResearch,
    set: (config, value) => ({ ...config, defaults: { ...config.defaults, onlineResearch: value as OnlineResearchMode } }),
    parse: (raw) => parseEnumValue(raw, ONLINE_MODES, "online research mode"),
    format: formatConfigValue,
  },
  "defaults.maxContextFiles": {
    get: (config) => config.defaults.maxContextFiles,
    set: (config, value) => ({ ...config, defaults: { ...config.defaults, maxContextFiles: value as number } }),
    parse: parsePositiveIntegerValue,
    format: formatConfigValue,
  },
  "defaults.maxOutputWords": {
    get: (config) => config.defaults.maxOutputWords,
    set: (config, value) => ({ ...config, defaults: { ...config.defaults, maxOutputWords: value as number } }),
    parse: parsePositiveIntegerValue,
    format: formatConfigValue,
  },
  "agents.researcher.model": {
    get: (config) => config.agents.researcher.model,
    set: (config, value) => ({ ...config, agents: { ...config.agents, researcher: { ...config.agents.researcher, model: value as string } } }),
    parse: parseStringValue,
    format: formatConfigValue,
  },
  "agents.planner.model": {
    get: (config) => config.agents.planner.model,
    set: (config, value) => ({ ...config, agents: { ...config.agents, planner: { ...config.agents.planner, model: value as string } } }),
    parse: parseStringValue,
    format: formatConfigValue,
  },
  "agents.executor.model": {
    get: (config) => config.agents.executor.model,
    set: (config, value) => ({ ...config, agents: { ...config.agents, executor: { ...config.agents.executor, model: value as string } } }),
    parse: parseStringValue,
    format: formatConfigValue,
  },
  "agents.verifier.model": {
    get: (config) => config.agents.verifier.model,
    set: (config, value) => ({ ...config, agents: { ...config.agents, verifier: { ...config.agents.verifier, model: value as string } } }),
    parse: parseStringValue,
    format: formatConfigValue,
  },
  "packs.roots": {
    get: (config) => config.packs.roots,
    set: (config, value) => ({ ...config, packs: { ...config.packs, roots: value as string[] } }),
    parse: parseStringArrayValue,
    format: formatConfigValue,
  },
  "packs.enabled": {
    get: (config) => config.packs.enabled,
    set: (config, value) => ({ ...config, packs: { ...config.packs, enabled: value as string[] } }),
    parse: parseStringArrayValue,
    format: formatConfigValue,
  },
  "runtimes.omp.enabled": {
    get: (config) => config.runtimes.omp.enabled,
    set: (config, value) => ({ ...config, runtimes: { ...config.runtimes, omp: { ...config.runtimes.omp, enabled: value as boolean } } }),
    parse: parseBooleanValue,
    format: formatConfigValue,
  },
  "workflow.autoCommit": {
    get: (config) => config.workflow.autoCommit,
    set: (config, value) => ({ ...config, workflow: { ...config.workflow, autoCommit: value as boolean } }),
    parse: parseBooleanValue,
    format: formatConfigValue,
  },
  "workflow.publishMode": {
    get: (config) => config.workflow.publishMode,
    set: (config, value) => ({ ...config, workflow: { ...config.workflow, publishMode: value as WorkflowPublishMode } }),
    parse: (raw) => parseEnumValue(raw, PUBLISH_MODES, "publish mode"),
    format: formatConfigValue,
  },
  "workflow.baseBranch": {
    get: (config) => config.workflow.baseBranch ?? "",
    set: (config, value) => {
      const baseBranch = value as string;
      if (baseBranch === "") {
        const { baseBranch: _baseBranch, ...workflow } = config.workflow;
        return { ...config, workflow };
      }
      return { ...config, workflow: { ...config.workflow, baseBranch } };
    },
    parse: parseStringValue,
    format: formatConfigValue,
  },
  "workflow.remote": {
    get: (config) => config.workflow.remote,
    set: (config, value) => ({ ...config, workflow: { ...config.workflow, remote: value as string } }),
    parse: parseStringValue,
    format: formatConfigValue,
  },
} satisfies Record<string, ConfigKeyDescriptor>;

function getConfigKeyDescriptor(key: string): ConfigKeyDescriptor | undefined {
  if (!Object.hasOwn(CONFIG_KEY_DESCRIPTORS, key)) {
    return undefined;
  }
  return CONFIG_KEY_DESCRIPTORS[key as keyof typeof CONFIG_KEY_DESCRIPTORS];
}


async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function writeIfMissing(path: string, content: string, force = false): Promise<"created" | "updated" | "preserved"> {
  if (!force && await exists(path)) {
    return "preserved";
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return force && await exists(path) ? "updated" : "created";
}

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

async function copyBuiltInCorePack(cwd: string, force: boolean): Promise<string[]> {
  const source = join(packageRoot(), "packs", "core");
  const target = join(packsDir(cwd), "core");
  const changed: string[] = [];
  for (const file of [
    "pack.json",
    "workflows/feature.json",
    ...TEMPLATE_FILES.map((name) => `templates/${name}`),
    "agents/researcher.md",
    "agents/planner.md",
    "agents/executor.md",
    "agents/verifier.md",
    "validators/core.json",
  ]) {
    const destination = join(target, file);
    if (force || !await exists(destination)) {
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(source, file), destination);
      changed.push(destination);
    }
  }
  return changed;
}

async function ensureProjectFiles(cwd: string): Promise<string[]> {
  const created: string[] = [];
  for (const name of ["charter.md", "principles.md", "glossary.md", "tech-stack.md", "architecture.md"]) {
    const path = join(projectDir(cwd), name);
    if (await writeIfMissing(path, `# ${name.replace(/\.md$/, "").replace(/-/g, " ")}\n\n`) === "created") {
      created.push(path);
    }
  }
  return created;
}

async function commandInit(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const created: string[] = [];
  const updated: string[] = [];
  for (const dir of [specwrightDir(ctx.cwd), projectDir(ctx.cwd), changesDir(ctx.cwd), packsDir(ctx.cwd), join(specwrightDir(ctx.cwd), "cache"), join(specwrightDir(ctx.cwd), "tmp")]) {
    await ensureDir(dir);
  }

  const configResult = await writeIfMissing(configPath(ctx.cwd), `${JSON.stringify(defaultConfig("Specwright"), null, 2)}\n`, args.force);
  const stateResult = await writeIfMissing(statePath(ctx.cwd), `${JSON.stringify(defaultState(ctx.now()), null, 2)}\n`, args.force);
  for (const [path, result] of [[configPath(ctx.cwd), configResult], [statePath(ctx.cwd), stateResult]] as const) {
    if (result === "created") created.push(path);
    if (result === "updated") updated.push(path);
  }

  updated.push(...await copyBuiltInCorePack(ctx.cwd, args.force));
  created.push(...await ensureProjectFiles(ctx.cwd));
  updated.push(...await installOmpAdapter({ cwd: ctx.cwd, force: args.force }));
  return ok("Initialized Specwright in .specwright and installed OMP adapter in .omp.", { filesCreated: created, filesUpdated: updated });
}

async function commandStatus(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const config = await loadConfig(ctx.cwd);
  const state = await loadState(ctx.cwd);
  const currentChange = state.currentChange ?? null;
  let current = currentChange ? state.changes[currentChange] : undefined;
  if (current) {
    current = await syncChangeTasksForCommand(ctx, current);
  }
  const currentStatus = current?.status ?? null;
  const progress = taskProgress(current);
  if (args.json) {
    return ok(JSON.stringify({
      project: config.project.name,
      currentChange,
      changeCount: Object.keys(state.changes).length,
      currentStatus,
      tasks: progress,
    }, null, 2));
  }
  const taskSuffix = progress.total > 0 ? ` · tasks=${progress.done}/${progress.total}` : "";
  return ok(`Specwright · ${config.project.name} · current=${currentChange ?? "none"} · changes=${Object.keys(state.changes).length}${taskSuffix}`, {
    statusText: `Specwright · ${currentChange ?? "none"} · ${currentStatus ?? "idle"}${taskSuffix}`,
  });
}

async function commandScan(ctx: CommandContext): Promise<CommandResult> {
  await ensureDir(projectDir(ctx.cwd));
  const scanPath = join(projectDir(ctx.cwd), "scan.md");
  await writeIfMissing(scanPath, "# Project Scan\n\n## Files inspected\n\n## Patterns found\n\n## Constraints\n\n## Open questions\n");
  const config = await loadConfig(ctx.cwd);
  const prompt = `# Specwright Scan\n\n${renderContextBudget(config)}\n\nInspect the repository using find, search/OMP grep, read, and lsp when available. Update only these files:\n- .specwright/project/scan.md\n- .specwright/project/tech-stack.md\n- .specwright/project/architecture.md\n\nDo not load full packs or unrelated docs.\n\n${renderSubagentRetryClause()}`;
  return ok("Prepared project scan prompt.", { prompt, filesCreated: [scanPath] });
}

function templateValues(change: ChangeState): Record<string, string> {
  return {
    id: change.id,
    title: change.title,
    kind: change.kind,
    mode: change.mode,
    pack: change.pack,
    createdAt: change.createdAt,
  };
}

async function existingChangeIds(cwd: string, stateIds: string[]): Promise<string[]> {
  const ids = [...stateIds];
  try {
    for (const entry of await readdir(changesDir(cwd), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const id = entry.name.slice(0, 4);
        if (/^\d{4}$/.test(id)) ids.push(id);
      }
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  return ids;
}

async function commandNew(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const [kindArg, title] = args.positionals;
  if (!CHANGE_KINDS.has(kindArg as ChangeKind)) {
    return fail("Change kind must be one of feature, bugfix, refactor, research.");
  }
  if (!title) {
    return fail("Usage: specwright new <kind> \"<title>\"");
  }
  if (args.mode && !MODES.has(args.mode)) {
    return fail(`Invalid mode: ${args.mode}`);
  }

  const config = await loadConfig(ctx.cwd);
  const state = await loadState(ctx.cwd);
  const id = nextChangeId(await existingChangeIds(ctx.cwd, Object.keys(state.changes)));
  const slug = slugify(title);
  const now = ctx.now().toISOString();
  const change: ChangeState = {
    id,
    slug,
    title,
    kind: kindArg as ChangeKind,
    pack: args.pack ?? config.defaults.pack,
    mode: args.mode ?? config.defaults.mode,
    status: "discussing",
    step: "discuss",
    createdAt: now,
    updatedAt: now,
    tasks: {},
  };

  const inGitWorktree = await isGitWorktree(ctx.cwd);
  const branch = branchNameForChange(change);
  if (inGitWorktree) {
    await switchToBranch(ctx.cwd, branch);
  }

  const dir = changeDir(ctx.cwd, id, slug);
  await ensureDir(dir);

  const replacements = templateValues(change);
  const created: string[] = [];
  for (const file of TEMPLATE_FILES) {
    let content = await readFile(join(packageRoot(), "packs", "core", "templates", file), "utf8");
    for (const [key, value] of Object.entries(replacements)) {
      content = content.replaceAll(`{{${key}}}`, value);
    }
    const path = join(dir, file);
    await writeFile(path, content, "utf8");
    created.push(path);
  }

  state.changes[id] = change;
  state.currentChange = id;
  state.updatedAt = now;
  await saveState(ctx.cwd, state);

  const updated = [statePath(ctx.cwd)];
  if (inGitWorktree && config.workflow.autoCommit) {
    await stageFiles(ctx.cwd, [...created, statePath(ctx.cwd)]);
    await commitStaged(ctx.cwd, `specwright: start ${id}-${slug}`);
  }

  const summary = `Created change ${id}-${slug} and set it current.`;
  const resultUpdates = { filesCreated: created, filesUpdated: updated };
  return args.json ? ok(JSON.stringify({ id, slug, path: dir }, null, 2), resultUpdates) : ok(summary, resultUpdates);
}

async function ensureChangeArtifacts(cwd: string, change: ChangeState, files: string[]): Promise<string[]> {
  const created: string[] = [];
  for (const file of files) {
    const path = join(changeDir(cwd, change.id, change.slug), file);
    if (!await exists(path)) {
      const templatePath = join(packageRoot(), "packs", "core", "templates", TEMPLATE_FILES.includes(file as typeof TEMPLATE_FILES[number]) ? file : "change.md");
      const fallback = `# ${file.replace(/\.md$/, "")}\n\n<!-- Specwright artifact: preserve human-owned sections. -->\n\n`;
      const content = await exists(templatePath) ? await readFile(templatePath, "utf8") : fallback;
      await writeFile(path, content, "utf8");
      created.push(path);
    }
  }
  return created;
}

async function updateChangeStep(cwd: string, change: ChangeState, status: ChangeState["status"], step: ChangeState["step"], now: Date): Promise<ChangeState> {
  const updated: ChangeState = { ...change, status, step, updatedAt: now.toISOString() };
  await updateCachedChange(cwd, updated);
  return updated;
}

async function syncChangeTasksForCommand(ctx: CommandContext, change: ChangeState): Promise<ChangeState> {
  return (await syncChangeTasksFromFileIfPresent(ctx.cwd, change, ctx.now())).change;
}

function taskProgress(change: ChangeState | undefined): { total: number; done: number } {
  if (!change) {
    return { total: 0, done: 0 };
  }
  let done = 0;
  let total = 0;
  for (const task of Object.values(change.tasks)) {
    total += 1;
    if (task.status === "done") {
      done += 1;
    }
  }
  return { total, done };
}

async function commandDiscuss(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  let change = await findCurrentChange(ctx.cwd, args.positionals[0]);
  change = await syncChangeTasksForCommand(ctx, change);
  change = await updateChangeStep(ctx.cwd, change, "discussing", "discuss", ctx.now());
  const created = await ensureChangeArtifacts(ctx.cwd, change, ["discussion.md", "intent.md", "constraints.md", "decisions.md"]);
  const config = await loadConfig(ctx.cwd);
  const prompt = `${renderDiscussPrompt({ step: "discuss", change, config, cwd: ctx.cwd })}

${renderCheckpointClause({ change, unit: { kind: "phase", id: "discuss" }, files: artifactPaths(change, ["discussion.md", "intent.md", "constraints.md", "decisions.md"]) })}`;
  return ok("Prepared discuss prompt.", { filesCreated: created, prompt });
}
async function commandResearch(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const config = await loadConfig(ctx.cwd);
  const online = args.online ?? config.defaults.onlineResearch;
  let change = await findCurrentChange(ctx.cwd, args.positionals[0]);
  change = await syncChangeTasksForCommand(ctx, change);
  change = await updateChangeStep(ctx.cwd, change, "researching", "research", ctx.now());
  const created = await ensureChangeArtifacts(ctx.cwd, change, ["research.md", "sources.md", "evidence.md", "options.md"]);
  const prompt = `# Specwright Research: ${change.id}-${change.slug}

online=${online}

${renderContextBudget(config)}

Read first:
- .specwright/changes/${change.id}-${change.slug}/intent.md
- .specwright/changes/${change.id}-${change.slug}/constraints.md
- .specwright/changes/${change.id}-${change.slug}/research.md
- .specwright/changes/${change.id}-${change.slug}/sources.md
- .specwright/changes/${change.id}-${change.slug}/evidence.md
- .specwright/changes/${change.id}-${change.slug}/options.md

Research rules:
- Start with local repository evidence: find, OMP grep/search, read, and lsp when available.
- Write local file evidence to evidence.md.
- If online=never, do not use web_search or browser tools.
- If online=ask, list proposed external questions before searching.
- If online=auto, use web_search when APIs, dependencies, standards, errors, competitors, or recent behavior matter.
- If online=require, use web_search and cite at least two relevant URLs in sources.md before planning.
- Prefer official docs, source repositories, standards, and primary issue/PR discussions.
- Store source summaries and URLs, not full copied web pages.
- Produce at least two implementation options in options.md unless the change is mechanically constrained by existing code.

${renderSubagentRetryClause()}

${renderCheckpointClause({ change, unit: { kind: "phase", id: "research" }, files: artifactPaths(change, ["research.md", "sources.md", "evidence.md", "options.md"]) })}`;
  return ok("Prepared research prompt.", { filesCreated: created, prompt });
}

async function commandPlan(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  let change = await findCurrentChange(ctx.cwd, args.positionals[0]);
  change = await syncChangeTasksForCommand(ctx, change);
  for (const file of ["intent.md", "research.md", "evidence.md"]) {
    if (!await exists(join(changeDir(ctx.cwd, change.id, change.slug), file))) {
      return fail(`Required artifact missing: ${file}`);
    }
  }
  const updated = await updateChangeStep(ctx.cwd, change, "planning", "plan", ctx.now());
  const config = await loadConfig(ctx.cwd);
  const prompt = `# Specwright Plan: ${updated.id}-${updated.slug}

${renderContextBudget(config)}

Read first:
- .specwright/changes/${updated.id}-${updated.slug}/intent.md
- .specwright/changes/${updated.id}-${updated.slug}/constraints.md
- .specwright/changes/${updated.id}-${updated.slug}/research.md
- .specwright/changes/${updated.id}-${updated.slug}/evidence.md
- .specwright/changes/${updated.id}-${updated.slug}/plan.md
- .specwright/changes/${updated.id}-${updated.slug}/tasks.md

Produce a decision-complete plan.md and a CLI-parseable tasks.md.

tasks.md contract required by the Specwright CLI:
- Each task MUST start with exactly one unchecked checklist line in this format: - [ ] T001: Short imperative title
- Task IDs MUST be sequential T001, T002, etc.; use [ ] for pending tasks and reserve [x] only for verified done tasks.
- Do NOT use task headings such as ### T001, tables, bullets without checkboxes, or nested checklist lines as task starts.
- Under each task checklist line, include Files, Action, Acceptance, and Verification bullets.
- Tasks may be grouped under wave headings, but only checklist lines define executable tasks.

Plan requirements:
- The plan cites evidence from evidence.md.
- Every task includes files, action, acceptance, and verification.
- Tasks are grouped into dependency waves when independent work exists.
- No implementation starts during planning.

${renderCheckpointClause({ change: updated, unit: { kind: "phase", id: "plan" }, files: artifactPaths(updated, ["plan.md", "tasks.md"]) })}`;
  return ok("Prepared plan prompt.", { prompt });
}


function artifactPaths(change: ChangeState, files: readonly string[]): string[] {
  const dir = `.specwright/changes/${change.id}-${change.slug}`;
  return files.map((file) => `${dir}/${file}`);
}

function taskFilesFromMarkdown(markdown: string, taskId: string): string[] {
  let inTask = false;
  for (const line of markdown.split(/\r?\n/)) {
    const taskMatch = /^\s*- \[([ xX])] (T\d{3}):/.exec(line);
    if (taskMatch) {
      if (inTask) break;
      inTask = taskMatch[2] === taskId;
      continue;
    }
    if (!inTask) continue;

    const filesMatch = /^\s*-\s*Files:\s*(.+?)\s*$/.exec(line);
    if (!filesMatch) continue;
    const raw = filesMatch[1] ?? "";
    const backtickFiles = [...raw.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "").filter((file) => file.length > 0);
    if (backtickFiles.length > 0) return backtickFiles;
    return raw.split(",").map((file) => file.trim()).filter((file) => file.length > 0);
  }
  return [];
}

async function commandCheckpoint(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  let change = await findCurrentChange(ctx.cwd, args.positionals[0]);
  if (args.phase && args.task) {
    return fail("Specify exactly one of --phase or --task.");
  }
  if (!args.phase && !args.task) {
    return fail("Specify exactly one of --phase or --task.");
  }
  if (args.phase && !CHECKPOINT_PHASES.has(args.phase)) {
    return fail(`Invalid checkpoint phase: ${args.phase}`);
  }
  if (!args.files || args.files.length === 0) {
    return fail("At least one file must be supplied with --files.");
  }
  if (!await isGitWorktree(ctx.cwd)) {
    return fail("Checkpoint commits require a git worktree.");
  }

  for (const file of args.files) {
    if (!await exists(resolve(ctx.cwd, file))) {
      return fail(`Checkpoint file not found: ${file}`);
    }
  }

  const filesToStage = [...args.files];
  const stateFile = ".specwright/state.json";
  const hasTasksMd = filesToStage.some(f => f === "tasks.md" || f.endsWith("/tasks.md"));
  if (hasTasksMd && !filesToStage.includes(stateFile)) {
    filesToStage.push(stateFile);
  }
  if (args.task) {
    const tasksMarkdown = await readFile(join(changeDir(ctx.cwd, change.id, change.slug), "tasks.md"), "utf8");
    const syncResult = syncChangeTasksFromMarkdown(change, tasksMarkdown, ctx.now());
    change = syncResult.change;
    if (!change.tasks[args.task]) {
      return fail(`Task not found: ${args.task}`);
    }
    if (syncResult.issues.length > 0) {
      return fail(`Task sync issues: ${syncResult.issues.map(i => i.message).join("; ")}`);
    }
    if (syncResult.changed) {
      await updateCachedChange(ctx.cwd, change);
    }
  }

  const unit = args.task ?? args.phase ?? "";
  const message = `specwright: checkpoint ${change.id}-${change.slug} ${unit}`;
  await stageFiles(ctx.cwd, filesToStage);
  await commitStaged(ctx.cwd, message);
  return ok(`Created checkpoint commit for ${unit}.`);
}

async function commandTasks(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const change = await findCurrentChange(ctx.cwd, args.positionals[0]);
  if (!await exists(join(changeDir(ctx.cwd, change.id, change.slug), "plan.md"))) {
    return fail("Required artifact missing: plan.md");
  }
  const updated = await syncChangeTasksForCommand(ctx, change);
  const config = await loadConfig(ctx.cwd);
  const prompt = `# Specwright Tasks: ${updated.id}-${updated.slug}

${renderContextBudget(config)}

Read first:
- .specwright/changes/${updated.id}-${updated.slug}/plan.md
- .specwright/changes/${updated.id}-${updated.slug}/tasks.md

Rewrite only tasks.md from the current plan.md.

Required tasks.md format for the Specwright CLI:
- Each executable task MUST start with exactly one unchecked checklist line: - [ ] T001: Short imperative title
- Use sequential IDs T001, T002, etc.
- Do NOT write task IDs as headings such as ### T001; headings are allowed only for waves/groups.
- Under each task line, include Files, Action, Acceptance, and Verification bullets.
- Keep tasks small and directly executable.

${renderCheckpointClause({ change: updated, unit: { kind: "phase", id: "tasks" }, files: artifactPaths(updated, ["tasks.md"]) })}`;
  return ok(`Parsed ${Object.keys(updated.tasks).length} tasks.`, { prompt });
}

async function selectedTask(change: ChangeState, taskId: string | undefined): Promise<TaskState | undefined> {
  if (taskId) return change.tasks[taskId];
  return Object.values(change.tasks).find((task) => task.status === "pending");
}

async function commandExecute(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  let change = await findCurrentChange(ctx.cwd, args.positionals[0]);
  change = await syncChangeTasksForCommand(ctx, change);
  const task = await selectedTask(change, args.task);
  if (!task) {
    return fail(args.task ? `Task not found: ${args.task}` : "No pending Specwright task.");
  }
  const now = ctx.now().toISOString();
  const tasks = { ...change.tasks, [task.id]: { ...task, status: "in-progress" as const, updatedAt: now } };
  const updated: ChangeState = { ...change, tasks, status: "executing", step: "execute", updatedAt: now };
  await updateCachedChange(ctx.cwd, updated);
  const tasksMarkdown = await readFile(join(changeDir(ctx.cwd, updated.id, updated.slug), "tasks.md"), "utf8");
  const taskFiles = taskFilesFromMarkdown(tasksMarkdown, task.id);
  const prompt = `# Specwright Execute: ${updated.id} ${task.id}\n\nRead first:\n- .specwright/changes/${updated.id}-${updated.slug}/intent.md\n- .specwright/changes/${updated.id}-${updated.slug}/evidence.md\n- .specwright/changes/${updated.id}-${updated.slug}/tasks.md\n\nTask:\n- [ ] ${task.id}: ${task.title}\n\nRules:\n- Implement this task only.\n- Do not broaden scope.\n- Update tasks.md checkbox/status only after verification for this task passes.\n- If new facts invalidate the plan, stop and update decisions.md with the blocking fact.\n\n${renderCheckpointClause({ change: updated, unit: { kind: "task", id: task.id }, files: taskFiles })}`;
  return ok(`Prepared execute prompt for ${task.id}.`, { prompt });
}

async function commandVerify(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const change = await findCurrentChange(ctx.cwd, args.positionals[0]);
  // Compute sync result without persisting, so validation can detect drift
  const tasksPath = join(changeDir(ctx.cwd, change.id, change.slug), "tasks.md");
  let syncResult: ReturnType<typeof syncChangeTasksFromMarkdown> | undefined;
  try {
    const markdown = await readFile(tasksPath, "utf8");
    syncResult = syncChangeTasksFromMarkdown(change, markdown, ctx.now());
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      // no-op when tasks.md is missing
    } else {
      throw error;
    }
  }
  // Validate against ORIGINAL cached state (before sync)
  const report = await validateChange(ctx.cwd, change);
  // Surface sync issues as SW009 errors in the validation report
  if (syncResult && syncResult.issues.length > 0) {
    for (const issue of syncResult.issues) {
      report.issues.push({
        level: "error",
        code: "SW009",
        message: `Unreconciled task drift: ${issue.kind}: ${issue.message}`,
        file: "tasks.md",
      });
    }
    report.ok = false;
  }
  const verifyPath = join(changeDir(ctx.cwd, change.id, change.slug), "verify.md");
  await writeFile(verifyPath, renderValidationReport(report), "utf8");
  if (!report.ok) {
    const summary = args.json ? JSON.stringify(report, null, 2) : "Specwright validation failed.";
    return fail(summary, { filesUpdated: [verifyPath] });
  }
  // Only persist sync after validation passes
  if (syncResult && syncResult.changed && syncResult.issues.length === 0) {
    await updateCachedChange(ctx.cwd, syncResult.change);
  }
  const updated = await updateChangeStep(ctx.cwd, syncResult ? syncResult.change : change, "verifying", "verify", ctx.now());
  const config = await loadConfig(ctx.cwd);
  const prompt = `# Specwright Verify: ${updated.id}-${updated.slug}\n\n${renderContextBudget(config)}\n\nRead first:\n- .specwright/changes/${updated.id}-${updated.slug}/tasks.md\n- .specwright/changes/${updated.id}-${updated.slug}/verify.md\n\nRun the task-specific checks listed in tasks.md and update verify.md with observed command output.\n\n${renderCheckpointClause({ change: updated, unit: { kind: "phase", id: "verify" }, files: artifactPaths(updated, ["verify.md", "tasks.md"]) })}`;
  return ok(args.json ? JSON.stringify(report, null, 2) : "Specwright validators passed.", { filesUpdated: [verifyPath], prompt });
}

async function commandHandoff(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const change = await syncChangeTasksForCommand(ctx, await findCurrentChange(ctx.cwd, args.positionals[0]));
  const dir = changeDir(ctx.cwd, change.id, change.slug);
  const artifacts = await Promise.all(["intent.md", "evidence.md", "tasks.md", "verify.md"].map(async (file) => {
    try { return await readFile(join(dir, file), "utf8"); } catch { return ""; }
  }));
  const intent = artifacts[0] ?? "";
  const evidence = artifacts[1] ?? "";
  const tasks = artifacts[2] ?? "";
  const verify = artifacts[3] ?? "";
  const taskLines = tasks.split(/\r?\n/).filter((line) => args.task ? line.includes(args.task) : /^\s*- \[ ] T\d{3}:/.test(line)).join("\n");
  const handoff = `# Agent Handoff: ${change.id}\n\n## Goal\n\n${intent}\n\n## Read first\n\n- .specwright/changes/${change.id}-${change.slug}/intent.md\n- .specwright/changes/${change.id}-${change.slug}/evidence.md\n- .specwright/changes/${change.id}-${change.slug}/tasks.md\n- .specwright/changes/${change.id}-${change.slug}/verify.md\n\n## Current state\n\nstatus=${change.status}; step=${change.step}\n\n## Constraints\n\nSee intent.md and evidence.md.\n\n## Acceptance\n\n${verify}\n\n## Next task\n\n${taskLines || "No incomplete tasks."}\n\n## Evidence\n\n${evidence}\n`;
  const handoffPath = join(dir, "handoff.md");
  await writeFile(handoffPath, handoff, "utf8");
  const report = await validateChange(ctx.cwd, change);
  const allDone = Object.values(change.tasks).length > 0 && Object.values(change.tasks).every((task) => task.status === "done");
  const status = allDone && report.ok ? "done" : change.status;
  await updateCachedChange(ctx.cwd, { ...change, status, step: "handoff", updatedAt: ctx.now().toISOString() });
  return ok(`Generated handoff for ${change.id}.`, { filesUpdated: [handoffPath], prompt: handoff });
}

async function discoverPackManifests(cwd: string): Promise<string[]> {
  const config = await loadConfig(cwd);
  const manifests: string[] = [];
  for (const root of config.packs.roots) {
    const absoluteRoot = resolve(cwd, root);
    try {
      for (const entry of await readdir(absoluteRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && await exists(join(absoluteRoot, entry.name, "pack.json"))) {
          manifests.push(join(absoluteRoot, entry.name, "pack.json"));
        }
      }
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return manifests;
}

async function commandConfig(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const [action, key, value, ...extra] = args.positionals;
  if (action === "get") {
    if (key === undefined || value !== undefined) {
      return fail("Usage: specwright config get <key>");
    }
    const descriptor = getConfigKeyDescriptor(key);
    if (!descriptor) {
      return fail(`Unknown config key: ${key}`);
    }
    const config = await loadConfig(ctx.cwd);
    return ok(descriptor.format(descriptor.get(config)));
  }

  if (action === "set") {
    if (key === undefined || value === undefined || extra.length > 0) {
      return fail("Usage: specwright config set <key> <value>");
    }
    const descriptor = getConfigKeyDescriptor(key);
    if (!descriptor) {
      return fail(`Unknown config key: ${key}`);
    }

    let parsed: ConfigValue;
    try {
      parsed = descriptor.parse(value);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }

    const config = await loadConfig(ctx.cwd);
    const updated = descriptor.set(config, parsed);
    try {
      validateSpecwrightConfig(updated);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    await saveConfig(ctx.cwd, updated);
    return ok(`Set ${key}.`, { filesUpdated: [configPath(ctx.cwd)] });
  }

  return fail("Usage: specwright config get <key> | specwright config set <key> <value>");
}

async function commandPublish(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  if (args.positionals.length > 1) {
    return fail("Usage: specwright publish [<change>] [--mode none|push|pr]");
  }

  const config = await loadConfig(ctx.cwd);
  const mode = args.publishMode ?? config.workflow.publishMode;
  if (mode === "none") {
    return ok("Publish mode is none; no remote work performed.");
  }

  if (!await isGitWorktree(ctx.cwd)) {
    return fail("Publish requires a git worktree.");
  }

  const branch = await currentBranch(ctx.cwd);
  const remote = config.workflow.remote;
  await pushBranch(ctx.cwd, remote, branch);

  if (mode === "push") {
    return ok(`Pushed ${branch} to ${remote}.`);
  }

  const change = await findCurrentChange(ctx.cwd, args.positionals[0]);
  const baseBranch = await resolveBaseBranch(ctx.cwd, config);
  const bodyFile = await writePullRequestBodyFile(ctx.cwd, change);
  const title = `${change.id}-${change.slug}: ${change.title}`;
  await createPullRequest(ctx.cwd, title, bodyFile, baseBranch, branch);
  return ok(`Created pull request for ${branch} targeting ${baseBranch}.`, { filesCreated: [bodyFile] });
}

async function commandPack(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  const [action, value] = args.positionals;
  if (action === "list") {
    const manifests = await discoverPackManifests(ctx.cwd);
    return ok(manifests.length ? manifests.join("\n") : "No packs found.");
  }
  if (action === "validate") {
    if (!value) return fail("Usage: specwright pack validate <path>");
    const packPath = resolve(ctx.cwd, value);
    const manifest = JSON.parse(await readFile(join(packPath, "pack.json"), "utf8")) as { workflows?: string[]; artifacts?: string[]; agents?: string[]; validators?: string[] };
    const missing: string[] = [];
    for (const workflow of manifest.workflows ?? []) if (!await exists(join(packPath, "workflows", `${workflow}.json`))) missing.push(`workflows/${workflow}.json`);
    for (const artifact of manifest.artifacts ?? []) if (!await exists(join(packPath, "templates", artifact))) missing.push(`templates/${artifact}`);
    for (const agent of manifest.agents ?? []) if (!await exists(join(packPath, "agents", `${agent}.md`))) missing.push(`agents/${agent}.md`);
    for (const validator of manifest.validators ?? []) if (!await exists(join(packPath, "validators", `${validator}.json`))) missing.push(`validators/${validator}.json`);
    return missing.length ? fail(`Pack validation failed:\n${missing.join("\n")}`) : ok(`Pack valid: ${value}`);
  }
  if (action === "add") {
    if (!value) return fail("Usage: specwright pack add <id>");
    const source = join(packageRoot(), "packs", value);
    if (!await exists(source)) return fail(`Pack not found locally: ${value}`);
    await cp(source, join(packsDir(ctx.cwd), value), { recursive: true, force: false, errorOnExist: false });
    return ok(`Added pack ${value}.`);
  }
  return fail("Usage: specwright pack list|validate|add");
}

export async function runSpecwrightCommand(ctx: CommandContext, argv: string[]): Promise<CommandResult> {
  const args = parseArgs(argv);
  if (!args.command || args.command === "--help" || args.command === "help") {
    return ok(renderHelp());
  }
  if (args.unknown) {
    return fail(`Unknown option: ${args.unknown}`);
  }

  try {
    switch (args.command) {
      case "init": return await commandInit(ctx, args);
      case "status": return await commandStatus(ctx, args);
      case "scan": return await commandScan(ctx);
      case "new": return await commandNew(ctx, args);
      case "discuss": return await commandDiscuss(ctx, args);
      case "research": return await commandResearch(ctx, args);
      case "plan": return await commandPlan(ctx, args);
      case "tasks": return await commandTasks(ctx, args);
      case "execute": return await commandExecute(ctx, args);
      case "verify": return await commandVerify(ctx, args);
      case "checkpoint":
      case "commit": return await commandCheckpoint(ctx, args);
      case "handoff": return await commandHandoff(ctx, args);
      case "pack": return await commandPack(ctx, args);
      case "config": return await commandConfig(ctx, args);
      case "publish": return await commandPublish(ctx, args);
      default: return fail(`Unknown command: ${args.command}`);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

export function renderHelp(): string {
  return `Specwright\n\nUsage:\n  specwright init [--force] [--json]\n  specwright status [--json]\n  specwright scan [--print-prompt]\n  specwright new <kind> "<title>" [--mode lite|full] [--pack core] [--json]\n  specwright discuss [<change>] [--print-prompt]\n  specwright research [<change>] [--online never|ask|auto|require] [--print-prompt]\n  specwright plan [<change>] [--print-prompt]\n  specwright tasks [<change>] [--print-prompt]\n  specwright execute [<change>] [--task T###] [--print-prompt]\n  specwright checkpoint [<change>] (--phase discuss|research|plan|tasks|verify|handoff | --task T###) --files <file[,file...]>\n  specwright commit [<change>] (--phase discuss|research|plan|tasks|verify|handoff | --task T###) --files <file[,file...]>\n  specwright publish [<change>] [--mode none|push|pr]\n  specwright verify [<change>] [--json] [--print-prompt]\n  specwright handoff [<change>] [--task T###] [--print-prompt]\n  specwright pack list|validate|add\n  specwright config get <key>\n  specwright config set <key> <value>\n`;
}
