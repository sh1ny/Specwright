export interface ToolDefinition {
  description: string;
  parameters?: Record<string, { type: string; description?: string }>;
  handler: (params: Record<string, unknown>, ctx: OmpContextLike) => unknown | Promise<unknown>;
}

export interface ToolCallEvent {
  name: string;
  params: Record<string, unknown>;
  input?: { agent?: string };
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
  registerTool(name: string, definition: ToolDefinition): void;
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