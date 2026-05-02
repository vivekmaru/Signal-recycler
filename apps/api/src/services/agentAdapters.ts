import { type AgentAdapter as AgentAdapterId } from "@signal-recycler/shared";
import { type AgentAdapter } from "../types.js";
import { createMockAdapter } from "./mockAdapter.js";

type ResolvableAgentAdapter = Exclude<AgentAdapterId, "default">;

export type AgentAdapterRegistry = {
  resolve(id: AgentAdapterId): AgentAdapter;
};

export function createAgentAdapterRegistry(options: {
  defaultAdapter: ResolvableAgentAdapter;
  codexCliCommand?: string | null;
  adapters?: Partial<Record<ResolvableAgentAdapter, AgentAdapter>>;
}): AgentAdapterRegistry {
  const adapters: Partial<Record<ResolvableAgentAdapter, AgentAdapter>> = {
    mock: createMockAdapter(),
    ...options.adapters
  };

  return {
    resolve(id) {
      const adapterId = id === "default" ? options.defaultAdapter : id;
      const adapter = adapters[adapterId];

      if (adapter) return adapter;
      if (adapterId === "codex_cli" && !options.codexCliCommand) {
        throw new Error("Codex CLI adapter is not configured");
      }

      throw new Error(`Agent adapter is not configured: ${adapterId}`);
    }
  };
}
