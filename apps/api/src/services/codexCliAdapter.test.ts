import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { createCodexCliAdapter, parseCodexJsonLine } from "./codexCliAdapter.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn()
}));

type FakeChild = EventEmitter & {
  stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
  stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
};

describe("parseCodexJsonLine", () => {
  it("parses assistant message events", () => {
    const raw = { type: "message", role: "assistant", content: "Done" };

    expect(parseCodexJsonLine(JSON.stringify(raw))).toEqual({
      kind: "message",
      body: "Done",
      raw
    });
  });

  it("parses Codex item.completed agent_message events as assistant messages", () => {
    const raw = { type: "item.completed", item: { type: "agent_message", text: "Done" } };

    expect(parseCodexJsonLine(JSON.stringify(raw))).toEqual({
      kind: "message",
      body: "Done",
      raw
    });
  });

  it("does not parse Codex item.completed user_message events as assistant messages", () => {
    const raw = { type: "item.completed", item: { type: "user_message", text: "Done" } };

    expect(parseCodexJsonLine(JSON.stringify(raw))).toEqual({
      kind: "raw",
      body: JSON.stringify(raw),
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

describe("createCodexCliAdapter", () => {
  it("runs Codex CLI with skip-git-repo-check for non-repo working directories", async () => {
    const child = createFakeChild();
    vi.mocked(spawn).mockReturnValueOnce(child as never);
    const adapter = createCodexCliAdapter({
      store: { createEvent: vi.fn() } as never,
      command: "codex-test"
    });

    const run = adapter.run({
      sessionId: "session-1",
      prompt: "Run.",
      workingDirectory: "/tmp/not-a-git-repo"
    });
    child.emit("close", 0);

    await expect(run).resolves.toMatchObject({ finalResponse: "", items: [] });
    expect(spawn).toHaveBeenCalledWith(
      "codex-test",
      ["exec", "--json", "--skip-git-repo-check", "Run."],
      expect.objectContaining({
        cwd: "/tmp/not-a-git-repo"
      })
    );
  });

  it("rejects and kills the child process when event persistence fails", async () => {
    const child = createFakeChild();
    vi.mocked(spawn).mockReturnValueOnce(child as never);
    const adapter = createCodexCliAdapter({
      store: {
        createEvent: () => {
          throw new Error("db write failed");
        }
      } as never,
      command: "codex-test"
    });

    const run = adapter.run({ sessionId: "session-1", prompt: "Run." });
    child.stdout.emit("data", `${JSON.stringify({ type: "message", role: "assistant", content: "Done" })}\n`);

    await expect(run).rejects.toThrow("db write failed");
    expect(child.kill).toHaveBeenCalled();
  });

  it("caps retained items while continuing to emit events", async () => {
    const child = createFakeChild();
    vi.mocked(spawn).mockReturnValueOnce(child as never);
    const createEvent = vi.fn();
    const adapter = createCodexCliAdapter({
      store: { createEvent } as never,
      command: "codex-test"
    });

    const run = adapter.run({ sessionId: "session-1", prompt: "Run." });
    for (let index = 0; index < 201; index += 1) {
      child.stdout.emit("data", `${JSON.stringify({ type: "tool_call", index })}\n`);
    }
    child.emit("close", 0);

    const result = await run;
    expect(result.items).toHaveLength(200);
    expect(createEvent).toHaveBeenCalledTimes(201);
  });

  it("truncates retained stderr in non-zero exit errors", async () => {
    const child = createFakeChild();
    vi.mocked(spawn).mockReturnValueOnce(child as never);
    const adapter = createCodexCliAdapter({
      store: { createEvent: vi.fn() } as never,
      command: "codex-test"
    });

    const run = adapter.run({ sessionId: "session-1", prompt: "Run." });
    child.stderr.emit("data", "x".repeat(9000));
    child.emit("close", 1);

    await expect(run).rejects.toThrow(`${"x".repeat(7988)}\n[truncated]`);
  });
});

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.kill = vi.fn();
  return child;
}
