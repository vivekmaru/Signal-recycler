import { describe, expect, it, vi } from "vitest";
import { createCodexCliAdapter } from "./codexCliAdapter.js";

type FakeCodexEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "item.completed"; item: { id: string; type: "agent_message"; text: string } }
  | { type: "item.completed"; item: { id: string; type: "command_execution"; command: string; aggregated_output: string; status: string } }
  | { type: "turn.completed"; usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number; reasoning_output_tokens: number } }
  | { type: "turn.failed"; error: { message: string } };

function fakeCodex(events: FakeCodexEvent[]) {
  const startThread = vi.fn(() => fakeThread(events));
  const resumeThread = vi.fn(() => fakeThread(events));
  return { startThread, resumeThread };
}

function fakeThread(events: FakeCodexEvent[]) {
  return {
    runStreamed: vi.fn(async () => ({
      events: asyncGenerator(events)
    }))
  };
}

async function* asyncGenerator(events: FakeCodexEvent[]) {
  for (const event of events) yield event;
}

function store(input?: {
  events?: Array<{ metadata: Record<string, unknown> }>;
  createEvent?: (event: unknown) => unknown;
}) {
  return {
    listEvents: vi.fn(() => input?.events ?? []),
    createEvent: vi.fn(input?.createEvent ?? ((event) => event))
  };
}

describe("createCodexCliAdapter", () => {
  it("starts a Codex SDK thread with the working directory and skip-git-repo-check", async () => {
    const codex = fakeCodex([
      { type: "thread.started", thread_id: "thread_new" },
      { type: "item.completed", item: { id: "item_1", type: "agent_message", text: "Done" } }
    ]);
    const testStore = store();
    const adapter = createCodexCliAdapter({
      store: testStore as never,
      codex: codex as never
    });

    await expect(
      adapter.run({
        sessionId: "session-1",
        prompt: "Run.",
        workingDirectory: "/tmp/not-a-git-repo"
      })
    ).resolves.toMatchObject({ finalResponse: "Done", items: [{ id: "item_1", type: "agent_message", text: "Done" }] });

    expect(codex.startThread).toHaveBeenCalledWith({
      workingDirectory: "/tmp/not-a-git-repo",
      skipGitRepoCheck: true
    });
    expect(codex.resumeThread).not.toHaveBeenCalled();
    expect(testStore.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Codex thread started",
        metadata: expect.objectContaining({
          adapter: "codex_cli",
          codexThreadId: "thread_new",
          sdkEventType: "thread.started"
        })
      })
    );
  });

  it("resumes the previous Codex SDK thread recorded on session events", async () => {
    const codex = fakeCodex([
      { type: "item.completed", item: { id: "item_1", type: "agent_message", text: "Continued" } }
    ]);
    const testStore = store({
      events: [
        { metadata: { codexThreadId: "thread_old" } },
        { metadata: { other: true } }
      ]
    });
    const adapter = createCodexCliAdapter({
      store: testStore as never,
      codex: codex as never
    });

    await adapter.run({ sessionId: "session-1", prompt: "Continue.", workingDirectory: "/repo" });

    expect(codex.resumeThread).toHaveBeenCalledWith("thread_old", {
      workingDirectory: "/repo",
      skipGitRepoCheck: true
    });
    expect(codex.startThread).not.toHaveBeenCalled();
    expect(testStore.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          codexThreadId: "thread_old",
          sdkEventType: "item.completed"
        })
      })
    );
  });

  it("records usage metadata from turn.completed events", async () => {
    const usage = {
      input_tokens: 10,
      cached_input_tokens: 2,
      output_tokens: 3,
      reasoning_output_tokens: 1
    };
    const codex = fakeCodex([{ type: "thread.started", thread_id: "thread_new" }, { type: "turn.completed", usage }]);
    const testStore = store();
    const adapter = createCodexCliAdapter({
      store: testStore as never,
      codex: codex as never
    });

    await adapter.run({ sessionId: "session-1", prompt: "Run." });

    expect(testStore.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Codex turn completed",
        metadata: expect.objectContaining({
          usage,
          sdkEventType: "turn.completed"
        })
      })
    );
  });

  it("rejects when a turn.failed event is streamed", async () => {
    const codex = fakeCodex([
      { type: "thread.started", thread_id: "thread_new" },
      { type: "turn.failed", error: { message: "permission denied" } }
    ]);
    const testStore = store();
    const adapter = createCodexCliAdapter({
      store: testStore as never,
      codex: codex as never
    });

    await expect(adapter.run({ sessionId: "session-1", prompt: "Run." })).rejects.toThrow("permission denied");
    expect(testStore.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Codex turn failed",
        metadata: expect.objectContaining({ sdkEventType: "turn.failed" })
      })
    );
  });

  it("rejects when event persistence fails", async () => {
    const codex = fakeCodex([
      { type: "thread.started", thread_id: "thread_new" },
      { type: "item.completed", item: { id: "item_1", type: "agent_message", text: "Done" } }
    ]);
    const adapter = createCodexCliAdapter({
      store: store({
        createEvent: () => {
          throw new Error("db write failed");
        }
      }) as never,
      codex: codex as never
    });

    await expect(adapter.run({ sessionId: "session-1", prompt: "Run." })).rejects.toThrow("db write failed");
  });

  it("caps retained completed items while continuing to emit events", async () => {
    const events: FakeCodexEvent[] = [{ type: "thread.started", thread_id: "thread_new" }];
    for (let index = 0; index < 201; index += 1) {
      events.push({
        type: "item.completed",
        item: {
          id: `item_${index}`,
          type: "command_execution",
          command: "echo ok",
          aggregated_output: String(index),
          status: "completed"
        }
      });
    }
    const codex = fakeCodex(events);
    const testStore = store();
    const adapter = createCodexCliAdapter({
      store: testStore as never,
      codex: codex as never
    });

    const result = await adapter.run({ sessionId: "session-1", prompt: "Run." });

    expect(result.items).toHaveLength(200);
    expect(testStore.createEvent).toHaveBeenCalledTimes(202);
  });
});
