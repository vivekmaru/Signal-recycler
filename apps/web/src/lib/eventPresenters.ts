import type { EventCategory, MemoryRetrievalResult, TimelineEvent } from "@signal-recycler/shared";
import type { TimelineGroup, TimelineGroupId } from "../types";

export type CandidateEventGroup = {
  id: string;
  ruleId: string | null;
  events: TimelineEvent[];
  primaryEvent: TimelineEvent;
};

const GROUP_TITLES: Record<TimelineGroupId, string> = {
  agent: "Agent Activity",
  context: "Context Operations",
  memory: "Memory Events",
  tools: "Tool Calls",
  errors: "Errors",
  files: "Files"
};

export function eventGroupId(event: TimelineEvent): TimelineGroupId {
  if (event.title.toLowerCase().includes("failed") || event.metadata["phase"] === "codex_error") {
    return "errors";
  }
  if (event.category === "codex_event") {
    const title = event.title.toLowerCase();
    if (title.includes("tool") || title.includes("command")) return "tools";
    return "agent";
  }
  if (event.category === "memory_injection" || event.category === "rule_candidate" || event.category === "rule_auto_approved") {
    return "memory";
  }
  if (event.category === "memory_retrieval" || event.category === "compression_result" || event.category === "proxy_request") {
    return "context";
  }
  return "agent";
}

export function groupTimelineEvents(events: TimelineEvent[]): TimelineGroup[] {
  const grouped = new Map<TimelineGroupId, TimelineEvent[]>();
  for (const event of events) {
    const id = eventGroupId(event);
    grouped.set(id, [...(grouped.get(id) ?? []), event]);
  }
  return Array.from(grouped.entries()).map(([id, groupEvents]) => ({
    id,
    title: GROUP_TITLES[id],
    events: groupEvents
  }));
}

export function groupCandidateEvents(events: TimelineEvent[]): CandidateEventGroup[] {
  const grouped = new Map<string, TimelineEvent[]>();

  for (const event of events) {
    if (event.category !== "rule_candidate" && event.category !== "rule_auto_approved") continue;
    const ruleId = typeof event.metadata["ruleId"] === "string" ? event.metadata["ruleId"] : null;
    const id = ruleId ?? event.id;
    grouped.set(id, [...(grouped.get(id) ?? []), event]);
  }

  return Array.from(grouped.entries()).flatMap(([id, groupEvents]) => {
    const primaryEvent = groupEvents.find((event) => event.category === "rule_candidate") ?? groupEvents[0];
    if (!primaryEvent) return [];
    return [
      {
        id,
        ruleId: typeof groupEvents[0]?.metadata["ruleId"] === "string" ? groupEvents[0].metadata["ruleId"] : null,
        events: groupEvents,
        primaryEvent
      }
    ];
  });
}

export function eventTone(category: EventCategory): "neutral" | "green" | "amber" | "red" | "blue" {
  if (category === "memory_injection" || category === "memory_retrieval") return "blue";
  if (category === "rule_candidate") return "amber";
  if (category === "rule_auto_approved") return "green";
  if (category === "compression_result") return "green";
  return "neutral";
}

export function summarizeMemoryRetrieval(metrics: MemoryRetrievalResult["metrics"]): string {
  return `Selected ${metrics.selectedMemories} · skipped ${metrics.skippedMemories} · approved ${metrics.approvedMemories}`;
}
