import { runSpecwrightCommand } from "../../core/commands";
import { splitArgs } from "./args";
import { clearStatus, getArgumentCompletions, refreshStatus, shouldDisplayStatusText } from "./status";
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

      if (result.statusText && shouldDisplayStatusText(result.statusText)) {
        ctx.ui?.setStatus?.("specwright", result.statusText);
      } else if (result.statusText) {
        ctx.ui?.setStatus?.("specwright", undefined);
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

  pi.registerTool("specwright_status", {
    description: "Return Specwright status as JSON",
    parameters: {},
    async handler(_params, ctx) {
      const result = await runSpecwrightCommand(
        { cwd: ctx.cwd ?? process.cwd(), runtime: "omp", now: () => new Date() },
        ["status", "--json"],
      );
      return { ok: result.ok, summary: result.summary, filesCreated: result.filesCreated, filesUpdated: result.filesUpdated, exitCode: result.exitCode };
    },
  });

  pi.registerTool("specwright_checkpoint", {
    description: "Create a Specwright checkpoint commit for a phase or task",
    parameters: {
      change: { type: "string", description: "Change ID (optional)" },
      phase: { type: "string", description: "Checkpoint phase (e.g., verify)" },
      task: { type: "string", description: "Task ID (e.g., T005)" },
      files: { type: "array", description: "Files to include in the checkpoint" },
    },
    async handler(params, ctx) {
      const hasPhase = typeof params.phase === "string" && params.phase.length > 0;
      const hasTask = typeof params.task === "string" && params.task.length > 0;
      if (hasPhase && hasTask) {
        return { ok: false, summary: "Specify exactly one of phase or task.", filesCreated: [], filesUpdated: [], exitCode: 1 };
      }
      if (!hasPhase && !hasTask) {
        return { ok: false, summary: "Specify exactly one of phase or task.", filesCreated: [], filesUpdated: [], exitCode: 1 };
      }
      const change = typeof params.change === "string" ? params.change : "";
      const files = Array.isArray(params.files) ? params.files.filter((f): f is string => typeof f === "string") : [];
      if (files.length === 0) {
        return { ok: false, summary: "At least one file must be supplied.", filesCreated: [], filesUpdated: [], exitCode: 1 };
      }
      const argv = ["checkpoint", change];
      if (hasPhase) {
        argv.push("--phase", params.phase as string);
      } else {
        argv.push("--task", params.task as string);
      }
      argv.push("--files", files.join(","));
      const result = await runSpecwrightCommand(
        { cwd: ctx.cwd ?? process.cwd(), runtime: "omp", now: () => new Date() },
        argv,
      );
      return { ok: result.ok, summary: result.summary, filesCreated: result.filesCreated, filesUpdated: result.filesUpdated, exitCode: result.exitCode };
    },
  });

  pi.registerTool("specwright_validate", {
    description: "Run Specwright validation on the current or specified change",
    parameters: {
      change: { type: "string", description: "Change ID (optional)" },
    },
    async handler(params, ctx) {
      const change = typeof params.change === "string" ? params.change : "";
      const argv = change ? ["verify", change, "--json"] : ["verify", "--json"];
      const result = await runSpecwrightCommand(
        { cwd: ctx.cwd ?? process.cwd(), runtime: "omp", now: () => new Date() },
        argv,
      );
      return { ok: result.ok, summary: result.summary, filesCreated: result.filesCreated, filesUpdated: result.filesUpdated, exitCode: result.exitCode };
    },
  });

  pi.on("session_start", refreshStatus);
  pi.on("goal_updated", refreshStatus);
  pi.on("turn_end", refreshStatus);
  pi.on("session_shutdown", clearStatus);
}
