import { describe, expect, it } from "vitest";
import { type ApiClient } from "./apiClient.js";
import { runCommand } from "./runCommand.js";
import { type TimelineEvent } from "./types.js";

function event(id: string, title: string): TimelineEvent {
  return {
    id,
    sessionId: "session_1",
    category: "codex_event",
    title,
    body: "",
    metadata: {},
    createdAt: "2026-05-03T00:00:00.000Z"
  };
}

describe("runCommand", () => {
  it("creates a durable session before running when no session id is supplied", async () => {
    const calls: string[] = [];
    const output: string[] = [];
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock", "codex_cli"]
      }),
      createSession: async (title?: string) => {
        calls.push(`create:${title ?? ""}`);
        return { id: "session_1", projectId: "demo", title: title ?? "Session", createdAt: "now" };
      },
      runSession: async (sessionId: string, prompt: string) => {
        calls.push(`run:${sessionId}:${prompt}`);
        return { finalResponse: "done", candidateRules: [] };
      },
      listEvents: async () => []
    } satisfies ApiClient;

    const summary = await runCommand(
      {
        command: "run",
        prompt: "fix tests",
        agent: "mock",
        apiBaseUrl: "http://127.0.0.1:3001",
        watch: false,
        json: false
      },
      { client, write: (line) => output.push(line), sleep: async () => undefined }
    );

    expect(calls).toEqual(["create:fix tests", "run:session_1:fix tests"]);
    expect(summary).toMatchObject({ sessionId: "session_1", continued: false });
    expect(output.join("\n")).toContain("Signal Recycler session session_1");
  });

  it("continues an existing session without creating a new one", async () => {
    const calls: string[] = [];
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock", "codex_cli"]
      }),
      createSession: async () => {
        calls.push("create");
        throw new Error("should not create");
      },
      runSession: async (sessionId: string, prompt: string) => {
        calls.push(`run:${sessionId}:${prompt}`);
        return { finalResponse: "continued", candidateRules: [] };
      },
      listEvents: async () => []
    } satisfies ApiClient;

    const summary = await runCommand(
      {
        command: "run",
        prompt: "continue",
        agent: "mock",
        apiBaseUrl: "http://127.0.0.1:3001",
        sessionId: "session_existing",
        watch: false,
        json: false
      },
      { client, write: () => undefined, sleep: async () => undefined }
    );

    expect(calls).toEqual(["run:session_existing:continue"]);
    expect(summary).toMatchObject({ sessionId: "session_existing", continued: true });
  });

  it("rejects unavailable adapters before running", async () => {
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock"]
      }),
      createSession: async () => ({ id: "session_1", projectId: "demo", title: "Session", createdAt: "now" }),
      runSession: async () => ({ finalResponse: "done", candidateRules: [] }),
      listEvents: async () => []
    } satisfies ApiClient;

    await expect(
      runCommand(
        {
          command: "run",
          prompt: "fix tests",
          agent: "codex_cli",
          apiBaseUrl: "http://127.0.0.1:3001",
          watch: false,
          json: false
        },
        { client, write: () => undefined, sleep: async () => undefined }
      )
    ).rejects.toThrow("Adapter codex_cli is not available");
  });

  it("prints watched events once while run is active", async () => {
    const output: string[] = [];
    let eventCalls = 0;
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock"]
      }),
      createSession: async () => ({ id: "session_1", projectId: "demo", title: "Session", createdAt: "now" }),
      runSession: async () => ({ finalResponse: "done", candidateRules: [] }),
      listEvents: async () => {
        eventCalls += 1;
        return eventCalls === 1
          ? [event("event_1", "User prompt")]
          : [event("event_1", "User prompt"), event("event_2", "Codex response")];
      }
    } satisfies ApiClient;

    await runCommand(
      {
        command: "run",
        prompt: "fix tests",
        agent: "mock",
        apiBaseUrl: "http://127.0.0.1:3001",
        watch: true,
        json: false
      },
      { client, write: (line) => output.push(line), sleep: async () => undefined }
    );

    expect(output.filter((line) => line.includes("User prompt"))).toHaveLength(1);
    expect(output.filter((line) => line.includes("Codex response"))).toHaveLength(1);
  });

  it("does not replay previous events when continuing a watched session", async () => {
    const output: string[] = [];
    let eventCalls = 0;
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock"]
      }),
      createSession: async () => {
        throw new Error("should not create");
      },
      runSession: async () => ({ finalResponse: "continued", candidateRules: [] }),
      listEvents: async () => {
        eventCalls += 1;
        const previous = event("event_old", "Previous turn");
        return eventCalls === 1 ? [previous] : [previous, event("event_new", "Current turn")];
      }
    } satisfies ApiClient;

    await runCommand(
      {
        command: "run",
        prompt: "continue",
        agent: "mock",
        apiBaseUrl: "http://127.0.0.1:3001",
        sessionId: "session_existing",
        watch: true,
        json: false
      },
      { client, write: (line) => output.push(line), sleep: async () => undefined }
    );

    expect(output.some((line) => line.includes("Previous turn"))).toBe(false);
    expect(output.some((line) => line.includes("Current turn"))).toBe(true);
  });

  it("writes only the final summary to stdout in JSON mode", async () => {
    const output: string[] = [];
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock"]
      }),
      createSession: async () => ({ id: "session_1", projectId: "demo", title: "Session", createdAt: "now" }),
      runSession: async () => ({ finalResponse: "done", candidateRules: [] }),
      listEvents: async () => [event("event_1", "User prompt"), event("event_2", "Codex response")]
    } satisfies ApiClient;

    await runCommand(
      {
        command: "run",
        prompt: "fix tests",
        agent: "mock",
        apiBaseUrl: "http://127.0.0.1:3001",
        watch: true,
        json: true
      },
      { client, write: (line) => output.push(line), sleep: async () => undefined }
    );

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      sessionId: "session_1",
      agent: "mock",
      status: "completed",
      finalResponse: "done"
    });
  });

  it("does not dump timeline events when watch is disabled", async () => {
    const output: string[] = [];
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock"]
      }),
      createSession: async () => ({ id: "session_1", projectId: "demo", title: "Session", createdAt: "now" }),
      runSession: async () => ({ finalResponse: "done", candidateRules: [] }),
      listEvents: async () => [event("event_1", "User prompt"), event("event_2", "Codex response")]
    } satisfies ApiClient;

    await runCommand(
      {
        command: "run",
        prompt: "fix tests",
        agent: "mock",
        apiBaseUrl: "http://127.0.0.1:3001",
        watch: false,
        json: false
      },
      { client, write: (line) => output.push(line), sleep: async () => undefined }
    );

    expect(output.some((line) => line.includes("[agent]"))).toBe(false);
    expect(output.join("\n")).toContain("Final response:");
  });

  it("does not replay previous events when continuing without watch", async () => {
    const output: string[] = [];
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock"]
      }),
      createSession: async () => {
        throw new Error("should not create");
      },
      runSession: async () => ({ finalResponse: "continued", candidateRules: [] }),
      listEvents: async () => [event("event_old", "Previous turn"), event("event_new", "Current turn")]
    } satisfies ApiClient;

    await runCommand(
      {
        command: "run",
        prompt: "continue",
        agent: "mock",
        apiBaseUrl: "http://127.0.0.1:3001",
        sessionId: "session_existing",
        watch: false,
        json: false
      },
      { client, write: (line) => output.push(line), sleep: async () => undefined }
    );

    expect(output.some((line) => line.includes("Previous turn"))).toBe(false);
    expect(output.some((line) => line.includes("Current turn"))).toBe(false);
  });
});
