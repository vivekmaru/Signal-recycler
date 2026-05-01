import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createCodexRunner } from "./codexRunner.js";
import { recordMemoryInjection } from "./services/memoryInjection.js";
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
    const body = run.json();

    expect(run.statusCode).toBe(200);
    expect(body.candidateRules).toEqual([
      expect.objectContaining({
        category: expect.any(String),
        rule: expect.any(String),
        reason: expect.any(String)
      })
    ]);
    const candidate = body.candidateRules[0];
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

  it("creates synced memories with synced file provenance", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/memories/synced",
      payload: {
        category: "project-context",
        rule: "Follow the signal recycler section in AGENTS.md.",
        reason: "Imported from repository agent instructions.",
        path: "AGENTS.md",
        section: "signal-recycler"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "approved",
      memoryType: "synced_file",
      source: { kind: "synced_file", path: "AGENTS.md", section: "signal-recycler" },
      syncStatus: "imported"
    });
  });

  it("returns memory audit trail with source and usages", async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "signal-recycler-api-")), "test.sqlite");
    const store = createStore(databasePath);
    const app = await createApp({
      projectId: "demo",
      workingDirectory: "/tmp/demo",
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm.",
        source: { kind: "manual", author: "local-user" },
        confidence: "high"
      }).id
    );
    const event = store.createEvent({
      sessionId: "proxy",
      category: "memory_injection",
      title: "Injected memory",
      body: "Injected 1 memory.",
      metadata: { projectId: "demo", memoryIds: [memory.id] }
    });
    store.recordMemoryUsage({
      projectId: "demo",
      memoryId: memory.id,
      sessionId: "proxy",
      eventId: event.id,
      adapter: "proxy",
      reason: "approved_project_memory"
    });
    const db = new DatabaseSync(databasePath);
    db.prepare(
      `INSERT INTO memory_usages (
        id, project_id, memory_id, session_id, event_id, adapter, reason, injected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "usage_other_project",
      "other",
      memory.id,
      "other-session",
      "other-event",
      "proxy",
      "other_project_memory",
      "2026-01-01T00:00:00.000Z"
    );
    db.close();

    const response = await app.inject({
      method: "GET",
      url: `/api/memories/${memory.id}/audit`
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      memory: { id: memory.id, source: { kind: "manual", author: "local-user" } },
      usages: [
        {
          projectId: "demo",
          memoryId: memory.id,
          sessionId: "proxy",
          eventId: event.id,
          adapter: "proxy",
          reason: "approved_project_memory"
        }
      ]
    });
    expect(body.usages).toHaveLength(1);
  });

  it("returns 404 for a memory audit trail outside the current project", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      projectId: "demo",
      workingDirectory: "/tmp/demo",
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: "other",
        category: "package-manager",
        rule: "Use npm for this other workspace.",
        reason: "The other workspace uses npm.",
        source: { kind: "manual", author: "local-user" },
        confidence: "high"
      }).id
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/memories/${memory.id}/audit`
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "Memory not found" });
  });

  it("returns 404 for a missing memory audit trail", async () => {
    const app = await createApp({
      projectId: "demo",
      workingDirectory: "/tmp/demo",
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/memories/does-not-exist/audit"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "Memory not found" });
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

  it("rejects non-rule memory types on the legacy rules endpoint", async () => {
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
        rule: "Prefer compact controls for dense operational screens.",
        reason: "Legacy rule endpoint only accepts rule memories.",
        memoryType: "preference"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "Invalid memoryType",
      message: "/api/rules only accepts memoryType \"rule\""
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

  it("records injection audit events and usage rows on proxy requests", async () => {
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
    const memoryEvent = events.find((event) => event.category === "memory_injection");
    expect(memoryEvent?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      adapter: "proxy",
      method: "POST",
      path: "/v1/responses",
      memoryIds: [manualRule.id]
    });
    expect(store.listMemoryUsages(manualRule.id)).toHaveLength(1);
    expect(store.getRule(manualRule.id)?.lastUsedAt).not.toBeNull();
  });

  it("does not record proxy memory usage for requests without an injected body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "tooling",
        rule: "Use pnpm for package scripts.",
        reason: "Manual setup rule."
      }).id
    );
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/proxy/v1/models",
      headers: {
        "x-signal-recycler-session-id": "proxy-get"
      }
    });
    const events = store.listEvents("proxy-get");

    expect(response.statusCode).toBe(200);
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(store.listMemoryUsages(memory.id)).toHaveLength(0);
    expect(store.getRule(memory.id)?.lastUsedAt).toBeNull();
  });

  it("does not record proxy memory usage for invalid JSON string bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "tooling",
        rule: "Use pnpm for package scripts.",
        reason: "Manual setup rule."
      }).id
    );
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
        "content-type": "text/plain",
        "x-signal-recycler-session-id": "proxy-invalid-json"
      },
      payload: "{ invalid json"
    });
    const events = store.listEvents("proxy-invalid-json");

    expect(response.statusCode).toBe(200);
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(store.listMemoryUsages(memory.id)).toHaveLength(0);
    expect(store.getRule(memory.id)?.lastUsedAt).toBeNull();
  });

  it("does not record proxy memory usage for non-injectable request bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "tooling",
        rule: "Use pnpm for package scripts.",
        reason: "Manual setup rule."
      }).id
    );
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
        "x-signal-recycler-session-id": "proxy-array"
      },
      payload: JSON.stringify(["hello"])
    });
    const events = store.listEvents("proxy-array");

    expect(response.statusCode).toBe(200);
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(store.listMemoryUsages(memory.id)).toHaveLength(0);
    expect(store.getRule(memory.id)?.lastUsedAt).toBeNull();
  });

  it("does not record proxy memory usage when upstream forwarding fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("upstream unavailable");
      })
    );
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "tooling",
        rule: "Use pnpm for package scripts.",
        reason: "Manual setup rule."
      }).id
    );
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
        "x-signal-recycler-session-id": "proxy-upstream-fail"
      },
      payload: JSON.stringify({ input: "hello" })
    });
    const events = store.listEvents("proxy-upstream-fail");

    expect(response.statusCode).toBe(500);
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(store.listMemoryUsages(memory.id)).toHaveLength(0);
    expect(store.getRule(memory.id)?.lastUsedAt).toBeNull();
  });

  it("validates injectable memories before recording injection events", () => {
    const store = createStore(":memory:");
    const memory = store.createRuleCandidate({
      projectId: TEST_APP_OPTIONS.projectId,
      category: "tooling",
      rule: "Use pnpm for package scripts.",
      reason: "Pending rules are not injectable."
    });

    expect(() =>
      recordMemoryInjection({
        store,
        projectId: TEST_APP_OPTIONS.projectId,
        sessionId: "service-validation",
        adapter: "proxy",
        memories: [memory],
        reason: "approved_project_memory"
      })
    ).toThrow("Rule is not injectable");
    expect(store.listEvents("service-validation")).toHaveLength(0);
    expect(store.listMemoryUsages(memory.id)).toHaveLength(0);
  });

  it("records injection audit events and usage rows from the mock Codex runner", async () => {
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
    const memoryEvent = events.find((event) => event.category === "memory_injection");

    expect(events.map((event) => event.category)).toEqual(["proxy_request", "memory_injection"]);
    expect(events[0]?.metadata).toMatchObject({ approvedRulesAvailable: 1 });
    expect(memoryEvent?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      adapter: "mock-codex",
      memoryIds: [rule.id]
    });
    expect(store.listMemoryUsages(rule.id)).toHaveLength(1);
    expect(store.getRule(rule.id)?.lastUsedAt).not.toBeNull();
  });
});
