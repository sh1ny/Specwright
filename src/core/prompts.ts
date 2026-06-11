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
