import type { AgentAdapter, MemoryRetrievalDecision, MemoryRetrievalResult, SkippedMemory } from "@signal-recycler/shared";
import type { BadgeTone } from "../components/Badge";

export type RunAdapterOption = {
  value: AgentAdapter;
  label: string;
};

export type MemoryPreviewMetric = {
  label: string;
  value: string;
  tone: BadgeTone;
};

export type SelectedMemoryPreviewRow = {
  id: string;
  title: string;
  detail: string;
  reason: string;
  score: string;
  rank: string | null;
};

export type SkippedMemoryPreviewRow = {
  id: string;
  reason: string;
};

export type MemoryPreviewRows = {
  metrics: MemoryPreviewMetric[];
  selectedRows: SelectedMemoryPreviewRow[];
  skippedRows: SkippedMemoryPreviewRow[];
};

const adapterOptions = [
  { value: "default", label: "Auto adapter" },
  { value: "mock", label: "Mock" },
  { value: "codex_cli", label: "Codex CLI (SDK-backed)" },
  { value: "codex_sdk", label: "Codex SDK proxy" }
] satisfies RunAdapterOption[];

export function runAdapterOptions(availableAdapters: AgentAdapter[]): RunAdapterOption[] {
  const available = new Set(availableAdapters);
  return adapterOptions.filter((option) => available.has(option.value));
}

export function buildMemoryPreviewRows(result: MemoryRetrievalResult): MemoryPreviewRows {
  return {
    metrics: [
      { label: "Selected", value: String(result.metrics.selectedMemories), tone: "blue" },
      { label: "Skipped", value: String(result.metrics.skippedMemories), tone: "neutral" },
      { label: "Approved", value: String(result.metrics.approvedMemories), tone: "green" },
      { label: "Limit", value: String(result.metrics.limit), tone: "neutral" }
    ],
    selectedRows: result.selected.map(selectedMemoryPreviewRow),
    skippedRows: result.skipped.map(skippedMemoryPreviewRow)
  };
}

function selectedMemoryPreviewRow(decision: MemoryRetrievalDecision): SelectedMemoryPreviewRow {
  return {
    id: decision.memoryId,
    title: decision.category,
    detail: decision.memoryType.replaceAll("_", " "),
    reason: decision.reason,
    score: formatScore(decision.score),
    rank: decision.rank === null ? null : String(decision.rank)
  };
}

function skippedMemoryPreviewRow(memory: SkippedMemory): SkippedMemoryPreviewRow {
  return {
    id: memory.memoryId,
    reason: memory.reason
  };
}

function formatScore(score: number): string {
  if (!Number.isFinite(score)) return "0";
  return Number(score.toFixed(4)).toString();
}
