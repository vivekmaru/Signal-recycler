import { type AgentAdapter, type ContextChunk } from "@signal-recycler/shared";
import { injectPlaybookRules } from "../playbook.js";
import { type SignalRecyclerStore } from "../store.js";
import { type ContextIndexStore } from "./contextIndexStore.js";
import { retrieveContextChunks } from "./contextIndexRetrieval.js";
import { recordMemoryInjection } from "./memoryInjection.js";
import { retrieveRelevantMemories } from "./memoryRetrieval.js";

export type ContextEnvelopeInput = {
  store: SignalRecyclerStore;
  contextIndexStore?: ContextIndexStore;
  projectId: string;
  sessionId: string;
  adapter: AgentAdapter;
  prompt: string;
  limit?: number;
  contextLimit?: number;
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

  let prompt = input.prompt;
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

  const contextIndexStore = input.contextIndexStore;
  const contextResult = contextIndexStore
    ? buildSourceContextEnvelope({ ...input, contextIndexStore })
    : null;
  if (contextResult) {
    prompt = injectProjectContext(prompt, contextResult.chunks);
  }
  prompt = injectPlaybookRules(prompt, retrieval.memories);

  return {
    prompt,
    retrieval,
    memoryIds: retrieval.memories.map((memory) => memory.id),
    contextRetrieval: contextResult?.retrieval ?? null,
    contextChunkIds: contextResult?.chunks.map((chunk) => chunk.id) ?? []
  };
}

function buildMemoryRetrievalSummary(selected: number, skipped: number): string {
  return `Selected ${selected} approved memor${selected === 1 ? "y" : "ies"}; skipped ${skipped}.`;
}

function buildSourceContextEnvelope(input: ContextEnvelopeInput & { contextIndexStore: ContextIndexStore }) {
  const retrieval = retrieveContextChunks({
    store: input.contextIndexStore,
    projectId: input.projectId,
    query: input.prompt,
    limit: input.contextLimit ?? 5
  });
  if (retrieval.metrics.indexedChunks === 0) return null;

  const chunks = retrieval.selected
    .map((decision) => input.contextIndexStore.getChunk(input.projectId, decision.chunkId))
    .filter((chunk): chunk is ContextChunk => Boolean(chunk));

  input.store.createEvent({
    sessionId: input.sessionId,
    category: "context_retrieval",
    title: `Retrieved ${retrieval.metrics.selectedChunks} of ${retrieval.metrics.indexedChunks} indexed context chunks`,
    body: buildContextRetrievalSummary(
      retrieval.metrics.selectedChunks,
      retrieval.metrics.skippedChunks
    ),
    metadata: {
      projectId: input.projectId,
      query: retrieval.query,
      selected: retrieval.selected,
      skipped: retrieval.skipped,
      metrics: retrieval.metrics
    }
  });

  if (chunks.length > 0) {
    input.store.createEvent({
      sessionId: input.sessionId,
      category: "context_injection",
      title: `Injected ${chunks.length} context chunk${chunks.length === 1 ? "" : "s"}`,
      body: chunks
        .map((chunk) => `- ${chunk.sourceType}: ${formatChunkLocation(chunk)}`)
        .join("\n"),
      metadata: {
        projectId: input.projectId,
        adapter: input.adapter,
        reason: "indexed_project_context",
        contextChunkIds: chunks.map((chunk) => chunk.id),
        sources: chunks.map((chunk) => ({
          id: chunk.id,
          sourceType: chunk.sourceType,
          path: chunk.path,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          hash: chunk.hash,
          indexedAt: chunk.indexedAt
        })),
        retrieval: {
          query: retrieval.query,
          selected: retrieval.selected,
          skipped: retrieval.skipped,
          metrics: retrieval.metrics
        }
      }
    });
  }

  return { retrieval, chunks };
}

function buildContextRetrievalSummary(selected: number, skipped: number): string {
  return `Selected ${selected} indexed context chunk${selected === 1 ? "" : "s"}; skipped ${skipped}.`;
}

function injectProjectContext(prompt: string, chunks: ContextChunk[]): string {
  if (chunks.length === 0) return prompt;
  const cleaned = stripProjectContextBlocks(prompt).trimStart();
  const block = renderProjectContextBlock(chunks);
  return `${block}\n\n${cleaned}`.trim();
}

function renderProjectContextBlock(chunks: ContextChunk[]): string {
  const body = chunks
    .map((chunk, index) =>
      [
        `${index + 1}. [${chunk.sourceType}] ${formatChunkLocation(chunk)} hash=${chunk.hash}`,
        truncateChunkText(chunk.text)
      ].join("\n")
    )
    .join("\n\n");

  return [
    "<signal-recycler-project-context>",
    "Signal Recycler Retrieved Project Context",
    "These indexed source and documentation chunks matched the current prompt. Use them as scoped context, but prefer the live repository if commands or files disagree.",
    body,
    "</signal-recycler-project-context>"
  ].join("\n");
}

function stripProjectContextBlocks(text: string): string {
  let cleaned = text;
  while (true) {
    const start = cleaned.indexOf("<signal-recycler-project-context>");
    const end = cleaned.indexOf("</signal-recycler-project-context>");
    if (start === -1 || end === -1 || end < start) return cleaned;
    cleaned = `${cleaned.slice(0, start)}${cleaned.slice(end + "</signal-recycler-project-context>".length)}`;
  }
}

function formatChunkLocation(chunk: Pick<ContextChunk, "path" | "lineStart" | "lineEnd">): string {
  return `${chunk.path}:${chunk.lineStart}-${chunk.lineEnd}`;
}

function truncateChunkText(text: string): string {
  const normalized = text.trim();
  if (normalized.length <= 1200) return normalized;
  return `${normalized.slice(0, 1200).trimEnd()}\n[truncated]`;
}
