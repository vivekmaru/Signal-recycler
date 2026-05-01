import {
  type MemoryRecord,
  type MemoryRetrievalDecision,
  type MemoryRetrievalResult,
  type SkippedMemory
} from "@signal-recycler/shared";
import { type SignalRecyclerStore } from "../store.js";

type RetrieveRelevantMemoriesInput = {
  store: SignalRecyclerStore;
  projectId: string;
  query: string;
  limit?: number;
};

const DEFAULT_RETRIEVAL_LIMIT = 5;

export function retrieveRelevantMemories(
  input: RetrieveRelevantMemoriesInput
): MemoryRetrievalResult & { memories: MemoryRecord[] } {
  const limit = normalizeLimit(input.limit);
  const approved = input.store.listApprovedRules(input.projectId);
  const hits = input.store.searchApprovedMemories({
    projectId: input.projectId,
    query: input.query,
    limit
  });
  const selectedIds = new Set(hits.map((hit) => hit.memory.id));
  const selected: MemoryRetrievalDecision[] = hits.map((hit) => ({
    memoryId: hit.memory.id,
    rank: hit.rank,
    score: hit.score,
    reason: retrievalReason(hit.memory, input.query),
    category: hit.memory.category,
    memoryType: hit.memory.memoryType,
    scope: hit.memory.scope,
    source: hit.memory.source
  }));
  const skipped: SkippedMemory[] = approved
    .filter((memory) => !selectedIds.has(memory.id))
    .map((memory) => ({ memoryId: memory.id, reason: "not_relevant" }));

  return {
    query: input.query,
    selected,
    skipped,
    memories: hits.map((hit) => hit.memory),
    metrics: {
      approvedMemories: approved.length,
      selectedMemories: selected.length,
      skippedMemories: skipped.length,
      limit
    }
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_RETRIEVAL_LIMIT;
  const normalized = Math.floor(limit);
  return normalized > 0 ? normalized : DEFAULT_RETRIEVAL_LIMIT;
}

function retrievalReason(memory: MemoryRecord, query: string): string {
  const queryTerms = tokenizeReasonText(query);
  const categoryTerms = Array.from(tokenizeReasonText(memory.category));
  if (categoryTerms.length > 0 && categoryTerms.every((term) => queryTerms.has(term))) {
    return `Matched category "${memory.category}"`;
  }
  if (memory.scope.value) {
    const scopeTerms = Array.from(tokenizeReasonText(memory.scope.value));
    if (scopeTerms.length > 0 && scopeTerms.every((term) => queryTerms.has(term))) {
      return `Matched ${memory.scope.type} scope "${memory.scope.value}"`;
    }
  }
  return "Matched memory text with lexical retrieval";
}

function tokenizeReasonText(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}
