import type { MemoryRecord, MemorySource } from "@signal-recycler/shared";

export function countMemoriesByStatus(memories: MemoryRecord[]) {
  return {
    all: memories.length,
    approved: memories.filter((memory) => memory.status === "approved" && !memory.supersededBy).length,
    pending: memories.filter((memory) => memory.status === "pending").length,
    rejected: memories.filter((memory) => memory.status === "rejected").length,
    superseded: memories.filter((memory) => memory.supersededBy).length
  };
}

export function memorySourceLabel(source: MemorySource): string {
  switch (source.kind) {
    case "manual":
      return "manual";
    case "event":
      return "learned";
    case "synced_file":
      return source.path;
    case "import":
      return `${source.label} import`;
    case "source_chunk":
      return source.path;
  }
}

export function memoryScopeLabel(memory: MemoryRecord): string {
  return memory.scope.value ? `${memory.scope.type}:${memory.scope.value}` : memory.scope.type;
}

export function confidenceValue(memory: MemoryRecord): number {
  if (memory.confidence === "high") return 0.9;
  if (memory.confidence === "medium") return 0.7;
  return 0.4;
}
