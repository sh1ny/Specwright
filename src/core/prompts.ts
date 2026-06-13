import type { ChangeState, LifecycleStep, PromptInput, SpecwrightAgentName, SpecwrightConfig } from "./types";

const LIFECYCLE_AGENT_BY_STEP = {
  research: "researcher",
  plan: "planner",
  execute: "executor",
  verify: "verifier",
} as const satisfies Partial<Record<LifecycleStep, SpecwrightAgentName>>;

export type RoutedLifecycleStep = keyof typeof LIFECYCLE_AGENT_BY_STEP;

export function renderLifecycleSpawnStrategy(input: {
  step: RoutedLifecycleStep;
  config: Pick<SpecwrightConfig, "agents">;
}): string {
  const agent = LIFECYCLE_AGENT_BY_STEP[input.step];
  const agentName = `specwright-${agent}`;
  const model = input.config.agents[agent].model;
  return `Lifecycle spawn strategy:
- You are the lifecycle orchestrator for this ${input.step} phase.
- Your first operational action is to delegate to \`${agentName}\` for the ${input.step} lifecycle work.
- Use the configured model \`${model}\` from \`agents.${agent}.model\`.
- Pass a worker assignment that includes the read-first files, rules, acceptance, and checkpoint instructions from this prompt, but excludes this Lifecycle spawn strategy section.
- The worker assignment MUST NOT tell the subagent that its first action is to delegate to another lifecycle agent, and MUST NOT include the blocker rule for missing lifecycle delegation.
- While the \`${agentName}\` subagent is active, do not perform implementation-file reads, code or artifact edits, test runs, artifact or status updates, or completion claims.
- Wait for the \`${agentName}\` result before editing artifacts, updating status, or reporting completion.
- If \`${agentName}\` or model \`${model}\` is unavailable, report a visible blocker naming the missing component and stop; do not proceed with direct inline work.
- Do not ask the user to switch agents manually and do not spawn recursive lifecycle agents.`;
}

export function renderSubagentRetryClause(): string {
  return "Subagent fallback:\n- Prefer lightweight/read-only scouts for mapping work.\n- If a scout/explore agent fails, cancels, returns null, or returns an unusable report, retry the same assignment once with the default task agent using the same read-only/no-project-wide-command constraints.\n- Record the retry in evidence.md under \"Research attempts\".\n- Do not declare blocked until the retry also fails or the missing fact is not available through tools.";
}

export function renderScanRetryClause(input: { retryArtifact: ".specwright/project/scan.md" | ".specwright/project/codebase-map.md" }): string {
  return [
    "Subagent fallback:",
    "- If delegated read-only mapping work fails, cancels, returns null, or returns an unusable report, retry the same assignment once with the default task agent using the same bounded/no-project-wide-command constraints.",
    `- Record the retry in ${input.retryArtifact} under Open questions.`,
    "- Do not declare blocked until the retry also fails or the missing fact is not available through tools.",
  ].join("\n");
}

export function renderContextBudget(config: PromptInput["config"]): string {
  return `Context budget:\n- max_context_files: ${config.defaults.maxContextFiles}\n- max_output_words: ${config.defaults.maxOutputWords}\n- Do not load full packs or unrelated docs.\n- Summarize sources; cite paths and URLs.`;
}

type CheckpointUnit = { kind: "phase" | "task"; id: string };

export function renderCheckpointClause(input: {
  change: Pick<ChangeState, "id" | "slug">;
  unit: CheckpointUnit;
  files: readonly string[];
}): string {
  const changeLabel = `${input.change.id}-${input.change.slug}`;
  const selector = input.unit.kind === "task" ? `--task ${input.unit.id}` : `--phase ${input.unit.id}`;
  const files = input.files.length > 0 ? input.files.join(",") : "<comma-separated-files-touched-for-this-unit>";
  return `Checkpoint:
- After this unit's verification passes, run \`specwright checkpoint ${changeLabel} ${selector} --summary '<concrete summary>' --files ${files}\`.
- Include every file changed for this unit and no unrelated files.
- Update task checkboxes/status only after verification passes.`;
}

export function renderStepPrompt(input: PromptInput): string {
  const changeLabel = input.change ? `${input.change.id}-${input.change.slug}` : "project";
  const taskLine = input.taskId ? `\nTask: ${input.taskId}` : "";
  return `# Specwright ${input.step}: ${changeLabel}${taskLine}\n\n${renderContextBudget(input.config)}\n\nRead only the current step artifacts and explicitly listed files. Do not load full packs or unrelated documentation.`;
}

type DiscussPromptInput = PromptInput & { change: NonNullable<PromptInput["change"]> };

export function renderDiscussPrompt(input: DiscussPromptInput): string {
  const changeLabel = `${input.change.id}-${input.change.slug}`;
  const artifactPath = `.specwright/changes/${changeLabel}`;
  return `# Specwright Discuss: ${changeLabel}

${renderContextBudget(input.config)}

The deterministic Specwright CLI has already prepared the discussion artifacts; do not run a stdin wizard, do not install or invoke a discusser agent, and do not create implementation tasks.

Read first:
- ${artifactPath}/discussion.md
- ${artifactPath}/intent.md
- ${artifactPath}/constraints.md
- ${artifactPath}/decisions.md

Discuss workflow:
- Inspect bounded local evidence before asking. Read only the files needed to understand the change and cite concise path evidence in the conversation.
- Identify 3-4 change-specific gray areas where a user decision changes the plan, scope, constraints, or acceptance criteria.
- Ask the user before writing final artifacts. Do not silently fill intent, constraints, or decisions from assumptions.
- Use structured clarification when available:
  - use multi-select for gray-area selection;
  - set recommended defaults when one option is the safest or most conventional;
  - keep option descriptions concise and tradeoff-oriented;
  - group related questions in one interaction where useful.
- If structured clarification is unavailable, or if the user selects freeform input, ask numbered plain-text options and wait for the user's answer before proceeding.
- After each completed gray area, write a short checkpoint to discussion.md capturing the question, settled answer, and source evidence.
- Update intent.md, constraints.md, and decisions.md only after the relevant answers are settled; keep any frozen-after-approval block intact.
- End with either \`Ready for research\` or the remaining load-bearing questions.`;
}

export interface ScanValidationIssue {
  level: string;
  code: string;
  message: string;
}

export interface ScanDeterministicSummary {
  indexUpdated: boolean;
  scannedFiles: number;
  indexedFiles: number;
  truncated: boolean;
  staleFiles: string[];
  validationIssues: ScanValidationIssue[];
  rebuiltFromValidationErrors?: boolean;
}

export interface ScanPromptInput {
  config: PromptInput["config"];
  map: boolean;
  refresh: boolean;
  deterministicSummary: ScanDeterministicSummary;
}

export function renderScanPrompt(input: ScanPromptInput): string {
  const isMap = input.map;
  const isRefresh = input.refresh;
  const summary = input.deterministicSummary;
  const focus = isRefresh
    ? isMap
      ? "Refresh the codebase map by patching stale prose sections. Do not rewrite unaffected sections."
      : "Refresh the project intelligence prose by patching stale sections. Do not rewrite unaffected sections."
    : isMap
      ? "Focus only on codebase mapping for this run."
      : "Inspect the repository and update the project intelligence prose files.";
  const proseArtifacts = [
    "- .specwright/project/scan.md",
    "- .specwright/project/tech-stack.md",
    "- .specwright/project/architecture.md",
    "- .specwright/project/codebase-map.md",
  ];
  const mapArtifacts = ["- .specwright/project/codebase-map.md"];
  const artifacts = isMap ? mapArtifacts : proseArtifacts;

  const deterministicState = [
    "Deterministic index state:",
    `- codebase-index.json updated: ${summary.indexUpdated}`,
    `- Files scanned: ${summary.scannedFiles}`,
    `- Files indexed: ${summary.indexedFiles}`,
    `- Truncated/capped: ${summary.truncated ? "yes" : "no"}`,
  ];
  if (summary.staleFiles.length > 0) {
    deterministicState.push(`- Stale files: ${summary.staleFiles.length}\n${summary.staleFiles.map((line) => `  - ${line}`).join("\n")}`);
  } else {
    deterministicState.push("- Stale files: none");
  }
  if (summary.rebuiltFromValidationErrors) {
    deterministicState.push("- Hard validation errors in the existing codebase-index.json caused a scratch rebuild; semantic fields from the invalid index were not preserved.");
  }
  if (summary.validationIssues.length > 0) {
    deterministicState.push(
      `- Validation issues: ${summary.validationIssues.length}\n${summary.validationIssues.map((issue) => `  - ${issue.level.toUpperCase()} ${issue.code}: ${issue.message}`).join("\n")}`
    );
  }

  const ownershipBoundary = [
    "Ownership boundary:",
    "- Command-owned (do not edit): .specwright/project/codebase-index.json, fingerprints, file inventory, package scripts, entrypoints, modules, tests, commands, verification, and cap/truncation risks.",
    "- Agent-owned (edit these): scan.md, tech-stack.md, architecture.md, codebase-map.md.",
  ];

  const agentContract = [
    "Agent contract:",
    "- Update the agent-owned prose artifacts based on current code.",
    "- Preserve existing confirmed facts unless current code contradicts them.",
    "- Record uncertainty, assumptions, and gaps in the Open questions section, not as fact.",
    "- Never author, paste, or hand-edit fingerprints or `codebase-index.json`.",
  ];

  const discoveryInstructions = [
    "Discovery instructions:",
    "- Use file discovery (find) to identify top-level structure.",
    "- Use search and LSP when available to locate entrypoints, exported commands, runtime adapters, config defaults, validators, and tests.",
    "- Read only relevant sections; do not load full packs or unrelated documentation.",
  ].join("\n");

  const refreshNote = isRefresh
    ? "\n\nRefresh run: use the deterministic index state above to identify changed areas and patch only the stale prose sections."
    : "";

  const retryArtifact = isMap ? ".specwright/project/codebase-map.md" : ".specwright/project/scan.md";
  return `# Specwright Scan\n\n${renderContextBudget(input.config)}\n\n${focus}\n\n${deterministicState.join("\n")}\n\n${ownershipBoundary.join("\n")}\n\n${agentContract.join("\n")}\n\nUpdate these files:\n${artifacts.join("\n")}${refreshNote}\n\n${discoveryInstructions}\n\n${renderScanRetryClause({ retryArtifact })}`;
}
