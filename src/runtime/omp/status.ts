import { runSpecwrightCommand } from "../../core/commands";
import type { OmpContextLike } from "./types";
const refreshInFlightByCwd = new Map<string, Promise<string | undefined>>();

async function loadStatusText(cwd: string): Promise<string | undefined> {
  const existing = refreshInFlightByCwd.get(cwd);
  if (existing) {
    return await existing;
  }

  const pending = (async () => {
    const result = await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["status"]);
    return result.ok && result.statusText ? result.statusText : undefined;
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
