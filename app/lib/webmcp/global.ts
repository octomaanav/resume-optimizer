export type ModelContextTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<string> | string;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => Promise<void> | void;
      getTools: () => Promise<ModelContextTool[]>;
      executeTool: (tool: ModelContextTool, argsJson: string) => Promise<string>;
    };
  }
}
