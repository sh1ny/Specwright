import { runSpecwrightCommand } from "../../core/commands";
import { splitArgs } from "./args";
import { clearStatus, getArgumentCompletions, refreshStatus } from "./status";
import type { ExtensionApiLike } from "./types";

export default function specwrightOmpExtension(pi: ExtensionApiLike): void {
  pi.setLabel("Specwright");

  pi.registerCommand("specwright", {
    description: "Run Specwright workflow commands",
    getArgumentCompletions,
    handler: async (args, ctx) => {
      await ctx.waitForIdle?.();
      const result = await runSpecwrightCommand(
        { cwd: ctx.cwd ?? process.cwd(), runtime: "omp", now: () => new Date() },
        splitArgs(args),
      );

      if (result.statusText) {
        ctx.ui?.setStatus?.("specwright", result.statusText);
      }
      if (result.summary) {
        ctx.ui?.notify?.(result.summary, result.ok ? "info" : "error");
      }
      if (result.prompt) {
        pi.sendUserMessage(result.prompt);
      }
      if (!result.ok && !ctx.ui) {
        pi.logger?.warn?.("Specwright command failed", result);
      }
    },
  });

  pi.on("session_start", refreshStatus);
  pi.on("goal_updated", refreshStatus);
  pi.on("turn_end", refreshStatus);
  pi.on("session_shutdown", clearStatus);
}
