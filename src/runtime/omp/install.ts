import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { defaultConfig } from "../../core/state";
import type { SpecwrightAgentName, SpecwrightConfig } from "../../core/types";
import { ompAgentsDir, ompExtensionDir, ompRulesDir } from "../../core/paths";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeOwned(path: string, content: string, force: boolean): Promise<string | undefined> {
  if (!force && await exists(path)) {
    return undefined;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return path;
}

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

async function extensionIndexContent(cwd: string): Promise<string> {
  const relativeTarget = join(ompExtensionDir(cwd), "..", "..", "..", "src", "runtime", "omp", "extension.ts");
  if (await exists(relativeTarget)) {
    return 'export { default } from "../../../src/runtime/omp/extension";\n';
  }
  const sourceUrl = pathToFileURL(join(packageRoot(), "src", "runtime", "omp", "extension.ts")).href;
  return `export { default } from ${JSON.stringify(sourceUrl)};\n`;
}

const PACKAGE_JSON = `{
  "name": "specwright-omp-extension",
  "private": true,
  "type": "module",
  "omp": {
    "extensions": ["./index.ts"]
  }
}
`;

const WORKFLOW_RULE = `---
description: Keep Specwright artifacts current when working inside a Specwright project.
globs:
  - "**/*"
alwaysApply: true
---

When \`.specwright/\` exists, treat its files as source-of-truth workflow artifacts. Do not claim a Specwright change is planned, implemented, verified, or handed off unless the matching \`.specwright/changes/<id>-<slug>/\` artifact was updated or intentionally left unchanged with evidence.
`;

interface AgentDefinition {
  fileName: string;
  name: string;
  description: string;
  tools: string;
  body: string;
}

const AGENT_DEFINITIONS: Record<SpecwrightAgentName, AgentDefinition> = {
  researcher: {
    fileName: "specwright-researcher.md",
    name: "specwright-researcher",
    description: "Researches local repo evidence and online sources for one Specwright change.",
    tools: "read,grep,find,lsp,web_search",
    body: `Role: Research capability, not a persona.
Goal: fill research.md, sources.md, evidence.md, and options.md with grounded facts.
Rules:
- Read local code/docs before using web_search.
- Use web_search only when the workflow online mode permits it.
- Prefer primary sources and cite URLs.
- Summarize evidence; do not paste full source documents.
- If a lightweight scout fails or returns unusable output, retry the same assignment once with the bundled task agent and record that retry in evidence.md.
`,
  },
  planner: {
    fileName: "specwright-planner.md",
    name: "specwright-planner",
    description: "Converts Specwright intent and research evidence into a decision-complete plan and tasks.",
    tools: "read,grep,find,lsp",
    body: `Role: Planning capability, not a persona.
Goal: produce plan.md and tasks.md from intent.md, constraints.md, research.md, and evidence.md.
Rules:
- No implementation.
- Every task has ID, files, action, acceptance, and verification.
- Cite evidence.md for load-bearing claims.
- Keep tasks small enough for task-scoped handoff.
`,
  },
  executor: {
    fileName: "specwright-executor.md",
    name: "specwright-executor",
    description: "Implements exactly one Specwright task from a task-scoped handoff.",
    tools: "read,grep,find,lsp,edit,write,bash,todo",
    body: `Role: Execution capability, not a persona.
Goal: implement one assigned T### task and verify that task.
Rules:
- Implement the assigned task only.
- Do not broaden scope or rewrite unrelated code.
- Update tasks.md only after verification for the task passes.
- If the plan is invalid, stop and record the blocking fact in decisions.md.
`,
  },
  verifier: {
    fileName: "specwright-verifier.md",
    name: "specwright-verifier",
    description: "Verifies a Specwright change against its acceptance criteria and observed command output.",
    tools: "read,grep,find,lsp,bash,browser",
    body: `Role: Verification capability, not a persona.
Goal: prove or disprove that the change satisfies tasks.md and verify.md.
Rules:
- Run the smallest checks that exercise the changed behavior.
- Record exact commands and observed outputs in verify.md.
- Do not mark done when only build/typecheck passed unless the task acceptance is only build/typecheck.
`,
  },
};

function renderAgent(definition: AgentDefinition, model: string): string {
  return `---
name: ${definition.name}
description: ${definition.description}
model: ${model}
tools: ${definition.tools}
spawns: []
---

${definition.body}`;
}

export async function installOmpAdapter(input: { cwd: string; force: boolean; config?: Pick<SpecwrightConfig, "agents"> }): Promise<string[]> {
  const changed: string[] = [];
  const extensionDir = ompExtensionDir(input.cwd);
  const config = input.config ?? defaultConfig(basename(input.cwd));
  const writes: Array<[string, string]> = [
    [join(extensionDir, "package.json"), PACKAGE_JSON],
    [join(extensionDir, "index.ts"), await extensionIndexContent(input.cwd)],
    [join(ompRulesDir(input.cwd), "specwright-workflow.md"), WORKFLOW_RULE],
  ];

  for (const agentName of Object.keys(AGENT_DEFINITIONS) as SpecwrightAgentName[]) {
    const definition = AGENT_DEFINITIONS[agentName];
    writes.push([join(ompAgentsDir(input.cwd), definition.fileName), renderAgent(definition, config.agents[agentName].model)]);
  }

  for (const [path, content] of writes) {
    const written = await writeOwned(path, content, input.force);
    if (written) {
      changed.push(relative(input.cwd, written));
    }
  }
  return changed;
}
