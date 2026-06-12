import type { ChangeState, PromptInput, SpecwrightConfig } from "../../core/types";
import type { RoutedLifecycleStep, ScanPromptInput } from "../../core/prompts";
import { renderScanPrompt } from "../../core/prompts";

const LIFECYCLE_AGENT_BY_STEP = {
  research: "researcher",
  plan: "planner",
  execute: "executor",
  verify: "verifier",
} as const;

export function renderOmpLifecycleSpawnStrategy(input: {
  step: RoutedLifecycleStep;
  config: Pick<SpecwrightConfig, "agents">;
}): string {
  const agent = LIFECYCLE_AGENT_BY_STEP[input.step];
  const agentName = `specwright-${agent}`;
  const model = input.config.agents[agent].model;
  return `Lifecycle spawn strategy:
- You are the lifecycle orchestrator for this ${input.step} phase.
- Your first operational action is to use OMP's \`task\` tool to spawn \`${agentName}\` for the ${input.step} lifecycle work.
- Route to configured model \`${model}\` from \`agents.${agent}.model\`.
- Pass a worker assignment that includes the read-first files, rules, acceptance, and checkpoint instructions from this prompt, but excludes this Lifecycle spawn strategy section.
- The worker assignment MUST NOT tell the subagent that its first action is to spawn another lifecycle agent, and MUST NOT include the blocker rule for missing lifecycle delegation.
- While the \`${agentName}\` subagent is active, do not perform implementation-file reads, code or artifact edits, test runs, artifact or status updates, or completion claims.
- Wait for the \`${agentName}\` result before editing artifacts, updating status, or reporting completion.
- If the \`task\` tool, \`${agentName}\`, or model \`${model}\` is unavailable, report a visible blocker naming the missing component and stop; do not proceed with direct inline work.
- Do not ask the user to switch agents manually and do not spawn recursive lifecycle agents.`;
}

export function renderOmpSubagentRetryClause(): string {
  return "Subagent fallback:\n- Prefer lightweight/read-only scouts for mapping work.\n- If a scout/explore agent fails, cancels, returns null, or returns an unusable report, retry the same assignment once with OMP's bundled `task` agent using the same read-only/no-project-wide-command constraints.\n- Record the retry in evidence.md under \"Research attempts\".\n- Do not declare blocked until the retry also fails or the missing fact is not available through tools.";
}
export function renderOmpScanPrompt(input: ScanPromptInput): string {
  return `${renderScanPrompt(input)}

OMP map guidance:
- When mapping larger repositories, prefer parallel read-only scouts via OMP's \`task\` tool.
- Split scouts by subsystem:
  - CLI and command kernel
  - state, config, and validators
  - runtime adapters
  - packs, templates, and agents
  - tests
- Give each scout the bounded discovery and mapping contract from this prompt, scoped to its subsystem.
- Merge scout findings into \`codebase-map.md\` and \`codebase-index.json\`; preserve confirmed facts and record uncertainty in Open questions.
- If the \`task\` tool or scout agents are unavailable, fall back to sequential mapping with the same bounded constraints.`;
}

type OmpDiscussPromptInput = PromptInput & { change: NonNullable<PromptInput["change"]> };

export function renderOmpDiscussPrompt(input: OmpDiscussPromptInput): string {
  const changeLabel = `${input.change.id}-${input.change.slug}`;
  const artifactPath = `.specwright/changes/${changeLabel}`;
  return `# Specwright Discuss: ${changeLabel}

Context budget:
- max_context_files: ${input.config.defaults.maxContextFiles}
- max_output_words: ${input.config.defaults.maxOutputWords}
- Do not load full packs or unrelated docs.
- Summarize sources; cite paths and URLs.

You are the receiving OMP agent for this prompt. The deterministic Specwright CLI has already prepared the discussion artifacts; do not run a stdin wizard, do not install or invoke a discusser agent, and do not create implementation tasks.

Read first:
- ${artifactPath}/discussion.md
- ${artifactPath}/intent.md
- ${artifactPath}/constraints.md
- ${artifactPath}/decisions.md

Discuss workflow:
- Inspect bounded local evidence before asking. Read only the files needed to understand the change and cite concise path evidence in the conversation.
- Identify 3-4 change-specific gray areas where a user decision changes the plan, scope, constraints, or acceptance criteria.
- Ask the user before writing final artifacts. Do not silently fill intent, constraints, or decisions from assumptions.
- Use Oh My Pi \`ask\` for structured clarification when available:
  - use \`multi: true\` for gray-area selection;
  - set \`recommended\` defaults when one option is the safest or most conventional;
  - keep option descriptions concise and tradeoff-oriented;
  - group related \`questions\` in one ask call where useful.
- If \`ask\` is unavailable, or if the user selects freeform input, ask numbered plain-text options and wait for the user's answer before proceeding.
- After each completed gray area, write a short checkpoint to discussion.md capturing the question, settled answer, and source evidence.
- Update intent.md, constraints.md, and decisions.md only after the relevant answers are settled; keep any frozen-after-approval block intact.
- End with either \`Ready for research\` or the remaining load-bearing questions.`;
}
