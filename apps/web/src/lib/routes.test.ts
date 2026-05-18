import { describe, expect, it } from "vitest";
import { parseAppLocation, pathForRoute } from "./routes";

describe("app routes", () => {
  it("parses a session deep link", () => {
    expect(parseAppLocation("/sessions/session_1")).toEqual({
      route: "session",
      sessionId: "session_1"
    });
  });

  it("decodes session ids from deep links", () => {
    expect(parseAppLocation("/sessions/session_1%2Fwith%20slash")).toEqual({
      route: "session",
      sessionId: "session_1/with slash"
    });
  });

  it("falls back to sessions for malformed session deep links", () => {
    expect(parseAppLocation("/sessions/%E0%A4%A")).toEqual({
      route: "sessions",
      sessionId: null
    });
  });

  it("builds a session deep-link path", () => {
    expect(pathForRoute("session", "session_1/with slash")).toBe("/sessions/session_1%2Fwith%20slash");
  });

  it("parses a context chunk inspector deep link", () => {
    expect(parseAppLocation("/context-index?chunk=ctx_123%2Fabc")).toEqual({
      route: "context",
      sessionId: null,
      contextChunkId: "ctx_123/abc"
    });
  });

  it("builds a context chunk inspector deep-link path", () => {
    expect(pathForRoute("context", null, "ctx_123/abc")).toBe("/context-index?chunk=ctx_123%2Fabc");
  });

  it("falls back to dashboard for unknown paths", () => {
    expect(parseAppLocation("/unknown")).toEqual({ route: "dashboard", sessionId: null });
  });
});
