import { mkdir, readFile, writeFile } from "node:fs/promises";
import { projectArtifactPath, projectDir, isEnoent } from "./paths";
import { loadState, saveState } from "./state";
import type {
  LearningEntry,
  MilestoneStage,
  MilestoneState,
  ProgressEntry,
  ProgressKind,
  ProjectState,
  RoadmapItemState,
  RoadmapItemStatus,
} from "./types";


export const PROJECT_ARTIFACTS = {
  roadmap: "roadmap.md",
  milestones: "milestones.md",
  currentMilestone: "current-milestone.md",
  progress: "progress.md",
  learnings: "learnings.md",
} as const;

const ROADMAP_STATUS: Record<RoadmapItemStatus, true> = {
  planned: true,
  active: true,
  shipped: true,
  cut: true,
};
const MILESTONE_STATUS: Record<MilestoneState["status"], true> = {
  planned: true,
  active: true,
  completed: true,
  cut: true,
};
const MILESTONE_STAGES: Record<MilestoneStage, true> = {
  scoping: true,
  building: true,
  stabilizing: true,
  shipped: true,
};
const PROGRESS_KINDS: Record<ProgressKind, true> = {
  note: true,
  decision: true,
  blocker: true,
  metric: true,
};

const ROADMAP_ITEM_PATTERN = /^\s*-\s*\[\s*(\w+)\s*\]\s*(R\d{3}):\s*(.+?)\s*$/;
const MILESTONE_PATTERN = /^\s*-\s*\[\s*(\w+)\s*\]\s*(M\d{3}):\s*(.+?)\s*$/;
const PROGRESS_PATTERN = /^\s*-\s*(P\d{4})\s*\[\s*(\w+)\s*\]\s*(\S+):\s*(.+?)\s*$/;
const LEARNING_PATTERN = /^\s*-\s*(L\d{4})\s*(\S+):\s*(.+?)\s*$/;
const METADATA_PATTERN = /^\s+-\s*(\w+):\s*(.*)$/;
const CURRENT_MILESTONE_PATTERN = /^Milestone:\s*(\S.*?)\s*$/;

const ROADMAP_TEMPLATE = "# Roadmap\n\n## Items\n\n";
const MILESTONES_TEMPLATE = "# Milestones\n\n## Items\n\n";
const CURRENT_MILESTONE_TEMPLATE = "# Current Milestone\n\nMilestone: none\n";
const PROGRESS_TEMPLATE = "# Progress\n\n## Entries\n\n";
const LEARNINGS_TEMPLATE = "# Learnings\n\n## Entries\n\n";

export interface ProjectArtifactIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  file: string;
}

export interface ProjectSyncResult {
  project: ProjectState;
  issues: ProjectArtifactIssue[];
  changed: boolean;
  filesCreated: string[];
  filesUpdated: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function extractCanonicalSection(
  markdown: string,
  header: string,
): { found: boolean; leading: string; body: string; trailing: string } {
  const lines = markdown.split("\n");
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if ((lines[i] ?? "").trim() === header) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) {
    return { found: false, leading: markdown, body: "", trailing: "" };
  }
  let endIndex = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (/^#{1,2}\s/.test(lines[i] ?? "")) {
      endIndex = i;
      break;
    }
  }
  const leading = lines.slice(0, headerIndex + 1).join("\n");
  const body = lines.slice(headerIndex + 1, endIndex).join("\n");
  const trailing = lines.slice(endIndex).join("\n");
  return { found: true, leading, body, trailing };
}

function issue(level: ProjectArtifactIssue["level"], code: string, message: string, file: string): ProjectArtifactIssue {
  return { level, code, message, file };
}

function parseMetadataBody(lines: readonly string[], startIndex: number): { metadata: Record<string, string>; nextIndex: number } {
  const metadata: Record<string, string> = {};
  let index = startIndex;
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.startsWith(" ")) break;
    const match = METADATA_PATTERN.exec(line);
    if (!match) continue;
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key && value) {
      metadata[key.toLowerCase()] = value;
    }
  }
  return { metadata, nextIndex: index };
}

export function defaultProjectState(now: Date): ProjectState {
  return {
    version: 1,
    roadmapItems: {},
    roadmapOrder: [],
    milestones: {},
    milestoneOrder: [],
    progress: {},
    progressOrder: [],
    learnings: {},
    learningOrder: [],
    updatedAt: now.toISOString(),
  };
}

export function parseRoadmapMarkdown(
  markdown: string,
  now: Date,
): { items: RoadmapItemState[]; order: string[]; issues: ProjectArtifactIssue[] } {
  const { body } = extractCanonicalSection(markdown, "## Items");
  const items: RoadmapItemState[] = [];
  const order: string[] = [];
  const issues: ProjectArtifactIssue[] = [];
  const seen = new Set<string>();
  const lines = body.split("\n");
  const updatedAt = now.toISOString();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = ROADMAP_ITEM_PATTERN.exec(line);
    if (!match) {
      if (line.trim().startsWith("- [")) {
        issues.push(issue("error", "SW200", `Malformed roadmap item line ${i + 1}: ${line.trim()}`, PROJECT_ARTIFACTS.roadmap));
      }
      continue;
    }
    const status = match[1] as RoadmapItemStatus;
    const id = match[2];
    const title = (match[3] ?? "").trim();
    if (!id) continue;
    if (!status || !ROADMAP_STATUS[status]) {
      issues.push(issue("error", "SW202", `Invalid roadmap status "${status ?? ""}" for ${id}.`, PROJECT_ARTIFACTS.roadmap));
    }

    const { metadata } = parseMetadataBody(lines, i + 1);
    const milestoneId = metadata.milestone;
    const changeId = metadata.change;

    if (seen.has(id)) {
      issues.push(issue("error", "SW201", `Duplicate roadmap item ID ${id}.`, PROJECT_ARTIFACTS.roadmap));
    }
    seen.add(id);
    order.push(id);
    const item: RoadmapItemState = {
      id,
      title: title || id,
      status: status && ROADMAP_STATUS[status] ? status : "planned",
      updatedAt,
    };
    if (milestoneId) item.milestoneId = milestoneId;
    if (changeId) item.changeId = changeId;
    items.push(item);
  }

  return { items, order, issues };
}

export function parseMilestonesMarkdown(
  markdown: string,
  now: Date,
): { milestones: MilestoneState[]; order: string[]; issues: ProjectArtifactIssue[] } {
  const { body } = extractCanonicalSection(markdown, "## Items");
  const milestones: MilestoneState[] = [];
  const order: string[] = [];
  const issues: ProjectArtifactIssue[] = [];
  const seen = new Set<string>();
  const lines = body.split("\n");
  const updatedAt = now.toISOString();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = MILESTONE_PATTERN.exec(line);
    if (!match) {
      if (line.trim().startsWith("- [")) {
        issues.push(issue("error", "SW205", `Malformed milestone line ${i + 1}: ${line.trim()}`, PROJECT_ARTIFACTS.milestones));
      }
      continue;
    }
    const status = match[1] as MilestoneState["status"];
    const id = match[2];
    if (!id) continue;
    const title = (match[3] ?? "").trim();
    if (!status || !MILESTONE_STATUS[status]) {
      issues.push(issue("error", "SW207", `Invalid milestone status "${status ?? ""}" for ${id}.`, PROJECT_ARTIFACTS.milestones));
    }

    const { metadata } = parseMetadataBody(lines, i + 1);
    let stage: MilestoneStage = (metadata.stage as MilestoneStage) ?? "scoping";
    const hasStage = metadata.stage !== undefined;

    if (!hasStage) {
      issues.push(issue("warning", "SW207", `Milestone ${id} omits Stage:; defaulting to scoping.`, PROJECT_ARTIFACTS.milestones));
    }
    if (!stage || !MILESTONE_STAGES[stage]) {
      issues.push(issue("error", "SW207", `Invalid milestone stage "${stage ?? ""}" for ${id}.`, PROJECT_ARTIFACTS.milestones));
      stage = "scoping";
    }

    const roadmapItemIds = (metadata.roadmap ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);


    if (seen.has(id)) {
      issues.push(issue("error", "SW206", `Duplicate milestone ID ${id}.`, PROJECT_ARTIFACTS.milestones));
    }
    seen.add(id);
    order.push(id);
    const milestone: MilestoneState = {
      id,
      title: title || id,
      status: status && MILESTONE_STATUS[status] ? status : "planned",
      stage: stage && MILESTONE_STAGES[stage] ? stage : "scoping",
      roadmapItemIds,
      updatedAt,
    };
    milestones.push(milestone);
  }

  return { milestones, order, issues };
}

export function parseCurrentMilestoneMarkdown(markdown: string): { currentMilestoneId?: string; issues: ProjectArtifactIssue[] } {
  const lines = markdown.split("\n");
  const issues: ProjectArtifactIssue[] = [];
  for (const line of lines) {
    const match = CURRENT_MILESTONE_PATTERN.exec(line);
    if (!match) continue;
    const value = (match[1] ?? "").trim();
    if (value.toLowerCase() === "none") {
      return { issues };
    }
    if (!/^M\d{3}$/.test(value)) {
      issues.push(issue("error", "SW209", `Invalid current milestone "${value}".`, PROJECT_ARTIFACTS.currentMilestone));
      return { issues };
    }
    return { currentMilestoneId: value, issues };
  }
  issues.push(issue("error", "SW209", "Current milestone section missing Milestone: line.", PROJECT_ARTIFACTS.currentMilestone));
  return { issues };
}

export function parseProgressMarkdown(
  markdown: string,
  now: Date,
): { entries: ProgressEntry[]; order: string[]; issues: ProjectArtifactIssue[] } {
  const { body } = extractCanonicalSection(markdown, "## Entries");
  const entries: ProgressEntry[] = [];
  const order: string[] = [];
  const issues: ProjectArtifactIssue[] = [];
  const seen = new Set<string>();
  const lines = body.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = PROGRESS_PATTERN.exec(line);
    if (!match) {
      if (line.trim().startsWith("- P")) {
        issues.push(issue("error", "SW211", `Malformed progress entry line ${i + 1}: ${line.trim()}`, PROJECT_ARTIFACTS.progress));
      }
      continue;
    }
    const id = match[1];
    const kind = match[2] as ProgressKind;
    const at = (match[3] ?? "").trim();
    const text = (match[4] ?? "").trim();
    if (!id) continue;

    if (!kind || !PROGRESS_KINDS[kind]) {
      issues.push(issue("error", "SW211", `Invalid progress kind "${kind ?? ""}" for ${id ?? ""}.`, PROJECT_ARTIFACTS.progress));
    }

    const { metadata } = parseMetadataBody(lines, i + 1);
    const milestoneId = metadata.milestone;
    const roadmapItemId = metadata.roadmap;
    const changeId = metadata.change;

    if (seen.has(id)) {
      issues.push(issue("error", "SW211", `Duplicate progress entry ID ${id}.`, PROJECT_ARTIFACTS.progress));
    }
    seen.add(id);
    order.push(id);
    const entry: ProgressEntry = {
      id,
      kind: kind && PROGRESS_KINDS[kind] ? kind : "note",
      text: text || id,
      at,
    };
    if (milestoneId) entry.milestoneId = milestoneId;
    if (roadmapItemId) entry.roadmapItemId = roadmapItemId;
    if (changeId) entry.changeId = changeId;
    entries.push(entry);
  }

  return { entries, order, issues };
}

export function parseLearningsMarkdown(
  markdown: string,
  now: Date,
): { entries: LearningEntry[]; order: string[]; issues: ProjectArtifactIssue[] } {
  const { body } = extractCanonicalSection(markdown, "## Entries");
  const entries: LearningEntry[] = [];
  const order: string[] = [];
  const issues: ProjectArtifactIssue[] = [];
  const seen = new Set<string>();
  const lines = body.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = LEARNING_PATTERN.exec(line);
    if (!match) {
      if (line.trim().startsWith("- L")) {
        issues.push(issue("error", "SW213", `Malformed learning entry line ${i + 1}: ${line.trim()}`, PROJECT_ARTIFACTS.learnings));
      }
      continue;
    }
    const id = match[1];
    const at = (match[2] ?? "").trim();
    const rawText = (match[3] ?? "").trim();
    if (!id) continue;

    let topic: string;
    let summary: string;
    if (rawText.includes(" — ")) {
      const splitIndex = rawText.indexOf(" — ");
      topic = rawText.slice(0, splitIndex).trim();
      summary = rawText.slice(splitIndex + 3).trim();
    } else {
      topic = rawText;
      summary = "";
    }

    const { metadata } = parseMetadataBody(lines, i + 1);
    const source = metadata.source;

    if (!id) continue;
    if (seen.has(id)) {
      issues.push(issue("error", "SW214", `Duplicate learning ID ${id}.`, PROJECT_ARTIFACTS.learnings));
    }
    seen.add(id);
    order.push(id);
    const entry: LearningEntry = {
      id,
      topic: topic || id,
      summary,
      at,
    };
    if (source) entry.source = source;
    entries.push(entry);
  }

  return { entries, order, issues };
}

function normalizeRoadmapMilestoneLinks(
  project: ProjectState,
  issues: ProjectArtifactIssue[],
): ProjectState {
  const orderedMilestoneIds = [
    ...project.milestoneOrder.filter((id) => project.milestones[id]),
    ...Object.keys(project.milestones).filter((id) => !project.milestoneOrder.includes(id)),
  ];
  const orderedMilestones = orderedMilestoneIds.map((id) => project.milestones[id]!);

  // Pass 1: add reverse links for items that already declare a valid milestone.
  for (const item of Object.values(project.roadmapItems)) {
    const milestone = item.milestoneId ? project.milestones[item.milestoneId] : undefined;
    if (milestone) {
      if (!milestone.roadmapItemIds.includes(item.id)) {
        milestone.roadmapItemIds.push(item.id);
        issues.push(
          issue(
            "warning",
            "SW208",
            `Roadmap item ${item.id} references milestone ${item.milestoneId} but milestone does not list it; normalized.`,
            PROJECT_ARTIFACTS.roadmap,
          ),
        );
      }
    }
  }

  // Pass 2: prune claims that conflict with an item's authoritative milestone.
  for (const milestone of orderedMilestones) {
    milestone.roadmapItemIds = milestone.roadmapItemIds.filter((itemId) => {
      const item = project.roadmapItems[itemId];
      if (!item) {
        issues.push(issue("error", "SW208", `Milestone ${milestone.id} references missing roadmap item ${itemId}.`, PROJECT_ARTIFACTS.milestones));
        return false;
      }
      if (item.milestoneId && item.milestoneId !== milestone.id) {
        issues.push(
          issue(
            "warning",
            "SW203",
            `Milestone ${milestone.id} lists roadmap item ${itemId} but item references ${item.milestoneId}; removed.`,
            PROJECT_ARTIFACTS.milestones,
          ),
        );
        return false;
      }
      return true;
    });
  }

  // Pass 3: assign first remaining claim (milestone parse order) to items with no milestone.
  const claimedBy = new Map<string, string>();
  for (const milestone of orderedMilestones) {
    for (const itemId of milestone.roadmapItemIds) {
      const item = project.roadmapItems[itemId];
      if (!item) continue;
      if (item.milestoneId) continue;
      item.milestoneId = milestone.id;
      claimedBy.set(itemId, milestone.id);
      issues.push(
        issue(
          "warning",
          "SW208",
          `Roadmap item ${itemId} has no milestone reference but is listed in ${milestone.id}; normalized.`,
          PROJECT_ARTIFACTS.roadmap,
        ),
      );
    }
  }

  // Pass 4: remove any duplicate claims left after assignment.
  for (const milestone of orderedMilestones) {
    milestone.roadmapItemIds = milestone.roadmapItemIds.filter((itemId) => {
      if (!claimedBy.has(itemId)) return true;
      const ownerId = claimedBy.get(itemId);
      if (ownerId === milestone.id) return true;
      issues.push(
        issue(
          "warning",
          "SW203",
          `Roadmap item ${itemId} is already owned by ${ownerId}; removed from ${milestone.id}.`,
          PROJECT_ARTIFACTS.milestones,
        ),
      );
      return false;
    });
  }

  return project;
}

export function renderRoadmapMarkdown(existing: string | undefined, project: ProjectState): string {
  const source = existing ?? ROADMAP_TEMPLATE;
  const { found, leading, trailing } = extractCanonicalSection(source, "## Items");
  const effectiveLeading = found ? leading : ROADMAP_TEMPLATE.trimEnd();
  const lines = [effectiveLeading];
  for (const id of project.roadmapOrder) {
    const item = project.roadmapItems[id];
    if (!item) continue;
    lines.push(`- [${item.status}] ${item.id}: ${item.title}`);
    if (item.milestoneId) lines.push(`  - Milestone: ${item.milestoneId}`);
    if (item.changeId) lines.push(`  - Change: ${item.changeId}`);
  }
  if (trailing.trim()) {
    lines.push("");
    lines.push(trailing.trim());
  }
  return lines.join("\n") + "\n";
}

export function renderMilestonesMarkdown(existing: string | undefined, project: ProjectState): string {
  const source = existing ?? MILESTONES_TEMPLATE;
  const { found, leading, trailing } = extractCanonicalSection(source, "## Items");
  const effectiveLeading = found ? leading : MILESTONES_TEMPLATE.trimEnd();
  const lines = [effectiveLeading];
  for (const id of project.milestoneOrder) {
    const milestone = project.milestones[id];
    if (!milestone) continue;
    lines.push(`- [${milestone.status}] ${milestone.id}: ${milestone.title}`);
    lines.push(`  - Stage: ${milestone.stage}`);
    if (milestone.roadmapItemIds.length > 0) {
      lines.push(`  - Roadmap: ${milestone.roadmapItemIds.join(", ")}`);
    }
  }
  if (trailing.trim()) {
    lines.push("");
    lines.push(trailing.trim());
  }
  return lines.join("\n") + "\n";
}
export function renderCurrentMilestoneMarkdown(existing: string | undefined, project: ProjectState): string {
  const value = project.currentMilestoneId ?? "none";
  if (!existing) {
    return `${CURRENT_MILESTONE_TEMPLATE.split("\n").slice(0, 2).join("\n")}\nMilestone: ${value}\n`;
  }
  const lines = existing.split("\n");
  const filtered = lines.filter((line) => !/^Milestone:\s*/.test(line));
  let result = filtered.join("\n").trimEnd();
  if (result) result += "\n";
  return `${result}Milestone: ${value}\n`;
}
export function renderProgressMarkdown(existing: string | undefined, project: ProjectState): string {
  const source = existing ?? PROGRESS_TEMPLATE;
  const { found, leading, trailing } = extractCanonicalSection(source, "## Entries");
  const effectiveLeading = found ? leading : PROGRESS_TEMPLATE.trimEnd();
  const lines = [effectiveLeading];
  for (const id of project.progressOrder) {
    const entry = project.progress[id];
    if (!entry) continue;
    lines.push(`- ${entry.id} [${entry.kind}] ${entry.at}: ${entry.text}`);
    if (entry.milestoneId) lines.push(`  - Milestone: ${entry.milestoneId}`);
    if (entry.roadmapItemId) lines.push(`  - Roadmap: ${entry.roadmapItemId}`);
    if (entry.changeId) lines.push(`  - Change: ${entry.changeId}`);
  }
  if (trailing.trim()) {
    lines.push("");
    lines.push(trailing.trim());
  }
  return lines.join("\n") + "\n";
}

export function renderLearningsMarkdown(existing: string | undefined, project: ProjectState): string {
  const source = existing ?? LEARNINGS_TEMPLATE;
  const { found, leading, trailing } = extractCanonicalSection(source, "## Entries");
  const effectiveLeading = found ? leading : LEARNINGS_TEMPLATE.trimEnd();
  const lines = [effectiveLeading];
  for (const id of project.learningOrder) {
    const entry = project.learnings[id];
    if (!entry) continue;
    const text = entry.summary ? `${entry.topic} — ${entry.summary}` : entry.topic;
    lines.push(`- ${entry.id} ${entry.at}: ${text}`);
    if (entry.source) lines.push(`  - Source: ${entry.source}`);
  }
  if (trailing.trim()) {
    lines.push("");
    lines.push(trailing.trim());
  }
  return lines.join("\n") + "\n";
}

async function readArtifact(cwd: string, name: string): Promise<string | undefined> {
  try {
    return await readFile(projectArtifactPath(cwd, name), "utf8");
  } catch (error) {
    if (isEnoent(error)) return undefined;
    throw error;
  }
}

async function writeArtifact(cwd: string, name: string, content: string): Promise<boolean> {
  const path = projectArtifactPath(cwd, name);
  let existing: string | undefined;
  try {
    existing = await readFile(path, "utf8");
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
  if (existing === content) return false;
  await mkdir(projectDir(cwd), { recursive: true });
  await writeFile(path, content, "utf8");
  return true;
}

export async function ensureProjectStateArtifacts(cwd: string): Promise<{ filesCreated: string[]; filesUpdated: string[] }> {
  const filesCreated: string[] = [];
  const filesUpdated: string[] = [];
  await mkdir(projectDir(cwd), { recursive: true });
  for (const [name, template] of Object.entries({
    [PROJECT_ARTIFACTS.roadmap]: ROADMAP_TEMPLATE,
    [PROJECT_ARTIFACTS.milestones]: MILESTONES_TEMPLATE,
    [PROJECT_ARTIFACTS.currentMilestone]: CURRENT_MILESTONE_TEMPLATE,
    [PROJECT_ARTIFACTS.progress]: PROGRESS_TEMPLATE,
    [PROJECT_ARTIFACTS.learnings]: LEARNINGS_TEMPLATE,
  })) {
    const path = projectArtifactPath(cwd, name);
    let existed = false;
    try {
      await readFile(path, "utf8");
      existed = true;
    } catch (error) {
      if (!isEnoent(error)) throw error;
    }
    if (!existed) {
      await writeFile(path, template, "utf8");
      filesCreated.push(path);
    }
  }
  return { filesCreated, filesUpdated };
}

function validateProjectCrossReferences(
  project: ProjectState,
  changes: Record<string, unknown>,
  issues: ProjectArtifactIssue[],
): void {
  let activeMilestoneCount = 0;
  for (const milestone of Object.values(project.milestones)) {
    if (milestone.status === "active") activeMilestoneCount += 1;
  }
  if (activeMilestoneCount > 1) {
    issues.push(issue("error", "SW210", `Multiple active milestones found (${activeMilestoneCount}).`, PROJECT_ARTIFACTS.milestones));
  }
  if (project.currentMilestoneId) {
    const current = project.milestones[project.currentMilestoneId];
    if (!current) {
      issues.push(issue("error", "SW209", `Current milestone ${project.currentMilestoneId} does not exist.`, PROJECT_ARTIFACTS.currentMilestone));
    } else if (current.status !== "active") {
      issues.push(issue("error", "SW209", `Current milestone ${project.currentMilestoneId} is ${current.status}, expected active.`, PROJECT_ARTIFACTS.currentMilestone));
    }
  }
  for (const item of Object.values(project.roadmapItems)) {
    if (item.milestoneId && !project.milestones[item.milestoneId]) {
      issues.push(issue("error", "SW203", `Roadmap item ${item.id} references missing milestone ${item.milestoneId}.`, PROJECT_ARTIFACTS.roadmap));
    }
    if (item.changeId && !changes[item.changeId]) {
      issues.push(issue("error", "SW204", `Roadmap item ${item.id} references missing change ${item.changeId}.`, PROJECT_ARTIFACTS.roadmap));
    }
  }
  for (const entry of Object.values(project.progress)) {
    if (entry.milestoneId && !project.milestones[entry.milestoneId]) {
      issues.push(issue("error", "SW212", `Progress ${entry.id} references missing milestone ${entry.milestoneId}.`, PROJECT_ARTIFACTS.progress));
    }
    if (entry.roadmapItemId && !project.roadmapItems[entry.roadmapItemId]) {
      issues.push(issue("error", "SW212", `Progress ${entry.id} references missing roadmap item ${entry.roadmapItemId}.`, PROJECT_ARTIFACTS.progress));
    }
    if (entry.changeId && !changes[entry.changeId]) {
      issues.push(issue("error", "SW212", `Progress ${entry.id} references missing change ${entry.changeId}.`, PROJECT_ARTIFACTS.progress));
    }
  }
}

export async function readProjectStateFromArtifacts(cwd: string, now: Date): Promise<ProjectSyncResult> {
  const project = defaultProjectState(now);
  const issues: ProjectArtifactIssue[] = [];
  const filesCreated: string[] = [];
  const filesUpdated: string[] = [];
  const state = await loadState(cwd);
  const changes = state?.changes ?? {};

  const roadmapMd = await readArtifact(cwd, PROJECT_ARTIFACTS.roadmap);
  if (roadmapMd !== undefined) {
    const parsed = parseRoadmapMarkdown(roadmapMd, now);
    issues.push(...parsed.issues.map((issue) => ({ ...issue, file: PROJECT_ARTIFACTS.roadmap })));
    for (const item of parsed.items) {
      project.roadmapItems[item.id] = item;
    }
    project.roadmapOrder = parsed.order;
  }

  const milestonesMd = await readArtifact(cwd, PROJECT_ARTIFACTS.milestones);
  if (milestonesMd !== undefined) {
    const parsed = parseMilestonesMarkdown(milestonesMd, now);
    issues.push(...parsed.issues.map((issue) => ({ ...issue, file: PROJECT_ARTIFACTS.milestones })));
    for (const milestone of parsed.milestones) {
      project.milestones[milestone.id] = milestone;
    }
    project.milestoneOrder = parsed.order;
  }

  const currentMd = await readArtifact(cwd, PROJECT_ARTIFACTS.currentMilestone);
  if (currentMd !== undefined) {
    const parsed = parseCurrentMilestoneMarkdown(currentMd);
    issues.push(...parsed.issues.map((issue) => ({ ...issue, file: PROJECT_ARTIFACTS.currentMilestone })));
    if (parsed.currentMilestoneId) {
      project.currentMilestoneId = parsed.currentMilestoneId;
    }
  }
  const progressMd = await readArtifact(cwd, PROJECT_ARTIFACTS.progress);
  if (progressMd !== undefined) {
    const parsed = parseProgressMarkdown(progressMd, now);
    issues.push(...parsed.issues.map((issue) => ({ ...issue, file: PROJECT_ARTIFACTS.progress })));
    for (const entry of parsed.entries) {
      project.progress[entry.id] = entry;
    }
    project.progressOrder = parsed.order;
  }

  const learningsMd = await readArtifact(cwd, PROJECT_ARTIFACTS.learnings);
  if (learningsMd !== undefined) {
    const parsed = parseLearningsMarkdown(learningsMd, now);
    issues.push(...parsed.issues.map((issue) => ({ ...issue, file: PROJECT_ARTIFACTS.learnings })));
    for (const entry of parsed.entries) {
      project.learnings[entry.id] = entry;
    }
    project.learningOrder = parsed.order;
  }

  normalizeRoadmapMilestoneLinks(project, issues);
  validateProjectCrossReferences(project, changes, issues);

  return {
    project,
    issues,
    changed: filesCreated.length > 0 || filesUpdated.length > 0,
    filesCreated,
    filesUpdated,
  };
}

export async function syncProjectStateFromArtifacts(
  cwd: string,
  now: Date,
  options: { createMissing?: boolean; writeCache?: boolean } = {},
): Promise<ProjectSyncResult> {
  const { createMissing = false, writeCache = false } = options;
  const ensured = createMissing ? await ensureProjectStateArtifacts(cwd) : { filesCreated: [], filesUpdated: [] };
  const result = await readProjectStateFromArtifacts(cwd, now);
  result.filesCreated.push(...ensured.filesCreated);
  result.filesUpdated.push(...ensured.filesUpdated);
  result.changed = result.filesCreated.length > 0 || result.filesUpdated.length > 0;
  if (writeCache && !result.issues.some((issue) => issue.level === "error")) {
    await writeProjectStateCache(cwd, result.project);
  }

  return result;
}

async function writeProjectStateCache(cwd: string, project: ProjectState): Promise<void> {
  const state = await loadState(cwd);
  state.project = project;
  state.updatedAt = project.updatedAt;
  await saveState(cwd, state);
}

export async function writeProjectStateArtifactsAndCache(
  cwd: string,
  project: ProjectState,
  now: Date,
): Promise<{ filesUpdated: string[] }> {
  project.updatedAt = now.toISOString();
  const filesUpdated: string[] = [];
  const existing = {
    roadmap: await readArtifact(cwd, PROJECT_ARTIFACTS.roadmap),
    milestones: await readArtifact(cwd, PROJECT_ARTIFACTS.milestones),
    currentMilestone: await readArtifact(cwd, PROJECT_ARTIFACTS.currentMilestone),
    progress: await readArtifact(cwd, PROJECT_ARTIFACTS.progress),
    learnings: await readArtifact(cwd, PROJECT_ARTIFACTS.learnings),
  };
  if (await writeArtifact(cwd, PROJECT_ARTIFACTS.roadmap, renderRoadmapMarkdown(existing.roadmap, project))) {
    filesUpdated.push(projectArtifactPath(cwd, PROJECT_ARTIFACTS.roadmap));
  }
  if (await writeArtifact(cwd, PROJECT_ARTIFACTS.milestones, renderMilestonesMarkdown(existing.milestones, project))) {
    filesUpdated.push(projectArtifactPath(cwd, PROJECT_ARTIFACTS.milestones));
  }
  if (await writeArtifact(cwd, PROJECT_ARTIFACTS.currentMilestone, renderCurrentMilestoneMarkdown(existing.currentMilestone, project))) {
    filesUpdated.push(projectArtifactPath(cwd, PROJECT_ARTIFACTS.currentMilestone));
  }
  if (await writeArtifact(cwd, PROJECT_ARTIFACTS.progress, renderProgressMarkdown(existing.progress, project))) {
    filesUpdated.push(projectArtifactPath(cwd, PROJECT_ARTIFACTS.progress));
  }
  if (await writeArtifact(cwd, PROJECT_ARTIFACTS.learnings, renderLearningsMarkdown(existing.learnings, project))) {
    filesUpdated.push(projectArtifactPath(cwd, PROJECT_ARTIFACTS.learnings));
  }
  await writeProjectStateCache(cwd, project);
  return { filesUpdated };
}
export function suggestNextProjectItem(project: ProjectState): { milestone?: MilestoneState; item?: RoadmapItemState; reason: string } {
  const activeMilestone = project.currentMilestoneId ? project.milestones[project.currentMilestoneId] : undefined;
  if (activeMilestone && activeMilestone.status === "active") {
    for (const id of activeMilestone.roadmapItemIds) {
      const item = project.roadmapItems[id];
      if (item?.status === "active") {
        return { milestone: activeMilestone, item, reason: "first active item in current active milestone" };
      }
    }
    for (const id of activeMilestone.roadmapItemIds) {
      const item = project.roadmapItems[id];
      if (item?.status === "planned") {
        return { milestone: activeMilestone, item, reason: "first planned item in current active milestone" };
      }
    }
  }
  for (const id of project.roadmapOrder) {
    const item = project.roadmapItems[id];
    if (item?.status === "active") {
      const milestone = item.milestoneId ? project.milestones[item.milestoneId] : undefined;
      const result: { item: RoadmapItemState; milestone?: MilestoneState; reason: string } = { item, reason: "first active item globally" };
      if (milestone) result.milestone = milestone;
      return result;
    }
  }
  for (const id of project.roadmapOrder) {
    const item = project.roadmapItems[id];
    if (item?.status === "planned") {
      const milestone = item.milestoneId ? project.milestones[item.milestoneId] : undefined;
      const result: { item: RoadmapItemState; milestone?: MilestoneState; reason: string } = { item, reason: "first planned item globally" };
      if (milestone) result.milestone = milestone;
      return result;
    }
  }
  return { reason: "No active or planned roadmap items." };
}

export function assertProjectState(value: unknown): asserts value is ProjectState {
  if (!isPlainObject(value)) {
    throw new Error("Invalid Specwright project state: expected object");
  }
  const project = value as Record<string, unknown>;
  if (project.version !== 1) {
    throw new Error(`Unsupported Specwright project state version: ${String(project.version)}`);
  }
  if (!isPlainObject(project.roadmapItems) || !isStringArray(project.roadmapOrder)) {
    throw new Error("Invalid Specwright project state: roadmap malformed");
  }
  if (!isPlainObject(project.milestones) || !isStringArray(project.milestoneOrder)) {
    throw new Error("Invalid Specwright project state: milestones malformed");
  }
  if (!isPlainObject(project.progress) || !isStringArray(project.progressOrder)) {
    throw new Error("Invalid Specwright project state: progress malformed");
  }
  if (!isPlainObject(project.learnings) || !isStringArray(project.learningOrder)) {
    throw new Error("Invalid Specwright project state: learnings malformed");
  }
  if (typeof project.updatedAt !== "string") {
    throw new Error("Invalid Specwright project state: updatedAt must be a string");
  }
}
