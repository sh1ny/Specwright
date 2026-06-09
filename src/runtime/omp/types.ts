export interface ExtensionApiLike {
  setLabel(label: string): void;
  on(event: string, handler: (event: unknown, ctx: OmpContextLike) => void | Promise<unknown>): void;
  registerCommand(name: string, options: {
    description?: string;
    getArgumentCompletions?: (prefix: string) => Array<{ value: string; label?: string; description?: string }> | null;
    handler: (args: string, ctx: OmpCommandContextLike) => Promise<void>;
  }): void;
  sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
  logger?: { warn?(message: string, data?: unknown): void; error?(message: string, data?: unknown): void };
}

export interface OmpContextLike {
  cwd?: string;
  hasUI?: boolean;
  getContextUsage?: () => { tokens?: number; contextWindow?: number; percent?: number } | undefined;
  ui?: {
    notify?(message: string, type?: "info" | "warning" | "error"): void;
    setStatus?(key: string, text: string | undefined): void;
  };
}

export interface OmpCommandContextLike extends OmpContextLike {
  waitForIdle?: () => Promise<void>;
}
