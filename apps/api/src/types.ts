import { type AgentAdapter as AgentAdapterId } from "@signal-recycler/shared";

export type AgentRunInput = {
  sessionId: string;
  prompt: string;
  workingDirectory?: string;
};

export type AgentRunResult = {
  finalResponse: string;
  items: unknown[];
};

export type AgentAdapter = {
  id: Exclude<AgentAdapterId, "default">;
  run(input: AgentRunInput): Promise<AgentRunResult>;
};

export type CodexRunner = Pick<AgentAdapter, "run">;
