import { readJsonFile } from "../../core/json";
import { statePath } from "../../core/paths";
import type { SpecwrightState } from "../../core/types";
import type { OmpContextLike } from "./types";

export async function refreshStatus(_event: unknown, ctx: OmpContextLike): Promise<void> {
  const cwd = ctx.cwd ?? process.cwd();
  const state = await readJsonFile<SpecwrightState>(statePath(cwd));
  if (!state) {
    ctx.ui?.setStatus?.("specwright", undefined);
    return;
  }

  const current = state.currentChange ?? "none";
  const status = state.currentChange ? state.changes[state.currentChange]?.status ?? "idle" : "idle";
  const usage = ctx.getContextUsage?.();
  const contextText = typeof usage?.percent === "number" ? ` · ctx ${Math.round(usage.percent)}%` : "";
  ctx.ui?.setStatus?.("specwright", `Specwright · ${current} · ${status}${contextText}`);
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
