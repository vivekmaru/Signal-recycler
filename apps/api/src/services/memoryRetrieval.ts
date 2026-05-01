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
  const approvedById = new Map(approved.map((memory) => [memory.id, memory]));
  const approvedByKey = new Map(approved.map((memory) => [dedupeKey(memory), memory]));
  const hits = input.store.searchApprovedMemories({
    projectId: input.projectId,
    query: input.query,
    limit: Math.max(limit, input.store.listRules(input.projectId).length)
  });
  const selectedMemories: MemoryRecord[] = [];
  const selectedIds = new Set<string>();
  const selected: MemoryRetrievalDecision[] = [];

  for (const hit of hits) {
    const memory = approvedById.get(hit.memory.id) ?? approvedByKey.get(dedupeKey(hit.memory));
    if (!memory || selectedIds.has(memory.id) || selected.length >= limit) continue;

    selectedIds.add(memory.id);
    selectedMemories.push(memory);
    selected.push({
      memoryId: memory.id,
      rank: selected.length + 1,
      score: hit.score,
      reason: retrievalReason(memory, input.query),
      category: memory.category,
      memoryType: memory.memoryType,
      scope: memory.scope,
      source: memory.source
    });
  }

  const skipped: SkippedMemory[] = approved
    .filter((memory) => !selectedIds.has(memory.id))
    .map((memory) => ({ memoryId: memory.id, reason: "not_relevant" }));

  return {
    query: input.query,
    selected,
    skipped,
    memories: selectedMemories,
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

function dedupeKey(memory: MemoryRecord): string {
  return `${memory.category}:${memory.rule}`;
}
