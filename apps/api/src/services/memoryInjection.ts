import { type MemoryRecord } from "@signal-recycler/shared";
import { type SignalRecyclerStore } from "../store.js";

type RecordMemoryInjectionInput = {
  store: SignalRecyclerStore;
  projectId: string;
  sessionId: string;
  adapter: string;
  memories: MemoryRecord[];
  reason: string;
  metadata?: Record<string, unknown>;
};

export function recordMemoryInjection(input: RecordMemoryInjectionInput): void {
  if (input.memories.length === 0) return;

  for (const memory of input.memories) {
    assertInjectableMemory(input.store, input.projectId, memory);
  }

  const event = input.store.createEvent({
    sessionId: input.sessionId,
    category: "memory_injection",
    title: `Injected ${input.memories.length} memor${input.memories.length === 1 ? "y" : "ies"}`,
    body: input.memories.map((memory) => `- ${memory.category}: ${memory.rule}`).join("\n"),
    metadata: {
      ...input.metadata,
      projectId: input.projectId,
      adapter: input.adapter,
      reason: input.reason,
      memoryIds: input.memories.map((memory) => memory.id),
      sources: input.memories.map((memory) => ({
        id: memory.id,
        source: memory.source,
        scope: memory.scope,
        syncStatus: memory.syncStatus
      }))
    }
  });

  for (const memory of input.memories) {
    input.store.recordMemoryUsage({
      projectId: input.projectId,
      memoryId: memory.id,
      sessionId: input.sessionId,
      eventId: event.id,
      adapter: input.adapter,
      reason: input.reason
    });
  }
}

function assertInjectableMemory(
  store: SignalRecyclerStore,
  projectId: string,
  memory: MemoryRecord
): void {
  const current = store.getRule(memory.id);
  if (!current || current.projectId !== projectId) {
    throw new Error(`Rule not found for project: ${memory.id}`);
  }
  if (
    memory.projectId !== projectId ||
    memory.status !== "approved" ||
    memory.supersededBy !== null ||
    current.status !== "approved" ||
    current.supersededBy !== null
  ) {
    throw new Error(`Rule is not injectable: ${memory.id}`);
  }
}
