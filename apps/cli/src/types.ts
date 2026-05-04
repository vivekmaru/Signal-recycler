export type Agent = "default" | "mock" | "codex_cli";

export type Command =
  | {
      command: "run";
      prompt: string;
      agent: Agent;
      apiBaseUrl: string;
      sessionId?: string;
      title?: string;
      watch: boolean;
      json: boolean;
    }
  | {
      command: "help";
    };

export type ApiConfig = {
  projectId: string;
  workingDirectory: string;
  workingDirectoryBasename: string;
  availableAdapters: Array<"default" | "mock" | "codex_sdk" | "codex_cli">;
};

export type SessionRecord = {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
};

export type TimelineEvent = {
  id: string;
  sessionId: string;
  category: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type RunResult = {
  finalResponse: string;
  candidateRules: unknown[];
};

export type RunSummary = {
  sessionId: string;
  agent: Agent;
  finalResponse: string;
  dashboardUrl: string;
  events: number;
  continued: boolean;
};
