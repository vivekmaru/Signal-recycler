import {
  type ContextRetrievalResult,
  type ContextSourceType
} from "@signal-recycler/shared";
import { type ContextIndexStore } from "./contextIndexStore.js";

type RetrieveContextChunksInput = {
  store: ContextIndexStore;
  projectId: string;
  query: string;
  limit?: number;
  sourceTypes?: ContextSourceType[];
};

const DEFAULT_CONTEXT_RETRIEVAL_LIMIT = 8;

export function retrieveContextChunks(input: RetrieveContextChunksInput): ContextRetrievalResult {
  const limit = normalizeLimit(input.limit);
  const activeSourceTypes =
    input.sourceTypes && input.sourceTypes.length > 0 ? input.sourceTypes : undefined;
  const hits = input.store.search({
    projectId: input.projectId,
    query: input.query,
    limit,
    sourceTypes: activeSourceTypes
  });
  const selected = hits.map((hit) => ({
    chunkId: hit.chunk.id,
    rank: hit.rank,
    score: hit.score,
    reason: `Matched ${hit.chunk.sourceType} context with lexical retrieval`,
    sourceType: hit.chunk.sourceType,
    path: hit.chunk.path,
    lineStart: hit.chunk.lineStart,
    lineEnd: hit.chunk.lineEnd,
    hash: hit.chunk.hash
  }));
  const selectedIds = new Set(selected.map((decision) => decision.chunkId));
  const allChunks = input.store.listChunkIds(input.projectId);
  const skipped = allChunks
    .filter((chunk) => !selectedIds.has(chunk.id))
    .map((chunk) => ({
      chunkId: chunk.id,
      reason:
        activeSourceTypes && !activeSourceTypes.includes(chunk.sourceType)
          ? ("source_type_filter" as const)
          : ("not_relevant" as const)
    }));

  return {
    query: input.query,
    selected,
    skipped,
    metrics: {
      indexedChunks: allChunks.length,
      selectedChunks: selected.length,
      skippedChunks: skipped.length,
      limit
    }
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_CONTEXT_RETRIEVAL_LIMIT;
  const normalized = Math.floor(limit);
  return normalized > 0 ? normalized : DEFAULT_CONTEXT_RETRIEVAL_LIMIT;
}
