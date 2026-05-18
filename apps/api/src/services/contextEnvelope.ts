import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  type AgentAdapter,
  type ContextChunk,
  type ContextRetrievalResult
} from "@signal-recycler/shared";
import { injectPlaybookRules } from "../playbook.js";
import { type SignalRecyclerStore } from "../store.js";
import { type ContextIndexStore } from "./contextIndexStore.js";
import { retrieveContextChunks } from "./contextIndexRetrieval.js";
import { recordMemoryInjection } from "./memoryInjection.js";
import { retrieveRelevantMemories } from "./memoryRetrieval.js";

const MAX_CONTEXT_SKIPPED_AUDIT_ENTRIES = 50;
const DEFAULT_CONTEXT_CHUNK_CHAR_LIMIT = 1200;
const DEFAULT_CONTEXT_TOTAL_CHAR_LIMIT = 3600;
const DEFAULT_CONTEXT_MIN_SCORE = 0;

export type ContextEnvelopeInput = {
  store: SignalRecyclerStore;
  contextIndexStore?: ContextIndexStore;
  projectId: string;
  sessionId: string;
  adapter: AgentAdapter;
  prompt: string;
  workingDirectory?: string;
  limit?: number;
  contextLimit?: number;
  contextMinScore?: number;
  contextMaxChunkChars?: number;
  contextMaxTotalChars?: number;
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
    prompt = injectProjectContext(
      prompt,
      contextResult.chunks,
      input.contextMaxChunkChars ?? DEFAULT_CONTEXT_CHUNK_CHAR_LIMIT
    );
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
  const rawRetrieval = retrieveContextChunks({
    store: input.contextIndexStore,
    projectId: input.projectId,
    query: input.prompt,
    limit: input.contextLimit ?? 5
  });
  if (rawRetrieval.metrics.indexedChunks === 0) return null;

  const { chunks, retrieval } = selectInjectableContextChunks({
    retrieval: rawRetrieval,
    contextIndexStore: input.contextIndexStore,
    projectId: input.projectId,
    workingDirectory: input.workingDirectory,
    minScore: input.contextMinScore ?? DEFAULT_CONTEXT_MIN_SCORE,
    maxChunkChars: input.contextMaxChunkChars ?? DEFAULT_CONTEXT_CHUNK_CHAR_LIMIT,
    maxTotalChars: input.contextMaxTotalChars ?? DEFAULT_CONTEXT_TOTAL_CHAR_LIMIT
  });

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
      ...buildContextRetrievalAudit(retrieval)
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
        retrieval: buildContextRetrievalAudit(retrieval)
      }
    });
  }

  return { retrieval, chunks };
}

function buildContextRetrievalSummary(selected: number, skipped: number): string {
  return `Selected ${selected} indexed context chunk${selected === 1 ? "" : "s"}; skipped ${skipped}.`;
}

function injectProjectContext(prompt: string, chunks: ContextChunk[], maxChunkChars: number): string {
  if (chunks.length === 0) return prompt;
  const cleaned = stripProjectContextBlocks(prompt).trimStart();
  const block = renderProjectContextBlock(chunks, maxChunkChars);
  return `${block}\n\n${cleaned}`.trim();
}

function renderProjectContextBlock(chunks: ContextChunk[], maxChunkChars: number): string {
  const body = chunks
    .map((chunk, index) =>
      [
        `${index + 1}. [${chunk.sourceType}] ${escapeEnvelopeText(formatChunkLocation(chunk))} hash=${escapeEnvelopeText(chunk.hash)}`,
        escapeEnvelopeText(truncateChunkText(chunk.text, maxChunkChars))
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

function truncateChunkText(text: string, maxChars: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}\n[truncated]`;
}

function escapeEnvelopeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildContextRetrievalAudit(retrieval: ContextRetrievalResult) {
  const skipped = retrieval.skipped.slice(0, MAX_CONTEXT_SKIPPED_AUDIT_ENTRIES);
  return {
    query: retrieval.query,
    selected: retrieval.selected,
    skipped,
    skippedOmitted: Math.max(0, retrieval.skipped.length - skipped.length),
    metrics: retrieval.metrics
  };
}

function selectInjectableContextChunks(input: {
  retrieval: ContextRetrievalResult;
  contextIndexStore: ContextIndexStore;
  projectId: string;
  workingDirectory: string | undefined;
  minScore: number;
  maxChunkChars: number;
  maxTotalChars: number;
}): { chunks: ContextChunk[]; retrieval: ContextRetrievalResult } {
  const chunks: ContextChunk[] = [];
  const selected: ContextRetrievalResult["selected"] = [];
  const skipped: ContextRetrievalResult["skipped"] = [...input.retrieval.skipped];
  let usedChars = 0;

  for (const decision of input.retrieval.selected) {
    if (decision.score < input.minScore) {
      skipped.push({ chunkId: decision.chunkId, reason: "score_below_threshold" });
      continue;
    }

    const chunk = input.contextIndexStore.getChunk(input.projectId, decision.chunkId);
    if (!chunk) {
      skipped.push({ chunkId: decision.chunkId, reason: "project_mismatch" });
      continue;
    }

    const freshness = checkChunkFreshness(chunk, input.workingDirectory);
    if (freshness === "stale") {
      skipped.push({ chunkId: decision.chunkId, reason: "stale_index" });
      continue;
    }
    if (freshness === "unavailable") {
      skipped.push({ chunkId: decision.chunkId, reason: "source_unavailable" });
      continue;
    }

    const chunkChars = Math.min(chunk.text.trim().length, input.maxChunkChars);
    if (chunks.length > 0 && usedChars + chunkChars > input.maxTotalChars) {
      skipped.push({ chunkId: decision.chunkId, reason: "budget_exceeded" });
      continue;
    }

    chunks.push(chunk);
    selected.push(decision);
    usedChars += chunkChars;
  }

  return {
    chunks,
    retrieval: {
      ...input.retrieval,
      selected,
      skipped,
      metrics: {
        ...input.retrieval.metrics,
        selectedChunks: selected.length,
        skippedChunks: skipped.length
      }
    }
  };
}

function checkChunkFreshness(
  chunk: Pick<ContextChunk, "path" | "lineStart" | "lineEnd" | "hash">,
  workingDirectory: string | undefined
): "fresh" | "stale" | "unavailable" {
  if (!workingDirectory) return "fresh";

  const workdir = path.resolve(workingDirectory);
  const absolutePath = path.resolve(workdir, chunk.path);
  if (absolutePath !== workdir && !absolutePath.startsWith(`${workdir}${path.sep}`)) {
    return "unavailable";
  }

  try {
    statSync(absolutePath);
    const text = readFileSync(absolutePath, "utf8");
    const lines = splitLines(text);
    const selected = lines.slice(chunk.lineStart - 1, chunk.lineEnd).join("");
    return chunkHash(chunk.path, chunk.lineStart, selected) === chunk.hash ? "fresh" : "stale";
  } catch {
    return "unavailable";
  }
}

function splitLines(text: string): string[] {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function chunkHash(chunkPath: string, lineStart: number, text: string): string {
  return createHash("sha256").update(`${chunkPath}:${lineStart}:${text}`).digest("hex");
}
