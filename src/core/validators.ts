import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { changeDir } from "./paths";
import { loadConfig, unreconciledTaskDriftIssues } from "./state";
import { SPECWRIGHT_AGENT_NAMES } from "./types";
import type { ChangeState, LifecycleStep, OnlineResearchMode, SpecwrightAgentName, SpecwrightConfig, SpecwrightMode, WorkflowPublishMode } from "./types";

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  file?: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
}

const STEP_INDEX: Record<LifecycleStep, number> = {
  discuss: 0,
  research: 1,
  plan: 2,
  execute: 3,
  verify: 4,
  handoff: 5,
};

const MODES = new Set<SpecwrightMode>(["lite", "full"]);
const ONLINE_MODES = new Set<OnlineResearchMode>(["never", "ask", "auto", "require"]);
const PUBLISH_MODES = new Set<WorkflowPublishMode>(["none", "push", "pr"]);
const GIT_REMOTE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GIT_BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function validateGitName(value: string, label: string, pattern: RegExp): void {
  if (
    value.length === 0 ||
    value.startsWith("-") ||
    value.includes("..") ||
    value.includes("@{") ||
    value.includes("\\") ||
    value.includes("//") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    /\s|[\x00-\x1f\x7f]/.test(value) ||
    !pattern.test(value)
  ) {
    throw new Error(`Invalid ${label}`);
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSafeRelativePath(value: string): boolean {
  if (value === "") return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  for (const segment of value.split(/[/\\]/)) {
    if (segment === "..") return false;
  }
  return true;
}

function validateAgentModel(config: SpecwrightConfig, agent: SpecwrightAgentName): void {
  const model = config.agents?.[agent]?.model;
  if (typeof model !== "string" || model.length === 0 || !/\S/.test(model)) {
    throw new Error(`Invalid agents.${agent}.model`);
  }
}

export function validateSpecwrightConfig(config: SpecwrightConfig): void {
  if (config.version !== 1) throw new Error("Invalid config version");
  if (typeof config.project.name !== "string") throw new Error("Invalid project.name");
  if (!MODES.has(config.defaults.mode)) throw new Error("Invalid defaults.mode");
  if (typeof config.defaults.pack !== "string") throw new Error("Invalid defaults.pack");
  if (!ONLINE_MODES.has(config.defaults.onlineResearch)) throw new Error("Invalid defaults.onlineResearch");
  if (!Number.isInteger(config.defaults.maxContextFiles) || config.defaults.maxContextFiles <= 0) {
    throw new Error("Invalid defaults.maxContextFiles");
  }
  if (!Number.isInteger(config.defaults.maxOutputWords) || config.defaults.maxOutputWords <= 0) {
    throw new Error("Invalid defaults.maxOutputWords");
  }
  if (!isStringArray(config.packs.roots) || config.packs.roots.some((root) => !isSafeRelativePath(root))) {
    throw new Error("Invalid packs.roots: entries must be relative paths without parent-directory references");
  }
  if (!isStringArray(config.packs.enabled)) throw new Error("Invalid packs.enabled");
  if (typeof config.runtimes.omp.enabled !== "boolean") throw new Error("Invalid runtimes.omp.enabled");
  for (const agent of SPECWRIGHT_AGENT_NAMES) {
    validateAgentModel(config, agent);
  }
  if (typeof config.workflow.autoCommit !== "boolean") throw new Error("Invalid workflow.autoCommit");
  if (!PUBLISH_MODES.has(config.workflow.publishMode)) throw new Error("Invalid workflow.publishMode");
  if (config.workflow.baseBranch !== undefined) {
    validateGitName(config.workflow.baseBranch, "workflow.baseBranch", GIT_BRANCH_PATTERN);
  }
  validateGitName(config.workflow.remote, "workflow.remote", GIT_REMOTE_PATTERN);
}
export interface CodebaseIndex {
  version: number;
  generatedAt?: string;
  entrypoints?: Array<{ path: string; kind?: string; summary?: string }>;
  modules?: Array<{ path: string; kind?: string; summary?: string; tests?: string[] }>;
  commands?: Array<{ name: string; summary?: string }>;
  verification?: Array<{ command: string; purpose?: string }>;
  risks?: Array<{ area: string; summary?: string }>;
  fingerprints?: Record<string, unknown>;
}

export async function validateCodebaseIndex(
  cwd: string,
  index: unknown,
): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];

  if (index === null || typeof index !== "object") {
    issues.push({ level: "error", code: "SW100", message: "codebase-index.json must be a JSON object." });
    return { ok: false, issues };
  }

  const obj = index as Record<string, unknown>;

  if (obj.version !== 1) {
    issues.push({
      level: "error",
      code: "SW101",
      message: `Expected version 1, got ${JSON.stringify(obj.version)}.`,
    });
  }

  if (obj.generatedAt !== undefined && typeof obj.generatedAt !== "string") {
    issues.push({
      level: "warning",
      code: "SW102",
      message: "generatedAt must be a string when present.",
    });
  }

  function requireArray(key: string): unknown[] | undefined {
    const value = obj[key];
    if (value === undefined) {
      issues.push({ level: "error", code: "SW103", message: `Missing required array: ${key}.` });
      return undefined;
    }
    if (!Array.isArray(value)) {
      issues.push({ level: "error", code: "SW103", message: `${key} must be an array.` });
      return undefined;
    }
    return value;
  }

  function requireString(obj: Record<string, unknown>, key: string, context: string): string | undefined {
    const value = obj[key];
    if (value === undefined) {
      issues.push({ level: "error", code: "SW104", message: `${context} is missing required field: ${key}.` });
      return undefined;
    }
    if (typeof value !== "string") {
      issues.push({ level: "error", code: "SW104", message: `${context} field ${key} must be a string.` });
      return undefined;
    }
    return value;
  }

  function validatePath(value: string, context: string): boolean {
    if (!isSafeRelativePath(value)) {
      issues.push({ level: "error", code: "SW105", message: `${context} path is not a safe relative path: ${value}.` });
      return false;
    }
    return true;
  }

  async function warnIfMissing(path: string, context: string): Promise<void> {
    try {
      await stat(join(cwd, path));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        issues.push({ level: "warning", code: "SW106", message: `${context} references missing file: ${path}.` });
      } else {
        throw error;
      }
    }
  }

  const entrypoints = requireArray("entrypoints");
  const modules = requireArray("modules");
  const commands = requireArray("commands");
  const verification = requireArray("verification");
  const risks = requireArray("risks");

  if (entrypoints !== undefined) {
    for (let i = 0; i < entrypoints.length; i++) {
      const entry = entrypoints[i];
      const context = `entrypoints[${i}]`;
      if (entry === null || typeof entry !== "object") {
        issues.push({ level: "error", code: "SW107", message: `${context} must be an object.` });
        continue;
      }
      const record = entry as Record<string, unknown>;
      const path = requireString(record, "path", context);
      if (path !== undefined && validatePath(path, context)) {
        await warnIfMissing(path, context);
      }
    }
  }

  const testPaths: string[] = [];
  if (modules !== undefined) {
    for (let i = 0; i < modules.length; i++) {
      const mod = modules[i];
      const context = `modules[${i}]`;
      if (mod === null || typeof mod !== "object") {
        issues.push({ level: "error", code: "SW107", message: `${context} must be an object.` });
        continue;
      }
      const record = mod as Record<string, unknown>;
      const path = requireString(record, "path", context);
      if (path !== undefined && validatePath(path, context)) {
        await warnIfMissing(path, context);
      }
      if (record.tests !== undefined) {
        if (!isStringArray(record.tests)) {
          issues.push({ level: "error", code: "SW108", message: `${context} tests must be an array of strings.` });
        } else {
          for (let j = 0; j < record.tests.length; j++) {
            const testPath = record.tests[j];
            const testContext = `${context}.tests[${j}]`;
            if (validatePath(testPath, testContext)) {
              testPaths.push(testPath);
            }
          }
        }
      }
    }
  }

  if (commands !== undefined) {
    for (let i = 0; i < commands.length; i++) {
      const entry = commands[i];
      const context = `commands[${i}]`;
      if (entry === null || typeof entry !== "object") {
        issues.push({ level: "error", code: "SW107", message: `${context} must be an object.` });
        continue;
      }
      requireString(entry as Record<string, unknown>, "name", context);
    }
  }

  if (verification !== undefined) {
    for (let i = 0; i < verification.length; i++) {
      const entry = verification[i];
      const context = `verification[${i}]`;
      if (entry === null || typeof entry !== "object") {
        issues.push({ level: "error", code: "SW107", message: `${context} must be an object.` });
        continue;
      }
      requireString(entry as Record<string, unknown>, "command", context);
    }
  }

  if (risks !== undefined) {
    for (let i = 0; i < risks.length; i++) {
      const entry = risks[i];
      const context = `risks[${i}]`;
      if (entry === null || typeof entry !== "object") {
        issues.push({ level: "error", code: "SW107", message: `${context} must be an object.` });
        continue;
      }
      requireString(entry as Record<string, unknown>, "area", context);
    }
  }

  for (const testPath of testPaths) {
    await warnIfMissing(testPath, `tests`);
  }

  return { ok: !issues.some((issue) => issue.level === "error"), issues };
}


async function readArtifact(cwd: string, change: ChangeState, file: string): Promise<string | undefined> {
  try {
    return await readFile(join(changeDir(cwd, change.id, change.slug), file), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function isNonHeadingContentLine(trimmed: string): boolean {
  return trimmed.length > 0
    && !trimmed.startsWith("#")
    && !trimmed.startsWith("-->")
    && !trimmed.startsWith("<frozen-after-approval")
    && trimmed !== "</frozen-after-approval>"
    && !trimmed.startsWith("```");
}

export function hasNonHeadingContent(markdown: string): boolean {
  let inHtmlComment = false;
  return markdown.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (inHtmlComment) {
      if (trimmed.endsWith("-->")) {
        inHtmlComment = false;
      }
      return false;
    }
    if (trimmed.startsWith("<!--")) {
      if (!trimmed.endsWith("-->")) {
        inHtmlComment = true;
      }
      return false;
    }
    return isNonHeadingContentLine(trimmed);
  });
}

export function hasObservedOutput(markdown: string): boolean {
  let inObservedSection = false;
  const observedPattern = /observed (command|output)|command output|observed output/i;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^#{1,6}\s+/.test(trimmed)) {
      inObservedSection = observedPattern.test(trimmed);
      continue;
    }
    if (observedPattern.test(trimmed) && isNonHeadingContentLine(trimmed)) {
      return true;
    }
    if (inObservedSection && isNonHeadingContentLine(trimmed)) {
      return true;
    }
  }
  return false;
}

function taskBlocks(tasksMarkdown: string): Array<{ id: string; title: string; block: string; checked: boolean }> {
  const lines = tasksMarkdown.split(/\r?\n/);
  const blocks: Array<{ id: string; title: string; block: string; checked: boolean }> = [];
  let current: { id: string; title: string; start: number; checked: boolean } | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*- \[([ xX])] (T\d{3}):\s*(.+?)\s*$/.exec(lines[index] ?? "");
    if (!match) {
      continue;
    }
    if (current) {
      blocks.push({
        id: current.id,
        title: current.title,
        checked: current.checked,
        block: lines.slice(current.start, index).join("\n"),
      });
    }
    current = {
      id: match[2] ?? "",
      title: match[3] ?? "",
      start: index,
      checked: (match[1] ?? "") !== " ",
    };
  }

  if (current) {
    blocks.push({
      id: current.id,
      title: current.title,
      checked: current.checked,
      block: lines.slice(current.start).join("\n"),
    });
  }

  return blocks;
}

export async function validateChange(cwd: string, change: ChangeState): Promise<ValidationReport> {
  const config = await loadConfig(cwd);
  const issues: ValidationIssue[] = [];
  const stepIndex = STEP_INDEX[change.step];
  const intent = await readArtifact(cwd, change, "intent.md");
  const evidence = await readArtifact(cwd, change, "evidence.md");
  const sources = await readArtifact(cwd, change, "sources.md");
  const tasks = await readArtifact(cwd, change, "tasks.md");
  const plan = await readArtifact(cwd, change, "plan.md");
  const verify = await readArtifact(cwd, change, "verify.md");

  if (!intent || !hasNonHeadingContent(intent)) {
    issues.push({ level: "error", code: "SW001", message: "intent.md is missing or has no non-heading content.", file: "intent.md" });
  }

  if (stepIndex >= STEP_INDEX.plan && !evidence) {
    issues.push({ level: "error", code: "SW002", message: "evidence.md is required before plan or later steps.", file: "evidence.md" });
  }

  if (config.defaults.onlineResearch === "require" && (!sources || !hasNonHeadingContent(sources))) {
    issues.push({
      level: stepIndex >= STEP_INDEX.plan ? "error" : "warning",
      code: "SW003",
      message: "sources.md is empty while onlineResearch is require.",
      file: "sources.md",
    });
  }

  const blocks = taskBlocks(tasks ?? "");
  const seen = new Set<string>();
  for (const block of blocks) {
    if (seen.has(block.id)) {
      issues.push({ level: "error", code: "SW004", message: `tasks.md contains duplicate task ID ${block.id}.`, file: "tasks.md" });
    }
    seen.add(block.id);
  }

  if (stepIndex >= STEP_INDEX.execute && blocks.length === 0) {
    issues.push({ level: "error", code: "SW005", message: "tasks.md has no T### tasks before execute.", file: "tasks.md" });
  }

  if (stepIndex >= STEP_INDEX.execute) {
    for (const block of blocks) {
      if (!/acceptance/i.test(block.block) || !/verification/i.test(block.block)) {
        issues.push({ level: "error", code: "SW006", message: `${block.id} lacks an acceptance or verification block.`, file: "tasks.md" });
      }
    }
  }

  for (const issue of unreconciledTaskDriftIssues(change, tasks, stepIndex >= STEP_INDEX.execute)) {
    issues.push({
      level: "error",
      code: "SW009",
      message: `Unreconciled task drift: ${issue.message}`,
      file: "tasks.md",
    });
  }

  if (plan && !/evidence\.md/i.test(plan)) {
    issues.push({ level: "warning", code: "SW007", message: "plan.md does not mention evidence.md.", file: "plan.md" });
  }

  if (blocks.length > 0 && blocks.every((block) => block.checked) && !hasObservedOutput(verify ?? "")) {
    issues.push({ level: "error", code: "SW008", message: "All tasks are done but verify.md has no observed command/output section.", file: "verify.md" });
  }

  return {
    ok: issues.every((issue) => issue.level !== "error"),
    issues,
  };
}

export function renderValidationReport(report: ValidationReport, observedOutput = ""): string {
  const result = report.ok ? "PASS" : "FAIL";
  const issues = report.issues.length === 0
    ? "No issues."
    : report.issues.map((issue) => {
      const file = issue.file ? ` (${issue.file})` : "";
      return `- ${issue.level.toUpperCase()} ${issue.code}${file}: ${issue.message}`;
    }).join("\n");

  return `# Verification\n\n## Result\n\n${result}\n\n## Issues\n\n${issues}\n\n## Observed output\n\n${observedOutput}`;
}
