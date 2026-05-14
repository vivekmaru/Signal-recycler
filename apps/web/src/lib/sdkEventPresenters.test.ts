import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "@signal-recycler/shared";
import { sdkEventBadges, sdkEventFacts, summarizeSdkSession } from "./sdkEventPresenters";

const baseEvent = {
  id: "event_1",
  sessionId: "session_1",
  category: "codex_event",
  title: "Codex event",
  body: "",
  createdAt: "2026-05-13T00:00:00.000Z"
} satisfies Omit<TimelineEvent, "metadata">;

describe("SDK event presenters", () => {
  it("summarizes new SDK-backed Codex sessions from thread and usage events", () => {
    const summary = summarizeSdkSession([
      event("thread", { sdkEventType: "thread.started", codexThreadId: "thread_1" }),
      event("message", { sdkEventType: "item.completed", itemType: "agent_message", codexThreadId: "thread_1" }),
      event("usage", {
        sdkEventType: "turn.completed",
        codexThreadId: "thread_1",
        usage: {
          input_tokens: 120,
          cached_input_tokens: 20,
          output_tokens: 30,
          reasoning_output_tokens: 4
        }
      })
    ]);

    expect(summary).toEqual({
      codexThreadId: "thread_1",
      eventCount: 3,
      itemCount: 1,
      lifecycle: "new_thread",
      totalInputTokens: 120,
      totalOutputTokens: 30
    });
  });

  it("summarizes resumed SDK-backed Codex sessions when no thread.started event appears", () => {
    const summary = summarizeSdkSession([
      event("message", { sdkEventType: "item.completed", itemType: "agent_message", codexThreadId: "thread_existing" })
    ]);

    expect(summary).toMatchObject({
      codexThreadId: "thread_existing",
      lifecycle: "resumed_thread"
    });
  });

  it("treats multi-prompt sessions with a thread id as resumed after the first turn", () => {
    const summary = summarizeSdkSession([
      event("prompt_1", { phase: "input" }),
      event("thread", { sdkEventType: "thread.started", codexThreadId: "thread_1" }),
      event("prompt_2", { phase: "input" }),
      event("message", { sdkEventType: "item.completed", itemType: "agent_message", codexThreadId: "thread_1" })
    ]);

    expect(summary).toMatchObject({
      codexThreadId: "thread_1",
      lifecycle: "resumed_thread"
    });
  });

  it("keeps a later SDK run marked as new when it starts a fresh thread after earlier prompts", () => {
    const summary = summarizeSdkSession([
      event("prompt_1", { phase: "input" }),
      event("legacy_response", { phase: "output" }),
      event("prompt_2", { phase: "input" }),
      event("thread_2", { sdkEventType: "thread.started", codexThreadId: "thread_2" }),
      event("message", { sdkEventType: "item.completed", itemType: "agent_message", codexThreadId: "thread_2" })
    ]);

    expect(summary).toMatchObject({
      codexThreadId: "thread_2",
      lifecycle: "new_thread"
    });
  });

  it("extracts compact event facts for the inspector", () => {
    expect(
      sdkEventFacts(
        event("usage", {
          sdkEventType: "turn.completed",
          itemType: "agent_message",
          codexThreadId: "thread_1",
          usage: {
            input_tokens: 120,
            cached_input_tokens: 20,
            output_tokens: 30,
            reasoning_output_tokens: 4
          }
        })
      )
    ).toEqual([
      { label: "SDK event", value: "turn.completed" },
      { label: "Item type", value: "agent_message" },
      { label: "Codex thread", value: "thread_1" },
      { label: "Input tokens", value: "120" },
      { label: "Cached input", value: "20" },
      { label: "Output tokens", value: "30" },
      { label: "Reasoning tokens", value: "4" }
    ]);
  });

  it("builds short timeline badges from SDK metadata", () => {
    expect(
      sdkEventBadges(
        event("message", { sdkEventType: "item.completed", itemType: "agent_message", codexThreadId: "thread_1" })
      )
    ).toEqual(["item.completed", "agent_message"]);
  });
});

function event(id: string, metadata: TimelineEvent["metadata"]): TimelineEvent {
  return {
    ...baseEvent,
    id,
    metadata
  };
}
