import { describe, expect, it } from "vitest";
import { createApiClient } from "./apiClient.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("createApiClient", () => {
  it("creates a session with an optional title", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3001",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return jsonResponse({
          id: "session_1",
          projectId: "demo",
          title: "Fix tests",
          createdAt: "2026-05-03T00:00:00.000Z"
        });
      }
    });

    await expect(client.createSession("Fix tests")).resolves.toMatchObject({ id: "session_1" });
    expect(calls[0]?.url).toBe("http://127.0.0.1:3001/api/sessions");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ title: "Fix tests" }));
  });

  it("runs an existing session", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3001",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return jsonResponse({ finalResponse: "done", candidateRules: [] });
      }
    });

    await expect(client.runSession("session_1", "fix it", "codex_cli")).resolves.toMatchObject({
      finalResponse: "done"
    });
    expect(calls[0]?.url).toBe("http://127.0.0.1:3001/api/sessions/session_1/run");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ prompt: "fix it", adapter: "codex_cli" }));
  });

  it("lists events for a session", async () => {
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3001/",
      fetchImpl: async () =>
        jsonResponse([
          {
            id: "event_1",
            sessionId: "session_1",
            category: "codex_event",
            title: "User prompt",
            body: "fix it",
            metadata: {},
            createdAt: "2026-05-03T00:00:00.000Z"
          }
        ])
    });

    await expect(client.listEvents("session_1")).resolves.toHaveLength(1);
  });

  it("turns non-2xx responses into ApiError", async () => {
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3001",
      fetchImpl: async () => jsonResponse({ error: "Session not found" }, { status: 404 })
    });

    await expect(client.listEvents("missing")).rejects.toMatchObject({
      status: 404,
      message: "Session not found"
    });
  });

  it("turns network failures into a clear unavailable error", async () => {
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3001",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      }
    });

    await expect(client.getConfig()).rejects.toThrow("Signal Recycler API is not running");
  });
});
