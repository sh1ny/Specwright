import { runSpecwrightCommand } from "../../core/commands";
import type { OmpContextLike } from "./types";
let refreshInFlight: Promise<void> | undefined;
export async function refreshStatus(_event: unknown, ctx: OmpContextLike): Promise<void> {
  if (refreshInFlight) {
    await refreshInFlight;
    return;
  }
  refreshInFlight = (async () => {
    const cwd = ctx.cwd ?? process.cwd();
    const result = await runSpecwrightCommand({ cwd, runtime: "omp", now: () => new Date() }, ["status"]);
    const statusText = result.statusText;
    if (!result.ok || !statusText) {
      ctx.ui?.setStatus?.("specwright", undefined);
      return;
    }
    const usage = ctx.getContextUsage?.();
    const contextText = typeof usage?.percent === "number" ? ` · ctx ${Math.round(usage.percent)}%` : "";
    ctx.ui?.setStatus?.("specwright", `${statusText}${contextText}`);
  })();
  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = undefined;
  }
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
