import { stat } from "node:fs/promises";
import { join } from "node:path";
import { runSpecwrightCommand } from "../../core/commands";
import { changeDir } from "../../core/paths";
import { loadState } from "../../core/state";
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
    const result = await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["status"]);
    const statusText = result.ok && result.statusText ? result.statusText : undefined;

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
  return statusText.includes("tasks=");
}

export async function refreshStatus(_event: unknown, ctx: OmpContextLike): Promise<void> {
  if (typeof ctx.ui?.setStatus !== "function") {
    return;
  }

  const cwd = ctx.cwd ?? process.cwd();
  const statusText = await loadStatusText(cwd);
  if (!statusText) {
    ctx.ui.setStatus("specwright", undefined);
    return;
  }
  if (!shouldDisplayStatusText(statusText)) {
    ctx.ui.setStatus("specwright", undefined);
    return;
  }
  ctx.ui.setStatus("specwright", statusText);
}

export function clearStatus(_event: unknown, ctx: OmpContextLike): void {
  ctx.ui?.setStatus?.("specwright", undefined);
}

export function getArgumentCompletions(prefix: string): Array<{ value: string; label?: string; description?: string }> {
  const commands = ["init", "status", "scan", "new", "discuss", "research", "plan", "tasks", "execute", "verify", "handoff", "pack"];
  return commands
    .filter((command) => command.startsWith(prefix))
    .map((command) => ({ value: command, label: command }));
}
