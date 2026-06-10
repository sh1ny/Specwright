import { stat } from "node:fs/promises";
import { join } from "node:path";
import { runSpecwrightCommand } from "../../core/commands";
import { changeDir } from "../../core/paths";
import { loadState } from "../../core/state";
import type { ValidationReport } from "../../core/validators";
import type { OmpContextLike } from "./types";

const refreshInFlightByCwd = new Map<string, Promise<string | undefined>>();

const CANONICAL_CHANGE_ARTIFACTS = [
  "intent.md",
  "evidence.md",
  "sources.md",
  "tasks.md",
  "plan.md",
  "verify.md",
];

interface StatusCacheEntry {
  artifactKey: string;
  statusText: string | undefined;
}

const statusCache = new Map<string, StatusCacheEntry>();
const lastDisplayedStatusByCwd = new Map<string, string | undefined>();

async function getCurrentChange(cwd: string): Promise<{ id: string; slug: string } | undefined> {
  const state = await loadState(cwd);
  const changeId = state.currentChange;
  if (!changeId) return undefined;
  const change = state.changes[changeId];
  if (!change) return undefined;
  return { id: changeId, slug: change.slug };
}

async function computeArtifactKey(cwd: string, changeId: string, slug: string): Promise<string> {
  const changePath = changeDir(cwd, changeId, slug);
  const tuples: Record<string, { mtimeMs: number; size: number }> = {};

  for (const file of CANONICAL_CHANGE_ARTIFACTS) {
    try {
      const s = await stat(join(changePath, file));
      tuples[file] = { mtimeMs: s.mtimeMs, size: s.size };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        tuples[file] = { mtimeMs: 0, size: 0 };
      } else {
        throw error;
      }
    }
  }

  for (const file of [".specwright/state.json", ".specwright/config.json"]) {
    try {
      const s = await stat(join(cwd, file));
      tuples[file] = { mtimeMs: s.mtimeMs, size: s.size };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        tuples[file] = { mtimeMs: 0, size: 0 };
      } else {
        throw error;
      }
    }
  }

  return JSON.stringify(tuples);
}

async function loadStatusText(cwd: string): Promise<string | undefined> {
  const existing = refreshInFlightByCwd.get(cwd);
  if (existing) {
    return await existing;
  }

  const change = await getCurrentChange(cwd);
  if (!change) {
    return undefined;
  }

  let artifactKey: string | undefined;
  try {
    artifactKey = await computeArtifactKey(cwd, change.id, change.slug);
  } catch {
    // If we cannot read artifact metadata, fall through to uncached execution.
  }

  const cacheKey = `${cwd}:${change.id}`;
  if (artifactKey) {
    const cached = statusCache.get(cacheKey);
    if (cached && cached.artifactKey === artifactKey) {
      return cached.statusText;
    }
  }

  const pending = (async () => {
    let currentChange: string | undefined;
    let currentStatus: string | undefined;
    let progress = { total: 0, done: 0 };

    const statusResult = await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["status", "--json"]);
    if (statusResult.summary) {
      try {
        const data = JSON.parse(statusResult.summary);
        currentChange = data.currentChange;
        currentStatus = data.currentStatus;
        progress = data.tasks ?? progress;
      } catch {
        // JSON parse failed; fall back to plain status
      }
    }

    if (!currentChange) {
      const plainResult = await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["status"]);
      if (plainResult.ok && plainResult.statusText) {
        return plainResult.statusText;
      }
      return undefined;
    }

    let report: ValidationReport | undefined;
    const verifyResult = await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["verify", "--json"]);
    if (verifyResult.summary) {
      try {
        report = JSON.parse(verifyResult.summary);
      } catch {
        // Ignore parse errors
      }
    }

    let statusText: string | undefined;
    if (report && !report.ok) {
      const driftIssues = report.issues.filter((issue) => issue.code === "SW009");
      if (driftIssues.length > 0) {
        statusText = `Specwright · ${change.id} · drift · tasks=${progress.done}/${progress.total}`;
      } else {
        const firstError = report.issues.find((issue) => issue.level === "error");
        const code = firstError?.code ?? "error";
        statusText = `Specwright · ${change.id} · blocked · ${code}`;
      }
    } else if (progress.total > 0 && progress.done === progress.total && currentStatus !== "done") {
      statusText = `Specwright · ${change.id} · checkpoint-needed · tasks=${progress.done}/${progress.total}`;
    } else {
      const taskSuffix = progress.total > 0 ? ` · tasks=${progress.done}/${progress.total}` : "";
      statusText = `Specwright · ${change.id} · ${currentStatus ?? "idle"}${taskSuffix}`;
    }

    // Recompute the key after command execution so that any files the command
    // itself modified (e.g. state.json after task sync) are reflected in the
    // cached key. This prevents the next refresh from always invalidating.
    let postKey: string | undefined;
    try {
      postKey = await computeArtifactKey(cwd, change.id, change.slug);
    } catch {
      postKey = artifactKey;
    }
    if (postKey) {
      statusCache.set(cacheKey, { artifactKey: postKey, statusText });
    }

    return statusText;
  })();

  refreshInFlightByCwd.set(cwd, pending);
  try {
    return await pending;
  } finally {
    if (refreshInFlightByCwd.get(cwd) === pending) {
      refreshInFlightByCwd.delete(cwd);
    }
  }
}

export function shouldDisplayStatusText(statusText: string): boolean {
  return (
    statusText.includes("tasks=") ||
    statusText.includes("blocked") ||
    statusText.includes("drift") ||
    statusText.includes("checkpoint-needed")
  );
}

export async function refreshStatus(_event: unknown, ctx: OmpContextLike): Promise<void> {
  if (typeof ctx.ui?.setStatus !== "function") {
    return;
  }

  const cwd = ctx.cwd ?? process.cwd();
  const statusText = await loadStatusText(cwd);
  if (!statusText) {
    ctx.ui.setStatus("specwright", undefined);
    lastDisplayedStatusByCwd.set(cwd, undefined);
    return;
  }
  if (!shouldDisplayStatusText(statusText)) {
    ctx.ui.setStatus("specwright", undefined);
    lastDisplayedStatusByCwd.set(cwd, undefined);
    return;
  }

  const lastStatus = lastDisplayedStatusByCwd.get(cwd);
  if (lastStatus !== statusText && (statusText.includes("blocked") || statusText.includes("drift") || statusText.includes("checkpoint-needed")) && typeof ctx.ui?.notify === "function") {
    const changeMatch = statusText.match(/Specwright · ([^·]+) ·/);
    const change = changeMatch?.[1]?.trim() ?? "change";
    if (statusText.includes("blocked")) {
      const codeMatch = statusText.match(/blocked · (.+)$/);
      const code = codeMatch?.[1] ?? "error";
      ctx.ui.notify(`Specwright: ${change} is blocked (${code})`, "warning");
    } else if (statusText.includes("drift")) {
      ctx.ui.notify(`Specwright: ${change} has task drift`, "warning");
    } else if (statusText.includes("checkpoint-needed")) {
      ctx.ui.notify(`Specwright: ${change} needs checkpoint`, "warning");
    }
  }

  ctx.ui.setStatus("specwright", statusText);
  lastDisplayedStatusByCwd.set(cwd, statusText);
}

export function clearStatus(_event: unknown, ctx: OmpContextLike): void {
  const cwd = ctx.cwd ?? process.cwd();
  ctx.ui?.setStatus?.("specwright", undefined);
  lastDisplayedStatusByCwd.set(cwd, undefined);
}

export function getArgumentCompletions(prefix: string): Array<{ value: string; label?: string; description?: string }> {
  const commands = ["init", "status", "scan", "new", "discuss", "research", "plan", "tasks", "execute", "verify", "handoff", "pack"];
  return commands
    .filter((command) => command.startsWith(prefix))
    .map((command) => ({ value: command, label: command }));
}
