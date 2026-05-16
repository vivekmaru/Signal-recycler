import { describe, expect, it } from "vitest";
import type { ContextChunk, ContextIndexStatus, ContextRetrievalResult } from "@signal-recycler/shared";
import {
  buildContextChunkDetail,
  buildContextCoverageRows,
  buildContextRetrievalPreview,
  contextIndexMetrics,
  sourceTypeLabel
} from "./contextIndexPresenters";

const status = {
  projectId: "demo",
  workdir: "/repo/demo",
  totalChunks: 42,
  totalFiles: 7,
  lastIndexedAt: null,
  bySourceType: [
    { sourceType: "source", files: 3, chunks: 21 },
    { sourceType: "docs", files: 2, chunks: 8 },
    { sourceType: "package", files: 1, chunks: 3 }
  ]
} satisfies ContextIndexStatus;

const retrieval = {
  query: "where is auth middleware",
  selected: [
    {
      chunkId: "chunk_1",
      rank: 1,
      score: 0.812345,
      reason: "Matched source context with lexical retrieval",
      sourceType: "source",
      path: "apps/web/src/middleware.ts",
      lineStart: 1,
      lineEnd: 52,
      hash: "hash_1234567890abcdef"
    }
  ],
  skipped: [{ chunkId: "chunk_2", reason: "not_relevant" }],
  metrics: {
    indexedChunks: 42,
    selectedChunks: 1,
    skippedChunks: 1,
    limit: 5
  }
} satisfies ContextRetrievalResult;

const chunkDetail = {
  id: "ctx_1",
  projectId: "demo",
  sourceType: "source",
  path: "apps/web/src/middleware.ts",
  lineStart: 1,
  lineEnd: 52,
  hash: "hash_1234567890abcdef",
  mtimeMs: 1778731200000,
  sizeBytes: 2400,
  text: "export function middleware() {\n  return true;\n}",
  indexedAt: "2026-05-14T00:00:00.000Z"
} satisfies ContextChunk;

describe("context index presenters", () => {
  it("builds status metric tiles from index coverage", () => {
    expect(contextIndexMetrics(status)).toEqual([
      { label: "Files", value: "7", tone: "blue" },
      { label: "Chunks", value: "42", tone: "green" },
      { label: "Sources", value: "3", tone: "amber" },
      { label: "Last indexed", value: "never", tone: "neutral" }
    ]);
  });

  it("summarizes coverage by source type", () => {
    expect(buildContextCoverageRows(status)).toEqual([
      { id: "source", label: "Source", files: "3 files", chunks: "21 chunks", percent: 50 },
      { id: "docs", label: "Docs", files: "2 files", chunks: "8 chunks", percent: 19 },
      { id: "package", label: "Package", files: "1 file", chunks: "3 chunks", percent: 7 }
    ]);
  });

  it("builds retrieval rows from context chunks instead of memory decisions", () => {
    expect(buildContextRetrievalPreview(retrieval)).toEqual({
      metrics: [
        { label: "Selected", value: "1", tone: "blue" },
        { label: "Skipped", value: "1", tone: "neutral" },
        { label: "Indexed", value: "42", tone: "green" },
        { label: "Limit", value: "5", tone: "neutral" }
      ],
      selectedRows: [
        {
          id: "chunk_1",
          title: "apps/web/src/middleware.ts",
          detail: "Source · lines 1-52",
          reason: "Matched source context with lexical retrieval",
          score: "0.8123",
          rank: "1",
          hash: "hash_1234567890abcdef"
        }
      ],
      skippedRows: [{ id: "chunk_2", reason: "not_relevant" }]
    });
  });

  it("builds chunk detail inspector fields from bounded context chunk content", () => {
    expect(buildContextChunkDetail(chunkDetail)).toEqual({
      id: "ctx_1",
      title: "apps/web/src/middleware.ts",
      sourceType: "Source",
      location: "lines 1-52",
      hash: "hash_1234567890abcdef",
      shortHash: "hash_1234567",
      indexedAt: "2026-05-14T00:00:00.000Z",
      modifiedAt: "2026-05-14T04:00:00.000Z",
      size: "2400 bytes",
      text: "export function middleware() {\n  return true;\n}"
    });
  });

  it("formats known context source types for UI labels", () => {
    expect(sourceTypeLabel("agent_instructions")).toBe("Agent instructions");
    expect(sourceTypeLabel("tests")).toBe("Tests");
  });
});
