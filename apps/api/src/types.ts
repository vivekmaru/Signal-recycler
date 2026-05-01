export type CodexRunner = {
  run(input: { sessionId: string; prompt: string; workingDirectory?: string }): Promise<{
    finalResponse: string;
    items: unknown[];
  }>;
};
