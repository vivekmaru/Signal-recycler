import { type RunSummary, type TimelineEvent } from "./types.js";

export function formatEventLine(event: TimelineEvent): string {
  if (event.category === "memory_retrieval") return `[memory] ${event.title}`;
  if (event.category === "memory_injection") return `[context] ${event.title}`;
  if (event.category === "classifier_result") return `[learn] ${event.title}`;
  if (event.category === "rule_candidate" || event.category === "rule_auto_approved") return `[memory] ${event.title}`;
  if (event.category === "codex_event") return `[agent] ${event.title}`;
  return `[event] ${event.title}`;
}

export function formatSummary(summary: RunSummary): string {
  const lines = [
    "",
    "Final response:",
    summary.finalResponse || "(no final response)",
    "",
    `Session: ${summary.sessionId}`,
    `Agent: ${summary.agent}`,
    `Dashboard: ${summary.dashboardUrl}`,
    `Events observed: ${summary.events}`
  ];

  if (!summary.continued) {
    lines.push("", "Continue this session:", `sr run --session ${summary.sessionId} "next prompt"`);
  }

  return lines.join("\n");
}

export function formatJsonSummary(summary: RunSummary): string {
  return JSON.stringify(
    {
      sessionId: summary.sessionId,
      agent: summary.agent,
      status: "completed",
      finalResponse: summary.finalResponse,
      dashboardUrl: summary.dashboardUrl,
      events: summary.events,
      continued: summary.continued
    },
    null,
    2
  );
}
