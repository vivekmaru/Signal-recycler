import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses default run prompt", () => {
    expect(parseArgs(["run", "fix", "the", "tests"])).toEqual({
      command: "run",
      prompt: "fix the tests",
      agent: "default",
      apiBaseUrl: "http://127.0.0.1:3001",
      watch: true,
      json: false
    });
  });

  it("maps codex alias to codex_cli", () => {
    expect(parseArgs(["run", "--agent", "codex", "fix it"])).toMatchObject({
      command: "run",
      agent: "codex_cli",
      prompt: "fix it"
    });
  });

  it("accepts explicit session continuation", () => {
    expect(parseArgs(["run", "--session", "session_123", "continue work"])).toMatchObject({
      command: "run",
      sessionId: "session_123",
      prompt: "continue work"
    });
  });

  it("rejects title while continuing an existing session", () => {
    expect(() =>
      parseArgs(["run", "--session", "session_123", "--title", "New title", "continue work"])
    ).toThrow("--title can only be used when creating a new session");
  });

  it("rejects empty prompt", () => {
    expect(() => parseArgs(["run"])).toThrow("Prompt is required");
  });

  it("rejects unknown agents", () => {
    expect(() => parseArgs(["run", "--agent", "llama", "fix it"])).toThrow("Unsupported agent: llama");
  });

  it("rejects invalid API URLs", () => {
    expect(() => parseArgs(["run", "--api", "not a url", "fix it"])).toThrow("Invalid --api URL");
  });
});
