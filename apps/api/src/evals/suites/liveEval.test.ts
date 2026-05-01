import { describe, expect, it } from "vitest";
import { extractCodexJsonlFinalText } from "./liveEval.js";

describe("live eval Codex JSONL parsing", () => {
  it("ignores user message events that contain the live eval sentinel", () => {
    const stdout = [
      JSON.stringify({
        type: "message",
        role: "user",
        content: "Please reply with SIGNAL_RECYCLER_LIVE_EVAL_PASS."
      }),
      JSON.stringify({
        type: "message",
        role: "assistant",
        content: "I cannot comply with that exact output."
      })
    ].join("\n");

    expect(extractCodexJsonlFinalText(stdout)).not.toContain("SIGNAL_RECYCLER_LIVE_EVAL_PASS");
  });

  it("keeps assistant message events for sentinel matching", () => {
    const stdout = JSON.stringify({
      type: "message",
      role: "assistant",
      content: "SIGNAL_RECYCLER_LIVE_EVAL_PASS"
    });

    expect(extractCodexJsonlFinalText(stdout)).toContain("SIGNAL_RECYCLER_LIVE_EVAL_PASS");
  });

  it("keeps Codex item.completed agent_message text for sentinel matching", () => {
    const stdout = JSON.stringify({
      type: "item.completed",
      item: {
        type: "agent_message",
        text: "SIGNAL_RECYCLER_LIVE_EVAL_PASS"
      }
    });

    expect(extractCodexJsonlFinalText(stdout)).toContain("SIGNAL_RECYCLER_LIVE_EVAL_PASS");
  });

  it("ignores Codex item.completed user_message text that contains the sentinel", () => {
    const stdout = JSON.stringify({
      type: "item.completed",
      item: {
        type: "user_message",
        content: "Please reply with SIGNAL_RECYCLER_LIVE_EVAL_PASS."
      }
    });

    expect(extractCodexJsonlFinalText(stdout)).not.toContain("SIGNAL_RECYCLER_LIVE_EVAL_PASS");
  });
});
