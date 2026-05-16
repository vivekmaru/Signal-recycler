import type {
  ContextChunk,
  ContextIndexStatus,
  ContextRetrievalResult,
  ContextSourceType
} from "@signal-recycler/shared";
import type { BadgeTone } from "../components/Badge";
import { formatDateTime } from "./format";

export type ContextIndexMetric = {
  label: string;
  value: string;
  tone: BadgeTone;
};

export type ContextCoverageRow = {
  id: ContextSourceType;
  label: string;
  files: string;
  chunks: string;
  percent: number;
};

export type SelectedContextPreviewRow = {
  id: string;
  title: string;
  detail: string;
  reason: string;
  score: string;
  rank: string;
  hash: string;
};

export type SkippedContextPreviewRow = {
  id: string;
  reason: string;
};

export type ContextRetrievalPreviewRows = {
  metrics: ContextIndexMetric[];
  selectedRows: SelectedContextPreviewRow[];
  skippedRows: SkippedContextPreviewRow[];
};

export type ContextChunkDetail = {
  id: string;
  title: string;
  sourceType: string;
  location: string;
  hash: string;
  shortHash: string;
  indexedAt: string;
  modifiedAt: string;
  size: string;
  text: string;
};

export function contextIndexMetrics(status: ContextIndexStatus): ContextIndexMetric[] {
  return [
    { label: "Files", value: String(status.totalFiles), tone: "blue" },
    { label: "Chunks", value: String(status.totalChunks), tone: "green" },
    { label: "Sources", value: String(status.bySourceType.length), tone: "amber" },
    {
      label: "Last indexed",
      value: status.lastIndexedAt ? formatDateTime(status.lastIndexedAt) : "never",
      tone: "neutral"
    }
  ];
}

export function buildContextCoverageRows(status: ContextIndexStatus): ContextCoverageRow[] {
  return status.bySourceType.map((row) => ({
    id: row.sourceType,
    label: sourceTypeLabel(row.sourceType),
    files: plural(row.files, "file"),
    chunks: plural(row.chunks, "chunk"),
    percent: status.totalChunks === 0 ? 0 : Math.round((row.chunks / status.totalChunks) * 100)
  }));
}

export function buildContextRetrievalPreview(result: ContextRetrievalResult): ContextRetrievalPreviewRows {
  return {
    metrics: [
      { label: "Selected", value: String(result.metrics.selectedChunks), tone: "blue" },
      { label: "Skipped", value: String(result.metrics.skippedChunks), tone: "neutral" },
      { label: "Indexed", value: String(result.metrics.indexedChunks), tone: "green" },
      { label: "Limit", value: String(result.metrics.limit), tone: "neutral" }
    ],
    selectedRows: result.selected.map((chunk) => ({
      id: chunk.chunkId,
      title: chunk.path,
      detail: `${sourceTypeLabel(chunk.sourceType)} · lines ${chunk.lineStart}-${chunk.lineEnd}`,
      reason: chunk.reason,
      score: formatScore(chunk.score),
      rank: String(chunk.rank),
      hash: chunk.hash
    })),
    skippedRows: result.skipped.map((chunk) => ({
      id: chunk.chunkId,
      reason: chunk.reason
    }))
  };
}

export function buildContextChunkDetail(chunk: ContextChunk): ContextChunkDetail {
  return {
    id: chunk.id,
    title: chunk.path,
    sourceType: sourceTypeLabel(chunk.sourceType),
    location: `lines ${chunk.lineStart}-${chunk.lineEnd}`,
    hash: chunk.hash,
    shortHash: chunk.hash.slice(0, 12),
    indexedAt: chunk.indexedAt,
    modifiedAt: new Date(chunk.mtimeMs).toISOString(),
    size: `${chunk.sizeBytes} bytes`,
    text: chunk.text
  };
}

export function sourceTypeLabel(sourceType: ContextSourceType): string {
  switch (sourceType) {
    case "agent_instructions":
      return "Agent instructions";
    case "config":
      return "Config";
    case "docs":
      return "Docs";
    case "package":
      return "Package";
    case "source":
      return "Source";
    case "tests":
      return "Tests";
  }
}

function formatScore(score: number): string {
  if (!Number.isFinite(score)) return "0";
  return Number(score.toFixed(4)).toString();
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
