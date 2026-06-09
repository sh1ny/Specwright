import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { changeDir, configPath, statePath } from "./paths";
import { readJsonFile, writeJsonFile } from "./json";
import type { ChangeState, ParsedTaskArtifact, SpecwrightAgentConfig, SpecwrightAgentName, SpecwrightConfig, SpecwrightState, TaskState, TaskSyncIssue, TaskSyncIssueKind, TaskSyncResult } from "./types";

type StoredSpecwrightConfig = Partial<Omit<SpecwrightConfig, "agents" | "workflow">> & {
  version?: unknown;
  agents?: Partial<Record<SpecwrightAgentName, Partial<SpecwrightAgentConfig>>>;
  workflow?: Partial<SpecwrightConfig["workflow"]>;
};

export function defaultConfig(projectName: string): SpecwrightConfig {
  return {
    version: 1,
    project: { name: projectName },
    defaults: {
      mode: "lite",
      pack: "core",
      onlineResearch: "auto",
      maxContextFiles: 6,
      maxOutputWords: 1200,
    },
    agents: {
      researcher: { model: "pi/task" },
      planner: { model: "pi/plan" },
      executor: { model: "pi/task" },
      verifier: { model: "pi/task" },
    },
    packs: {
      roots: [".specwright/packs", "packs"],
      enabled: ["core"],
    },
    runtimes: {
      omp: { enabled: true },
    },
    workflow: {
      autoCommit: true,
      publishMode: "none",
      remote: "origin",
    },
  };
}

export function defaultState(now: Date): SpecwrightState {
  return {
    version: 1,
    changes: {},
    updatedAt: now.toISOString(),
  };
}

const TASK_LINE_PATTERN = /^\s*- \[([ xX])] (T\d{3}):\s*(.+?)\s*$/;
const TASK_CHECKLIST_PATTERN = /^\s*-\s*\[[^\]]*]\s*T\d+/;
export type UnreconciledTaskDriftKind = TaskSyncIssueKind | "missing-task-artifact" | "cached-task-without-artifact";

export interface UnreconciledTaskDriftIssue {
  kind: UnreconciledTaskDriftKind;
  line?: number;
  taskId?: string;
  message: string;
}


function taskStatesEqual(left: Record<string, TaskState>, right: Record<string, TaskState>): boolean {
  const leftIds = Object.keys(left);
  const rightIds = Object.keys(right);
  if (leftIds.length !== rightIds.length) return false;
  for (const id of leftIds) {
    const leftTask = left[id];
    const rightTask = right[id];
    if (!leftTask || !rightTask) return false;
    if (leftTask.id !== rightTask.id || leftTask.title !== rightTask.title || leftTask.status !== rightTask.status) {
      return false;
    }
  }
  return true;
}

export function parseTaskArtifact(markdown: string): { tasks: ParsedTaskArtifact[]; issues: TaskSyncIssue[] } {
  const tasks: ParsedTaskArtifact[] = [];
  const issues: TaskSyncIssue[] = [];
  const seen = new Set<string>();

  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const match = TASK_LINE_PATTERN.exec(line);
    if (!match) {
      if (TASK_CHECKLIST_PATTERN.test(line)) {
        issues.push({
          kind: "malformed-task-line",
          line: lineNumber,
          message: `Malformed task checklist line ${lineNumber}. Expected "- [ ] T001: Title".`,
        });
      }
      continue;
    }

    const id = match[2] ?? "";
    if (seen.has(id)) {
      issues.push({
        kind: "duplicate-task-id",
        line: lineNumber,
        taskId: id,
        message: `Duplicate task id ${id} on line ${lineNumber}.`,
      });
      continue;
    }

    seen.add(id);
    tasks.push({
      id,
      title: match[3] ?? "",
      checked: (match[1] ?? "") !== " ",
      line: lineNumber,
    });
  }

  return { tasks, issues };
}
export function unreconciledTaskDriftIssues(
  change: ChangeState,
  markdown: string | undefined,
  taskArtifactRequired: boolean,
): UnreconciledTaskDriftIssue[] {
  const cachedTasks = Object.values(change.tasks);
  if (markdown === undefined) {
    const issues: UnreconciledTaskDriftIssue[] = [];
    if (taskArtifactRequired) {
      issues.push({
        kind: "missing-task-artifact",
        message: "tasks.md is missing at execute or later step.",
      });
    }
    for (const task of cachedTasks) {
      issues.push({
        kind: "cached-task-without-artifact",
        taskId: task.id,
        message: `Cached task ${task.id} exists but tasks.md is missing.`,
      });
    }
    return issues;
  }

  const parsed = parseTaskArtifact(markdown);
  const issues: UnreconciledTaskDriftIssue[] = parsed.issues.map((issue) => ({
    kind: issue.kind,
    line: issue.line,
    message: issue.message,
    ...(issue.taskId ? { taskId: issue.taskId } : {}),
  }));
  const artifactIds = new Set(parsed.tasks.map((task) => task.id));

  if (taskArtifactRequired && parsed.tasks.length === 0) {
    issues.push({
      kind: "missing-task-artifact",
      message: "tasks.md has no parseable task artifacts at execute or later step.",
    });
  }

  for (const task of parsed.tasks) {
    const cached = change.tasks[task.id];
    if (cached && cached.title !== task.title) {
      issues.push({
        kind: "title-drift",
        line: task.line,
        taskId: task.id,
        message: `Task ${task.id} title changed from "${cached.title}" to "${task.title}".`,
      });
    }
  }

  for (const task of cachedTasks) {
    if (!artifactIds.has(task.id)) {
      issues.push({
        kind: "cached-task-without-artifact",
        taskId: task.id,
        message: `Cached task ${task.id} has no matching tasks.md artifact.`,
      });
    }
  }

  return issues;
}

export function syncChangeTasksFromMarkdown(change: ChangeState, markdown: string, now: Date): TaskSyncResult {
  const parsed = parseTaskArtifact(markdown);
  const issues = [...parsed.issues];
  const updatedAt = now.toISOString();
  const tasks: Record<string, TaskState> = {};
  for (const task of parsed.tasks) {
    const prior = change.tasks[task.id];
    if (prior && prior.title !== task.title) {
      issues.push({
        kind: "title-drift",
        line: task.line,
        taskId: task.id,
        message: `Task ${task.id} title changed from "${prior.title}" to "${task.title}".`,
        previousTitle: prior.title,
        nextTitle: task.title,
      });
    }
    const status = task.checked
      ? "done"
      : prior && prior.title === task.title && (prior.status === "in-progress" || prior.status === "blocked")
        ? prior.status
        : "pending";
    tasks[task.id] = { id: task.id, title: task.title, status, updatedAt };
  }
  for (const task of Object.values(change.tasks)) {
    if (!tasks[task.id]) {
      issues.push({
        kind: "cached-task-without-artifact",
        taskId: task.id,
        message: `Cached task ${task.id} has no matching tasks.md artifact.`,
      });
    }
  }
  const changed = !taskStatesEqual(change.tasks, tasks);
  return {
    change: changed ? { ...change, tasks, updatedAt } : change,
    issues,
    changed,
  };
}

export async function syncChangeTasksFromFile(cwd: string, change: ChangeState, now: Date): Promise<TaskSyncResult> {
  const tasksPath = join(changeDir(cwd, change.id, change.slug), "tasks.md");
  const markdown = await readFile(tasksPath, "utf8");
  const result = syncChangeTasksFromMarkdown(change, markdown, now);
  if (result.changed) {
    await updateCachedChange(cwd, result.change);
  }
  return result;
}

export async function syncChangeTasksFromFileIfPresent(cwd: string, change: ChangeState, now: Date): Promise<TaskSyncResult> {
  const tasksPath = join(changeDir(cwd, change.id, change.slug), "tasks.md");
  let markdown: string;
  try {
    markdown = await readFile(tasksPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { change, issues: [], changed: false };
    }
    throw error;
  }
  const result = syncChangeTasksFromMarkdown(change, markdown, now);
  if (result.changed && result.issues.length === 0) {
    await updateCachedChange(cwd, result.change);
  }
  return result;
}

export async function loadConfig(cwd: string): Promise<SpecwrightConfig> {
  const existing = await readJsonFile<StoredSpecwrightConfig>(configPath(cwd));
  const defaults = defaultConfig(basename(cwd));
  if (!existing) {
    return defaults;
  }
  if (existing.version !== 1) {
    throw new Error(`Unsupported Specwright config version: ${String(existing.version)}`);
  }

  return {
    version: 1,
    project: {
      ...defaults.project,
      ...existing.project,
    },
    defaults: {
      ...defaults.defaults,
      ...existing.defaults,
    },
    agents: {
      researcher: {
        ...defaults.agents.researcher,
        ...existing.agents?.researcher,
      },
      planner: {
        ...defaults.agents.planner,
        ...existing.agents?.planner,
      },
      executor: {
        ...defaults.agents.executor,
        ...existing.agents?.executor,
      },
      verifier: {
        ...defaults.agents.verifier,
        ...existing.agents?.verifier,
      },
    },
    packs: {
      ...defaults.packs,
      ...existing.packs,
    },
    runtimes: {
      omp: {
        ...defaults.runtimes.omp,
        ...existing.runtimes?.omp,
      },
    },
    workflow: {
      ...defaults.workflow,
      ...existing.workflow,
    },
  };
}

export async function loadState(cwd: string): Promise<SpecwrightState> {
  const state = await readJsonFile<SpecwrightState & { version?: unknown }>(statePath(cwd));
  if (!state) {
    return defaultState(new Date());
  }
  if (state.version !== 1) {
    throw new Error(`Unsupported Specwright state version: ${String(state.version)}`);
  }
  return state as SpecwrightState;
}

export async function saveConfig(cwd: string, config: SpecwrightConfig): Promise<void> {
  await writeJsonFile(configPath(cwd), config);
}

export async function saveState(cwd: string, state: SpecwrightState): Promise<void> {
  await writeJsonFile(statePath(cwd), state);
}

export async function findCurrentChange(cwd: string, explicit?: string): Promise<ChangeState> {
  const state = await loadState(cwd);
  const target = explicit ?? state.currentChange;
  if (!target) {
    throw new Error("No current Specwright change. Run specwright new <kind> \"<title>\" first.");
  }

  const direct = state.changes[target];
  if (direct) {
    return direct;
  }

  for (const change of Object.values(state.changes)) {
    if (change.id === target || `${change.id}-${change.slug}` === target || change.id === target.slice(0, 4)) {
      return change;
    }
  }

  throw new Error(`Specwright change not found: ${target}`);
}

export async function updateCachedChange(cwd: string, change: ChangeState): Promise<void> {
  const state = await loadState(cwd);
  state.changes[change.id] = change;
  state.updatedAt = change.updatedAt;
  await saveState(cwd, state);
}

export async function upsertChange(cwd: string, change: ChangeState): Promise<void> {
  const state = await loadState(cwd);
  state.changes[change.id] = change;
  state.updatedAt = change.updatedAt;
  await saveState(cwd, state);
}
