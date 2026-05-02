import { Codex } from "@openai/codex-sdk";
import { injectPlaybookRules } from "../playbook.js";
import { type SignalRecyclerStore } from "../store.js";
import { type AgentAdapter } from "../types.js";
import { recordMemoryInjection } from "./memoryInjection.js";
import { retrieveRelevantMemories } from "./memoryRetrieval.js";

type ThreadLike = {
  run(prompt: string): Promise<{ finalResponse?: string; items?: unknown[] }>;
};

export function createCodexSdkAdapter(input: {
  store: SignalRecyclerStore;
  apiPort: number;
  projectId: string;
  workingDirectory: string;
}): AgentAdapter {
  const threads = new Map<string, ThreadLike>();
  const codex = new Codex({
    baseUrl: `http://127.0.0.1:${input.apiPort}/proxy/v1`,
    ...(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {}),
    env: stringEnv(process.env)
  });

  return {
    id: "codex_sdk",
    async run({ sessionId, prompt, workingDirectory: overrideDir }) {
      const effectiveDir = overrideDir ?? input.workingDirectory;
      const rules = input.store.listApprovedRules(input.projectId);
      input.store.createEvent({
        sessionId,
        category: "proxy_request",
        title: "Codex SDK routed through proxy",
        body: `Running in ${effectiveDir} — Signal Recycler will intercept and compress traffic before Codex sees it.`,
        metadata: { approvedRulesAvailable: rules.length, workingDirectory: effectiveDir }
      });

      if (process.env.SIGNAL_RECYCLER_MOCK_CODEX === "1") {
        const retrieval = retrieveRelevantMemories({
          store: input.store,
          projectId: input.projectId,
          query: prompt,
          limit: 5
        });
        input.store.createEvent({
          sessionId,
          category: "memory_retrieval",
          title: `Retrieved ${retrieval.metrics.selectedMemories} of ${retrieval.metrics.approvedMemories} approved memories`,
          body: buildMemoryRetrievalSummary(
            retrieval.metrics.selectedMemories,
            retrieval.metrics.skippedMemories
          ),
          metadata: {
            projectId: input.projectId,
            query: retrieval.query,
            selected: retrieval.selected,
            skipped: retrieval.skipped,
            metrics: retrieval.metrics
          }
        });
        const injected = injectPlaybookRules(prompt, retrieval.memories);
        try {
          recordMemoryInjection({
            store: input.store,
            projectId: input.projectId,
            sessionId,
            adapter: "mock-codex",
            memories: retrieval.memories,
            reason: "approved_project_memory",
            metadata: {
              retrieval: {
                query: retrieval.query,
                selected: retrieval.selected,
                skipped: retrieval.skipped,
                metrics: retrieval.metrics
              }
            }
          });
        } catch (error) {
          console.warn("[signal-recycler] Mock Codex memory audit failed", error);
        }
        return {
          finalResponse:
            retrieval.memories.length > 0
              ? `Checking learned constraints from playbook... ${retrieval.memories[0]?.rule ?? ""} Applying rules before proceeding.`
              : "Encountered a failure. The correction should be captured as a durable rule.",
          items: [{ type: "mock", injected }]
        };
      }

      // Threads are keyed by (sessionId + workingDirectory) so a session that
      // touches multiple directories doesn't get a stale chdir.
      const threadKey = `${sessionId}::${effectiveDir}`;
      let thread = threads.get(threadKey);
      if (!thread) {
        thread = codex.startThread({
          workingDirectory: effectiveDir,
          skipGitRepoCheck: true
        }) as ThreadLike;
        threads.set(threadKey, thread);
      }

      const turn = await thread.run(prompt);
      return {
        finalResponse: turn.finalResponse ?? "",
        items: turn.items ?? []
      };
    }
  };
}

function buildMemoryRetrievalSummary(selected: number, skipped: number): string {
  return `Selected ${selected} approved memor${selected === 1 ? "y" : "ies"}; skipped ${skipped}.`;
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}
