export interface ToolResultContent {
  type: "text";
  text: string;
}

export interface ToolResult<TDetails = unknown> {
  content: ToolResultContent[];
  details?: TDetails;
}

export interface ToolDefinition<TParams = Record<string, unknown>, TDetails = unknown> {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  approval?: "read" | "write" | "exec";
  execute: (
    toolCallId: string,
    params: TParams,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: OmpContextLike,
  ) => ToolResult<TDetails> | Promise<ToolResult<TDetails>>;
}

export interface SchemaLike {
  optional(): SchemaLike;
  describe(description: string): SchemaLike;
}

export interface ZodLike {
  object(shape: Record<string, SchemaLike>): unknown;
  string(): SchemaLike;
  array(schema: SchemaLike): SchemaLike;
}

export interface ToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
}

export interface ToolCallBlockResult {
  block: true;
  reason: string;
}

export interface ExtensionApiLike {
  setLabel(label: string): void;
  on(event: string, handler: (event: unknown, ctx: OmpContextLike) => unknown | Promise<unknown>): void;
  registerCommand(name: string, options: {
    description?: string;
    getArgumentCompletions?: (prefix: string) => Array<{ value: string; label?: string; description?: string }> | null;
    handler: (args: string, ctx: OmpCommandContextLike) => Promise<void>;
  }): void;
  sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
  registerTool(definition: ToolDefinition): void;
  zod?: ZodLike;
  getActiveTools?(): string[];
  setActiveTools?(tools: string[]): void;
  logger?: { warn?(message: string, data?: unknown): void; error?(message: string, data?: unknown): void };
}

export interface OmpContextLike {
  cwd?: string;
  hasUI?: boolean;
  getContextUsage?: () => { tokens?: number; contextWindow?: number; percent?: number } | undefined;
  ui?: {
    notify?(message: string, type?: "info" | "warning" | "error"): void;
    setStatus?(key: string, text: string | undefined): void;
    select?<T>(message: string, choices: Array<{ value: T; label?: string }>): Promise<T | undefined>;
    input?(message: string, options?: { default?: string; multiline?: boolean }): Promise<string | undefined>;
    editor?(content: string, options?: { language?: string }): Promise<string | undefined>;
    confirm?(message: string): Promise<boolean>;
  };
}

export interface OmpCommandContextLike extends OmpContextLike {
  waitForIdle?: () => Promise<void>;
}