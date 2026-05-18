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
        continuedSessionId: "session_1",
        newSessionRunning: false,
        optimisticSessionId: null
      })
    ).toBe(true);
  });

  it("ignores continued runs for a different selected detail session", () => {
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_2",
        continuedSessionRunning: true,
        continuedSessionId: "session_1",
        newSessionRunning: false,
        optimisticSessionId: null
      })
    ).toBe(false);
  });

  it("does not treat any run as active without a selected detail session", () => {
    expect(
      isSessionDetailRunActive({
        selectedSessionId: null,
        continuedSessionRunning: true,
        continuedSessionId: "session_1",
        newSessionRunning: true,
        optimisticSessionId: "session_new"
      })
    ).toBe(false);
  });

  it("treats the optimistic new session as active only while it is selected", () => {
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_new",
        continuedSessionRunning: false,
        continuedSessionId: null,
        newSessionRunning: true,
        optimisticSessionId: "session_new"
      })
    ).toBe(true);
    expect(
      isSessionDetailRunActive({
        selectedSessionId: "session_other",
        continuedSessionRunning: false,
        continuedSessionId: null,
        newSessionRunning: true,
        optimisticSessionId: "session_new"
      })
    ).toBe(false);
  });
});
