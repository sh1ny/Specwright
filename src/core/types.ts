export const SPECWRIGHT_DIR = ".specwright" as const;
export const OMP_DIR = ".omp" as const;

export const LIFECYCLE_STEPS = ["discuss", "research", "plan", "execute", "verify", "handoff"] as const;
export type LifecycleStep = (typeof LIFECYCLE_STEPS)[number];

export type SpecwrightMode = "lite" | "full";
export type OnlineResearchMode = "never" | "ask" | "auto" | "require";
export type WorkflowPublishMode = "none" | "push" | "pr";
export type WorkflowCompleteMode = "none" | "push" | "pr" | "merge";
export const SPECWRIGHT_AGENT_NAMES = ["researcher", "planner", "executor", "verifier"] as const;
export type SpecwrightAgentName = (typeof SPECWRIGHT_AGENT_NAMES)[number];

export type ChangeKind = "feature" | "bugfix" | "refactor" | "research";
export type ChangeStatus =
  | "discussing"
  | "researching"
  | "planning"
  | "ready-for-execution"
  | "executing"
  | "verifying"
  | "done"
  | "blocked";
export type TaskStatus = "pending" | "in-progress" | "done" | "blocked";

export interface SpecwrightAgentConfig {
  model: string;
}

export interface SpecwrightConfig {
  version: 1;
  project: {
    name: string;
  };
  defaults: {
    mode: SpecwrightMode;
    pack: string;
    onlineResearch: OnlineResearchMode;
    maxContextFiles: number;
    maxOutputWords: number;
  };
  agents: Record<SpecwrightAgentName, SpecwrightAgentConfig>;
  packs: {
    roots: string[];
    enabled: string[];
  };
  runtimes: {
    omp: {
      enabled: boolean;
    };
  };
  workflow: {
    autoCommit: boolean;
    publishMode: WorkflowPublishMode;
    baseBranch?: string;
    remote: string;
  };
}

export interface TaskState {
  id: string;
  title: string;
  status: TaskStatus;
  updatedAt: string;
}

export interface ParsedTaskArtifact {
  id: string;
  title: string;
  checked: boolean;
  line: number;
}

export type TaskSyncIssueKind = "malformed-task-line" | "duplicate-task-id" | "title-drift" | "cached-task-without-artifact";
export interface TaskSyncIssue {
  kind: TaskSyncIssueKind;
  line?: number;
  taskId?: string;
  message: string;
  previousTitle?: string;
  nextTitle?: string;
}

export interface TaskSyncResult {
  change: ChangeState;
  issues: TaskSyncIssue[];
  changed: boolean;
}

export interface ChangeState {
  id: string;
  slug: string;
  title: string;
  kind: ChangeKind;
  pack: string;
  mode: SpecwrightMode;
  status: ChangeStatus;
  step: LifecycleStep;
  createdAt: string;
  updatedAt: string;
  tasks: Record<string, TaskState>;
}

export interface SpecwrightState {
  version: 1;
  currentChange?: string;
  changes: Record<string, ChangeState>;
  updatedAt: string;
}

export interface PackManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  artifacts: string[];
  workflows: string[];
  agents: string[];
  validators: string[];
}

export interface WorkflowManifest {
  id: string;
  name: string;
  pack: string;
  steps: LifecycleStep[];
  modes: Record<SpecwrightMode, {
    artifacts: string[];
    maxContextFiles: number;
    maxOutputWords: number;
  }>;
}

export interface AgentCard {
  id: string;
  name: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
  rules: string[];
}

export interface CommandContext {
  cwd: string;
  runtime: "cli" | "omp";
  now: () => Date;
}

export interface CommandResult {
  ok: boolean;
  summary: string;
  filesCreated: string[];
  filesUpdated: string[];
  prompt?: string;
  statusText?: string;
  exitCode: 0 | 1;
}

export interface RuntimeAdapter {
  id: string;
  install(ctx: { cwd: string; force: boolean }): Promise<string[]>;
  renderPrompt(input: PromptInput): string;
}

export interface PromptInput {
  step: LifecycleStep | "scan" | "tasks";
  change?: ChangeState;
  config: SpecwrightConfig;
  cwd: string;
  taskId?: string;
}
