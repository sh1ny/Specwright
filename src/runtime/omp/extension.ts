import { runSpecwrightCommand } from "../../core/commands";
import { splitArgs } from "./args";
import { clearStatus, getArgumentCompletions, refreshStatus, shouldDisplayStatusText } from "./status";
import type { CommandResult } from "../../core/types";
import type { ExtensionApiLike, ToolCallBlockResult, ToolCallEvent, ToolResult } from "./types";

export default function specwrightOmpExtension(pi: ExtensionApiLike): void {
  let pendingRoute: { step: string; expectedAgent: string } | null = null;

  const stepToAgent: Record<string, string> = {
    research: "specwright-researcher",
    plan: "specwright-planner",
    execute: "specwright-executor",
    verify: "specwright-verifier",
  };
  const schemas = toolSchemas(pi);

  function clearPendingRoute() {
    pendingRoute = null;
  }

  pi.setLabel("Specwright");

  pi.registerCommand("specwright", {
    description: "Run Specwright workflow commands",
    getArgumentCompletions,
    handler: async (args, ctx) => {
      await ctx.waitForIdle?.();
      const argv = splitArgs(args);
      const subcommand = argv[0] ?? "";
      const expectedAgent = stepToAgent[subcommand];
      const result = await runSpecwrightCommand(
        { cwd: ctx.cwd ?? process.cwd(), runtime: "omp", now: () => new Date() },
        argv,
      );

      if (result.statusText && shouldDisplayStatusText(result.statusText)) {
        ctx.ui?.setStatus?.("specwright", result.statusText);
      } else if (result.statusText) {
        ctx.ui?.setStatus?.("specwright", undefined);
      }
      if (result.summary) {
        ctx.ui?.notify?.(result.summary, result.ok ? "info" : "error");
      }
      if (expectedAgent !== undefined) {
        if (result.ok && result.prompt) {
          pendingRoute = { step: subcommand, expectedAgent };
          pi.sendUserMessage(result.prompt);
        } else {
          pendingRoute = null;
        }
      } else {
        pendingRoute = null;
        if (result.prompt) {
          pi.sendUserMessage(result.prompt);
        }
      }
      if (!result.ok && !ctx.ui) {
        pi.logger?.warn?.("Specwright command failed", result);
      }
    },
  });

  pi.registerTool({
    name: "specwright_status",
    label: "Specwright Status",
    description: "Return Specwright status as JSON",
    parameters: schemas.empty,
    approval: "read",
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const result = await runSpecwrightCommand(
        { cwd: ctx.cwd ?? process.cwd(), runtime: "omp", now: () => new Date() },
        ["status", "--json"],
      );
      return toolResult(commandResultDetails(result));
    },
  });

  pi.registerTool({
    name: "specwright_checkpoint",
    label: "Specwright Checkpoint",
    description: "Create a Specwright checkpoint commit for a phase or task",
    parameters: schemas.checkpoint,
    approval: "write",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const hasPhase = typeof params.phase === "string" && params.phase.length > 0;
      const hasTask = typeof params.task === "string" && params.task.length > 0;
      if (hasPhase && hasTask) {
        return toolResult({ ok: false, summary: "Specify exactly one of phase or task.", filesCreated: [], filesUpdated: [], exitCode: 1 });
      }
      if (!hasPhase && !hasTask) {
        return toolResult({ ok: false, summary: "Specify exactly one of phase or task.", filesCreated: [], filesUpdated: [], exitCode: 1 });
      }
      const change = typeof params.change === "string" ? params.change : "";
      const files = Array.isArray(params.files) ? params.files.filter((f): f is string => typeof f === "string") : [];
      if (files.length === 0) {
        return toolResult({ ok: false, summary: "At least one file must be supplied.", filesCreated: [], filesUpdated: [], exitCode: 1 });
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
      return toolResult(commandResultDetails(result));
    },
  });

  pi.registerTool({
    name: "specwright_validate",
    label: "Specwright Validate",
    description: "Run Specwright validation on the current or specified change",
    parameters: schemas.validate,
    approval: "read",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const change = typeof params.change === "string" ? params.change : "";
      const argv = change ? ["verify", change, "--json"] : ["verify", "--json"];
      const result = await runSpecwrightCommand(
        { cwd: ctx.cwd ?? process.cwd(), runtime: "omp", now: () => new Date() },
        argv,
      );
      return toolResult(commandResultDetails(result));
    },
  });

  pi.on("tool_call", (event) => {
    if (!pendingRoute) return;
    const toolCall = event as ToolCallEvent;
    const isTask = toolCall.toolName === "task";
    const agent = typeof toolCall.input?.agent === "string" ? toolCall.input.agent : undefined;
    if (isTask && agent === pendingRoute.expectedAgent) {
      pendingRoute = null;
      return;
    }
    const blockResult: ToolCallBlockResult = {
      block: true,
      reason: `Expected the model to delegate ${pendingRoute.step} to \`${pendingRoute.expectedAgent}\` via the \`task\` tool, but received tool \`${toolCall.toolName}\` instead.`,
    };
    return blockResult;
  });

  pi.on("session_start", (event, ctx) => {
    clearPendingRoute();
    return refreshStatus(event, ctx);
  });
  pi.on("goal_updated", refreshStatus);
  pi.on("turn_end", (event, ctx) => {
    clearPendingRoute();
    return refreshStatus(event, ctx);
  });
  pi.on("session_shutdown", clearStatus);
}

interface CommandResultDetails {
  ok: boolean;
  summary: string;
  filesCreated: string[];
  filesUpdated: string[];
  exitCode: number;
}

function commandResultDetails(result: Pick<CommandResult, "ok" | "summary" | "filesCreated" | "filesUpdated" | "exitCode">): CommandResultDetails {
  return {
    ok: result.ok,
    summary: result.summary,
    filesCreated: result.filesCreated,
    filesUpdated: result.filesUpdated,
    exitCode: result.exitCode,
  };
}

function toolResult(details: CommandResultDetails): ToolResult<CommandResultDetails> {
  return {
    content: [{ type: "text", text: details.summary }],
    details,
  };
}


function toolSchemas(pi: ExtensionApiLike) {
  const z = pi.zod;
  if (!z) {
    return {
      empty: { type: "object", properties: {} },
      validate: { type: "object", properties: { change: { type: "string" } } },
      checkpoint: {
        type: "object",
        properties: {
          change: { type: "string" },
          phase: { type: "string" },
          task: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        },
      },
    };
  }

  const optionalString = (description: string) => z.string().describe(description).optional();
  return {
    empty: z.object({}),
    validate: z.object({
      change: optionalString("Change ID"),
    }),
    checkpoint: z.object({
      change: optionalString("Change ID"),
      phase: optionalString("Checkpoint phase, e.g. verify"),
      task: optionalString("Task ID, e.g. T005"),
      files: z.array(z.string()).describe("Files to include in the checkpoint").optional(),
    }),
  };
}
