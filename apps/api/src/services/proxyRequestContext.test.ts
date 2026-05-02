import { describe, expect, it } from "vitest";
import { renderPlaybookBlock } from "../playbook.js";
import {
  analyzeProxyRequestContext,
  isSignalRecyclerInternalRequest
} from "./proxyRequestContext.js";

const packageMemory = {
  id: "rule_package",
  category: "package-manager",
  rule: "Use pnpm test instead of npm test."
};

const themeMemory = {
  id: "rule_theme",
  category: "theme",
  rule: "Use approved theme tokens for UI theme changes."
};

describe("proxy request context", () => {
  it("detects classifier requests by schema name", () => {
    expect(
      isSignalRecyclerInternalRequest({
        input: [{ role: "user", content: "anything" }],
        text: { format: { name: "signal_recycler_classifier" } }
      })
    ).toBe(true);
  });

  it("detects classifier requests by system marker", () => {
    expect(
      isSignalRecyclerInternalRequest({
        input: [
          { role: "system", content: "Classify this Codex turn for Signal Recycler." },
          { role: "user", content: "{}" }
        ]
      })
    ).toBe(true);
  });

  it("does not treat user-quoted classifier marker as internal", () => {
    expect(
      isSignalRecyclerInternalRequest({
        input: [
          {
            role: "user",
            content: "Please document this text: Classify this Codex turn for Signal Recycler."
          }
        ]
      })
    ).toBe(false);
  });

  it("extracts retrieval query from user prompt and strips existing playbook blocks", () => {
    const result = analyzeProxyRequestContext({
      input: [
        { role: "system", content: renderPlaybookBlock([packageMemory, themeMemory]) },
        { role: "user", content: "Run package manager validation for this repo." }
      ]
    });

    expect(result).toEqual({
      internalSignalRecyclerRequest: false,
      query: "Run package manager validation for this repo.",
      querySource: "user_input",
      strippedPlaybookBlocks: 1
    });
  });
});
