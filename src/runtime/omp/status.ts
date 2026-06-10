import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { changeDir } from "../../core/paths";
import { loadState, syncChangeTasksFromMarkdown } from "../../core/state";
import type { ChangeState } from "../../core/types";
import { validateChange, type ValidationReport } from "../../core/validators";
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
  // Race-safe: capture or create the per-cwd in-flight promise synchronously,
  // before any `await`, so concurrent callers always share one execution path.
  const existing = refreshInFlightByCwd.get(cwd);
  if (existing) {
    return await existing;
  }

  const pending = (async () => {
    try {
      // Read state directly. No subprocess, no writes.
      const state = await loadState(cwd);
      const changeId = state.currentChange;
      if (!changeId) return undefined;
      const change = state.changes[changeId];
      if (!change) return undefined;

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

      // Compute task progress from the cached change, mirroring the in-memory
      // half of `syncChangeTasksFromFile` so passive refresh sees unchecked
      const tasksPath = join(changeDir(cwd, change.id, change.slug), "tasks.md");
      let tasksMarkdown: string | undefined;
      try {
        tasksMarkdown = await readFile(tasksPath, "utf8");
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
      const now = new Date();
      const sync = tasksMarkdown !== undefined
        ? syncChangeTasksFromMarkdown(change, tasksMarkdown, now)
        : { change, issues: [], changed: false };
      const syncedChange: ChangeState = sync.change;
      const progress = taskProgress(syncedChange);

      // Validate directly. `validateChange` is read-only: it never writes
      // verify.md or updates state.json.
      const report: ValidationReport = await validateChange(cwd, syncedChange);
      if (sync.issues.length > 0) {
        // Surface unreconciled task drift surfaced by the in-memory sync, even
        // when the cached change has already been reconciled.
        for (const issue of sync.issues) {
          report.issues.push({
            level: "error",
            code: "SW009",
            message: `Unreconciled task drift: ${issue.message}`,
            file: "tasks.md",
          });
        }
        report.ok = false;
      }

      let statusText: string | undefined;
      const driftIssues = report.issues.filter((issue) => issue.code === "SW009");
      if (driftIssues.length > 0) {
        statusText = `Specwright · ${change.id} · drift · tasks=${progress.done}/${progress.total}`;
      } else if (!report.ok) {
        const firstError = report.issues.find((issue) => issue.level === "error");
        const code = firstError?.code ?? "error";
        statusText = `Specwright · ${change.id} · blocked · ${code}`;
      } else if (progress.total > 0 && progress.done === progress.total && syncedChange.status !== "done") {
        statusText = `Specwright · ${change.id} · checkpoint-needed · tasks=${progress.done}/${progress.total}`;
      } else {
        const taskSuffix = progress.total > 0 ? ` · tasks=${progress.done}/${progress.total}` : "";
        statusText = `Specwright · ${change.id} · ${syncedChange.status ?? "idle"}${taskSuffix}`;
      }

      if (artifactKey) {
        statusCache.set(cacheKey, { artifactKey, statusText });
      }
      return statusText;
    } catch {
      // Degrade safely: passive refresh must never throw through OMP event handlers
      // when validation or read classification fails.
      return undefined;
    }
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

function taskProgress(change: ChangeState | undefined): { total: number; done: number } {
  if (!change) return { total: 0, done: 0 };
  let total = 0;
  let done = 0;
  for (const task of Object.values(change.tasks)) {
    total += 1;
    if (task.status === "done") done += 1;
  }
  return { total, done };
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
