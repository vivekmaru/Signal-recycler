import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createStore } from "./store.js";

const TEST_APP_OPTIONS = {
  projectId: "test-project",
  workingDirectory: "/tmp/test-project"
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
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

    expect(run.statusCode).toBe(200);
    expect(events.json().map((event: { category: string }) => event.category)).toEqual(
      expect.arrayContaining(["codex_event", "classifier_result", "rule_candidate"])
    );
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
});
