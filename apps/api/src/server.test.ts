import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createCodexRunner } from "./codexRunner.js";
import { renderPlaybookBlock } from "./playbook.js";
import { createAgentAdapterRegistry } from "./services/agentAdapters.js";
import { scanContextIndex } from "./services/contextIndexScanner.js";
import { createContextIndexStore } from "./services/contextIndexStore.js";
import { createCodexSdkAdapter } from "./services/codexSdkAdapter.js";
import { recordMemoryInjection } from "./services/memoryInjection.js";
import { createStore } from "./store.js";

const TEST_APP_OPTIONS = {
  projectId: "test-project",
  workingDirectory: "/tmp/test-project"
} as const;
const fixtureContextRepoPath = resolve(__dirname, "../../../fixtures/context-index-repo");

afterEach(() => {
  vi.useRealTimers();
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
      availableAdapters: ["default", "mock", "codex_sdk"],
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
    const otherSession = store.createSession({
      projectId: "other-project",
      title: "Other Firehose"
    });
    store.createEvent({
      sessionId: otherSession.id,
      category: "codex_event",
      title: "Other project event",
      body: "Hidden from this dashboard"
    });
    store.createEvent({
      sessionId: "proxy",
      category: "memory_injection",
      title: "Current proxy event",
      body: "Visible proxy event",
      metadata: { projectId: TEST_APP_OPTIONS.projectId }
    });
    store.createEvent({
      sessionId: "proxy",
      category: "memory_injection",
      title: "Other proxy event",
      body: "Hidden proxy event",
      metadata: { projectId: "other-project" }
    });

    const response = await app.inject({ method: "GET", url: "/api/firehose/events?limit=10" });

    expect(response.statusCode).toBe(200);
    const titles = response.json().map((event: { title: string }) => event.title);
    expect(titles).toEqual(expect.arrayContaining(["Tracked event", "Current proxy event"]));
    expect(titles).not.toEqual(expect.arrayContaining(["Other project event", "Other proxy event"]));
  });

  it("returns all project events when firehose limit is zero", async () => {
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
      title: "Complete history"
    });
    const otherSession = store.createSession({
      projectId: "other-project",
      title: "Other complete history"
    });

    for (let index = 0; index < 3; index += 1) {
      store.createEvent({
        sessionId: session.id,
        category: "codex_event",
        title: `Project event ${index}`,
        body: "Visible in complete dashboard event history"
      });
    }
    store.createEvent({
      sessionId: otherSession.id,
      category: "codex_event",
      title: "Other project event",
      body: "Hidden from this dashboard"
    });

    const limited = await app.inject({ method: "GET", url: "/api/firehose/events?limit=2" });
    const complete = await app.inject({ method: "GET", url: "/api/firehose/events?limit=0" });

    expect(limited.statusCode).toBe(200);
    expect(limited.json()).toHaveLength(2);
    expect(complete.statusCode).toBe(200);
    expect(complete.json().map((event: { title: string }) => event.title)).toEqual(
      expect.arrayContaining(["Project event 0", "Project event 1", "Project event 2"])
    );
    expect(complete.json().map((event: { title: string }) => event.title)).not.toContain(
      "Other project event"
    );
  });

  it("normalizes negative firehose limits instead of returning all project events", async () => {
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
      title: "Negative limit"
    });

    for (let index = 0; index < 3; index += 1) {
      store.createEvent({
        sessionId: session.id,
        category: "codex_event",
        title: `Project event ${index}`,
        body: "Visible in normalized limited dashboard event history"
      });
    }

    const response = await app.inject({ method: "GET", url: "/api/firehose/events?limit=-1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });

  it("orders same-timestamp project firehose events by newest inserted first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T00:00:00.000Z"));
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
      title: "Stable order"
    });

    for (let index = 0; index < 3; index += 1) {
      store.createEvent({
        sessionId: session.id,
        category: "codex_event",
        title: `Project event ${index}`,
        body: "Visible in stable dashboard event history"
      });
    }

    const response = await app.inject({ method: "GET", url: "/api/firehose/events?limit=3" });

    expect(response.statusCode).toBe(200);
    expect(response.json().map((event: { title: string }) => event.title)).toEqual([
      "Project event 2",
      "Project event 1",
      "Project event 0"
    ]);
  });

  it("lists only sessions for the current project", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const current = store.createSession({
      projectId: TEST_APP_OPTIONS.projectId,
      title: "Current project"
    });
    store.createSession({
      projectId: "other-project",
      title: "Other project"
    });

    const response = await app.inject({ method: "GET", url: "/api/sessions" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({ id: current.id, title: "Current project" })
    ]);
  });

  it("does not expose another project's session events", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const otherSession = store.createSession({
      projectId: "other-project",
      title: "Other project"
    });
    store.createEvent({
      sessionId: otherSession.id,
      category: "memory_injection",
      title: "Other project memory",
      body: "Hidden",
      metadata: { projectId: "other-project" }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/sessions/${otherSession.id}/events`
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "Session not found" });

    const run = await app.inject({
      method: "POST",
      url: `/api/sessions/${otherSession.id}/run`,
      payload: { prompt: "Should not run" }
    });
    expect(run.statusCode).toBe(404);
    expect(run.json()).toMatchObject({ error: "Session not found" });
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

  it("does not create duplicate memory from injected memory echoed by the run", async () => {
    delete process.env.OPENAI_API_KEY;
    const store = createStore(":memory:");
    const existing = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "Manual setup rule."
      }).id
    );
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => ({
          finalResponse:
            "Checking learned constraints from playbook... Use pnpm test instead of npm test. Applying rules before proceeding.",
          items: [{ type: "mock", injected: true }]
        })
      }
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const run = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: { prompt: "Run package manager validation for this repo." }
    });
    const events = await app.inject({ method: "GET", url: `/api/sessions/${id}/events` });

    expect(run.statusCode).toBe(200);
    expect(run.json().candidateRules).toEqual([]);
    expect(store.listRules(TEST_APP_OPTIONS.projectId).map((rule) => rule.id)).toEqual([
      existing.id
    ]);
    expect(events.json().map((event: { category: string }) => event.category)).not.toContain(
      "rule_candidate"
    );
    expect(events.json().map((event: { category: string }) => event.category)).not.toContain(
      "rule_auto_approved"
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

  it("retains integration memories with api import provenance", async () => {
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
      url: "/api/memory/retain",
      payload: {
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "External integration retained this memory.",
        memoryType: "command_convention",
        scope: { type: "project", value: null }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "approved",
      source: { kind: "import", label: "api" }
    });
  });

  it("returns 400 for malformed memory retain requests", async () => {
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/memory/retain",
      payload: {
        category: "package-manager",
        rule: "short",
        reason: "External integration retained this memory.",
        memoryType: "command_convention",
        scope: { type: "project", value: null }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "Invalid memory retain request",
      message: expect.any(String)
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

  it("previews relevant memory retrieval for a prompt", async () => {
    const store = createStore(":memory:");
    const relevant = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "The repo uses pnpm workspaces."
      }).id
    );
    store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "theme",
        rule: "Use approved theme tokens.",
        reason: "Theme work follows the design system."
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
      url: "/api/memory/retrieve",
      payload: { prompt: "run package manager validation", limit: 1 }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().selected.map((decision: { memoryId: string }) => decision.memoryId)).toEqual([
      relevant.id
    ]);
    expect(response.json()).not.toHaveProperty("memories");

    const defaultLimit = await app.inject({
      method: "POST",
      url: "/api/memory/retrieve",
      payload: { prompt: "run package manager validation" }
    });

    expect(defaultLimit.statusCode).toBe(200);
    expect(defaultLimit.json().metrics.limit).toBe(5);
  });

  it("returns 400 for memory retrieval requests without a prompt", async () => {
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/memory/retrieve",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "Invalid memory retrieval request",
      message: expect.any(String)
    });
  });

  it("returns 400 for memory retrieval requests with an invalid limit", async () => {
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/memory/retrieve",
      payload: { prompt: "run package manager validation", limit: 21 }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "Invalid memory retrieval request",
      message: expect.any(String)
    });
  });

  it("reindexes repository context and retrieves source chunks", async () => {
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      workingDirectory: fixtureContextRepoPath,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const emptyStatus = await app.inject({ method: "GET", url: "/api/context-index/status" });

    expect(emptyStatus.statusCode).toBe(200);
    expect(emptyStatus.json()).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      workdir: fixtureContextRepoPath,
      totalChunks: 0,
      totalFiles: 0,
      lastIndexedAt: null,
      bySourceType: []
    });

    const reindex = await app.inject({
      method: "POST",
      url: "/api/context-index/reindex"
    });

    expect(reindex.statusCode).toBe(200);
    expect(reindex.json()).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      workdir: fixtureContextRepoPath,
      totalChunks: expect.any(Number),
      totalFiles: expect.any(Number),
      lastIndexedAt: expect.any(String)
    });
    expect(reindex.json().totalChunks).toBeGreaterThan(0);

    const retrieval = await app.inject({
      method: "POST",
      url: "/api/context-index/retrieve",
      payload: { prompt: "where is auth middleware", limit: 5, sourceTypes: ["source"] }
    });

    expect(retrieval.statusCode).toBe(200);
    expect(retrieval.json().selected[0]).toMatchObject({
      path: "apps/web/src/middleware.ts",
      sourceType: "source"
    });
    expect(retrieval.json().metrics.indexedChunks).toBe(reindex.json().totalChunks);

    const chunkDetail = await app.inject({
      method: "GET",
      url: `/api/context-index/chunks/${retrieval.json().selected[0].chunkId}`
    });

    expect(chunkDetail.statusCode).toBe(200);
    expect(chunkDetail.json()).toMatchObject({
      id: retrieval.json().selected[0].chunkId,
      projectId: TEST_APP_OPTIONS.projectId,
      path: "apps/web/src/middleware.ts",
      sourceType: "source",
      lineStart: expect.any(Number),
      lineEnd: expect.any(Number),
      hash: retrieval.json().selected[0].hash,
      indexedAt: expect.any(String),
      text: expect.stringContaining("middleware")
    });
  });

  it("returns 404 for missing context chunk detail requests", async () => {
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      workingDirectory: fixtureContextRepoPath,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/context-index/chunks/ctx_missing"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "Context chunk not found",
      message: expect.any(String)
    });
  });

  it("returns 400 for malformed context retrieval requests", async () => {
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/context-index/retrieve",
      payload: { prompt: "", limit: 5 }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "Invalid context retrieval request",
      message: expect.any(String)
    });
  });

  it("does not require context index storage during app startup", async () => {
    let attempts = 0;
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      },
      contextIndexStoreFactory: (path) => {
        attempts += 1;
        if (attempts === 1) throw new Error("no such module: fts5");
        return createContextIndexStore(path);
      }
    });

    const health = await app.inject({ method: "GET", url: "/health" });
    const status = await app.inject({ method: "GET", url: "/api/context-index/status" });
    const recoveredStatus = await app.inject({ method: "GET", url: "/api/context-index/status" });

    expect(health.statusCode).toBe(200);
    expect(status.statusCode).toBe(503);
    expect(status.json()).toMatchObject({
      error: "Context index unavailable",
      message: expect.stringContaining("fts5")
    });
    expect(recoveredStatus.statusCode).toBe(200);
    expect(attempts).toBe(2);
  });

  it("normalizes non-error context index storage initialization failures", async () => {
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      },
      contextIndexStoreFactory: () => {
        throw "raw context index failure";
      }
    });

    const status = await app.inject({ method: "GET", url: "/api/context-index/status" });

    expect(status.statusCode).toBe(503);
    expect(status.json()).toMatchObject({
      error: "Context index unavailable",
      message: "raw context index failure"
    });
  });

  it("does not wipe an existing context index when reindex scan fails", async () => {
    const databasePath = join(
      mkdtempSync(join(tmpdir(), "signal-recycler-context-api-")),
      "db.sqlite"
    );
    const indexedApp = await createApp({
      ...TEST_APP_OPTIONS,
      workingDirectory: fixtureContextRepoPath,
      databasePath,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const firstReindex = await indexedApp.inject({
      method: "POST",
      url: "/api/context-index/reindex"
    });
    const indexedChunks = firstReindex.json().totalChunks;
    await indexedApp.close();

    const missingWorkdirApp = await createApp({
      ...TEST_APP_OPTIONS,
      workingDirectory: join(databasePath, "missing-workdir"),
      databasePath,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const failedReindex = await missingWorkdirApp.inject({
      method: "POST",
      url: "/api/context-index/reindex"
    });
    const preservedStatus = await missingWorkdirApp.inject({
      method: "GET",
      url: "/api/context-index/status"
    });

    expect(indexedChunks).toBeGreaterThan(0);
    expect(failedReindex.statusCode).toBe(422);
    expect(failedReindex.json()).toMatchObject({
      error: "Context index scan failed",
      errors: [
        expect.objectContaining({
          path: ".",
          reason: "read_directory_failed"
        })
      ]
    });
    expect(preservedStatus.json().totalChunks).toBe(indexedChunks);
  });

  it("clears an existing context index for a valid empty workdir", async () => {
    const databasePath = join(
      mkdtempSync(join(tmpdir(), "signal-recycler-context-api-empty-")),
      "db.sqlite"
    );
    const indexedApp = await createApp({
      ...TEST_APP_OPTIONS,
      workingDirectory: fixtureContextRepoPath,
      databasePath,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const firstReindex = await indexedApp.inject({
      method: "POST",
      url: "/api/context-index/reindex"
    });
    const indexedChunks = firstReindex.json().totalChunks;
    await indexedApp.close();

    const emptyWorkdir = mkdtempSync(join(tmpdir(), "signal-recycler-context-empty-workdir-"));
    const emptyApp = await createApp({
      ...TEST_APP_OPTIONS,
      workingDirectory: emptyWorkdir,
      databasePath,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const reindex = await emptyApp.inject({
      method: "POST",
      url: "/api/context-index/reindex"
    });
    const status = await emptyApp.inject({
      method: "GET",
      url: "/api/context-index/status"
    });

    expect(indexedChunks).toBeGreaterThan(0);
    expect(reindex.statusCode).toBe(200);
    expect(status.json().totalChunks).toBe(0);
    expect(status.json().totalFiles).toBe(0);
  });

  it("does not replace an existing context index when reindex partially skips unreadable files", async () => {
    if (process.platform === "win32") return;

    const databasePath = join(
      mkdtempSync(join(tmpdir(), "signal-recycler-context-api-partial-")),
      "db.sqlite"
    );
    const workdir = mkdtempSync(join(tmpdir(), "signal-recycler-context-partial-workdir-"));
    const privateDir = join(workdir, "private");
    writeFileSync(join(workdir, "README.md"), "indexed docs\n");
    mkdirSync(privateDir);
    writeFileSync(join(privateDir, "hidden.ts"), "export const hidden = true;\n");

    const indexedApp = await createApp({
      ...TEST_APP_OPTIONS,
      workingDirectory: workdir,
      databasePath,
      store: createStore(":memory:"),
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const firstReindex = await indexedApp.inject({
      method: "POST",
      url: "/api/context-index/reindex"
    });
    const indexedChunks = firstReindex.json().totalChunks;
    await indexedApp.close();

    chmodSync(privateDir, 0);
    try {
      const partialApp = await createApp({
        ...TEST_APP_OPTIONS,
        workingDirectory: workdir,
        databasePath,
        store: createStore(":memory:"),
        codexRunner: {
          run: async () => ({ finalResponse: "ok", items: [] })
        }
      });
      const failedReindex = await partialApp.inject({
        method: "POST",
        url: "/api/context-index/reindex"
      });
      const preservedStatus = await partialApp.inject({
        method: "GET",
        url: "/api/context-index/status"
      });

      expect(indexedChunks).toBeGreaterThan(1);
      expect(failedReindex.statusCode).toBe(422);
      expect(failedReindex.json()).toMatchObject({
        error: "Context index scan failed",
        errors: [
          expect.objectContaining({
            path: "private",
            reason: "read_directory_failed"
          })
        ]
      });
      expect(preservedStatus.json().totalChunks).toBe(indexedChunks);
      await partialApp.close();
    } finally {
      chmodSync(privateDir, 0o700);
    }
  });

  it("does not include other-project memories in retrieval previews", async () => {
    const store = createStore(":memory:");
    const current = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "The repo uses pnpm workspaces."
      }).id
    );
    const other = store.approveRule(
      store.createRuleCandidate({
        projectId: "other-project",
        category: "package-manager",
        rule: "Use npm test for this other project.",
        reason: "The other repo uses npm."
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
      url: "/api/memory/retrieve",
      payload: { prompt: "run package manager validation", limit: 5 }
    });

    const selectedIds = response
      .json()
      .selected.map((decision: { memoryId: string }) => decision.memoryId);
    const skippedIds = response
      .json()
      .skipped.map((memory: { memoryId: string }) => memory.memoryId);
    expect(response.statusCode).toBe(200);
    expect(selectedIds).toEqual([current.id]);
    expect(selectedIds).not.toContain(other.id);
    expect(skippedIds).not.toContain(other.id);
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

  it("does not approve or reject rules outside the current project", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });
    const otherRule = store.createRuleCandidate({
      projectId: "other-project",
      category: "package-manager",
      rule: "Use npm for this other project.",
      reason: "Other project convention."
    });

    const approve = await app.inject({
      method: "POST",
      url: `/api/rules/${otherRule.id}/approve`
    });
    const reject = await app.inject({
      method: "POST",
      url: `/api/rules/${otherRule.id}/reject`
    });

    expect(approve.statusCode).toBe(404);
    expect(reject.statusCode).toBe(404);
    expect(store.getRule(otherRule.id)?.status).toBe("pending");
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

  it("uses the mock adapter selected by the run request", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => {
          throw new Error("default runner should not be used");
        }
      },
      agentAdapterRegistry: createAgentAdapterRegistry({
        defaultAdapter: "codex_sdk",
        adapters: {
          codex_sdk: {
            id: "codex_sdk",
            run: async () => {
              throw new Error("codex sdk adapter should not be used");
            }
          }
        }
      })
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: {
        prompt: "Run package manager validation for this repo.",
        adapter: "mock"
      }
    });
    const events = store.listEvents(id);

    expect(response.statusCode).toBe(200);
    expect(response.json().finalResponse).toContain("Encountered a failure");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "codex_event",
          title: "Codex response",
          body: expect.stringContaining("Encountered a failure")
        })
      ])
    );
  });

  it("keeps default mock-mode session runs on the Codex SDK adapter compatibility path", async () => {
    vi.stubEnv("SIGNAL_RECYCLER_MOCK_CODEX", "1");
    const store = createStore(":memory:");
    const rule = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm for package scripts.",
        reason: "The workspace uses pnpm."
      }).id
    );
    const codexSdkAdapter = createCodexSdkAdapter({
      store,
      apiPort: 3001,
      projectId: TEST_APP_OPTIONS.projectId,
      workingDirectory: TEST_APP_OPTIONS.workingDirectory
    });
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: codexSdkAdapter,
      agentAdapterRegistry: createAgentAdapterRegistry({
        defaultAdapter: "codex_sdk",
        adapters: { codex_sdk: codexSdkAdapter }
      })
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: { prompt: "Please run package manager validation with pnpm." }
    });
    const events = store.listEvents(id);

    expect(response.statusCode).toBe(200);
    expect(response.json().finalResponse).toContain("Use pnpm for package scripts.");
    expect(events.map((event) => event.category)).toEqual(
      expect.arrayContaining(["proxy_request", "memory_retrieval", "memory_injection"])
    );
    expect(events.find((event) => event.category === "proxy_request")).toMatchObject({
      title: "Codex SDK routed through proxy",
      metadata: {
        approvedRulesAvailable: 1,
        workingDirectory: TEST_APP_OPTIONS.workingDirectory
      }
    });
    expect(events.find((event) => event.category === "memory_injection")?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      adapter: "mock-codex",
      reason: "approved_project_memory",
      memoryIds: [rule.id],
      retrieval: expect.objectContaining({
        query: "Please run package manager validation with pnpm.",
        metrics: expect.objectContaining({ selectedMemories: 1 })
      })
    });
  });

  it("uses the app-provided adapter registry for default session runs", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => {
          throw new Error("legacy runner should not be used");
        }
      },
      agentAdapterRegistry: createAgentAdapterRegistry({
        defaultAdapter: "codex_sdk",
        adapters: {
          codex_sdk: {
            id: "codex_sdk",
            run: async () => ({
              finalResponse: "registry adapter response",
              items: [{ type: "registry" }]
            })
          }
        }
      })
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: { prompt: "Run through default registry adapter.", adapter: "default" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      finalResponse: "registry adapter response",
      items: [{ type: "registry" }]
    });
  });

  it("injects memory and working directory into configured Codex CLI adapter runs", async () => {
    const store = createStore(":memory:");
    const rule = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm for package scripts.",
        reason: "The workspace uses pnpm."
      }).id
    );
    let capturedPrompt = "";
    let capturedWorkingDirectory: string | undefined;
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => {
          throw new Error("legacy runner should not be used");
        }
      },
      agentAdapterRegistry: createAgentAdapterRegistry({
        defaultAdapter: "codex_sdk",
        adapters: {
          codex_cli: {
            id: "codex_cli",
            run: async (input) => {
              capturedPrompt = input.prompt;
              capturedWorkingDirectory = input.workingDirectory;
              return { finalResponse: "codex cli response", items: [{ type: "cli" }] };
            }
          }
        }
      })
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: {
        prompt: "Please run package manager validation with pnpm.",
        adapter: "codex_cli"
      }
    });
    const events = store.listEvents(id);

    expect(response.statusCode).toBe(200);
    expect(capturedPrompt).toContain("Use pnpm for package scripts.");
    expect(capturedWorkingDirectory).toBe(TEST_APP_OPTIONS.workingDirectory);
    expect(events.map((event) => event.category)).toEqual(
      expect.arrayContaining(["memory_retrieval", "memory_injection"])
    );
    expect(events.find((event) => event.category === "memory_injection")?.metadata).toMatchObject({
      adapter: "codex_cli",
      memoryIds: [rule.id]
    });
  });

  it("injects indexed source context into owned session adapter runs", async () => {
    const store = createStore(":memory:");
    const workdir = mkdtempSync(join(tmpdir(), "signal-recycler-session-context-workdir-"));
    mkdirSync(join(workdir, "apps/api/src"), { recursive: true });
    writeFileSync(
      join(workdir, "apps/api/src/app.ts"),
      [
        "import Fastify from 'fastify';",
        "",
        "export function createApp() {",
        "  const app = Fastify();",
        "  app.register(sessionRoutes);",
        "}",
        "",
        "const sessionRoutes = {};",
        "",
        "The Fastify app registers session routes before context index routes."
      ].join("\n")
    );
    writeFileSync(join(workdir, "README.md"), "Signal Recycler manages memory for coding agents.\n");
    const scanned = scanContextIndex({
      projectId: TEST_APP_OPTIONS.projectId,
      workdir,
      indexedAt: "2026-05-17T00:00:00.000Z"
    });
    const contextIndexDbPath = join(
      mkdtempSync(join(tmpdir(), "signal-recycler-session-context-")),
      "context.sqlite"
    );
    const contextStore = createContextIndexStore(contextIndexDbPath);
    contextStore.upsertChunks({
      projectId: TEST_APP_OPTIONS.projectId,
      workdir,
      chunks: scanned.chunks.map(({ projectId: _projectId, ...chunk }) => chunk)
    });
    contextStore.close();
    let capturedPrompt = "";
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      workingDirectory: workdir,
      contextIndexDbPath,
      store,
      codexRunner: {
        run: async () => {
          throw new Error("legacy runner should not be used");
        }
      },
      agentAdapterRegistry: createAgentAdapterRegistry({
        defaultAdapter: "codex_sdk",
        adapters: {
          codex_cli: {
            id: "codex_cli",
            run: async (input) => {
              capturedPrompt = input.prompt;
              return { finalResponse: "codex cli response", items: [{ type: "cli" }] };
            }
          }
        }
      })
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: {
        prompt: "How are session routes registered in the Fastify app?",
        adapter: "codex_cli"
      }
    });
    const events = store.listEvents(id);

    expect(response.statusCode).toBe(200);
    expect(capturedPrompt).toContain("<signal-recycler-project-context>");
    expect(capturedPrompt).toContain("apps/api/src/app.ts:1-10");
    expect(events.map((event) => event.category)).toEqual(
      expect.arrayContaining(["context_retrieval", "context_injection"])
    );
    expect(events.find((event) => event.category === "context_retrieval")?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      query: "How are session routes registered in the Fastify app?",
      selected: [
        expect.objectContaining({
          path: "apps/api/src/app.ts",
          lineStart: 1,
          lineEnd: 10
        })
      ],
      metrics: expect.objectContaining({
        indexedChunks: 2,
        selectedChunks: 1,
        skippedChunks: 1
      })
    });
    expect(events.find((event) => event.category === "context_injection")?.metadata).toMatchObject({
      adapter: "codex_cli",
      reason: "indexed_project_context",
      sources: [
        expect.objectContaining({
          path: "apps/api/src/app.ts",
          hash: expect.stringMatching(/^[a-f0-9]{64}$/)
        })
      ]
    });
  });

  it("uses the app database path as the owned-session context index fallback", async () => {
    const store = createStore(":memory:");
    const workdir = mkdtempSync(join(tmpdir(), "signal-recycler-session-context-fallback-workdir-"));
    writeFileSync(join(workdir, "AGENTS.md"), "Use pnpm type-check before reporting TypeScript changes.\n");
    const scanned = scanContextIndex({
      projectId: TEST_APP_OPTIONS.projectId,
      workdir,
      indexedAt: "2026-05-17T00:00:00.000Z"
    });
    const databasePath = join(
      mkdtempSync(join(tmpdir(), "signal-recycler-session-context-fallback-")),
      "db.sqlite"
    );
    const contextStore = createContextIndexStore(databasePath);
    contextStore.upsertChunks({
      projectId: TEST_APP_OPTIONS.projectId,
      workdir,
      chunks: scanned.chunks.map(({ projectId: _projectId, ...chunk }) => chunk)
    });
    contextStore.close();
    let capturedPrompt = "";
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      workingDirectory: workdir,
      databasePath,
      store,
      codexRunner: {
        run: async () => {
          throw new Error("legacy runner should not be used");
        }
      },
      agentAdapterRegistry: createAgentAdapterRegistry({
        defaultAdapter: "codex_sdk",
        adapters: {
          codex_cli: {
            id: "codex_cli",
            run: async (input) => {
              capturedPrompt = input.prompt;
              return { finalResponse: "codex cli response", items: [{ type: "cli" }] };
            }
          }
        }
      })
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: {
        prompt: "Which type-check command should be used?",
        adapter: "codex_cli"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(capturedPrompt).toContain("Use pnpm type-check before reporting TypeScript changes.");
    expect(store.listEvents(id).some((event) => event.category === "context_injection")).toBe(true);
  });

  it("shares the default in-memory context index between reindex and owned session runs", async () => {
    const store = createStore(":memory:");
    let capturedPrompt = "";
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      workingDirectory: fixtureContextRepoPath,
      store,
      codexRunner: {
        run: async () => {
          throw new Error("legacy runner should not be used");
        }
      },
      agentAdapterRegistry: createAgentAdapterRegistry({
        defaultAdapter: "codex_sdk",
        adapters: {
          codex_cli: {
            id: "codex_cli",
            run: async (input) => {
              capturedPrompt = input.prompt;
              return { finalResponse: "codex cli response", items: [{ type: "cli" }] };
            }
          }
        }
      })
    });
    const reindex = await app.inject({ method: "POST", url: "/api/context-index/reindex" });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: {
        prompt: "Which pnpm type-check instruction applies?",
        adapter: "codex_cli"
      }
    });

    expect(reindex.statusCode).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(capturedPrompt).toContain("<signal-recycler-project-context>");
    expect(capturedPrompt).toContain("Use pnpm type-check before reporting TypeScript changes as complete.");
    expect(store.listEvents(id).some((event) => event.category === "context_injection")).toBe(true);
  });

  it("does not initialize context index storage for session adapter paths without owned envelopes", async () => {
    let contextStoreAttempts = 0;
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => {
          throw new Error("legacy runner should not be used");
        }
      },
      contextIndexStoreFactory: () => {
        contextStoreAttempts += 1;
        throw new Error("context index should not be opened");
      },
      agentAdapterRegistry: createAgentAdapterRegistry({
        defaultAdapter: "codex_sdk",
        adapters: {
          codex_sdk: {
            id: "codex_sdk",
            run: async (input) => ({
              finalResponse: input.prompt,
              items: [{ type: "sdk" }]
            })
          }
        }
      })
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: {
        prompt: "Run through Codex SDK compatibility path.",
        adapter: "codex_sdk"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(contextStoreAttempts).toBe(0);
    expect(store.listEvents(id).some((event) => event.category === "context_retrieval")).toBe(false);
  });

  it("returns a clear error when the Codex CLI adapter is selected before configuration", async () => {
    const store = createStore(":memory:");
    const app = await createApp({
      ...TEST_APP_OPTIONS,
      store,
      codexRunner: {
        run: async () => ({ finalResponse: "default runner response", items: [] })
      }
    });
    const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    const id = session.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/run`,
      payload: {
        prompt: "Run package manager validation for this repo.",
        adapter: "codex_cli"
      }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: "Codex run failed",
      message: "Agent adapter is not configured: codex_cli"
    });
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
      payload: JSON.stringify({ input: "Use pnpm for package scripts." })
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

  it("retrieves and injects only relevant memories on proxy requests", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore(":memory:");
    const relevant = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm for package scripts.",
        reason: "The workspace uses pnpm."
      }).id
    );
    const unrelated = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "theme",
        rule: "Use approved theme tokens.",
        reason: "Theme work follows the design system."
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
        "x-signal-recycler-session-id": "proxy-retrieval"
      },
      payload: JSON.stringify({ input: "Please run package manager validation with pnpm." })
    });
    const forwardedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const events = store.listEvents("proxy-retrieval");
    const retrievalEvent = events.find((event) => event.category === "memory_retrieval");
    const memoryEvent = events.find((event) => event.category === "memory_injection");

    expect(response.statusCode).toBe(200);
    expect(forwardedBody.input).toContain("Use pnpm for package scripts.");
    expect(forwardedBody.input).not.toContain("Use approved theme tokens.");
    expect(retrievalEvent?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      query: "Please run package manager validation with pnpm.",
      selected: [expect.objectContaining({ memoryId: relevant.id })],
      skipped: [expect.objectContaining({ memoryId: unrelated.id })],
      metrics: {
        approvedMemories: 2,
        selectedMemories: 1,
        skippedMemories: 1,
        limit: 5
      }
    });
    expect(memoryEvent?.metadata).toMatchObject({
      memoryIds: [relevant.id],
      retrieval: {
        query: "Please run package manager validation with pnpm.",
        selected: [expect.objectContaining({ memoryId: relevant.id })],
        skipped: [expect.objectContaining({ memoryId: unrelated.id })],
        metrics: expect.objectContaining({ selectedMemories: 1 })
      }
    });
    expect(store.listMemoryUsages(relevant.id)).toHaveLength(1);
    expect(store.listMemoryUsages(unrelated.id)).toHaveLength(0);
  });

  it("does not retrieve from an existing injected playbook on proxy requests", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore(":memory:");
    const relevant = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "This repo uses pnpm workspaces."
      }).id
    );
    const unrelated = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "theme",
        rule: "Use approved theme tokens for UI theme changes.",
        reason: "Theme work follows the design system."
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
        "x-signal-recycler-session-id": "proxy-existing-playbook"
      },
      payload: JSON.stringify({
        input: [
          {
            type: "message",
            role: "system",
            content: renderPlaybookBlock([relevant, unrelated])
          },
          {
            type: "message",
            role: "user",
            content: "Run package manager validation for this repo."
          }
        ]
      })
    });
    const forwardedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const events = store.listEvents("proxy-existing-playbook");
    const retrievalEvent = events.find((event) => event.category === "memory_retrieval");
    const memoryEvent = events.find((event) => event.category === "memory_injection");

    expect(response.statusCode).toBe(200);
    expect(forwardedBody.input[0].content).toContain("Use pnpm test instead of npm test.");
    expect(forwardedBody.input[0].content).not.toContain(
      "Use approved theme tokens for UI theme changes."
    );
    expect(retrievalEvent?.metadata).toMatchObject({
      query: "Run package manager validation for this repo.",
      selected: [expect.objectContaining({ memoryId: relevant.id })],
      skipped: [expect.objectContaining({ memoryId: unrelated.id })],
      metrics: expect.objectContaining({ selectedMemories: 1, skippedMemories: 1 })
    });
    expect(memoryEvent?.metadata).toMatchObject({
      memoryIds: [relevant.id],
      retrieval: expect.objectContaining({
        metrics: expect.objectContaining({ selectedMemories: 1, skippedMemories: 1 })
      })
    });
    expect(store.listMemoryUsages(relevant.id)).toHaveLength(1);
    expect(store.listMemoryUsages(unrelated.id)).toHaveLength(0);
  });

  it("does not retrieve or inject memory into internal classifier proxy requests", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore(":memory:");
    const relevant = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "This repo uses pnpm workspaces."
      }).id
    );
    store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "theme",
        rule: "Use approved theme tokens for UI theme changes.",
        reason: "Theme work follows the design system."
      }).id
    );
    const classifierBody = {
      model: "gpt-5.1-mini",
      input: [
        {
          role: "system",
          content: "Classify this Codex turn for Signal Recycler."
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt: "Run package manager validation for this repo.",
            finalResponse:
              "Checking learned constraints from playbook... Use pnpm test instead of npm test.",
            items: [{ injectedPrompt: renderPlaybookBlock(store.listApprovedRules(TEST_APP_OPTIONS.projectId)) }]
          })
        }
      ],
      text: {
        format: {
          name: "signal_recycler_classifier"
        }
      }
    };
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
        "x-signal-recycler-session-id": "proxy-classifier"
      },
      payload: JSON.stringify(classifierBody)
    });
    const forwardedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const events = store.listEvents("proxy-classifier");

    expect(response.statusCode).toBe(200);
    expect(forwardedBody).toEqual(classifierBody);
    expect(events.some((event) => event.category === "memory_retrieval")).toBe(false);
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(events.find((event) => event.category === "proxy_request")?.metadata).toMatchObject({
      internalSignalRecyclerRequest: true,
      injectedRules: 0
    });
    expect(store.listMemoryUsages(relevant.id)).toHaveLength(0);
  });

  it("detects internal classifier proxy requests by prompt marker without schema metadata", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore(":memory:");
    const relevant = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "This repo uses pnpm workspaces."
      }).id
    );
    const classifierBody = {
      model: "gpt-5.1-mini",
      input: [
        {
          role: "system",
          content: "Classify this Codex turn for Signal Recycler."
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt: "Run package manager validation for this repo.",
            finalResponse: "Use pnpm test instead of npm test."
          })
        }
      ]
    };
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
        "x-signal-recycler-session-id": "proxy-classifier-marker"
      },
      payload: JSON.stringify(classifierBody)
    });
    const forwardedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const events = store.listEvents("proxy-classifier-marker");

    expect(response.statusCode).toBe(200);
    expect(forwardedBody).toEqual(classifierBody);
    expect(events.some((event) => event.category === "memory_retrieval")).toBe(false);
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(events.find((event) => event.category === "proxy_request")?.metadata).toMatchObject({
      internalSignalRecyclerRequest: true,
      injectedRules: 0
    });
    expect(store.listMemoryUsages(relevant.id)).toHaveLength(0);
  });

  it("does not treat user-quoted classifier marker text as an internal request", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "This repo uses pnpm workspaces."
      }).id
    );
    const body = {
      input: [
        {
          role: "user",
          content:
            "Debug this proxy text: Classify this Codex turn for Signal Recycler. Then run package manager validation."
        }
      ]
    };
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
        "x-signal-recycler-session-id": "proxy-user-marker-quote"
      },
      payload: JSON.stringify(body)
    });
    const forwardedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const events = store.listEvents("proxy-user-marker-quote");

    expect(response.statusCode).toBe(200);
    expect(forwardedBody.input[0].content).toContain("Use pnpm test instead of npm test.");
    expect(events.find((event) => event.category === "memory_retrieval")?.metadata).toMatchObject({
      metrics: expect.objectContaining({ selectedMemories: 1 })
    });
    expect(events.find((event) => event.category === "proxy_request")?.metadata).toMatchObject({
      internalSignalRecyclerRequest: false,
      injectedRules: 1
    });
    expect(store.listMemoryUsages(memory.id)).toHaveLength(1);
  });

  it("does not inject all approved memories when proxy retrieval selects nothing", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm for package scripts.",
        reason: "The workspace uses pnpm."
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
        "x-signal-recycler-session-id": "proxy-no-retrieval-hit"
      },
      payload: JSON.stringify({ input: "Investigate frobnicator latency." })
    });
    const forwardedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const events = store.listEvents("proxy-no-retrieval-hit");

    expect(response.statusCode).toBe(200);
    expect(forwardedBody.input).toBe("Investigate frobnicator latency.");
    expect(events.find((event) => event.category === "memory_retrieval")?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      query: "Investigate frobnicator latency.",
      selected: [],
      skipped: [expect.objectContaining({ memoryId: memory.id })],
      metrics: expect.objectContaining({ selectedMemories: 0, skippedMemories: 1 })
    });
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(store.listMemoryUsages(memory.id)).toHaveLength(0);
    expect(store.getRule(memory.id)?.lastUsedAt).toBeNull();
  });

  it("does not inject all approved memories when proxy retrieval has only stopwords", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm for package scripts.",
        reason: "The workspace uses pnpm."
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
        "x-signal-recycler-session-id": "proxy-stopword-retrieval"
      },
      payload: JSON.stringify({ input: "the and of to" })
    });
    const forwardedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const events = store.listEvents("proxy-stopword-retrieval");

    expect(response.statusCode).toBe(200);
    expect(forwardedBody.input).toBe("the and of to");
    expect(forwardedBody.input).not.toContain("Use pnpm for package scripts.");
    expect(events.find((event) => event.category === "memory_retrieval")?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      query: "the and of to",
      selected: [],
      skipped: [expect.objectContaining({ memoryId: memory.id })],
      metrics: expect.objectContaining({
        approvedMemories: 1,
        selectedMemories: 0,
        skippedMemories: 1
      })
    });
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(store.listMemoryUsages(memory.id)).toHaveLength(0);
    expect(store.getRule(memory.id)?.lastUsedAt).toBeNull();
  });

  it("does not inject memories for low-signal generic proxy prompts", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore(":memory:");
    const packageManager = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "This repo uses pnpm workspaces."
      }).id
    );
    const theme = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "theme",
        rule: "Use approved theme tokens for UI theme changes.",
        reason: "Theme work follows the design system."
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
        "x-signal-recycler-session-id": "proxy-low-signal-retrieval"
      },
      payload: JSON.stringify({ input: "test" })
    });
    const forwardedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const events = store.listEvents("proxy-low-signal-retrieval");

    expect(response.statusCode).toBe(200);
    expect(forwardedBody.input).toBe("test");
    expect(forwardedBody.input).not.toContain("Use pnpm test instead of npm test.");
    expect(forwardedBody.input).not.toContain("Use approved theme tokens");
    expect(events.find((event) => event.category === "memory_retrieval")?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      query: "test",
      selected: [],
      skipped: [
        expect.objectContaining({ memoryId: packageManager.id }),
        expect.objectContaining({ memoryId: theme.id })
      ],
      metrics: expect.objectContaining({
        approvedMemories: 2,
        selectedMemories: 0,
        skippedMemories: 2
      })
    });
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(store.listMemoryUsages(packageManager.id)).toHaveLength(0);
    expect(store.listMemoryUsages(theme.id)).toHaveLength(0);
  });

  it("skips retrieval when proxy request has no query fields", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm for package scripts.",
        reason: "The workspace uses pnpm."
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
        "x-signal-recycler-session-id": "proxy-missing-query"
      },
      payload: JSON.stringify({ metadata: { source: "test" } })
    });
    const forwardedText = String(fetchMock.mock.calls[0]?.[1]?.body);
    const forwardedBody = JSON.parse(forwardedText);
    const events = store.listEvents("proxy-missing-query");

    expect(response.statusCode).toBe(200);
    expect(forwardedBody).toEqual({ metadata: { source: "test" } });
    expect(forwardedText).not.toContain("<signal-recycler-playbook>");
    expect(forwardedText).not.toContain("Use pnpm for package scripts.");
    expect(events.some((event) => event.category === "memory_retrieval")).toBe(false);
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(store.listMemoryUsages(memory.id)).toHaveLength(0);
    expect(store.getRule(memory.id)?.lastUsedAt).toBeNull();
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

  it("does not fail proxy responses when memory audit persistence fails", async () => {
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
      store: {
        ...store,
        recordMemoryInjectionEvent: () => {
          throw new Error("audit unavailable");
        }
      },
      codexRunner: {
        run: async () => ({ finalResponse: "ok", items: [] })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/proxy/v1/responses",
      headers: {
        "content-type": "application/json",
        "x-signal-recycler-session-id": "proxy-audit-fail"
      },
      payload: JSON.stringify({ input: "Use pnpm for package scripts." })
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(
      store.listEvents("proxy-audit-fail").some((event) => event.category === "memory_injection")
    ).toBe(false);
    expect(store.listMemoryUsages(memory.id)).toHaveLength(0);
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

    expect(events.map((event) => event.category)).toEqual([
      "proxy_request",
      "memory_retrieval",
      "memory_injection"
    ]);
    expect(events[0]?.metadata).toMatchObject({ approvedRulesAvailable: 1 });
    expect(events.find((event) => event.category === "memory_retrieval")?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      query: "Apply the theme.",
      selected: [expect.objectContaining({ memoryId: rule.id })],
      metrics: expect.objectContaining({ selectedMemories: 1 })
    });
    expect(memoryEvent?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      adapter: "mock-codex",
      memoryIds: [rule.id],
      retrieval: expect.objectContaining({
        query: "Apply the theme.",
        metrics: expect.objectContaining({ selectedMemories: 1 })
      })
    });
    expect(store.listMemoryUsages(rule.id)).toHaveLength(1);
    expect(store.getRule(rule.id)?.lastUsedAt).not.toBeNull();
  });

  it("retrieves and injects only relevant memories from the mock Codex runner", async () => {
    vi.stubEnv("SIGNAL_RECYCLER_MOCK_CODEX", "1");
    const store = createStore(":memory:");
    const unrelated = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "theme",
        rule: "Use the approved theme tokens.",
        reason: "Manual demo rule."
      }).id
    );
    const relevant = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "package-manager",
        rule: "Use pnpm for package scripts.",
        reason: "The workspace uses pnpm."
      }).id
    );
    const runner = createCodexRunner({
      store,
      apiPort: 3001,
      projectId: TEST_APP_OPTIONS.projectId,
      workingDirectory: TEST_APP_OPTIONS.workingDirectory
    });

    const result = await runner.run({
      sessionId: "codex-runner-retrieval",
      prompt: "Please run package manager validation with pnpm."
    });
    const events = store.listEvents("codex-runner-retrieval");
    const memoryEvent = events.find((event) => event.category === "memory_injection");

    expect(result.finalResponse).toContain("Use pnpm for package scripts.");
    expect(result.finalResponse).not.toContain("Use the approved theme tokens.");
    expect(events.map((event) => event.category)).toEqual([
      "proxy_request",
      "memory_retrieval",
      "memory_injection"
    ]);
    expect(events.find((event) => event.category === "memory_retrieval")?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      query: "Please run package manager validation with pnpm.",
      selected: [expect.objectContaining({ memoryId: relevant.id })],
      skipped: [expect.objectContaining({ memoryId: unrelated.id })],
      metrics: expect.objectContaining({ selectedMemories: 1, skippedMemories: 1 })
    });
    expect(memoryEvent?.metadata).toMatchObject({
      projectId: TEST_APP_OPTIONS.projectId,
      adapter: "mock-codex",
      memoryIds: [relevant.id],
      retrieval: expect.objectContaining({
        query: "Please run package manager validation with pnpm.",
        metrics: expect.objectContaining({ selectedMemories: 1 })
      })
    });
    expect(store.listMemoryUsages(relevant.id)).toHaveLength(1);
    expect(store.listMemoryUsages(unrelated.id)).toHaveLength(0);
  });

  it("does not inject an unrelated approved memory from the mock Codex runner", async () => {
    vi.stubEnv("SIGNAL_RECYCLER_MOCK_CODEX", "1");
    const store = createStore(":memory:");
    const unrelated = store.approveRule(
      store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "theme",
        rule: "Use approved theme tokens for UI changes.",
        reason: "Theme work follows the design system."
      }).id
    );
    const runner = createCodexRunner({
      store,
      apiPort: 3001,
      projectId: TEST_APP_OPTIONS.projectId,
      workingDirectory: TEST_APP_OPTIONS.workingDirectory
    });

    const result = await runner.run({
      sessionId: "codex-runner-no-relevant-memory",
      prompt: "Run package manager validation for this repo."
    });
    const events = store.listEvents("codex-runner-no-relevant-memory");

    expect(result.finalResponse).not.toContain("Use approved theme tokens");
    expect(result.items).toEqual([
      { type: "mock", injected: "Run package manager validation for this repo." }
    ]);
    expect(events.find((event) => event.category === "memory_retrieval")?.metadata).toMatchObject({
      selected: [],
      skipped: [expect.objectContaining({ memoryId: unrelated.id })],
      metrics: expect.objectContaining({ selectedMemories: 0, skippedMemories: 1 })
    });
    expect(events.some((event) => event.category === "memory_injection")).toBe(false);
    expect(store.listMemoryUsages(unrelated.id)).toHaveLength(0);
  });

  it("does not fail mock Codex runs when memory audit persistence fails", async () => {
    vi.stubEnv("SIGNAL_RECYCLER_MOCK_CODEX", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const store = createStore(":memory:");
      const rule = store.createRuleCandidate({
        projectId: TEST_APP_OPTIONS.projectId,
        category: "theme",
        rule: "Use the approved theme tokens.",
        reason: "Manual demo rule."
      });
      store.approveRule(rule.id);
      const runner = createCodexRunner({
        store: {
          ...store,
          recordMemoryInjectionEvent: () => {
            throw new Error("audit unavailable");
          }
        },
        apiPort: 3001,
        projectId: TEST_APP_OPTIONS.projectId,
        workingDirectory: TEST_APP_OPTIONS.workingDirectory
      });

      const result = await runner.run({ sessionId: "codex-audit-fail", prompt: "Apply the theme." });

      expect(result.finalResponse).toContain("Checking learned constraints from playbook");
      expect(store.listMemoryUsages(rule.id)).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(
        "[signal-recycler] Mock Codex memory audit failed",
        expect.any(Error)
      );
    } finally {
      warn.mockRestore();
    }
  });
});
