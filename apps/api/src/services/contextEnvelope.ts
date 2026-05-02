import { type AgentAdapter } from "@signal-recycler/shared";
import { injectPlaybookRules } from "../playbook.js";
import { type SignalRecyclerStore } from "../store.js";
import { recordMemoryInjection } from "./memoryInjection.js";
import { retrieveRelevantMemories } from "./memoryRetrieval.js";

export type ContextEnvelopeInput = {
  store: SignalRecyclerStore;
  projectId: string;
  sessionId: string;
  adapter: AgentAdapter;
  prompt: string;
  limit?: number;
};

export function buildContextEnvelope(input: ContextEnvelopeInput) {
  const retrieval = retrieveRelevantMemories({
    store: input.store,
    projectId: input.projectId,
    query: input.prompt,
    limit: input.limit ?? 5
  });

  input.store.createEvent({
    sessionId: input.sessionId,
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

  const prompt = injectPlaybookRules(input.prompt, retrieval.memories);
  try {
    recordMemoryInjection({
      store: input.store,
      projectId: input.projectId,
      sessionId: input.sessionId,
      adapter: input.adapter,
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
    console.warn("[signal-recycler] Context envelope memory audit failed", error);
  }

  return {
    prompt,
    retrieval,
    memoryIds: retrieval.memories.map((memory) => memory.id)
  };
}

function buildMemoryRetrievalSummary(selected: number, skipped: number): string {
  return `Selected ${selected} approved memor${selected === 1 ? "y" : "ies"}; skipped ${skipped}.`;
}
