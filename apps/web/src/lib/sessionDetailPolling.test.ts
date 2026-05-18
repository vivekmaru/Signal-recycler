import { describe, expect, it } from "vitest";
import {
  ACTIVE_SESSION_DETAIL_POLL_INTERVAL_MS,
  IDLE_SESSION_DETAIL_POLL_INTERVAL_MS,
  isSessionDetailRunActive,
  sessionDetailPollInterval
} from "./sessionDetailPolling";

describe("session detail polling", () => {
  it("does not poll without a selected session", () => {
    expect(sessionDetailPollInterval({ hasSelectedSession: false, runActive: true })).toBeNull();
  });

  it("polls quickly while a session run is active", () => {
    expect(sessionDetailPollInterval({ hasSelectedSession: true, runActive: true })).toBe(
      ACTIVE_SESSION_DETAIL_POLL_INTERVAL_MS
    );
  });

  it("backs off when the selected session is idle", () => {
    expect(sessionDetailPollInterval({ hasSelectedSession: true, runActive: false })).toBe(
      IDLE_SESSION_DETAIL_POLL_INTERVAL_MS
    );
  });

  it("treats continued runs as active for the selected detail session", () => {
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_1",
        continuedSessionRunning: true,
        newSessionRunning: false,
        optimisticSessionId: null
      })
    ).toBe(true);
  });

  it("treats the optimistic new session as active only while it is selected", () => {
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_new",
        continuedSessionRunning: false,
        newSessionRunning: true,
        optimisticSessionId: "session_new"
      })
    ).toBe(true);
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_other",
        continuedSessionRunning: false,
        newSessionRunning: true,
        optimisticSessionId: "session_new"
      })
    ).toBe(false);
  });
});
