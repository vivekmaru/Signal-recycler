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

  it("falls back to dashboard for unknown paths", () => {
    expect(parseAppLocation("/unknown")).toEqual({ route: "dashboard", sessionId: null });
  });
});
