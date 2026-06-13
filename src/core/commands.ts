import { access, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adapterNeedsRegeneration, installOmpAdapter } from "../runtime/omp/install";
import { readJsonFile, writeJsonFile } from "./json";
import { buildCodebaseIndex, type CodebaseIndex } from "./codebase-index";
import {
  changeDir,
  changesDir,
  configPath,
  packsDir,
  projectDir,
  specwrightDir,
  statePath,
} from "./paths";
import { renderCheckpointClause, renderContextBudget, renderDiscussPrompt, renderLifecycleSpawnStrategy, renderScanPrompt, renderSubagentRetryClause } from "./prompts";
import { renderOmpDiscussPrompt, renderOmpLifecycleSpawnStrategy, renderOmpScanPrompt, renderOmpSubagentRetryClause } from "../runtime/omp/prompts";
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
import { branchNameForChange, commitStaged, createPullRequest, currentBranch, hasGitIdentity, isGitWorktree, isWorktreeClean, pushBranch, resolveBaseBranch, stageFiles, switchToBranch, switchToExistingBranch, mergeNoFastForward, writePullRequestBodyFile } from "./git";
import { renderValidationReport, validateChange, validateCodebaseIndex, validateSpecwrightConfig, hasNonHeadingContent, hasObservedOutput, isSafeRelativePath } from "./validators";
import type {
  ChangeKind,
  ChangeState,
  CommandContext,
  CommandResult,
  OnlineResearchMode,
  SpecwrightConfig,
  SpecwrightAgentName,
  SpecwrightMode,
  WorkflowPublishMode,
  WorkflowCompleteMode,
  TaskState,
} from "./types";

interface ParsedArgs {
  command?: string;
  positionals: string[];
  json: boolean;
  force: boolean;
  printPrompt: boolean;
  map: boolean;
  refresh: boolean;
  mode?: SpecwrightMode;
  publishMode?: WorkflowPublishMode;
  completeMode?: WorkflowCompleteMode;
  pack?: string;
  phase?: string;
  files?: string[];
  summary?: string;
  online?: OnlineResearchMode;
  task?: string;
  unknown?: string;
}

const CHANGE_KINDS = new Set<ChangeKind>(["feature", "bugfix", "refactor", "research"]);
const MODES = new Set<SpecwrightMode>(["lite", "full"]);
const ONLINE_MODES = new Set<OnlineResearchMode>(["never", "ask", "auto", "require"]);
const PUBLISH_MODES = new Set<WorkflowPublishMode>(["none", "push", "pr"]);
const COMPLETE_MODES = new Set<WorkflowCompleteMode>(["none", "push", "pr", "merge"]);
const CHECKPOINT_PHASES = new Set(["discuss", "research", "plan", "tasks", "verify", "handoff"]);
const REQUEST_FILE_GLOB_PATTERN = /[*?\[\]{}]/;
const MAX_REQUEST_FILE_BYTES = 64 * 1024;
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
  const parsed: ParsedArgs = { positionals: [], json: false, force: false, printPrompt: false, map: false, refresh: false };
  const [command, ...rest] = argv;
  if (command !== undefined) {
    parsed.command = command;
  }

  for (let index = 0; index < rest.length; index += 1) {
    let arg = rest[index];
    if (arg?.startsWith("--") && arg.includes("=")) {
      const equalIndex = arg.indexOf("=");
      const key = arg.slice(0, equalIndex);
      const value = arg.slice(equalIndex + 1);
      arg = key;
      rest.splice(index + 1, 0, value);
    }
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--force") {
      parsed.force = true;
    } else if (arg === "--print-prompt") {
      parsed.printPrompt = true;
    } else if (arg === "--map") {
      parsed.map = true;
    } else if (arg === "--refresh") {
      parsed.refresh = true;
    } else if (arg === "--mode") {
      const value = rest[++index];
      if (parsed.command === "publish") {
        if (value === undefined || value.startsWith("--") || !PUBLISH_MODES.has(value as WorkflowPublishMode)) {
          parsed.unknown = arg;
        } else {
          parsed.publishMode = value as WorkflowPublishMode;
        }
      } else if (parsed.command === "complete") {
        if (value === undefined || value.startsWith("--") || !COMPLETE_MODES.has(value as WorkflowCompleteMode)) {
          parsed.unknown = arg;
        } else {
          parsed.completeMode = value as WorkflowCompleteMode;
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
    } else if (arg === "--summary") {
      const value = rest[++index];
      if (value === undefined || value.startsWith("--")) {
        parsed.unknown = arg;
      } else {
        parsed.summary = value;
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

function agentNameForModelConfigKey(key: string): SpecwrightAgentName | undefined {
  switch (key) {
    case "agents.researcher.model": return "researcher";
    case "agents.planner.model": return "planner";
    case "agents.executor.model": return "executor";
    case "agents.verifier.model": return "verifier";
    default: return undefined;
  }
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
  const existed = await exists(path);
  if (!force && existed) {
    return "preserved";
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return existed ? "updated" : "created";
}
async function mapPointerSection(cwd: string): Promise<string> {
  const project = projectDir(cwd);
  const mapPath = join(project, "codebase-map.md");
  const indexPath = join(project, "codebase-index.json");
  const mapExists = await exists(mapPath);
  const indexExists = await exists(indexPath);
  if (!mapExists && !indexExists) return "";
  const lines = ["", "Optional project context:"];
  if (mapExists) lines.push("- .specwright/project/codebase-map.md");
  if (indexExists) lines.push("- .specwright/project/codebase-index.json");
  return lines.join("\n");
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
  const config = await loadConfig(ctx.cwd);
  const needsRegen = await adapterNeedsRegeneration(ctx.cwd);
  updated.push(...await installOmpAdapter({ cwd: ctx.cwd, force: args.force, regenerateAdapter: needsRegen, config }));
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

async function commandScan(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  await ensureDir(projectDir(ctx.cwd));
  const project = projectDir(ctx.cwd);
  const created: string[] = [];
  const updated: string[] = [];

  const scanArtifacts = [
    { path: join(project, "scan.md"), content: "# Project Scan\n\n## Files inspected\n\n## Patterns found\n\n## Constraints\n\n## Open questions\n" },
    { path: join(project, "tech-stack.md"), content: "# tech stack\n\n" },
    { path: join(project, "architecture.md"), content: "# architecture\n\n" },
  ];
  const mapArtifacts = [
    {
      path: join(project, "codebase-map.md"),
      content: `# Codebase Map\n\n## Entry points\n\n## Core modules\n\n## Runtime adapters\n\n## Data and state artifacts\n\n## Command surface\n\n## Test surface\n\n## Build and verification commands\n\n## Conventions\n\n## Known risks and gaps\n\n## Open questions\n`,
    },
  ];
  const artifactsToEnsure = args.map ? mapArtifacts : [...scanArtifacts, ...mapArtifacts];
  for (const { path, content } of artifactsToEnsure) {
    const result = await writeIfMissing(path, content, args.force);
    if (result === "created") {
      created.push(path);
    } else if (result === "updated") {
      updated.push(path);
    }
  }

  const indexPath = join(project, "codebase-index.json");
  const indexExists = await exists(indexPath);

  let existing: CodebaseIndex | undefined;
  let rebuiltFromValidationErrors = false;
  let validationReport = { ok: true, issues: [] as import("./validators").ValidationIssue[] };
  if (indexExists && !args.force) {
    const existingRead = await readJsonFile<CodebaseIndex>(indexPath);
    if (existingRead) {
      validationReport = await validateCodebaseIndex(ctx.cwd, existingRead);
      const hasHardErrors = validationReport.issues.some((issue) => issue.level === "error");
      if (hasHardErrors) {
        rebuiltFromValidationErrors = true;
      } else {
        existing = existingRead;
      }
    }
  }

  const buildOptions: import("./codebase-index").BuildCodebaseIndexOptions = { cwd: ctx.cwd, now: ctx.now() };
  if (existing) {
    buildOptions.existing = existing;
  }
  const buildResult = await buildCodebaseIndex(buildOptions);
  const generatedValidationReport = await validateCodebaseIndex(ctx.cwd, buildResult.index);
  if (!generatedValidationReport.ok) {
    const summary = "Generated codebase-index failed validation; refusing to write.";
    return fail(
      args.json ? JSON.stringify({ summary, validation: generatedValidationReport }, null, 2) : summary,
      { filesCreated: created, filesUpdated: updated },
    );
  }
  const validationIssues = [...validationReport.issues, ...generatedValidationReport.issues];

  if (args.force && !buildResult.changed) {
    buildResult.index.generatedAt = ctx.now().toISOString();
  }

  const shouldWriteIndex = args.force || !indexExists || buildResult.changed;
  if (shouldWriteIndex) {
    await writeJsonFile(indexPath, buildResult.index);
    if (indexExists) {
      updated.push(indexPath);
    } else {
      created.push(indexPath);
    }
  }

  const deterministicSummary = {
    indexUpdated: shouldWriteIndex,
    scannedFiles: buildResult.scannedFiles,
    indexedFiles: buildResult.indexedFiles,
    truncated: buildResult.truncated,
    staleFiles: buildResult.staleFiles,
    validationIssues,
    rebuiltFromValidationErrors,
  };

  const config = await loadConfig(ctx.cwd);
  const prompt = ctx.runtime === "omp"
    ? renderOmpScanPrompt({ config, map: args.map, refresh: args.refresh, deterministicSummary })
    : renderScanPrompt({ config, map: args.map, refresh: args.refresh, deterministicSummary });
  const humanSummary = "Prepared project scan prompt.";
  const scanSummary = args.json
    ? JSON.stringify({
        generatedValidation: generatedValidationReport,
        summary: humanSummary,
        map: args.map,
        refresh: args.refresh,
        indexUpdated: shouldWriteIndex,
        staleFiles: buildResult.staleFiles,
        scannedFiles: buildResult.scannedFiles,
        indexedFiles: buildResult.indexedFiles,
        truncated: buildResult.truncated,
        filesCreated: created,
        filesUpdated: updated,
        validation: validationReport,
        prompt,
      }, null, 2)
    : humanSummary;
  return ok(scanSummary, { prompt, filesCreated: created, filesUpdated: updated });

}

async function expandRequestFileReference(cwd: string, token: string): Promise<string> {
  const fileReference = token.slice(1);
  if (!fileReference) {
    throw new Error("Invalid @file reference: include a local file path after @.");
  }
  if (fileReference === "-") {
    throw new Error("stdin @file references are not supported; pass a local file path.");
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(fileReference)) {
    throw new Error(`URL @file references are not supported: ${token}. Pass a local file path.`);
  }
  if (REQUEST_FILE_GLOB_PATTERN.test(fileReference)) {
    throw new Error(`Glob patterns are not supported in @file references: ${token}. Pass one explicit file path.`);
  }
  if (fileReference.includes("..") || fileReference.includes("//") || fileReference.startsWith("/") || fileReference.startsWith("\\")) {
    throw new Error(`Invalid @file reference: ${token}. Path traversal and absolute paths are not allowed.`);
  }

  const filePath = resolve(cwd, fileReference);
  if (!filePath.startsWith(resolve(cwd))) {
    throw new Error(`Invalid @file reference: ${token}. File must be inside the project directory.`);
  }
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`File reference not found: ${token} (${filePath}).`);
    }
    throw new Error(`Cannot inspect file reference: ${token} (${filePath}).`);
  }

  if (fileStat.isDirectory()) {
    throw new Error(`File reference is a directory: ${token} (${filePath}); pass a file path.`);
  }
  if (!fileStat.isFile()) {
    throw new Error(`File reference is not a regular file: ${token} (${filePath}).`);
  }
  if (fileStat.size > MAX_REQUEST_FILE_BYTES) {
    throw new Error(`File reference is too large: ${token} is ${fileStat.size} bytes; maximum is ${MAX_REQUEST_FILE_BYTES} bytes.`);
  }

  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`File reference is not readable: ${token} (${filePath}).`);
  }

  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new Error(`Cannot read file reference: ${token} (${filePath}).`);
  }
}

async function expandRequestTokens(cwd: string, tokens: string[]): Promise<string> {
  const expanded: string[] = [];
  for (const token of tokens) {
    expanded.push(token.startsWith("@") ? await expandRequestFileReference(cwd, token) : token);
  }
  return expanded.join(" ").trim();
}
function deriveTitle(request: string): string {
  let title = request.replace(/\s+/g, " ").trim();

  const sentenceEnd = title.search(/[.!?](\s|$)/);
  if (sentenceEnd > 0 && sentenceEnd < 80) {
    title = title.slice(0, sentenceEnd + 1).trim();
  } else if (title.length > 80) {
    const truncated = title.slice(0, 80);
    const lastSpace = truncated.lastIndexOf(" ");
    title = (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim();
  }

  return title || "change";
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
  const [kindArg, ...requestTokens] = args.positionals;
  if (!CHANGE_KINDS.has(kindArg as ChangeKind)) {
    return fail("Change kind must be one of feature, bugfix, refactor, research.");
  }
  const request = await expandRequestTokens(ctx.cwd, requestTokens);
  if (!request) {
    return fail("Usage: specwright new <kind> <request...>");
  }
  if (args.mode && !MODES.has(args.mode)) {
    return fail(`Invalid mode: ${args.mode}`);
  }
  const config = await loadConfig(ctx.cwd);
  const state = await loadState(ctx.cwd);
  const id = nextChangeId(await existingChangeIds(ctx.cwd, Object.keys(state.changes)));
  const title = deriveTitle(request);
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

  const sourceRequest = requestTokens.join(" ");
  const replacements = { ...templateValues(change), sourceRequest, expandedRequest: request };
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
    if (!await hasGitIdentity(ctx.cwd)) {
      return fail("Git user.name and user.email must be configured to auto-commit. Run git config user.name/email or disable workflow.autoCommit.");
    }
    const commitFiles = [...created, statePath(ctx.cwd)];
    await stageFiles(ctx.cwd, commitFiles);
    await commitStaged(ctx.cwd, `specwright: start ${id}-${slug}`, undefined, commitFiles);
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
  const discussPrompt = ctx.runtime === "omp"
    ? renderOmpDiscussPrompt({ step: "discuss", change, config, cwd: ctx.cwd })
    : renderDiscussPrompt({ step: "discuss", change, config, cwd: ctx.cwd });
  const prompt = `${discussPrompt}

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
  const lifecycleStrategy = ctx.runtime === "omp"
    ? renderOmpLifecycleSpawnStrategy({ step: "research", config })
    : renderLifecycleSpawnStrategy({ step: "research", config });
  const mapPointer = await mapPointerSection(ctx.cwd);
  const subagentRetry = ctx.runtime === "omp"
    ? renderOmpSubagentRetryClause()
    : renderSubagentRetryClause();
  const prompt = `# Specwright Research: ${change.id}-${change.slug}

online=${online}

${renderContextBudget(config)}

${lifecycleStrategy}

Read first:
- .specwright/changes/${change.id}-${change.slug}/intent.md
- .specwright/changes/${change.id}-${change.slug}/constraints.md
- .specwright/changes/${change.id}-${change.slug}/research.md
- .specwright/changes/${change.id}-${change.slug}/sources.md
- .specwright/changes/${change.id}-${change.slug}/evidence.md
- .specwright/changes/${change.id}-${change.slug}/options.md${mapPointer}

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

${subagentRetry}

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
  const lifecycleStrategy = ctx.runtime === "omp"
    ? renderOmpLifecycleSpawnStrategy({ step: "plan", config })
    : renderLifecycleSpawnStrategy({ step: "plan", config });
  const mapPointer = await mapPointerSection(ctx.cwd);
  const prompt = `# Specwright Plan: ${updated.id}-${updated.slug}

${renderContextBudget(config)}

${lifecycleStrategy}

Read first:
- .specwright/changes/${updated.id}-${updated.slug}/intent.md
- .specwright/changes/${updated.id}-${updated.slug}/constraints.md
- .specwright/changes/${updated.id}-${updated.slug}/research.md
- .specwright/changes/${updated.id}-${updated.slug}/evidence.md
- .specwright/changes/${updated.id}-${updated.slug}/plan.md
- .specwright/changes/${updated.id}-${updated.slug}/tasks.md${mapPointer}
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
  if (!args.summary || args.summary.trim() === "") {
    return fail("A non-empty --summary is required.");
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
    if (syncResult.issues.length > 0) {
      return fail(`Task sync issues: ${syncResult.issues.map(i => i.message).join("; ")}`);
    }
    if (!change.tasks[args.task]) {
      return fail(`Task not found: ${args.task}`);
    }
    if (syncResult.changed) {
      await updateCachedChange(ctx.cwd, change);
      if (!filesToStage.includes(stateFile)) {
        filesToStage.push(stateFile);
      }
    }
  }

  const unit = args.task ?? args.phase ?? "";
  const summary = args.summary.trim();
  const subject = `[${change.id}-${unit}] ${summary}`;
  const bodyLines = [
    `Change: ${change.id}-${change.slug}`,
    `Unit: ${args.task ? "task" : "phase"} ${unit}`,
    `Summary: ${summary}`,
  ];
  const taskState = args.task ? change.tasks[args.task] : undefined;
  if (taskState) {
    bodyLines.push(`Task title: ${taskState.title}`);
  }
  if (args.phase) {
    bodyLines.push(`Phase: ${args.phase}`);
  }
  bodyLines.push("Files:", ...args.files.map(file => `- ${file}`));
  const body = bodyLines.join("\n");
  await stageFiles(ctx.cwd, filesToStage);
  await commitStaged(ctx.cwd, subject, body, filesToStage);
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
  const config = await loadConfig(ctx.cwd);
  const lifecycleStrategy = ctx.runtime === "omp"
    ? renderOmpLifecycleSpawnStrategy({ step: "execute", config })
    : renderLifecycleSpawnStrategy({ step: "execute", config });
  const mapPointer = await mapPointerSection(ctx.cwd);
  const prompt = `# Specwright Execute: ${updated.id} ${task.id}\n\n${lifecycleStrategy}\n\nRead first:\n- .specwright/changes/${updated.id}-${updated.slug}/intent.md\n- .specwright/changes/${updated.id}-${updated.slug}/evidence.md\n- .specwright/changes/${updated.id}-${updated.slug}/tasks.md${mapPointer}\n\nTask:\n- [ ] ${task.id}: ${task.title}\n\nRules:\n- Implement this task only.\n- Do not broaden scope.\n- Update tasks.md checkbox/status only after verification for this task passes.\n- If new facts invalidate the plan, stop and update decisions.md with the blocking fact.\n\n${renderCheckpointClause({ change: updated, unit: { kind: "task", id: task.id }, files: taskFiles })}`;
  return ok(`Prepared execute prompt for ${task.id}.`, { prompt });
}

function preservedObservedOutput(markdown: string | undefined): string {
  if (!markdown) return "";
  const match = markdown.match(/(?:^|\n)## Observed output\s*\n([\s\S]*)$/i);
  if (!match) return "";
  const content = match[1] ?? "";
  return content.length > 0 && !content.endsWith("\n") ? `${content}\n` : content;
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
  // Validate against ORIGINAL cached state (before sync). validateChange already
  // surfaces unreconciled task drift as SW009 issues, so we do not duplicate them here.
  const verifyPath = join(changeDir(ctx.cwd, change.id, change.slug), "verify.md");
  let existingVerify: string | undefined;
  try {
    existingVerify = await readFile(verifyPath, "utf8");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  const report = await validateChange(ctx.cwd, change);
  await writeFile(verifyPath, renderValidationReport(report, preservedObservedOutput(existingVerify)), "utf8");
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
  const lifecycleStrategy = ctx.runtime === "omp"
    ? renderOmpLifecycleSpawnStrategy({ step: "verify", config })
    : renderLifecycleSpawnStrategy({ step: "verify", config });
  const prompt = `# Specwright Verify: ${updated.id}-${updated.slug}\n\n${renderContextBudget(config)}\n\n${lifecycleStrategy}\n\nRead first:\n- .specwright/changes/${updated.id}-${updated.slug}/tasks.md\n- .specwright/changes/${updated.id}-${updated.slug}/verify.md\n\nRun the task-specific checks listed in tasks.md and update verify.md with observed command output.\n\n${renderCheckpointClause({ change: updated, unit: { kind: "phase", id: "verify" }, files: artifactPaths(updated, ["verify.md", "tasks.md"]) })}`;
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
  const mapPointer = !args.task ? await mapPointerSection(ctx.cwd) : "";
  const handoff = `# Agent Handoff: ${change.id}\n\n## Goal\n\n${intent}\n\n## Read first\n\n- .specwright/changes/${change.id}-${change.slug}/intent.md\n- .specwright/changes/${change.id}-${change.slug}/evidence.md\n- .specwright/changes/${change.id}-${change.slug}/tasks.md\n- .specwright/changes/${change.id}-${change.slug}/verify.md${mapPointer}\n\n## Current state\n\nstatus=${change.status}; step=${change.step}\n\n## Constraints\n\nSee intent.md and evidence.md.\n\n## Acceptance\n\n${verify}\n\n## Next task\n\n${taskLines || "No incomplete tasks."}\n\n## Evidence\n\n${evidence}\n`;
  const handoffPath = join(dir, "handoff.md");
  await writeFile(handoffPath, handoff, "utf8");
  const report = await validateChange(ctx.cwd, change);
  if (!report.ok) {
    return fail("Handoff generated but validation failed. Run specwright verify to see issues.", { filesUpdated: [handoffPath] });
  }
  const allDone = Object.values(change.tasks).length > 0 && Object.values(change.tasks).every((task) => task.status === "done");
  const status = allDone ? "done" : change.status;
  await updateCachedChange(ctx.cwd, { ...change, status, step: "handoff", updatedAt: ctx.now().toISOString() });
  return ok(`Generated handoff for ${change.id}.`, { filesUpdated: [handoffPath], prompt: handoff });
}

async function discoverPackManifests(cwd: string): Promise<string[]> {
  const config = await loadConfig(cwd);
  const manifests: string[] = [];
  const projectRoot = resolve(cwd);
  for (const root of config.packs.roots) {
    const absoluteRoot = resolve(cwd, root);
    if (!absoluteRoot.startsWith(projectRoot)) {
      continue;
    }
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
    const filesUpdated = [relative(ctx.cwd, configPath(ctx.cwd))];
    const updatedAgent = agentNameForModelConfigKey(key);
    if (updated.runtimes.omp.enabled) {
      const needsRegen = await adapterNeedsRegeneration(ctx.cwd);
      filesUpdated.push(...await installOmpAdapter({ cwd: ctx.cwd, force: args.force, regenerateAdapter: needsRegen, config: updated, ...(updatedAgent ? { regenerateAgents: [updatedAgent] as const } : {}) }));
    }
    return ok(`Set ${key}.`, { filesUpdated });
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
async function commandComplete(ctx: CommandContext, args: ParsedArgs): Promise<CommandResult> {
  if (args.positionals.length > 1) {
    return fail("Usage: specwright complete [<change>] [--mode none|push|pr|merge]");
  }

  const mode = args.completeMode ?? "none";

  // Git preflight guards — all checked before any side effect.
  if (!await isGitWorktree(ctx.cwd)) {
    return fail("Complete requires a git worktree.");
  }

  let branch: string;
  try {
    branch = await currentBranch(ctx.cwd);
  } catch {
    return fail("Complete requires a non-detached HEAD.");
  }

  let change = await findCurrentChange(ctx.cwd, args.positionals[0]);

  const expectedBranch = branchNameForChange(change);
  if (branch !== expectedBranch) {
    return fail(`Current branch "${branch}" does not match change branch "${expectedBranch}".`);
  }

  const config = await loadConfig(ctx.cwd);
  const baseBranch = await resolveBaseBranch(ctx.cwd, config);
  if (branch === baseBranch) {
    return fail(`Already on base branch "${branch}".`);
  }

  if (!await isWorktreeClean(ctx.cwd)) {
    return fail("Complete requires a clean worktree. Commit or stash local changes first.");
  }

  // Lifecycle artifact and evidence guards. Sync tasks in memory only; complete
  // must not dirty state.json before every guard has passed.
  const tasksPath = join(changeDir(ctx.cwd, change.id, change.slug), "tasks.md");
  try {
    const tasksMarkdown = await readFile(tasksPath, "utf8");
    const syncResult = syncChangeTasksFromMarkdown(change, tasksMarkdown, ctx.now());
    if (syncResult.issues.length > 0) {
      const messages = syncResult.issues.map((issue) => issue.message).join("; ");
      return fail(`Complete cannot reconcile tasks.md: ${messages}.`);
    }
    change = syncResult.change;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const { total, done } = taskProgress(change);
  if (total === 0) {
    return fail("Complete requires at least one task; add tasks to tasks.md first.");
  }
  if (done !== total) {
    return fail(`Complete requires all tasks to be done (${done}/${total} done).`);
  }

  const changeDir_ = changeDir(ctx.cwd, change.id, change.slug);
  const verifyPath = join(changeDir_, "verify.md");
  const handoffPath = join(changeDir_, "handoff.md");
  let verifyContent: string | undefined;
  let handoffContent: string | undefined;
  try {
    verifyContent = await readFile(verifyPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      // missing
    } else {
      throw error;
    }
  }
  try {
    handoffContent = await readFile(handoffPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      // missing
    } else {
      throw error;
    }
  }
  if (!verifyContent || !hasObservedOutput(verifyContent)) {
    return fail("Complete requires verify.md to contain observed command/output evidence.");
  }
  if (!handoffContent || !hasNonHeadingContent(handoffContent)) {
    return fail("Complete requires a non-empty handoff.md.");
  }

  const validationReport = await validateChange(ctx.cwd, change);
  if (!validationReport.ok) {
    return fail("Complete requires passing validation. Run specwright verify to see issues.");
  }
  const remote = config.workflow.remote;

  if (mode === "none") {
    await updateChangeStep(ctx.cwd, change, "done", "handoff", ctx.now());
    return ok("Complete mode: none. Change status set to done.");
  }

  if (mode === "push" || mode === "pr") {
    await pushBranch(ctx.cwd, remote, branch);
  }

  if (mode === "pr") {
    const bodyFile = await writePullRequestBodyFile(ctx.cwd, change);
    const title = `${change.id}-${change.slug}: ${change.title}`;
    await createPullRequest(ctx.cwd, title, bodyFile, baseBranch, branch);
    await updateChangeStep(ctx.cwd, change, "done", "handoff", ctx.now());
    return ok(`Created pull request for ${branch} targeting ${baseBranch}.`, { filesCreated: [bodyFile] });
  }

  if (mode === "merge") {
    await switchToExistingBranch(ctx.cwd, baseBranch);
    try {
      await mergeNoFastForward(ctx.cwd, branch);
    } catch (error) {
      try {
        await switchToExistingBranch(ctx.cwd, branch);
      } catch {
        // Best-effort rollback failed; leave repo on baseBranch and report original error.
      }
      return fail(`Merge failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await updateChangeStep(ctx.cwd, change, "done", "handoff", ctx.now());
    return ok(`Merged ${branch} into ${baseBranch} with --no-ff.`);
  }

  await updateChangeStep(ctx.cwd, change, "done", "handoff", ctx.now());
  return ok(`Pushed ${branch} to ${remote}.`);
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
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      return fail(`Invalid pack id: ${value}. Use only letters, numbers, hyphens, and underscores.`);
    }
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
      case "scan": return await commandScan(ctx, args);
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
      case "complete": return await commandComplete(ctx, args);
      default: return fail(`Unknown command: ${args.command}`);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
export function renderHelp(): string {
  return `Specwright\n\nUsage:\n  specwright init [--force] [--json]\n  specwright status [--json]\n  specwright scan [--map] [--refresh] [--force] [--json] [--print-prompt]\n  specwright new <kind> <request...> [--mode lite|full] [--pack core] [--json]\n  specwright discuss [<change>] [--print-prompt]\n  specwright research [<change>] [--online never|ask|auto|require] [--print-prompt]\n  specwright plan [<change>] [--print-prompt]\n  specwright tasks [<change>] [--print-prompt]\n  specwright execute [<change>] [--task T###] [--print-prompt]\n  specwright checkpoint [<change>] (--phase discuss|research|plan|tasks|verify|handoff | --task T###) --summary '<summary>' --files <file[,file...]>\n  specwright commit [<change>] (--phase discuss|research|plan|tasks|verify|handoff | --task T###) --summary '<summary>' --files <file[,file...]>\n  specwright publish [<change>] [--mode none|push|pr]\n  specwright complete [<change>] [--mode none|push|pr|merge]\n  specwright verify [<change>] [--json] [--print-prompt]\n  specwright handoff [<change>] [--task T###] [--print-prompt]\n  specwright pack list|validate|add\n  specwright config get <key>\n  specwright config set <key> <value>\n`;
}
