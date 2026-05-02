import { describe, expect, it } from "vitest";
import { parseCodexJsonLine } from "./codexCliAdapter.js";

describe("parseCodexJsonLine", () => {
  it("parses assistant message events", () => {
    const raw = { type: "message", role: "assistant", content: "Done" };

    expect(parseCodexJsonLine(JSON.stringify(raw))).toEqual({
      kind: "message",
      body: "Done",
      raw
    });
  });

  it("parses unknown JSON events as raw JSON", () => {
    const raw = { type: "tool_call", name: "shell" };

    expect(parseCodexJsonLine(JSON.stringify(raw))).toEqual({
      kind: "raw",
      body: JSON.stringify(raw),
      raw
    });
  });

  it("parses non-JSON lines as raw text", () => {
    expect(parseCodexJsonLine("not-json")).toEqual({
      kind: "raw",
      body: "not-json",
      raw: "not-json"
    });
  });
});
