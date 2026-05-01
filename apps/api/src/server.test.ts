import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createCodexRunner } from "./codexRunner.js";
import { createStore } from "./store.js";

const TEST_APP_OPTIONS = {
  projectId: "test-project",
  workingDirectory: "/tmp/test-project"
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("api", () => {
  it("creates a tracked session", async () => {
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { title: "Judge demo" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: "Judge demo",
      projectId: TEST_APP_OPTIONS.projectId
    });
  });

  it("returns smoke database metadata in config", async () => {
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      databasePath: "/tmp/signal-recycler-smoke.sqlite",
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({ method: "GET", url: "/api/config" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      database: {
        basename: "signal-recycler-smoke.sqlite",
        isSmoke: true
      }
    });
  });

  it("returns recent events through the firehose endpoint", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const session = store.createSession({
      projectId: TEST_APP_OPTIONS.projectId,
      title: "Firehose"
    });
    store.createEvent({
      sessionId: session.id,
      category: "codex_event",
      title: "Tracked event",
      body: "Visible in dashboard firehose"
    });

    const response = await app.inject({ method: "GET", url: "/api/firehose/events?limit=10" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        sessionId: session.id,
        category: "codex_event",
        title: "Tracked event"
      })
    ]);
  });

  it("creates rule candidates during a run and emits ordered events", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => ({
          finalResponse:
            "I tried npm install and it failed. The user corrected me to use pnpm test instead.",
          items: [{ type: "message", text: "npm failed" }]
        })
      }
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const run = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: { prompt: "Phase 1" }
    });
    const events = await app.inject({ method: "GET", url: `/api/sessions/${id}/events` });
    const candidate = run.json().candidateRules[0];

    expect(run.statusCode).toBe(200);
    expect(candidate.source).toMatchObject({
      kind: "event",
      sessionId: id,
      eventId: expect.stringMatching(/^event_/)
    });
    expect(candidate.confidence).toBe("high");
    expect(events.json().map((event: { category: string }) => event.category)).toEqual(
      expect.arrayContaining(["codex_event", "classifier_result", "rule_candidate"])
    );
  });

  it("creates manual memories with manual provenance", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      projectId: "demo",
      workingDirectory: "/tmp/demo",
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/memories",
      payload: {
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The repository uses pnpm workspaces.",
        memoryType: "command_convention",
        scope: { type: "project", value: null }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "approved",
      memoryType: "command_convention",
      source: { kind: "manual", author: "local-user" },
      syncStatus: "local"
    });
  });

  it("creates a manually approved playbook rule", async () => {
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/rules",
      payload: {
        category: "frontend",
        rule: "For frontend tasks, never modify apps/api unless explicitly asked.",
        reason: "Manual guardrail before running a broad UI prompt."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "approved",
      category: "frontend",
      rule: "For frontend tasks, never modify apps/api unless explicitly asked.",
      reason: "Manual guardrail before running a broad UI prompt."
    });
  });

  it("returns a clear gateway error when the Codex runner fails", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => {
          throw new Error("unexpected status 401 Unauthorized: Missing scopes: api.responses.write");
        }
      }
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: { prompt: "Run live Codex" }
    });
    const events = store.listEvents(id);

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: "Codex run failed",
      message: expect.stringContaining("api.responses.write")
    });
    expect(events.some((event) => event.title === "Codex run failed")).toBe(true);
  });

  it("does not reject proxy requests before the handler when content-length is stale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/proxy/v1/responses",
      headers: {
        "content-type": "application/json",
        "content-length": "9999"
      },
      payload: JSON.stringify({ input: "hello" })
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("records injection metadata on proxy requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    const store = createStore(":memory:");
    const manualRule = store.createRuleCandidate({
      projectId: TEST_APP_OPTIONS.projectId,
      category: "tooling",
      rule: "Use pnpm for package scripts.",
      reason: "Manual setup rule."
    });
    store.approveRule(manualRule.id);
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/proxy/v1/responses",
      headers: {
        "content-type": "application/json",
        "x-signal-recycler-session-id": "proxy"
      },
      payload: JSON.stringify({ input: "hello" })
    });
    const events = store.listEvents("proxy");

    expect(response.statusCode).toBe(200);
    expect(events.find((event) => event.category === "proxy_request")?.metadata).toMatchObject({
      injectedRules: 1
    });
  });

  it("does not emit standalone proxy injection events from the Codex runner", async () => {
    vi.stubEnv("SIGNAL_RECYCLER_MOCK_CODEX", "1");
    const store = createStore(":memory:");
    const rule = store.createRuleCandidate({
      projectId: TEST_APP_OPTIONS.projectId,
      category: "theme",
      rule: "Use the approved theme tokens.",
      reason: "Manual demo rule."
    });
    store.approveRule(rule.id);
    const runner = createCodexRunner({
      store,
      apiPort: 3001,
      projectId: TEST_APP_OPTIONS.projectId,
      workingDirectory: TEST_APP_OPTIONS.workingDirectory
    });

    await runner.run({ sessionId: "codex-runner", prompt: "Apply the theme." });
    const events = store.listEvents("codex-runner");

    expect(events.map((event) => event.category)).toEqual(["proxy_request"]);
    expect(events[0]?.metadata).toMatchObject({ approvedRulesAvailable: 1 });
  });
});
