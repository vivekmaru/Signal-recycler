import { describe, expect, it } from "vitest";
import { formatEventLine, formatSummary } from "./output.js";
import { type TimelineEvent } from "./types.js";

function event(input: Partial<TimelineEvent> & Pick<TimelineEvent, "category" | "title">): TimelineEvent {
  return {
    id: input.id ?? "event_1",
    sessionId: "session_1",
    category: input.category,
    title: input.title,
    body: input.body ?? "",
    metadata: input.metadata ?? {},
    createdAt: "2026-05-03T00:00:00.000Z"
  };
}

describe("output formatting", () => {
  it("formats memory retrieval counts", () => {
    expect(
      formatEventLine(
        event({
          category: "memory_retrieval",
          title: "Retrieved 1 of 2 approved memories",
          metadata: {
            retrieval: {
              metrics: { selectedMemories: 1, skippedMemories: 1 }
            }
          }
        })
      )
    ).toBe("[memory] Retrieved 1 of 2 approved memories");
  });

  it("formats generic agent events", () => {
    expect(formatEventLine(event({ category: "codex_event", title: "Codex response", body: "Done." }))).toBe(
      "[agent] Codex response"
    );
  });

  it("formats final text summary", () => {
    expect(
      formatSummary({
        sessionId: "session_1",
        agent: "codex_cli",
        finalResponse: "Done.",
        dashboardUrl: "http://127.0.0.1:5173",
        events: 4,
        continued: false
      })
    ).toContain("Continue this session:\nsr run --session session_1 \"next prompt\"");
  });
});
