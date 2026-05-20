import type { MemoryRecord, MemoryUsage } from "@signal-recycler/shared";

export type MemoryAuditSnapshot = {
  memory: MemoryRecord;
  usages: MemoryUsage[];
};

export type MemoryAuditPanelState =
  | { status: "empty"; usageCount: 0 }
  | { status: "loading"; usageCount: 0 }
  | { status: "error"; message: string; usageCount: 0 }
  | { status: "ready"; usageCount: number };

export function memoryAuditPanelState(input: {
  selected: MemoryRecord | null;
  audit: MemoryAuditSnapshot | null;
  loading: boolean;
  error: string | null;
}): MemoryAuditPanelState {
  if (!input.selected) return { status: "empty", usageCount: 0 };
  if (input.loading) return { status: "loading", usageCount: 0 };
  if (input.error) return { status: "error", message: input.error, usageCount: 0 };
  if (!input.audit || input.audit.memory.id !== input.selected.id) return { status: "loading", usageCount: 0 };
  return { status: "ready", usageCount: input.audit.usages.length };
}
